"""
Librería SkuldHuman para nodos Human-in-the-Loop (Robot Framework)

Proporciona keywords para interacción humana en flujos RPA:
- Aprobaciones manuales
- Input de usuario
- Revisión de datos
- Escalamiento
- Notificaciones con respuesta
"""

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger


class TaskStatus(Enum):
    """Estados de tareas humanas"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"
    EXPIRED = "expired"
    ESCALATED = "escalated"


class TaskPriority(Enum):
    """Prioridad de tareas"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class HumanTask:
    """Representa una tarea que requiere intervención humana"""
    task_id: str
    task_type: str
    title: str
    description: str
    data: Dict[str, Any]
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.NORMAL
    assignee: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    timeout_minutes: int = 60
    response: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HumanTaskResult:
    """Resultado de una tarea humana"""
    task_id: str
    status: TaskStatus
    response: Optional[Dict[str, Any]] = None
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    comments: Optional[str] = None


@library(scope="GLOBAL", auto_keywords=True)
class SkuldHuman:
    """
    Librería de Human-in-the-Loop para Skuldbot.

    Proporciona keywords para:
    - Solicitar aprobaciones manuales
    - Capturar input de usuarios
    - Enviar tareas para revisión
    - Escalar a supervisores
    - Notificaciones con respuesta requerida

    Integración:
    - Local (dialogs)
    - Orchestrator (task queue)
    - Email
    - Slack/Teams
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._tasks: Dict[str, HumanTask] = {}
        self._orchestrator_url: Optional[str] = None
        self._orchestrator_key: Optional[str] = None
        self._notification_config: Dict[str, Any] = {}
        self._default_timeout: int = 60
        self._mode: str = "local"  # local, orchestrator, mock

    # =========================================================================
    # CONFIGURACIÓN
    # =========================================================================

    @keyword("Configure Human Tasks")
    def configure_human_tasks(
        self,
        mode: str = "local",
        orchestrator_url: Optional[str] = None,
        orchestrator_key: Optional[str] = None,
        default_timeout: int = 60,
        **notification_config
    ):
        """
        Configura el sistema de tareas humanas.

        Args:
            mode: Modo de operación (local, orchestrator, mock)
            orchestrator_url: URL del Orchestrator (si mode=orchestrator)
            orchestrator_key: API key del Orchestrator
            default_timeout: Timeout por defecto en minutos
            **notification_config: Config de notificaciones (email, slack, etc.)

        Example:
            | Configure Human Tasks | orchestrator | ${url} | ${api_key} | 30 |
            | Configure Human Tasks | local | | | 60 | slack_webhook=${webhook} |
        """
        self._mode = mode
        self._orchestrator_url = orchestrator_url
        self._orchestrator_key = orchestrator_key
        self._default_timeout = default_timeout
        self._notification_config = notification_config

        logger.info(f"Human tasks configured in {mode} mode")

    # =========================================================================
    # APROBACIONES
    # =========================================================================

    @keyword("Request Approval")
    def request_approval(
        self,
        title: str,
        description: str,
        data: Optional[Dict[str, Any]] = None,
        assignee: Optional[str] = None,
        priority: str = "normal",
        timeout_minutes: Optional[int] = None,
        wait_for_response: bool = True
    ) -> Union[bool, str]:
        """
        Solicita aprobación humana para continuar el proceso.

        Args:
            title: Título de la solicitud
            description: Descripción detallada
            data: Datos a mostrar para la decisión
            assignee: Usuario/grupo asignado
            priority: Prioridad (low, normal, high, urgent)
            timeout_minutes: Tiempo límite para responder
            wait_for_response: Si True, espera la respuesta

        Returns:
            True si aprobado, False si rechazado, task_id si no espera

        Example:
            | ${approved}= | Request Approval | Large Transaction | Amount: $50,000 |
            | Run Keyword If | ${approved} | Process Transaction |
        """
        task = self._create_task(
            task_type="approval",
            title=title,
            description=description,
            data=data or {},
            assignee=assignee,
            priority=priority,
            timeout_minutes=timeout_minutes
        )

        # Enviar notificación
        self._send_notification(task, "approval_requested")

        if not wait_for_response:
            return task.task_id

        # Esperar respuesta
        result = self._wait_for_task(task.task_id, timeout_minutes)

        if result.status == TaskStatus.APPROVED:
            logger.info(f"Approval {task.task_id} was approved by {result.completed_by}")
            return True
        elif result.status == TaskStatus.REJECTED:
            logger.info(f"Approval {task.task_id} was rejected by {result.completed_by}")
            return False
        else:
            logger.warn(f"Approval {task.task_id} timed out or was escalated")
            return False

    @keyword("Request Multi Level Approval")
    def request_multi_level_approval(
        self,
        title: str,
        description: str,
        approvers: List[str],
        require_all: bool = True,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Solicita aprobación de múltiples niveles/personas.

        Args:
            title: Título de la solicitud
            description: Descripción
            approvers: Lista de aprobadores en orden
            require_all: Si True, todos deben aprobar
            data: Datos adicionales

        Returns:
            True si todas las aprobaciones requeridas fueron otorgadas

        Example:
            | ${approvers}= | Create List | manager@co.com | director@co.com |
            | ${ok}= | Request Multi Level Approval | Budget Request | ${desc} | ${approvers} |
        """
        approved_by = []

        for approver in approvers:
            task = self._create_task(
                task_type="approval",
                title=f"{title} (Level {len(approved_by) + 1})",
                description=f"{description}\n\nPreviously approved by: {', '.join(approved_by) if approved_by else 'None'}",
                data=data or {},
                assignee=approver,
                priority="high"
            )

            self._send_notification(task, "approval_requested")
            result = self._wait_for_task(task.task_id)

            if result.status == TaskStatus.APPROVED:
                approved_by.append(result.completed_by or approver)
            else:
                if require_all:
                    logger.warn(f"Multi-level approval failed at {approver}")
                    return False

        if require_all:
            return len(approved_by) == len(approvers)
        else:
            return len(approved_by) > 0

    # =========================================================================
    # INPUT DE USUARIO
    # =========================================================================

    @keyword("Request User Input")
    def request_user_input(
        self,
        title: str,
        fields: Dict[str, Dict[str, Any]],
        description: Optional[str] = None,
        assignee: Optional[str] = None,
        timeout_minutes: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Solicita input estructurado de un usuario.

        Args:
            title: Título del formulario
            fields: Definición de campos {name: {type, label, required, default, options}}
            description: Descripción del formulario
            assignee: Usuario asignado
            timeout_minutes: Timeout

        Returns:
            Diccionario con los valores ingresados

        Example:
            | ${fields}= | Create Dictionary |
            | ... | amount={"type": "number", "label": "Amount", "required": True} |
            | ... | notes={"type": "text", "label": "Notes", "required": False} |
            | ${input}= | Request User Input | Adjustment Form | ${fields} |
        """
        task = self._create_task(
            task_type="input",
            title=title,
            description=description or "Please fill in the required information.",
            data={"fields": fields},
            assignee=assignee,
            timeout_minutes=timeout_minutes
        )

        self._send_notification(task, "input_requested")
        result = self._wait_for_task(task.task_id, timeout_minutes)

        if result.status == TaskStatus.COMPLETED and result.response:
            return result.response
        else:
            logger.warn(f"User input {task.task_id} was not completed")
            return {}

    @keyword("Request File Upload")
    def request_file_upload(
        self,
        title: str,
        description: str,
        allowed_types: Optional[List[str]] = None,
        multiple: bool = False,
        assignee: Optional[str] = None
    ) -> Union[str, List[str]]:
        """
        Solicita al usuario que suba uno o más archivos.

        Args:
            title: Título de la solicitud
            description: Instrucciones para el usuario
            allowed_types: Extensiones permitidas (ej: [".pdf", ".xlsx"])
            multiple: Si permite múltiples archivos
            assignee: Usuario asignado

        Returns:
            Ruta(s) del archivo(s) subido(s)

        Example:
            | ${file}= | Request File Upload | Upload Invoice | Please upload the invoice PDF |
            | ${files}= | Request File Upload | Upload Docs | Upload documents | multiple=True |
        """
        task = self._create_task(
            task_type="file_upload",
            title=title,
            description=description,
            data={
                "allowed_types": allowed_types or [],
                "multiple": multiple
            },
            assignee=assignee
        )

        self._send_notification(task, "file_upload_requested")
        result = self._wait_for_task(task.task_id)

        if result.status == TaskStatus.COMPLETED and result.response:
            files = result.response.get("files", [])
            return files if multiple else (files[0] if files else "")
        return [] if multiple else ""

    # =========================================================================
    # REVISIÓN DE DATOS
    # =========================================================================

    @keyword("Request Data Review")
    def request_data_review(
        self,
        title: str,
        data: Dict[str, Any],
        editable_fields: Optional[List[str]] = None,
        instructions: Optional[str] = None,
        assignee: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Envía datos para revisión y posible corrección humana.

        Args:
            title: Título de la revisión
            data: Datos a revisar
            editable_fields: Campos que pueden ser modificados
            instructions: Instrucciones para el revisor
            assignee: Usuario asignado

        Returns:
            Datos revisados (posiblemente modificados)

        Example:
            | ${extracted}= | Extract Invoice Data | ${pdf} |
            | ${verified}= | Request Data Review | Verify Invoice | ${extracted} |
        """
        task = self._create_task(
            task_type="data_review",
            title=title,
            description=instructions or "Please review and correct the data if necessary.",
            data={
                "original_data": data,
                "editable_fields": editable_fields or list(data.keys())
            },
            assignee=assignee
        )

        self._send_notification(task, "review_requested")
        result = self._wait_for_task(task.task_id)

        if result.status == TaskStatus.COMPLETED and result.response:
            reviewed_data = result.response.get("reviewed_data", data)
            changes = result.response.get("changes", [])
            if changes:
                logger.info(f"Data review {task.task_id} had {len(changes)} modifications")
            return reviewed_data

        return data  # Retornar original si no hubo revisión

    @keyword("Request Exception Handling")
    def request_exception_handling(
        self,
        title: str,
        error_details: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        options: Optional[List[str]] = None,
        assignee: Optional[str] = None
    ) -> str:
        """
        Solicita decisión humana para manejar una excepción.

        Args:
            title: Título del problema
            error_details: Detalles del error
            context: Contexto adicional
            options: Opciones de resolución disponibles
            assignee: Usuario asignado

        Returns:
            Opción seleccionada

        Example:
            | ${error}= | Create Dictionary | code=ERR001 | message=Invalid format |
            | ${opts}= | Create List | retry | skip | abort |
            | ${decision}= | Request Exception Handling | Processing Error | ${error} | options=${opts} |
        """
        default_options = ["retry", "skip", "abort", "manual_fix"]

        task = self._create_task(
            task_type="exception",
            title=title,
            description="An exception occurred that requires human decision.",
            data={
                "error": error_details,
                "context": context or {},
                "options": options or default_options
            },
            assignee=assignee,
            priority="high"
        )

        self._send_notification(task, "exception_occurred")
        result = self._wait_for_task(task.task_id)

        if result.status == TaskStatus.COMPLETED and result.response:
            return result.response.get("selected_option", "abort")

        return "abort"

    # =========================================================================
    # ESCALAMIENTO
    # =========================================================================

    @keyword("Escalate Task")
    def escalate_task(
        self,
        task_id: str,
        escalation_reason: str,
        new_assignee: str,
        increase_priority: bool = True
    ) -> bool:
        """
        Escala una tarea a otro usuario/nivel.

        Args:
            task_id: ID de la tarea a escalar
            escalation_reason: Motivo del escalamiento
            new_assignee: Nuevo asignado
            increase_priority: Si aumentar la prioridad

        Returns:
            True si el escalamiento fue exitoso

        Example:
            | ${ok}= | Escalate Task | ${task_id} | Timeout exceeded | supervisor@co.com |
        """
        if task_id not in self._tasks:
            logger.error(f"Task {task_id} not found")
            return False

        task = self._tasks[task_id]
        task.status = TaskStatus.ESCALATED
        task.assignee = new_assignee
        task.metadata["escalation_reason"] = escalation_reason
        task.metadata["escalated_at"] = datetime.now().isoformat()

        if increase_priority:
            priorities = [TaskPriority.LOW, TaskPriority.NORMAL, TaskPriority.HIGH, TaskPriority.URGENT]
            current_idx = priorities.index(task.priority)
            if current_idx < len(priorities) - 1:
                task.priority = priorities[current_idx + 1]

        self._send_notification(task, "task_escalated")
        logger.info(f"Task {task_id} escalated to {new_assignee}")
        return True

    @keyword("Create Escalation Chain")
    def create_escalation_chain(
        self,
        title: str,
        description: str,
        chain: List[Dict[str, Any]],
        data: Optional[Dict[str, Any]] = None
    ) -> HumanTaskResult:
        """
        Crea una cadena de escalamiento automático.

        Args:
            title: Título de la tarea
            description: Descripción
            chain: Lista de niveles [{assignee, timeout_minutes}, ...]
            data: Datos de la tarea

        Returns:
            Resultado de la tarea (del nivel que respondió)

        Example:
            | ${chain}= | Create List |
            | ... | {"assignee": "agent@co.com", "timeout_minutes": 15} |
            | ... | {"assignee": "manager@co.com", "timeout_minutes": 30} |
            | ${result}= | Create Escalation Chain | Urgent Issue | ${desc} | ${chain} |
        """
        for i, level in enumerate(chain):
            assignee = level.get("assignee")
            timeout = level.get("timeout_minutes", 30)

            task = self._create_task(
                task_type="approval",
                title=f"{title} (Level {i + 1})",
                description=description,
                data=data or {},
                assignee=assignee,
                timeout_minutes=timeout,
                priority="high" if i > 0 else "normal"
            )

            self._send_notification(task, "approval_requested")
            result = self._wait_for_task(task.task_id, timeout)

            if result.status in [TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.COMPLETED]:
                return result

            # Si timeout, continuar al siguiente nivel
            logger.info(f"Escalating from level {i + 1} to level {i + 2}")

        # Todos los niveles expirados
        return HumanTaskResult(
            task_id=task.task_id,
            status=TaskStatus.EXPIRED
        )

    # =========================================================================
    # NOTIFICACIONES
    # =========================================================================

    @keyword("Send Human Notification")
    def send_human_notification(
        self,
        recipients: Union[str, List[str]],
        title: str,
        message: str,
        channel: str = "email",
        require_acknowledgment: bool = False
    ) -> Union[bool, str]:
        """
        Envía una notificación a usuarios.

        Args:
            recipients: Destinatario(s)
            title: Título/asunto
            message: Contenido del mensaje
            channel: Canal (email, slack, teams, sms)
            require_acknowledgment: Si requiere confirmación de lectura

        Returns:
            True si enviado, task_id si requiere acknowledgment

        Example:
            | Send Human Notification | admin@co.com | Bot Error | ${error_msg} | email |
            | ${ack_id}= | Send Human Notification | ${team} | Alert | ${msg} | slack | True |
        """
        if isinstance(recipients, str):
            recipients = [recipients]

        if require_acknowledgment:
            task = self._create_task(
                task_type="notification_ack",
                title=title,
                description=message,
                data={"channel": channel, "recipients": recipients}
            )
            self._send_notification(task, "notification_sent")
            return task.task_id
        else:
            # Enviar notificación simple
            self._send_simple_notification(
                channel=channel,
                recipients=recipients,
                title=title,
                message=message
            )
            return True

    @keyword("Wait For Acknowledgment")
    def wait_for_acknowledgment(
        self,
        task_id: str,
        timeout_minutes: Optional[int] = None
    ) -> bool:
        """
        Espera a que una notificación sea reconocida.

        Args:
            task_id: ID de la tarea de notificación
            timeout_minutes: Tiempo máximo de espera

        Returns:
            True si fue reconocida

        Example:
            | ${ack_id}= | Send Human Notification | ${user} | Alert | ${msg} | True |
            | ${acked}= | Wait For Acknowledgment | ${ack_id} |
        """
        result = self._wait_for_task(task_id, timeout_minutes)
        return result.status == TaskStatus.COMPLETED

    # =========================================================================
    # GESTIÓN DE TAREAS
    # =========================================================================

    @keyword("Get Human Task Status")
    def get_human_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        Obtiene el estado de una tarea humana.

        Args:
            task_id: ID de la tarea

        Returns:
            Diccionario con estado y detalles

        Example:
            | ${status}= | Get Human Task Status | ${task_id} |
        """
        if task_id not in self._tasks:
            return {"error": "Task not found", "task_id": task_id}

        task = self._tasks[task_id]
        return {
            "task_id": task.task_id,
            "status": task.status.value,
            "title": task.title,
            "assignee": task.assignee,
            "priority": task.priority.value,
            "created_at": task.created_at.isoformat(),
            "response": task.response
        }

    @keyword("Cancel Human Task")
    def cancel_human_task(
        self,
        task_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """
        Cancela una tarea humana pendiente.

        Args:
            task_id: ID de la tarea
            reason: Motivo de cancelación

        Returns:
            True si fue cancelada

        Example:
            | ${ok}= | Cancel Human Task | ${task_id} | No longer needed |
        """
        if task_id not in self._tasks:
            return False

        task = self._tasks[task_id]
        if task.status not in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]:
            return False

        task.status = TaskStatus.EXPIRED
        task.metadata["cancelled_reason"] = reason
        task.metadata["cancelled_at"] = datetime.now().isoformat()

        logger.info(f"Task {task_id} cancelled: {reason}")
        return True

    @keyword("List Pending Human Tasks")
    def list_pending_human_tasks(
        self,
        assignee: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Lista tareas humanas pendientes.

        Args:
            assignee: Filtrar por asignado

        Returns:
            Lista de tareas pendientes

        Example:
            | ${pending}= | List Pending Human Tasks |
            | ${my_tasks}= | List Pending Human Tasks | agent@co.com |
        """
        tasks = []
        for task in self._tasks.values():
            if task.status in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]:
                if assignee is None or task.assignee == assignee:
                    tasks.append({
                        "task_id": task.task_id,
                        "title": task.title,
                        "type": task.task_type,
                        "assignee": task.assignee,
                        "priority": task.priority.value,
                        "created_at": task.created_at.isoformat()
                    })
        return tasks

    # =========================================================================
    # HELPERS INTERNOS
    # =========================================================================

    def _create_task(
        self,
        task_type: str,
        title: str,
        description: str,
        data: Dict[str, Any],
        assignee: Optional[str] = None,
        priority: str = "normal",
        timeout_minutes: Optional[int] = None
    ) -> HumanTask:
        """Crea una nueva tarea humana"""
        task_id = f"task-{uuid.uuid4().hex[:12]}"

        try:
            priority_enum = TaskPriority(priority.lower())
        except ValueError:
            priority_enum = TaskPriority.NORMAL

        task = HumanTask(
            task_id=task_id,
            task_type=task_type,
            title=title,
            description=description,
            data=data,
            assignee=assignee,
            priority=priority_enum,
            timeout_minutes=timeout_minutes or self._default_timeout
        )

        self._tasks[task_id] = task
        logger.info(f"Human task created: {task_id} ({task_type})")

        return task

    def _wait_for_task(
        self,
        task_id: str,
        timeout_minutes: Optional[int] = None
    ) -> HumanTaskResult:
        """Espera a que una tarea sea completada"""
        if task_id not in self._tasks:
            return HumanTaskResult(task_id=task_id, status=TaskStatus.EXPIRED)

        task = self._tasks[task_id]
        timeout = timeout_minutes or task.timeout_minutes
        deadline = datetime.now() + timedelta(minutes=timeout)

        if self._mode == "mock":
            # En modo mock, simular aprobación inmediata
            return HumanTaskResult(
                task_id=task_id,
                status=TaskStatus.APPROVED,
                response={"mock": True},
                completed_by="mock_user",
                completed_at=datetime.now()
            )

        if self._mode == "local":
            # En modo local, usar diálogo del sistema
            result = self._show_local_dialog(task)
            return result

        if self._mode == "orchestrator":
            # En modo orchestrator, polling al servidor
            return self._poll_orchestrator(task_id, deadline)

        # Fallback: timeout
        return HumanTaskResult(task_id=task_id, status=TaskStatus.EXPIRED)

    def _show_local_dialog(self, task: HumanTask) -> HumanTaskResult:
        """Muestra un diálogo local para la tarea"""
        try:
            # Intentar usar RPA.Dialogs si está disponible
            from RPA.Dialogs import Dialogs
            dialogs = Dialogs()

            if task.task_type == "approval":
                dialogs.create_form(task.title)
                dialogs.add_text(task.description)
                if task.data:
                    dialogs.add_text(f"\nData:\n{json.dumps(task.data, indent=2)}")
                dialogs.add_submit_buttons(["Approve", "Reject"])

                result = dialogs.request_response()
                approved = result.get("submit") == "Approve"

                return HumanTaskResult(
                    task_id=task.task_id,
                    status=TaskStatus.APPROVED if approved else TaskStatus.REJECTED,
                    completed_by="local_user",
                    completed_at=datetime.now()
                )

            elif task.task_type == "input":
                dialogs.create_form(task.title)
                dialogs.add_text(task.description)

                fields = task.data.get("fields", {})
                for field_name, field_config in fields.items():
                    field_type = field_config.get("type", "text")
                    label = field_config.get("label", field_name)
                    default = field_config.get("default", "")

                    if field_type == "text":
                        dialogs.add_text_input(field_name, label, default)
                    elif field_type == "number":
                        dialogs.add_text_input(field_name, label, str(default))
                    elif field_type == "dropdown":
                        options = field_config.get("options", [])
                        dialogs.add_dropdown(field_name, label, options, default)

                dialogs.add_submit_buttons(["Submit", "Cancel"])
                result = dialogs.request_response()

                if result.get("submit") == "Cancel":
                    return HumanTaskResult(task_id=task.task_id, status=TaskStatus.EXPIRED)

                # Extraer respuestas
                response = {k: v for k, v in result.items() if k != "submit"}

                return HumanTaskResult(
                    task_id=task.task_id,
                    status=TaskStatus.COMPLETED,
                    response=response,
                    completed_by="local_user",
                    completed_at=datetime.now()
                )

            else:
                # Tipo genérico
                dialogs.create_form(task.title)
                dialogs.add_text(task.description)
                dialogs.add_submit_buttons(["OK", "Cancel"])

                result = dialogs.request_response()
                completed = result.get("submit") == "OK"

                return HumanTaskResult(
                    task_id=task.task_id,
                    status=TaskStatus.COMPLETED if completed else TaskStatus.EXPIRED,
                    completed_by="local_user",
                    completed_at=datetime.now()
                )

        except ImportError:
            logger.warn("RPA.Dialogs not available. Using console input.")
            return self._console_fallback(task)

    def _console_fallback(self, task: HumanTask) -> HumanTaskResult:
        """Fallback a entrada de consola"""
        print(f"\n{'='*50}")
        print(f"HUMAN TASK: {task.title}")
        print(f"{'='*50}")
        print(f"Description: {task.description}")
        if task.data:
            print(f"Data: {json.dumps(task.data, indent=2)}")
        print(f"{'='*50}")

        if task.task_type == "approval":
            response = input("Approve? (y/n): ").strip().lower()
            approved = response in ["y", "yes", "approve", "1"]
            return HumanTaskResult(
                task_id=task.task_id,
                status=TaskStatus.APPROVED if approved else TaskStatus.REJECTED,
                completed_by="console_user",
                completed_at=datetime.now()
            )
        else:
            input("Press Enter to acknowledge...")
            return HumanTaskResult(
                task_id=task.task_id,
                status=TaskStatus.COMPLETED,
                completed_by="console_user",
                completed_at=datetime.now()
            )

    def _poll_orchestrator(
        self,
        task_id: str,
        deadline: datetime
    ) -> HumanTaskResult:
        """Polling al Orchestrator para estado de tarea"""
        if not self._orchestrator_url:
            return HumanTaskResult(task_id=task_id, status=TaskStatus.EXPIRED)

        try:
            import requests
        except ImportError:
            logger.error("requests package required for orchestrator mode")
            return HumanTaskResult(task_id=task_id, status=TaskStatus.EXPIRED)

        headers = {"Authorization": f"Bearer {self._orchestrator_key}"}
        url = f"{self._orchestrator_url}/api/human-tasks/{task_id}"

        while datetime.now() < deadline:
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    status = TaskStatus(data.get("status", "pending"))

                    if status not in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]:
                        return HumanTaskResult(
                            task_id=task_id,
                            status=status,
                            response=data.get("response"),
                            completed_by=data.get("completed_by"),
                            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None
                        )
            except Exception as e:
                logger.warn(f"Orchestrator poll failed: {e}")

            time.sleep(5)  # Poll cada 5 segundos

        return HumanTaskResult(task_id=task_id, status=TaskStatus.EXPIRED)

    def _send_notification(self, task: HumanTask, event: str):
        """Envía notificación sobre un evento de tarea"""
        if self._mode == "orchestrator" and self._orchestrator_url:
            self._notify_orchestrator(task, event)

        # Notificaciones adicionales según config
        if "slack_webhook" in self._notification_config:
            self._notify_slack(task, event)

        if "email_smtp" in self._notification_config:
            self._notify_email(task, event)

    def _send_simple_notification(
        self,
        channel: str,
        recipients: List[str],
        title: str,
        message: str
    ):
        """Envía notificación simple sin crear tarea"""
        logger.info(f"Notification sent via {channel} to {recipients}: {title}")

        # Implementar según canal
        if channel == "slack" and "slack_webhook" in self._notification_config:
            self._send_slack_message(title, message)
        elif channel == "email" and "email_smtp" in self._notification_config:
            self._send_email(recipients, title, message)

    def _notify_orchestrator(self, task: HumanTask, event: str):
        """Notifica al Orchestrator sobre una tarea"""
        try:
            import requests

            headers = {"Authorization": f"Bearer {self._orchestrator_key}"}
            url = f"{self._orchestrator_url}/api/human-tasks"

            payload = {
                "task_id": task.task_id,
                "event": event,
                "task_type": task.task_type,
                "title": task.title,
                "description": task.description,
                "data": task.data,
                "assignee": task.assignee,
                "priority": task.priority.value,
                "timeout_minutes": task.timeout_minutes
            }

            requests.post(url, json=payload, headers=headers, timeout=10)
        except Exception as e:
            logger.warn(f"Failed to notify orchestrator: {e}")

    def _notify_slack(self, task: HumanTask, event: str):
        """Envía notificación a Slack"""
        webhook = self._notification_config.get("slack_webhook")
        if not webhook:
            return

        try:
            import requests

            message = {
                "text": f"*{event.upper()}*: {task.title}",
                "blocks": [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*{task.title}*\n{task.description}"}
                    },
                    {
                        "type": "context",
                        "elements": [
                            {"type": "mrkdwn", "text": f"Priority: {task.priority.value}"},
                            {"type": "mrkdwn", "text": f"Task ID: {task.task_id}"}
                        ]
                    }
                ]
            }

            requests.post(webhook, json=message, timeout=10)
        except Exception as e:
            logger.warn(f"Failed to send Slack notification: {e}")

    def _notify_email(self, task: HumanTask, event: str):
        """Envía notificación por email"""
        # Implementación básica - requiere configuración SMTP
        logger.info(f"Email notification for task {task.task_id}: {event}")

    def _send_slack_message(self, title: str, message: str):
        """Envía mensaje simple a Slack"""
        webhook = self._notification_config.get("slack_webhook")
        if not webhook:
            return

        try:
            import requests
            requests.post(webhook, json={"text": f"*{title}*\n{message}"}, timeout=10)
        except Exception:
            pass

    def _send_email(self, recipients: List[str], title: str, message: str):
        """Envía email simple"""
        # Requiere configuración SMTP
        logger.info(f"Email to {recipients}: {title}")
