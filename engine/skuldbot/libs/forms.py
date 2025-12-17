"""
Librería SkuldForms para Form Trigger (Robot Framework)

Proporciona keywords para:
- Generación de formularios web
- Validación de datos de formularios
- Procesamiento de submissions
"""

import json
import uuid
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger


class FormFieldType(Enum):
    """Tipos de campos de formulario"""
    TEXT = "text"
    EMAIL = "email"
    NUMBER = "number"
    DATE = "date"
    DROPDOWN = "dropdown"
    CHECKBOX = "checkbox"
    FILE = "file"
    TEXTAREA = "textarea"


@dataclass
class FormField:
    """Definición de un campo de formulario"""
    id: str
    type: FormFieldType
    label: str
    placeholder: str = ""
    required: bool = False
    options: List[str] = field(default_factory=list)
    validation: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FormDefinition:
    """Definición completa de un formulario"""
    form_id: str
    title: str
    description: str = ""
    fields: List[FormField] = field(default_factory=list)
    submit_button_label: str = "Submit"
    require_auth: bool = False
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class FormSubmission:
    """Datos de una submission de formulario"""
    submission_id: str
    form_id: str
    data: Dict[str, Any]
    submitted_at: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    authenticated_user: Optional[str] = None


@library(scope="GLOBAL", auto_keywords=True)
class SkuldForms:
    """
    Librería de Formularios para Skuldbot.

    Proporciona keywords para:
    - Crear definiciones de formularios
    - Validar datos de formularios
    - Procesar submissions
    - Generar HTML de formularios

    El Form Trigger del Orchestrator usa esta librería para
    manejar formularios web que inician workflows.
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._forms: Dict[str, FormDefinition] = {}
        self._submissions: Dict[str, FormSubmission] = {}
        self._current_submission: Optional[FormSubmission] = None

    # =========================================================================
    # FORM DEFINITION
    # =========================================================================

    @keyword("Create Form Definition")
    def create_form_definition(
        self,
        title: str,
        description: str = "",
        submit_button_label: str = "Submit",
        require_auth: bool = False
    ) -> str:
        """
        Crea una nueva definición de formulario.

        Args:
            title: Título del formulario
            description: Descripción/instrucciones
            submit_button_label: Texto del botón de envío
            require_auth: Si requiere autenticación

        Returns:
            ID del formulario creado

        Example:
            | ${form_id}= | Create Form Definition | Contact Form | Please fill out... |
        """
        form_id = f"form-{uuid.uuid4().hex[:12]}"

        form = FormDefinition(
            form_id=form_id,
            title=title,
            description=description,
            submit_button_label=submit_button_label,
            require_auth=require_auth
        )

        self._forms[form_id] = form
        logger.info(f"Form created: {form_id} - {title}")
        return form_id

    @keyword("Add Form Field")
    def add_form_field(
        self,
        form_id: str,
        field_type: str,
        label: str,
        field_id: Optional[str] = None,
        placeholder: str = "",
        required: bool = False,
        options: Optional[List[str]] = None,
        validation: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Agrega un campo al formulario.

        Args:
            form_id: ID del formulario
            field_type: Tipo de campo (text, email, number, date, dropdown, checkbox, file, textarea)
            label: Etiqueta del campo
            field_id: ID único del campo (auto-generado si no se especifica)
            placeholder: Texto placeholder
            required: Si el campo es requerido
            options: Opciones para dropdown
            validation: Reglas de validación

        Returns:
            ID del campo agregado

        Example:
            | ${field_id}= | Add Form Field | ${form_id} | text | Name | required=True |
            | ${field_id}= | Add Form Field | ${form_id} | dropdown | Country | options=${countries} |
        """
        if form_id not in self._forms:
            raise ValueError(f"Form not found: {form_id}")

        try:
            field_type_enum = FormFieldType(field_type.lower())
        except ValueError:
            field_type_enum = FormFieldType.TEXT

        fid = field_id or f"field-{uuid.uuid4().hex[:8]}"

        form_field = FormField(
            id=fid,
            type=field_type_enum,
            label=label,
            placeholder=placeholder,
            required=required,
            options=options or [],
            validation=validation or {}
        )

        self._forms[form_id].fields.append(form_field)
        logger.info(f"Field added to form {form_id}: {fid} ({field_type})")
        return fid

    @keyword("Get Form Definition")
    def get_form_definition(self, form_id: str) -> Dict[str, Any]:
        """
        Obtiene la definición de un formulario como diccionario.

        Args:
            form_id: ID del formulario

        Returns:
            Diccionario con la definición del formulario

        Example:
            | ${form}= | Get Form Definition | ${form_id} |
        """
        if form_id not in self._forms:
            raise ValueError(f"Form not found: {form_id}")

        form = self._forms[form_id]
        return {
            "form_id": form.form_id,
            "title": form.title,
            "description": form.description,
            "submit_button_label": form.submit_button_label,
            "require_auth": form.require_auth,
            "fields": [
                {
                    "id": f.id,
                    "type": f.type.value,
                    "label": f.label,
                    "placeholder": f.placeholder,
                    "required": f.required,
                    "options": f.options,
                    "validation": f.validation
                }
                for f in form.fields
            ]
        }

    @keyword("Load Form From Config")
    def load_form_from_config(self, config: Dict[str, Any]) -> str:
        """
        Carga un formulario desde la configuración del nodo trigger.form.

        Args:
            config: Configuración del nodo (formTitle, formDescription, fields, etc.)

        Returns:
            ID del formulario cargado

        Example:
            | ${form_id}= | Load Form From Config | ${node_config} |
        """
        form_id = self.create_form_definition(
            title=config.get("formTitle", "Form"),
            description=config.get("formDescription", ""),
            submit_button_label=config.get("submitButtonLabel", "Submit"),
            require_auth=config.get("requireAuth", False)
        )

        for field_def in config.get("fields", []):
            self.add_form_field(
                form_id=form_id,
                field_type=field_def.get("type", "text"),
                label=field_def.get("label", ""),
                field_id=field_def.get("id"),
                placeholder=field_def.get("placeholder", ""),
                required=field_def.get("required", False),
                options=field_def.get("options"),
                validation=field_def.get("validation")
            )

        return form_id

    # =========================================================================
    # FORM VALIDATION
    # =========================================================================

    @keyword("Validate Form Data")
    def validate_form_data(
        self,
        form_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Valida datos contra la definición del formulario.

        Args:
            form_id: ID del formulario
            data: Datos a validar

        Returns:
            Diccionario con {valid: bool, errors: [{field, message}]}

        Example:
            | ${result}= | Validate Form Data | ${form_id} | ${submission_data} |
            | Should Be True | ${result}[valid] |
        """
        if form_id not in self._forms:
            raise ValueError(f"Form not found: {form_id}")

        form = self._forms[form_id]
        errors = []

        for field in form.fields:
            value = data.get(field.id)

            # Required check
            if field.required and not value:
                errors.append({
                    "field": field.id,
                    "message": f"{field.label} is required"
                })
                continue

            if value is None:
                continue

            # Type-specific validation
            if field.type == FormFieldType.EMAIL:
                if not self._is_valid_email(str(value)):
                    errors.append({
                        "field": field.id,
                        "message": f"{field.label} must be a valid email"
                    })

            elif field.type == FormFieldType.NUMBER:
                try:
                    num = float(value)
                    if "min" in field.validation and num < field.validation["min"]:
                        errors.append({
                            "field": field.id,
                            "message": f"{field.label} must be at least {field.validation['min']}"
                        })
                    if "max" in field.validation and num > field.validation["max"]:
                        errors.append({
                            "field": field.id,
                            "message": f"{field.label} must be at most {field.validation['max']}"
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "field": field.id,
                        "message": f"{field.label} must be a number"
                    })

            elif field.type == FormFieldType.DROPDOWN:
                if field.options and str(value) not in field.options:
                    errors.append({
                        "field": field.id,
                        "message": f"{field.label} must be one of: {', '.join(field.options)}"
                    })

            # Pattern validation
            if "pattern" in field.validation:
                import re
                if not re.match(field.validation["pattern"], str(value)):
                    msg = field.validation.get("message", f"{field.label} has invalid format")
                    errors.append({"field": field.id, "message": msg})

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    # =========================================================================
    # FORM SUBMISSION
    # =========================================================================

    @keyword("Process Form Submission")
    def process_form_submission(
        self,
        form_id: str,
        data: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        authenticated_user: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Procesa una submission de formulario.

        Args:
            form_id: ID del formulario
            data: Datos enviados
            ip_address: IP del cliente
            user_agent: User agent del navegador
            authenticated_user: Usuario autenticado (si aplica)

        Returns:
            Diccionario con {submission_id, valid, errors, data}

        Example:
            | ${result}= | Process Form Submission | ${form_id} | ${form_data} |
        """
        # Validar datos
        validation = self.validate_form_data(form_id, data)

        if not validation["valid"]:
            return {
                "submission_id": None,
                "valid": False,
                "errors": validation["errors"],
                "data": data
            }

        # Crear submission
        submission_id = f"sub-{uuid.uuid4().hex[:12]}"
        submission = FormSubmission(
            submission_id=submission_id,
            form_id=form_id,
            data=data,
            submitted_at=datetime.now(),
            ip_address=ip_address,
            user_agent=user_agent,
            authenticated_user=authenticated_user
        )

        self._submissions[submission_id] = submission
        self._current_submission = submission

        logger.info(f"Form submission processed: {submission_id}")

        return {
            "submission_id": submission_id,
            "valid": True,
            "errors": [],
            "data": data
        }

    @keyword("Get Current Submission")
    def get_current_submission(self) -> Dict[str, Any]:
        """
        Obtiene los datos de la submission actual (del trigger).

        Returns:
            Diccionario con datos de la submission

        Example:
            | ${submission}= | Get Current Submission |
            | ${name}= | Set Variable | ${submission}[data][name] |
        """
        if not self._current_submission:
            return {}

        return {
            "submission_id": self._current_submission.submission_id,
            "form_id": self._current_submission.form_id,
            "data": self._current_submission.data,
            "submitted_at": self._current_submission.submitted_at.isoformat(),
            "ip_address": self._current_submission.ip_address,
            "user_agent": self._current_submission.user_agent,
            "authenticated_user": self._current_submission.authenticated_user
        }

    @keyword("Get Submission Field")
    def get_submission_field(
        self,
        field_id: str,
        default: Any = None
    ) -> Any:
        """
        Obtiene el valor de un campo de la submission actual.

        Args:
            field_id: ID del campo
            default: Valor por defecto si no existe

        Returns:
            Valor del campo

        Example:
            | ${email}= | Get Submission Field | email_field |
        """
        if not self._current_submission:
            return default

        return self._current_submission.data.get(field_id, default)

    @keyword("Set Submission Context")
    def set_submission_context(self, submission_data: Dict[str, Any]):
        """
        Establece el contexto de submission (usado por el Orchestrator).

        Args:
            submission_data: Datos de la submission

        Example:
            | Set Submission Context | ${trigger_data} |
        """
        submission = FormSubmission(
            submission_id=submission_data.get("submission_id", f"sub-{uuid.uuid4().hex[:12]}"),
            form_id=submission_data.get("form_id", ""),
            data=submission_data.get("data", {}),
            submitted_at=datetime.fromisoformat(submission_data["submitted_at"]) if "submitted_at" in submission_data else datetime.now(),
            ip_address=submission_data.get("ip_address"),
            user_agent=submission_data.get("user_agent"),
            authenticated_user=submission_data.get("authenticated_user")
        )

        self._current_submission = submission
        logger.info(f"Submission context set: {submission.submission_id}")

    # =========================================================================
    # HTML GENERATION
    # =========================================================================

    @keyword("Generate Form HTML")
    def generate_form_html(
        self,
        form_id: str,
        action_url: str = "",
        method: str = "POST",
        css_framework: str = "tailwind"
    ) -> str:
        """
        Genera el HTML de un formulario.

        Args:
            form_id: ID del formulario
            action_url: URL de acción del form
            method: Método HTTP
            css_framework: Framework CSS (tailwind, bootstrap, none)

        Returns:
            HTML del formulario

        Example:
            | ${html}= | Generate Form HTML | ${form_id} | /api/submit |
        """
        if form_id not in self._forms:
            raise ValueError(f"Form not found: {form_id}")

        form = self._forms[form_id]

        # CSS classes based on framework
        styles = self._get_css_classes(css_framework)

        html_parts = [
            f'<form action="{action_url}" method="{method}" class="{styles["form"]}">',
            f'  <h2 class="{styles["title"]}">{self._escape_html(form.title)}</h2>',
        ]

        if form.description:
            html_parts.append(
                f'  <p class="{styles["description"]}">{self._escape_html(form.description)}</p>'
            )

        html_parts.append(f'  <div class="{styles["fields_container"]}">')

        for field in form.fields:
            html_parts.append(self._generate_field_html(field, styles))

        html_parts.append('  </div>')
        html_parts.append(
            f'  <button type="submit" class="{styles["submit_button"]}">'
            f'{self._escape_html(form.submit_button_label)}</button>'
        )
        html_parts.append('</form>')

        return "\n".join(html_parts)

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _is_valid_email(self, email: str) -> bool:
        """Valida formato de email básico"""
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    def _escape_html(self, text: str) -> str:
        """Escapa caracteres HTML"""
        return (text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#x27;"))

    def _get_css_classes(self, framework: str) -> Dict[str, str]:
        """Retorna clases CSS según el framework"""
        if framework == "tailwind":
            return {
                "form": "space-y-6 max-w-lg mx-auto p-6",
                "title": "text-2xl font-bold text-gray-900",
                "description": "text-gray-600 mt-2",
                "fields_container": "space-y-4",
                "field_wrapper": "space-y-1",
                "label": "block text-sm font-medium text-gray-700",
                "input": "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500",
                "textarea": "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500",
                "select": "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500",
                "checkbox_wrapper": "flex items-center gap-2",
                "checkbox": "h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded",
                "submit_button": "w-full px-4 py-2 bg-rose-600 text-white font-medium rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500",
                "required": "text-red-500 ml-1",
            }
        elif framework == "bootstrap":
            return {
                "form": "container mt-4",
                "title": "h2",
                "description": "text-muted",
                "fields_container": "",
                "field_wrapper": "mb-3",
                "label": "form-label",
                "input": "form-control",
                "textarea": "form-control",
                "select": "form-select",
                "checkbox_wrapper": "form-check",
                "checkbox": "form-check-input",
                "submit_button": "btn btn-primary",
                "required": "text-danger",
            }
        else:
            return {k: "" for k in [
                "form", "title", "description", "fields_container", "field_wrapper",
                "label", "input", "textarea", "select", "checkbox_wrapper",
                "checkbox", "submit_button", "required"
            ]}

    def _generate_field_html(self, field: FormField, styles: Dict[str, str]) -> str:
        """Genera HTML para un campo"""
        required_mark = f'<span class="{styles["required"]}">*</span>' if field.required else ""
        required_attr = "required" if field.required else ""

        html = f'    <div class="{styles["field_wrapper"]}">'
        html += f'\n      <label for="{field.id}" class="{styles["label"]}">{self._escape_html(field.label)}{required_mark}</label>'

        if field.type == FormFieldType.TEXTAREA:
            html += f'\n      <textarea id="{field.id}" name="{field.id}" class="{styles["textarea"]}" placeholder="{self._escape_html(field.placeholder)}" {required_attr}></textarea>'

        elif field.type == FormFieldType.DROPDOWN:
            html += f'\n      <select id="{field.id}" name="{field.id}" class="{styles["select"]}" {required_attr}>'
            html += f'\n        <option value="">Select...</option>'
            for opt in field.options:
                html += f'\n        <option value="{self._escape_html(opt)}">{self._escape_html(opt)}</option>'
            html += '\n      </select>'

        elif field.type == FormFieldType.CHECKBOX:
            html = f'    <div class="{styles["checkbox_wrapper"]}">'
            html += f'\n      <input type="checkbox" id="{field.id}" name="{field.id}" class="{styles["checkbox"]}" {required_attr}>'
            html += f'\n      <label for="{field.id}" class="{styles["label"]}">{self._escape_html(field.label)}{required_mark}</label>'

        elif field.type == FormFieldType.FILE:
            html += f'\n      <input type="file" id="{field.id}" name="{field.id}" class="{styles["input"]}" {required_attr}>'

        else:
            input_type = field.type.value
            html += f'\n      <input type="{input_type}" id="{field.id}" name="{field.id}" class="{styles["input"]}" placeholder="{self._escape_html(field.placeholder)}" {required_attr}>'

        html += '\n    </div>'
        return html
