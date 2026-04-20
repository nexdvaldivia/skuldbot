"""
Librería de nodos Excel (Robot Framework)
SkuldBot Custom Excel Library
"""

from typing import List, Dict, Any, Optional
from robot.api.deco import keyword, library
from RPA.Excel.Files import Files


@library(scope="GLOBAL", auto_keywords=True)
class ExcelLibrary:
    """
    Librería custom de Excel para Skuldbot
    Extiende RPA.Excel.Files con funcionalidades adicionales

    Keywords disponibles:
    - Open Excel With Config: Abre un Excel con configuración
    - Read Excel As Dictionary: Lee Excel y retorna lista de diccionarios
    - Read Excel With Column Names: Lee Excel sin header, asigna nombres personalizados
    - Read Excel Range: Lee rango con metadatos (data + rowCount)
    - Write Data To Excel: Escribe lista de diccionarios al Excel
    - Filter Excel Rows: Filtra filas por columna/valor
    - Save And Close Excel: Guarda y cierra
    - Close Excel Without Saving: Cierra sin guardar
    - Get Cell Value: Obtiene valor de celda (delegado a RPA)
    - Set Cell Value: Establece valor de celda (delegado a RPA)
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self.excel = Files()
        self._workbook_opened = False

    @keyword("Open Excel")
    def open_excel(self, path: str):
        """
        Abre un archivo Excel

        Args:
            path: Ruta al archivo Excel

        Example:
            | Open Excel | /path/to/file.xlsx |
        """
        if not path:
            raise ValueError("Excel path no especificado")

        self.excel.open_workbook(path)
        self._workbook_opened = True

    @keyword("Open Excel With Config")
    def open_excel_with_config(self, config: dict):
        """
        Abre un archivo Excel con configuración avanzada

        Args:
            config: Diccionario con path, create_if_not_exists, etc.

        Example:
            | Open Excel With Config | ${config} |
        """
        path = config.get("path")
        if not path:
            raise ValueError("Excel path no especificado en config")

        self.open_excel(path)

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

    @keyword("Read Excel With Column Names")
    def read_excel_with_column_names(
        self,
        column_names: str,
        sheet_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Lee Excel sin header y asigna nombres de columnas personalizados.

        Args:
            column_names: Nombres de columnas separados por coma (ej: "Name, Date, Status")
            sheet_name: Nombre de la hoja (None = activa)

        Returns:
            Lista de diccionarios con los nombres de columnas especificados

        Example:
            | ${data}= | Read Excel With Column Names | Name, Date, Amount | Sheet1 |
        """
        if sheet_name:
            self.excel.set_active_worksheet(sheet_name)

        # Leer como lista de listas (sin header)
        raw_data = self.excel.read_worksheet_as_table(header=False)

        # Parsear nombres de columnas
        names = [name.strip() for name in column_names.split(",")]

        # Convertir a lista de diccionarios
        result = []
        for row in raw_data:
            row_dict = {}
            for i, name in enumerate(names):
                if i < len(row):
                    row_dict[name] = row[i]
                else:
                    row_dict[name] = None
            result.append(row_dict)

        return result

    @keyword("Read Excel Range")
    def read_excel_range(
        self,
        sheet_name: Optional[str] = None,
        header: bool = True,
        column_names: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Lee un rango de Excel y retorna datos con metadatos.
        Si header=False y column_names está definido, usa esos nombres.

        Args:
            sheet_name: Nombre de la hoja (None = activa)
            header: Si la primera fila es header
            column_names: Nombres de columnas personalizados (solo si header=False)

        Returns:
            Diccionario con 'data' (lista) y 'rowCount' (número)

        Example:
            | ${result}= | Read Excel Range | Sheet1 | False | Name, Date, Amount |
            | ${data}= | Set Variable | ${result}[data] |
            | ${count}= | Set Variable | ${result}[rowCount] |
        """
        if sheet_name:
            self.excel.set_active_worksheet(sheet_name)

        if header:
            # Leer con headers de la primera fila
            data = self.excel.read_worksheet_as_table(header=True)
        elif column_names:
            # Leer sin header pero con nombres personalizados
            data = self.read_excel_with_column_names(column_names, sheet_name=None)
        else:
            # Leer como lista de listas
            data = self.excel.read_worksheet_as_table(header=False)

        return {
            "data": data,
            "rowCount": len(data) if data else 0
        }

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

    @keyword("Get Cell Value")
    def get_cell_value(self, cell: str) -> Any:
        """
        Obtiene el valor de una celda específica

        Args:
            cell: Referencia de celda (ej: "A1", "B5")

        Returns:
            Valor de la celda

        Example:
            | ${value}= | Get Cell Value | A1 |
        """
        return self.excel.get_cell_value(cell)

    @keyword("Set Cell Value")
    def set_cell_value(self, cell: str, value: Any):
        """
        Establece el valor de una celda específica

        Args:
            cell: Referencia de celda (ej: "A1", "B5")
            value: Valor a escribir

        Example:
            | Set Cell Value | A1 | Hello World |
        """
        # Parse cell reference to row/column
        import re
        match = re.match(r"([A-Z]+)(\d+)", cell.upper())
        if not match:
            raise ValueError(f"Referencia de celda inválida: {cell}")

        col_str, row_str = match.groups()
        row = int(row_str)

        # Convert column letters to number (A=1, B=2, etc.)
        col = 0
        for char in col_str:
            col = col * 26 + (ord(char) - ord('A') + 1)

        self.excel.set_cell_value(row, col, value)

    @keyword("Set Active Worksheet")
    def set_active_worksheet(self, sheet_name: str):
        """
        Establece la hoja activa

        Args:
            sheet_name: Nombre de la hoja

        Example:
            | Set Active Worksheet | Sheet1 |
        """
        self.excel.set_active_worksheet(sheet_name)

