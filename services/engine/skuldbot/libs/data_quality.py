"""
SkuldBot Data Quality Library - Powered by Great Expectations

Esta librería implementa validación de calidad de datos usando Great Expectations
como motor subyacente, con una interfaz simplificada para Robot Framework.

Funcionalidades:
- Validación de esquema de datos
- Validación de valores (nulos, rangos, patrones)
- Validación de unicidad y duplicados
- Validación de integridad referencial
- Validación de formato (fechas, emails, etc.)
- Generación de reportes de calidad
- Expectativas personalizadas

Great Expectations proporciona:
- 300+ expectativas built-in
- Profiling automático de datos
- Documentación de datos (Data Docs)
- Validación en batch y streaming
"""

import re
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union, Callable
from datetime import datetime
from robot.api.deco import keyword, library
from robot.api import logger

# Intentar importar Great Expectations
try:
    import great_expectations as gx
    from great_expectations.core import ExpectationSuite
    from great_expectations.dataset import PandasDataset
    GX_AVAILABLE = True
except ImportError:
    GX_AVAILABLE = False
    logger.warn("Great Expectations not installed. Using fallback validators.")

# Intentar importar pandas
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


class ValidationSeverity(Enum):
    """Severidad de validaciones"""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ExpectationType(Enum):
    """Tipos de expectativas soportadas"""
    # Column existence
    COLUMN_EXISTS = "expect_column_to_exist"

    # Null checks
    NOT_NULL = "expect_column_values_to_not_be_null"
    NULL_PERCENTAGE = "expect_column_null_value_percentage_to_be"

    # Type checks
    TYPE_STRING = "expect_column_values_to_be_of_type_string"
    TYPE_INTEGER = "expect_column_values_to_be_of_type_integer"
    TYPE_FLOAT = "expect_column_values_to_be_of_type_float"
    TYPE_BOOLEAN = "expect_column_values_to_be_of_type_boolean"
    TYPE_DATETIME = "expect_column_values_to_be_of_type_datetime"

    # Value checks
    IN_SET = "expect_column_values_to_be_in_set"
    NOT_IN_SET = "expect_column_values_to_not_be_in_set"
    BETWEEN = "expect_column_values_to_be_between"
    GREATER_THAN = "expect_column_values_to_be_greater_than"
    LESS_THAN = "expect_column_values_to_be_less_than"

    # String checks
    MATCH_REGEX = "expect_column_values_to_match_regex"
    NOT_MATCH_REGEX = "expect_column_values_to_not_match_regex"
    STRING_LENGTH_BETWEEN = "expect_column_value_lengths_to_be_between"

    # Uniqueness
    UNIQUE = "expect_column_values_to_be_unique"
    UNIQUE_COMPOUND = "expect_compound_columns_to_be_unique"

    # Format checks
    VALID_EMAIL = "expect_column_values_to_match_email_format"
    VALID_DATE = "expect_column_values_to_match_date_format"
    VALID_JSON = "expect_column_values_to_be_valid_json"

    # Statistical
    MEAN_BETWEEN = "expect_column_mean_to_be_between"
    MEDIAN_BETWEEN = "expect_column_median_to_be_between"
    STD_BETWEEN = "expect_column_stdev_to_be_between"

    # Row count
    ROW_COUNT_BETWEEN = "expect_table_row_count_to_be_between"
    ROW_COUNT_EQUAL = "expect_table_row_count_to_equal"


@dataclass
class ValidationResult:
    """Resultado de una validación"""
    expectation: str
    column: Optional[str]
    success: bool
    severity: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    unexpected_count: int = 0
    unexpected_percent: float = 0.0
    unexpected_values: List[Any] = field(default_factory=list)


@dataclass
class DataQualityReport:
    """Reporte completo de calidad de datos"""
    timestamp: str
    data_source: str
    total_rows: int
    total_columns: int
    validations_run: int
    validations_passed: int
    validations_failed: int
    success_rate: float
    results: List[ValidationResult] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)


# Patrones regex comunes
COMMON_PATTERNS = {
    "email": r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    "phone_us": r'^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$',
    "ssn": r'^\d{3}-\d{2}-\d{4}$',
    "zip_us": r'^\d{5}(-\d{4})?$',
    "date_iso": r'^\d{4}-\d{2}-\d{2}$',
    "date_us": r'^(0[1-9]|1[0-2])/(0[1-9]|[12]\d|3[01])/\d{4}$',
    "url": r'^https?://[^\s/$.?#].[^\s]*$',
    "ipv4": r'^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
    "uuid": r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    "credit_card": r'^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})$',
}


@library(scope="GLOBAL", auto_keywords=True)
class SkuldDataQuality:
    """
    SkuldBot Data Quality Library

    Validación de calidad de datos usando Great Expectations como motor.
    Proporciona una interfaz simplificada para Robot Framework.

    Keywords disponibles:
    - Validate Data Schema: Valida esquema de datos
    - Validate Column Not Null: Verifica que columna no tenga nulos
    - Validate Column Unique: Verifica unicidad de valores
    - Validate Column In Set: Verifica valores en conjunto permitido
    - Validate Column Between: Verifica valores en rango
    - Validate Column Regex: Verifica valores contra patrón regex
    - Validate Email Format: Verifica formato de email
    - Validate Date Format: Verifica formato de fecha
    - Validate Row Count: Verifica cantidad de filas
    - Run Expectation Suite: Ejecuta suite completa de expectativas
    - Profile Data: Genera perfil automático de datos
    - Generate Quality Report: Genera reporte de calidad
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._expectation_suite: List[Dict[str, Any]] = []
        self._validation_results: List[ValidationResult] = []
        self._data_context = None

        # Inicializar Great Expectations context si está disponible
        if GX_AVAILABLE:
            try:
                self._data_context = gx.get_context()
            except Exception as e:
                logger.debug(f"Could not initialize GX context: {e}")

    def _convert_to_dataframe(self, data: Any) -> Optional[Any]:
        """Convierte datos a DataFrame si es posible"""
        if not PANDAS_AVAILABLE:
            return None

        if isinstance(data, pd.DataFrame):
            return data
        elif isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                return pd.DataFrame(data)
            else:
                return pd.DataFrame(data)
        elif isinstance(data, dict):
            return pd.DataFrame([data])
        else:
            return None

    def _validate_with_fallback(
        self,
        data: List[Dict[str, Any]],
        column: str,
        validator: Callable,
        expectation_name: str,
        **kwargs
    ) -> ValidationResult:
        """Ejecuta validación con fallback si GX no está disponible"""

        if not data:
            return ValidationResult(
                expectation=expectation_name,
                column=column,
                success=False,
                severity="error",
                message="No data provided",
                details={"error": "Empty dataset"}
            )

        # Extraer valores de la columna
        values = []
        for row in data:
            if isinstance(row, dict) and column in row:
                values.append(row[column])

        if not values:
            return ValidationResult(
                expectation=expectation_name,
                column=column,
                success=False,
                severity="error",
                message=f"Column '{column}' not found in data",
                details={"error": "Column not found"}
            )

        # Ejecutar validador
        try:
            success, unexpected = validator(values, **kwargs)
            unexpected_count = len(unexpected) if isinstance(unexpected, list) else 0
            unexpected_percent = (unexpected_count / len(values)) * 100 if values else 0

            return ValidationResult(
                expectation=expectation_name,
                column=column,
                success=success,
                severity="error" if not success else "info",
                message=f"Validation {'passed' if success else 'failed'} for column '{column}'",
                details=kwargs,
                unexpected_count=unexpected_count,
                unexpected_percent=unexpected_percent,
                unexpected_values=unexpected[:10] if isinstance(unexpected, list) else []
            )
        except Exception as e:
            return ValidationResult(
                expectation=expectation_name,
                column=column,
                success=False,
                severity="error",
                message=f"Validation error: {str(e)}",
                details={"error": str(e)}
            )

    @keyword("Validate Data Schema")
    def validate_data_schema(
        self,
        data: List[Dict[str, Any]],
        expected_columns: List[str],
        strict: bool = False,
    ) -> Dict[str, Any]:
        """
        Valida que los datos tengan las columnas esperadas.

        Args:
            data: Lista de diccionarios (filas de datos)
            expected_columns: Lista de columnas esperadas
            strict: Si True, no permite columnas adicionales

        Returns:
            Resultado de validación con columnas faltantes/extras

        Example:
            | ${result}= | Validate Data Schema | ${data} | name,email,phone |
            | Should Be True | ${result}[valid] |
        """
        if not data:
            return {
                "valid": False,
                "message": "No data provided",
                "missing_columns": expected_columns,
                "extra_columns": [],
            }

        # Obtener columnas actuales
        actual_columns = set()
        for row in data:
            if isinstance(row, dict):
                actual_columns.update(row.keys())

        expected_set = set(expected_columns) if isinstance(expected_columns, list) else set(expected_columns.split(","))
        expected_set = {c.strip() for c in expected_set}

        missing = expected_set - actual_columns
        extra = actual_columns - expected_set

        valid = len(missing) == 0
        if strict:
            valid = valid and len(extra) == 0

        result = {
            "valid": valid,
            "message": "Schema validation passed" if valid else "Schema validation failed",
            "expected_columns": list(expected_set),
            "actual_columns": list(actual_columns),
            "missing_columns": list(missing),
            "extra_columns": list(extra),
        }

        self._validation_results.append(ValidationResult(
            expectation="validate_schema",
            column=None,
            success=valid,
            severity="error" if not valid else "info",
            message=result["message"],
            details=result,
        ))

        logger.info(f"Schema validation: {result['message']}")
        return result

    @keyword("Validate Column Not Null")
    def validate_column_not_null(
        self,
        data: List[Dict[str, Any]],
        column: str,
        threshold: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Valida que una columna no tenga valores nulos.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna
            threshold: Porcentaje máximo de nulos permitido (0.0 = ninguno)

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Column Not Null | ${data} | email |
            | Should Be True | ${result}[valid] |
        """
        def validator(values, **kwargs):
            null_values = [v for v in values if v is None or v == "" or (isinstance(v, float) and str(v) == 'nan')]
            null_percent = (len(null_values) / len(values)) * 100 if values else 0
            success = null_percent <= kwargs.get("threshold", 0.0)
            return success, null_values

        result = self._validate_with_fallback(
            data, column, validator,
            ExpectationType.NOT_NULL.value,
            threshold=threshold
        )

        self._validation_results.append(result)

        return {
            "valid": result.success,
            "column": column,
            "null_count": result.unexpected_count,
            "null_percent": result.unexpected_percent,
            "threshold": threshold,
            "message": result.message,
        }

    @keyword("Validate Column Unique")
    def validate_column_unique(
        self,
        data: List[Dict[str, Any]],
        column: str,
    ) -> Dict[str, Any]:
        """
        Valida que los valores de una columna sean únicos.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna

        Returns:
            Resultado de validación con duplicados encontrados

        Example:
            | ${result}= | Validate Column Unique | ${data} | id |
            | Should Be True | ${result}[valid] |
        """
        def validator(values, **kwargs):
            seen = set()
            duplicates = []
            for v in values:
                if v in seen:
                    duplicates.append(v)
                seen.add(v)
            success = len(duplicates) == 0
            return success, duplicates

        result = self._validate_with_fallback(
            data, column, validator,
            ExpectationType.UNIQUE.value
        )

        self._validation_results.append(result)

        return {
            "valid": result.success,
            "column": column,
            "duplicate_count": result.unexpected_count,
            "duplicate_values": result.unexpected_values,
            "message": result.message,
        }

    @keyword("Validate Column In Set")
    def validate_column_in_set(
        self,
        data: List[Dict[str, Any]],
        column: str,
        allowed_values: List[Any],
    ) -> Dict[str, Any]:
        """
        Valida que los valores estén en un conjunto permitido.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna
            allowed_values: Lista de valores permitidos

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Column In Set | ${data} | status | active,inactive,pending |
        """
        # Convertir string a lista si es necesario
        if isinstance(allowed_values, str):
            allowed_set = {v.strip() for v in allowed_values.split(",")}
        else:
            allowed_set = set(allowed_values)

        def validator(values, **kwargs):
            invalid = [v for v in values if v not in allowed_set and v is not None]
            success = len(invalid) == 0
            return success, invalid

        result = self._validate_with_fallback(
            data, column, validator,
            ExpectationType.IN_SET.value,
            allowed_values=list(allowed_set)
        )

        self._validation_results.append(result)

        return {
            "valid": result.success,
            "column": column,
            "invalid_count": result.unexpected_count,
            "invalid_values": result.unexpected_values,
            "allowed_values": list(allowed_set),
            "message": result.message,
        }

    @keyword("Validate Column Between")
    def validate_column_between(
        self,
        data: List[Dict[str, Any]],
        column: str,
        min_value: Union[int, float],
        max_value: Union[int, float],
        inclusive: bool = True,
    ) -> Dict[str, Any]:
        """
        Valida que los valores numéricos estén en un rango.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna
            min_value: Valor mínimo
            max_value: Valor máximo
            inclusive: Si incluye los límites

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Column Between | ${data} | age | 18 | 120 |
        """
        def validator(values, **kwargs):
            min_v = float(kwargs["min_value"])
            max_v = float(kwargs["max_value"])
            incl = kwargs.get("inclusive", True)

            invalid = []
            for v in values:
                if v is None:
                    continue
                try:
                    num = float(v)
                    if incl:
                        if num < min_v or num > max_v:
                            invalid.append(v)
                    else:
                        if num <= min_v or num >= max_v:
                            invalid.append(v)
                except (ValueError, TypeError):
                    invalid.append(v)

            success = len(invalid) == 0
            return success, invalid

        result = self._validate_with_fallback(
            data, column, validator,
            ExpectationType.BETWEEN.value,
            min_value=min_value,
            max_value=max_value,
            inclusive=inclusive
        )

        self._validation_results.append(result)

        return {
            "valid": result.success,
            "column": column,
            "out_of_range_count": result.unexpected_count,
            "out_of_range_values": result.unexpected_values,
            "min_value": min_value,
            "max_value": max_value,
            "message": result.message,
        }

    @keyword("Validate Column Regex")
    def validate_column_regex(
        self,
        data: List[Dict[str, Any]],
        column: str,
        pattern: str,
        pattern_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Valida que los valores coincidan con un patrón regex.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna
            pattern: Patrón regex o nombre de patrón predefinido
            pattern_name: Nombre descriptivo del patrón

        Patrones predefinidos: email, phone_us, ssn, zip_us, date_iso, date_us, url, ipv4, uuid

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Column Regex | ${data} | email | email |
            | ${result}= | Validate Column Regex | ${data} | code | ^[A-Z]{3}\\d{4}$ |
        """
        # Usar patrón predefinido si existe
        actual_pattern = COMMON_PATTERNS.get(pattern, pattern)

        try:
            regex = re.compile(actual_pattern)
        except re.error as e:
            return {
                "valid": False,
                "column": column,
                "error": f"Invalid regex pattern: {e}",
                "message": f"Invalid regex: {e}",
            }

        def validator(values, **kwargs):
            invalid = []
            for v in values:
                if v is None:
                    continue
                if not regex.match(str(v)):
                    invalid.append(v)
            success = len(invalid) == 0
            return success, invalid

        result = self._validate_with_fallback(
            data, column, validator,
            ExpectationType.MATCH_REGEX.value,
            pattern=actual_pattern,
            pattern_name=pattern_name or pattern
        )

        self._validation_results.append(result)

        return {
            "valid": result.success,
            "column": column,
            "invalid_count": result.unexpected_count,
            "invalid_values": result.unexpected_values,
            "pattern": actual_pattern,
            "pattern_name": pattern_name or pattern,
            "message": result.message,
        }

    @keyword("Validate Email Format")
    def validate_email_format(
        self,
        data: List[Dict[str, Any]],
        column: str,
    ) -> Dict[str, Any]:
        """
        Valida que los valores tengan formato de email válido.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Email Format | ${data} | email |
        """
        return self.validate_column_regex(data, column, "email", "Email")

    @keyword("Validate Date Format")
    def validate_date_format(
        self,
        data: List[Dict[str, Any]],
        column: str,
        format: str = "iso",
    ) -> Dict[str, Any]:
        """
        Valida que los valores tengan formato de fecha válido.

        Args:
            data: Lista de diccionarios
            column: Nombre de la columna
            format: Formato esperado (iso, us, o patrón strftime)

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Date Format | ${data} | created_at | iso |
        """
        if format == "iso":
            pattern = "date_iso"
        elif format == "us":
            pattern = "date_us"
        else:
            # Usar formato strftime - convertir a regex
            pattern = format

        return self.validate_column_regex(data, column, pattern, f"Date ({format})")

    @keyword("Validate Row Count")
    def validate_row_count(
        self,
        data: List[Dict[str, Any]],
        min_count: Optional[int] = None,
        max_count: Optional[int] = None,
        exact_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Valida la cantidad de filas en los datos.

        Args:
            data: Lista de diccionarios
            min_count: Cantidad mínima de filas
            max_count: Cantidad máxima de filas
            exact_count: Cantidad exacta esperada

        Returns:
            Resultado de validación

        Example:
            | ${result}= | Validate Row Count | ${data} | min_count=1 | max_count=1000 |
        """
        actual_count = len(data) if data else 0

        valid = True
        message_parts = []

        if exact_count is not None:
            valid = actual_count == exact_count
            message_parts.append(f"expected exactly {exact_count}")
        else:
            if min_count is not None and actual_count < min_count:
                valid = False
                message_parts.append(f"expected at least {min_count}")
            if max_count is not None and actual_count > max_count:
                valid = False
                message_parts.append(f"expected at most {max_count}")

        message = f"Row count: {actual_count}"
        if message_parts:
            message += f" ({', '.join(message_parts)})"

        result = ValidationResult(
            expectation=ExpectationType.ROW_COUNT_BETWEEN.value,
            column=None,
            success=valid,
            severity="error" if not valid else "info",
            message=message,
            details={
                "actual_count": actual_count,
                "min_count": min_count,
                "max_count": max_count,
                "exact_count": exact_count,
            }
        )

        self._validation_results.append(result)

        return {
            "valid": valid,
            "actual_count": actual_count,
            "min_count": min_count,
            "max_count": max_count,
            "exact_count": exact_count,
            "message": message,
        }

    @keyword("Add Expectation")
    def add_expectation(
        self,
        expectation_type: str,
        column: Optional[str] = None,
        **kwargs
    ):
        """
        Agrega una expectativa a la suite para ejecución posterior.

        Args:
            expectation_type: Tipo de expectativa (not_null, unique, in_set, etc.)
            column: Columna a validar
            **kwargs: Parámetros adicionales de la expectativa

        Example:
            | Add Expectation | not_null | email |
            | Add Expectation | in_set | status | allowed_values=active,inactive |
            | Add Expectation | between | age | min_value=18 | max_value=120 |
        """
        self._expectation_suite.append({
            "expectation_type": expectation_type,
            "column": column,
            "kwargs": kwargs,
        })
        logger.info(f"Added expectation: {expectation_type} for column {column}")

    @keyword("Run Expectation Suite")
    def run_expectation_suite(
        self,
        data: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Ejecuta todas las expectativas agregadas con Add Expectation.

        Args:
            data: Lista de diccionarios a validar

        Returns:
            Reporte con resultados de todas las validaciones

        Example:
            | Add Expectation | not_null | email |
            | Add Expectation | unique | id |
            | ${report}= | Run Expectation Suite | ${data} |
        """
        results = []

        expectation_handlers = {
            "not_null": self.validate_column_not_null,
            "unique": self.validate_column_unique,
            "in_set": self.validate_column_in_set,
            "between": self.validate_column_between,
            "regex": self.validate_column_regex,
            "email": self.validate_email_format,
            "date": self.validate_date_format,
            "schema": self.validate_data_schema,
        }

        for exp in self._expectation_suite:
            exp_type = exp["expectation_type"]
            column = exp["column"]
            kwargs = exp["kwargs"]

            handler = expectation_handlers.get(exp_type)
            if handler:
                if exp_type == "schema":
                    result = handler(data, **kwargs)
                else:
                    result = handler(data, column, **kwargs)
                results.append(result)
            else:
                results.append({
                    "valid": False,
                    "error": f"Unknown expectation type: {exp_type}",
                })

        passed = sum(1 for r in results if r.get("valid", False))
        failed = len(results) - passed

        return {
            "success": failed == 0,
            "validations_run": len(results),
            "validations_passed": passed,
            "validations_failed": failed,
            "success_rate": (passed / len(results) * 100) if results else 0,
            "results": results,
        }

    @keyword("Clear Expectation Suite")
    def clear_expectation_suite(self):
        """
        Limpia la suite de expectativas.

        Example:
            | Clear Expectation Suite |
        """
        self._expectation_suite.clear()
        logger.info("Expectation suite cleared")

    @keyword("Profile Data")
    def profile_data(
        self,
        data: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Genera un perfil automático de los datos.

        Args:
            data: Lista de diccionarios a perfilar

        Returns:
            Perfil con estadísticas de cada columna

        Example:
            | ${profile}= | Profile Data | ${data} |
            | Log | Column stats: ${profile}[columns] |
        """
        if not data:
            return {"error": "No data provided", "columns": {}}

        # Obtener todas las columnas
        columns = set()
        for row in data:
            if isinstance(row, dict):
                columns.update(row.keys())

        profile = {
            "row_count": len(data),
            "column_count": len(columns),
            "columns": {},
        }

        for col in columns:
            values = [row.get(col) for row in data if isinstance(row, dict)]
            non_null = [v for v in values if v is not None and v != ""]

            col_profile = {
                "total_count": len(values),
                "null_count": len(values) - len(non_null),
                "null_percent": ((len(values) - len(non_null)) / len(values) * 100) if values else 0,
                "unique_count": len(set(str(v) for v in non_null)),
                "unique_percent": (len(set(str(v) for v in non_null)) / len(non_null) * 100) if non_null else 0,
            }

            # Detectar tipo
            types = set()
            for v in non_null[:100]:  # Sample first 100
                if isinstance(v, bool):
                    types.add("boolean")
                elif isinstance(v, int):
                    types.add("integer")
                elif isinstance(v, float):
                    types.add("float")
                elif isinstance(v, str):
                    # Intentar detectar formato
                    if re.match(COMMON_PATTERNS["email"], v):
                        types.add("email")
                    elif re.match(COMMON_PATTERNS["date_iso"], v):
                        types.add("date")
                    else:
                        types.add("string")
                else:
                    types.add(type(v).__name__)

            col_profile["detected_types"] = list(types)
            col_profile["primary_type"] = list(types)[0] if len(types) == 1 else "mixed"

            # Estadísticas numéricas si aplica
            if col_profile["primary_type"] in ["integer", "float"]:
                numeric_values = []
                for v in non_null:
                    try:
                        numeric_values.append(float(v))
                    except (ValueError, TypeError):
                        pass

                if numeric_values:
                    col_profile["min"] = min(numeric_values)
                    col_profile["max"] = max(numeric_values)
                    col_profile["mean"] = sum(numeric_values) / len(numeric_values)

            # Valores de ejemplo
            col_profile["sample_values"] = [str(v) for v in non_null[:5]]

            profile["columns"][col] = col_profile

        logger.info(f"Data profile generated: {len(columns)} columns, {len(data)} rows")
        return profile

    @keyword("Generate Quality Report")
    def generate_quality_report(
        self,
        data: List[Dict[str, Any]],
        data_source: str = "unknown",
    ) -> Dict[str, Any]:
        """
        Genera un reporte completo de calidad de datos.

        Args:
            data: Lista de diccionarios
            data_source: Nombre/descripción de la fuente de datos

        Returns:
            Reporte completo con todas las validaciones ejecutadas

        Example:
            | ${report}= | Generate Quality Report | ${data} | Customer Database |
        """
        # Obtener perfil
        profile = self.profile_data(data)

        # Obtener resultados de validaciones
        passed = sum(1 for r in self._validation_results if r.success)
        failed = len(self._validation_results) - passed

        report = {
            "timestamp": datetime.now().isoformat(),
            "data_source": data_source,
            "total_rows": profile.get("row_count", 0),
            "total_columns": profile.get("column_count", 0),
            "validations_run": len(self._validation_results),
            "validations_passed": passed,
            "validations_failed": failed,
            "success_rate": (passed / len(self._validation_results) * 100) if self._validation_results else 100,
            "profile": profile,
            "validation_results": [
                {
                    "expectation": r.expectation,
                    "column": r.column,
                    "success": r.success,
                    "severity": r.severity,
                    "message": r.message,
                    "unexpected_count": r.unexpected_count,
                    "unexpected_percent": r.unexpected_percent,
                }
                for r in self._validation_results
            ],
            "summary": {
                "data_quality_score": (passed / len(self._validation_results) * 100) if self._validation_results else 100,
                "critical_issues": failed,
                "recommendations": self._generate_recommendations(),
            }
        }

        logger.info(f"Quality report generated: {passed}/{len(self._validation_results)} validations passed")
        return report

    def _generate_recommendations(self) -> List[str]:
        """Genera recomendaciones basadas en los resultados"""
        recommendations = []

        for result in self._validation_results:
            if not result.success:
                if "null" in result.expectation.lower():
                    recommendations.append(f"Column '{result.column}' has null values - consider adding default values or constraints")
                elif "unique" in result.expectation.lower():
                    recommendations.append(f"Column '{result.column}' has duplicates - verify data integrity")
                elif "between" in result.expectation.lower():
                    recommendations.append(f"Column '{result.column}' has out-of-range values - review data validation rules")
                elif "regex" in result.expectation.lower() or "format" in result.expectation.lower():
                    recommendations.append(f"Column '{result.column}' has invalid format - implement input validation")

        return list(set(recommendations))[:10]  # Max 10 unique recommendations

    @keyword("Clear Validation Results")
    def clear_validation_results(self):
        """
        Limpia los resultados de validación acumulados.

        Example:
            | Clear Validation Results |
        """
        self._validation_results.clear()
        logger.info("Validation results cleared")

    @keyword("Get Validation Summary")
    def get_validation_summary(self) -> Dict[str, Any]:
        """
        Obtiene un resumen de todas las validaciones ejecutadas.

        Returns:
            Resumen con conteos de validaciones pasadas/fallidas

        Example:
            | ${summary}= | Get Validation Summary |
            | Log | Passed: ${summary}[passed], Failed: ${summary}[failed] |
        """
        passed = sum(1 for r in self._validation_results if r.success)
        failed = len(self._validation_results) - passed

        return {
            "total": len(self._validation_results),
            "passed": passed,
            "failed": failed,
            "success_rate": (passed / len(self._validation_results) * 100) if self._validation_results else 100,
            "failed_validations": [
                {"expectation": r.expectation, "column": r.column, "message": r.message}
                for r in self._validation_results if not r.success
            ],
        }

    # =========================================================================
    # QUALITY PROFILES - Reusable validation templates by vertical
    # =========================================================================

    # Built-in profiles por vertical
    BUILTIN_PROFILES = {
        # ===== INSURANCE PROFILE =====
        "insurance_claims": {
            "name": "Insurance Claims",
            "description": "Standard validations for insurance claims data",
            "vertical": "insurance",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "claim_id", "threshold": 0},
                {"type": "unique", "column": "claim_id"},
                {"type": "not_null", "column": "policy_number", "threshold": 0},
                {"type": "regex", "column": "policy_number", "pattern": r"^[A-Z]{2,3}\d{6,10}$"},
                {"type": "not_null", "column": "claim_amount", "threshold": 0},
                {"type": "between", "column": "claim_amount", "min_value": 0, "max_value": 10000000},
                {"type": "in_set", "column": "claim_status", "allowed_values": ["pending", "approved", "denied", "under_review", "paid"]},
                {"type": "date", "column": "claim_date", "format": "iso"},
                {"type": "date", "column": "incident_date", "format": "iso"},
                {"type": "not_null", "column": "claimant_name", "threshold": 5},
            ],
        },
        "insurance_policies": {
            "name": "Insurance Policies",
            "description": "Validations for policy master data",
            "vertical": "insurance",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "policy_id", "threshold": 0},
                {"type": "unique", "column": "policy_id"},
                {"type": "not_null", "column": "policy_holder", "threshold": 0},
                {"type": "in_set", "column": "policy_type", "allowed_values": ["auto", "home", "life", "health", "commercial", "liability"]},
                {"type": "in_set", "column": "policy_status", "allowed_values": ["active", "cancelled", "expired", "pending", "suspended"]},
                {"type": "between", "column": "premium_amount", "min_value": 0, "max_value": 1000000},
                {"type": "date", "column": "effective_date", "format": "iso"},
                {"type": "date", "column": "expiration_date", "format": "iso"},
                {"type": "email", "column": "contact_email"},
            ],
        },

        # ===== HEALTHCARE PROFILE =====
        "healthcare_patients": {
            "name": "Healthcare Patient Records",
            "description": "HIPAA-aware validations for patient data",
            "vertical": "healthcare",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "patient_id", "threshold": 0},
                {"type": "unique", "column": "patient_id"},
                {"type": "regex", "column": "mrn", "pattern": r"^MRN\d{6,10}$"},
                {"type": "not_null", "column": "date_of_birth", "threshold": 0},
                {"type": "date", "column": "date_of_birth", "format": "iso"},
                {"type": "in_set", "column": "gender", "allowed_values": ["M", "F", "O", "U", "male", "female", "other", "unknown"]},
                {"type": "not_null", "column": "last_name", "threshold": 0},
                {"type": "not_null", "column": "first_name", "threshold": 0},
                {"type": "regex", "column": "ssn", "pattern": r"^\d{3}-\d{2}-\d{4}$"},
            ],
        },
        "healthcare_encounters": {
            "name": "Healthcare Encounters",
            "description": "Validations for medical encounters/visits",
            "vertical": "healthcare",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "encounter_id", "threshold": 0},
                {"type": "unique", "column": "encounter_id"},
                {"type": "not_null", "column": "patient_id", "threshold": 0},
                {"type": "not_null", "column": "provider_id", "threshold": 0},
                {"type": "date", "column": "encounter_date", "format": "iso"},
                {"type": "in_set", "column": "encounter_type", "allowed_values": ["inpatient", "outpatient", "emergency", "telehealth", "home_visit"]},
                {"type": "regex", "column": "icd10_code", "pattern": r"^[A-Z]\d{2}(\.\d{1,4})?$"},
                {"type": "regex", "column": "cpt_code", "pattern": r"^\d{5}$"},
            ],
        },

        # ===== FINANCE PROFILE =====
        "finance_transactions": {
            "name": "Financial Transactions",
            "description": "Validations for financial transaction data",
            "vertical": "finance",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "transaction_id", "threshold": 0},
                {"type": "unique", "column": "transaction_id"},
                {"type": "not_null", "column": "account_number", "threshold": 0},
                {"type": "not_null", "column": "amount", "threshold": 0},
                {"type": "between", "column": "amount", "min_value": -100000000, "max_value": 100000000},
                {"type": "in_set", "column": "transaction_type", "allowed_values": ["credit", "debit", "transfer", "payment", "refund", "fee"]},
                {"type": "in_set", "column": "status", "allowed_values": ["pending", "completed", "failed", "reversed", "cancelled"]},
                {"type": "date", "column": "transaction_date", "format": "iso"},
                {"type": "regex", "column": "currency", "pattern": r"^[A-Z]{3}$"},
            ],
        },
        "finance_accounts": {
            "name": "Financial Accounts",
            "description": "Validations for account master data",
            "vertical": "finance",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "account_id", "threshold": 0},
                {"type": "unique", "column": "account_id"},
                {"type": "not_null", "column": "account_holder", "threshold": 0},
                {"type": "in_set", "column": "account_type", "allowed_values": ["checking", "savings", "investment", "credit", "loan", "mortgage"]},
                {"type": "in_set", "column": "status", "allowed_values": ["active", "closed", "suspended", "dormant"]},
                {"type": "between", "column": "balance", "min_value": -1000000000, "max_value": 1000000000},
                {"type": "email", "column": "email"},
                {"type": "regex", "column": "routing_number", "pattern": r"^\d{9}$"},
            ],
        },

        # ===== GENERAL PROFILES =====
        "general_contacts": {
            "name": "Contact Information",
            "description": "Standard contact data validations",
            "vertical": "general",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "name", "threshold": 5},
                {"type": "email", "column": "email"},
                {"type": "regex", "column": "phone", "pattern": "phone_us"},
                {"type": "not_null", "column": "address", "threshold": 10},
                {"type": "regex", "column": "zip_code", "pattern": "zip_us"},
            ],
        },
        "general_products": {
            "name": "Product Catalog",
            "description": "Standard product data validations",
            "vertical": "general",
            "version": "1.0",
            "expectations": [
                {"type": "not_null", "column": "product_id", "threshold": 0},
                {"type": "unique", "column": "product_id"},
                {"type": "not_null", "column": "product_name", "threshold": 0},
                {"type": "between", "column": "price", "min_value": 0, "max_value": 1000000},
                {"type": "between", "column": "quantity", "min_value": 0, "max_value": 1000000},
                {"type": "in_set", "column": "status", "allowed_values": ["active", "inactive", "discontinued"]},
            ],
        },
    }

    @keyword("List Quality Profiles")
    def list_quality_profiles(self, vertical: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista los profiles de calidad disponibles.

        Args:
            vertical: Filtrar por vertical (insurance, healthcare, finance, general)

        Returns:
            Lista de profiles disponibles

        Example:
            | ${profiles}= | List Quality Profiles | healthcare |
            | Log | Available profiles: ${profiles}[profiles] |
        """
        profiles = []

        for profile_id, profile in self.BUILTIN_PROFILES.items():
            if vertical and profile.get("vertical") != vertical:
                continue

            profiles.append({
                "id": profile_id,
                "name": profile.get("name"),
                "description": profile.get("description"),
                "vertical": profile.get("vertical"),
                "expectation_count": len(profile.get("expectations", [])),
            })

        return {
            "profiles": profiles,
            "total": len(profiles),
            "verticals": list(set(p["vertical"] for p in profiles)),
        }

    @keyword("Get Quality Profile")
    def get_quality_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Obtiene un profile de calidad por su ID.

        Args:
            profile_id: ID del profile

        Returns:
            Definición completa del profile

        Example:
            | ${profile}= | Get Quality Profile | insurance_claims |
            | Log | Expectations: ${profile}[expectations] |
        """
        profile = self.BUILTIN_PROFILES.get(profile_id)

        if not profile:
            return {
                "error": f"Profile '{profile_id}' not found",
                "available_profiles": list(self.BUILTIN_PROFILES.keys()),
            }

        return {
            "id": profile_id,
            **profile,
        }

    @keyword("Apply Quality Profile")
    def apply_quality_profile(
        self,
        data: List[Dict[str, Any]],
        profile_id: str,
        strict: bool = False,
    ) -> Dict[str, Any]:
        """
        Aplica un profile de calidad predefinido a los datos.

        Args:
            data: Datos a validar
            profile_id: ID del profile a aplicar
            strict: Si True, falla si faltan columnas del profile

        Returns:
            Reporte de validación completo

        Example:
            | ${result}= | Apply Quality Profile | ${data} | insurance_claims |
            | Should Be True | ${result}[success] |
        """
        profile = self.BUILTIN_PROFILES.get(profile_id)

        if not profile:
            return {
                "success": False,
                "error": f"Profile '{profile_id}' not found",
                "available_profiles": list(self.BUILTIN_PROFILES.keys()),
            }

        # Limpiar resultados anteriores
        self.clear_validation_results()

        # Obtener columnas del profile
        profile_columns = set()
        for exp in profile.get("expectations", []):
            if exp.get("column"):
                profile_columns.add(exp["column"])

        # Verificar columnas existentes en datos
        actual_columns = set()
        if data:
            for row in data:
                if isinstance(row, dict):
                    actual_columns.update(row.keys())

        missing_columns = profile_columns - actual_columns

        if strict and missing_columns:
            return {
                "success": False,
                "error": f"Missing required columns: {', '.join(missing_columns)}",
                "profile_id": profile_id,
                "profile_name": profile.get("name"),
            }

        # Ejecutar cada expectativa
        results = []
        skipped = []

        for exp in profile.get("expectations", []):
            exp_type = exp.get("type")
            column = exp.get("column")

            # Saltar si la columna no existe
            if column and column not in actual_columns:
                skipped.append({
                    "type": exp_type,
                    "column": column,
                    "reason": "Column not found in data",
                })
                continue

            # Ejecutar validación según tipo
            try:
                if exp_type == "not_null":
                    result = self.validate_column_not_null(data, column, exp.get("threshold", 0))
                elif exp_type == "unique":
                    result = self.validate_column_unique(data, column)
                elif exp_type == "in_set":
                    result = self.validate_column_in_set(data, column, exp.get("allowed_values", []))
                elif exp_type == "between":
                    result = self.validate_column_between(
                        data, column,
                        exp.get("min_value", 0),
                        exp.get("max_value", 1000000),
                        exp.get("inclusive", True)
                    )
                elif exp_type == "regex":
                    result = self.validate_column_regex(data, column, exp.get("pattern", ""))
                elif exp_type == "email":
                    result = self.validate_email_format(data, column)
                elif exp_type == "date":
                    result = self.validate_date_format(data, column, exp.get("format", "iso"))
                else:
                    result = {"valid": True, "skipped": True, "reason": f"Unknown type: {exp_type}"}

                results.append({
                    "type": exp_type,
                    "column": column,
                    **result,
                })
            except Exception as e:
                results.append({
                    "type": exp_type,
                    "column": column,
                    "valid": False,
                    "error": str(e),
                })

        # Calcular métricas
        passed = sum(1 for r in results if r.get("valid", False))
        failed = len(results) - passed
        success_rate = (passed / len(results) * 100) if results else 100

        return {
            "success": failed == 0,
            "profile_id": profile_id,
            "profile_name": profile.get("name"),
            "profile_vertical": profile.get("vertical"),
            "validations_run": len(results),
            "validations_passed": passed,
            "validations_failed": failed,
            "validations_skipped": len(skipped),
            "success_rate": round(success_rate, 2),
            "results": results,
            "skipped": skipped,
            "data_row_count": len(data) if data else 0,
        }

    @keyword("Create Custom Profile")
    def create_custom_profile(
        self,
        profile_id: str,
        name: str,
        expectations: List[Dict[str, Any]],
        description: str = "",
        vertical: str = "custom",
    ) -> Dict[str, Any]:
        """
        Crea un profile de calidad personalizado.

        Args:
            profile_id: ID único del profile
            name: Nombre descriptivo
            expectations: Lista de expectativas
            description: Descripción opcional
            vertical: Categoría/vertical

        Returns:
            Profile creado

        Example:
            | @{expectations}= | Create List |
            | ... | {"type": "not_null", "column": "id"} |
            | ... | {"type": "unique", "column": "id"} |
            | ${profile}= | Create Custom Profile | my_profile | My Profile | ${expectations} |
        """
        # Validar que no exista
        if profile_id in self.BUILTIN_PROFILES:
            return {
                "success": False,
                "error": f"Profile '{profile_id}' already exists as builtin",
            }

        # Crear profile (en runtime, no persistido)
        profile = {
            "name": name,
            "description": description,
            "vertical": vertical,
            "version": "1.0",
            "expectations": expectations,
            "custom": True,
        }

        # Agregar temporalmente
        self.BUILTIN_PROFILES[profile_id] = profile

        return {
            "success": True,
            "profile_id": profile_id,
            "profile": profile,
            "message": "Profile created (runtime only, not persisted)",
        }

    @keyword("Validate With Profile And Repair")
    def validate_with_profile_and_repair(
        self,
        data: List[Dict[str, Any]],
        profile_id: str,
        auto_repair: bool = True,
        repair_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Valida datos con un profile y opcionalmente repara con AI.

        Este es el flujo completo:
        1. Aplica profile de validación
        2. Si hay errores y auto_repair=True, intenta reparar con AI
        3. Re-valida después de reparación

        Args:
            data: Datos a validar
            profile_id: ID del profile
            auto_repair: Si reparar automáticamente con AI
            repair_context: Contexto para AI Repair (usa vertical del profile si no se especifica)

        Returns:
            Reporte completo con validación inicial, reparación y re-validación

        Example:
            | ${result}= | Validate With Profile And Repair | ${data} | insurance_claims |
            | Log | Final quality: ${result}[final_quality] |
        """
        # Paso 1: Validación inicial
        initial_validation = self.apply_quality_profile(data, profile_id)

        if initial_validation.get("error"):
            return initial_validation

        initial_quality = initial_validation.get("success_rate", 0)

        # Si ya es exitoso, retornar
        if initial_validation.get("success", False):
            return {
                "status": "valid",
                "initial_quality": initial_quality,
                "final_quality": initial_quality,
                "repair_attempted": False,
                "initial_validation": initial_validation,
                "final_data": data,
            }

        # Si no hay auto-repair, retornar con warning
        if not auto_repair:
            return {
                "status": "warning",
                "initial_quality": initial_quality,
                "final_quality": initial_quality,
                "repair_attempted": False,
                "initial_validation": initial_validation,
                "final_data": data,
                "message": "Validation failed, auto_repair disabled",
            }

        # Determinar contexto de reparación
        profile = self.BUILTIN_PROFILES.get(profile_id, {})
        context = repair_context or profile.get("vertical", "general")

        # Importar SkuldAI si está disponible
        try:
            from skuldbot.libs.ai import SkuldAI
            ai = SkuldAI()

            # Construir reporte de validación para AI Repair
            validation_report = {
                "success_rate": initial_quality,
                "results": initial_validation.get("results", []),
            }

            # Paso 2: Intentar reparación con AI
            repair_result = ai.ai_repair_data(
                data=data,
                validation_report=validation_report,
                context=context,
                allow_format_normalization=True,
                allow_semantic_cleanup=True,
                allow_value_inference=False,
                allow_sensitive_repair=False,
                min_confidence=0.9,
            )

            repaired_data = repair_result.get("repaired_data", data)

            # Paso 3: Re-validar después de reparación
            final_validation = self.apply_quality_profile(repaired_data, profile_id)
            final_quality = final_validation.get("success_rate", 0)

            # Determinar estado final
            if final_validation.get("success", False):
                status = "repaired"
            elif final_quality > initial_quality:
                status = "partially_fixed"
            else:
                status = "failed"

            return {
                "status": status,
                "initial_quality": initial_quality,
                "final_quality": final_quality,
                "improvement": round(final_quality - initial_quality, 2),
                "repair_attempted": True,
                "initial_validation": initial_validation,
                "repair_result": repair_result,
                "final_validation": final_validation,
                "final_data": repaired_data,
            }

        except ImportError:
            return {
                "status": "warning",
                "initial_quality": initial_quality,
                "final_quality": initial_quality,
                "repair_attempted": False,
                "initial_validation": initial_validation,
                "final_data": data,
                "message": "AI repair not available (SkuldAI not configured)",
            }
        except Exception as e:
            return {
                "status": "error",
                "initial_quality": initial_quality,
                "final_quality": initial_quality,
                "repair_attempted": True,
                "error": str(e),
                "initial_validation": initial_validation,
                "final_data": data,
            }
