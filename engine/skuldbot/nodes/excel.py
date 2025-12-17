"""
Librería de nodos Excel (Robot Framework)
"""

from typing import List, Dict, Any, Optional
from robot.api.deco import keyword, library
from RPA.Excel.Files import Files


@library(scope="GLOBAL", auto_keywords=True)
class ExcelLibrary:
    """
    Librería custom de Excel para Skuldbot
    Extiende RPA.Excel.Files con funcionalidades adicionales
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self.excel = Files()
        self._workbook_opened = False

    @keyword("Open Excel With Config")
    def open_excel_with_config(self, config: dict):
        """
        Abre un archivo Excel con configuración

        Args:
            config: Diccionario con path, create_if_not_exists, etc.

        Example:
            | Open Excel With Config | ${config} |
        """
        path = config.get("path")
        if not path:
            raise ValueError("Excel path no especificado en config")

        self.excel.open_workbook(path)
        self._workbook_opened = True

    @keyword("Read Excel As Dictionary")
    def read_excel_as_dictionary(
        self, sheet_name: Optional[str] = None, header: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Lee Excel y retorna lista de diccionarios

        Args:
            sheet_name: Nombre de la hoja (None = activa)
            header: Si la primera fila es header

        Returns:
            Lista de diccionarios

        Example:
            | ${data}= | Read Excel As Dictionary | Sheet1 | True |
        """
        if sheet_name:
            self.excel.set_active_worksheet(sheet_name)

        table = self.excel.read_worksheet_as_table(header=header)
        return table

    @keyword("Write Data To Excel")
    def write_data_to_excel(self, data: List[Dict[str, Any]], sheet_name: str = "Sheet1"):
        """
        Escribe datos al Excel

        Args:
            data: Lista de diccionarios
            sheet_name: Nombre de la hoja

        Example:
            | Write Data To Excel | ${data} | Results |
        """
        self.excel.create_worksheet(sheet_name, exist_ok=True)
        self.excel.set_active_worksheet(sheet_name)

        if not data:
            return

        # Escribir headers
        headers = list(data[0].keys())
        for col_idx, header in enumerate(headers, start=1):
            self.excel.set_cell_value(1, col_idx, header)

        # Escribir datos
        for row_idx, row_data in enumerate(data, start=2):
            for col_idx, header in enumerate(headers, start=1):
                value = row_data.get(header, "")
                self.excel.set_cell_value(row_idx, col_idx, value)

    @keyword("Filter Excel Rows")
    def filter_excel_rows(
        self, data: List[Dict[str, Any]], column: str, value: Any
    ) -> List[Dict[str, Any]]:
        """
        Filtra filas de Excel

        Args:
            data: Lista de diccionarios
            column: Columna a filtrar
            value: Valor a buscar

        Returns:
            Lista filtrada

        Example:
            | ${filtered}= | Filter Excel Rows | ${data} | Status | Active |
        """
        return [row for row in data if row.get(column) == value]

    @keyword("Save And Close Excel")
    def save_and_close_excel(self):
        """
        Guarda y cierra el workbook

        Example:
            | Save And Close Excel |
        """
        if self._workbook_opened:
            try:
                self.excel.save_workbook()
                self.excel.close_workbook()
            finally:
                self._workbook_opened = False

    @keyword("Close Excel Without Saving")
    def close_excel_without_saving(self):
        """
        Cierra sin guardar cambios

        Example:
            | Close Excel Without Saving |
        """
        if self._workbook_opened:
            try:
                self.excel.close_workbook()
            finally:
                self._workbook_opened = False

