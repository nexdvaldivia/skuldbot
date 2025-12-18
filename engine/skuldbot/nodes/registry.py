"""
Node Registry - Mapeo de nodos DSL a keywords Robot Framework

Este archivo define el mapeo completo entre los tipos de nodos del Studio
y sus correspondientes keywords de Robot Framework / rpaframework.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from enum import Enum


class NodeCategory(str, Enum):
    """Categorias de nodos"""
    TRIGGER = "trigger"
    WEB = "web"
    DESKTOP = "desktop"
    FILES = "files"
    EXCEL = "excel"
    EMAIL = "email"
    API = "api"
    DATABASE = "database"
    DOCUMENT = "document"
    AI = "ai"
    PYTHON = "python"
    CONTROL = "control"
    LOGGING = "logging"
    SECURITY = "security"
    HUMAN = "human"
    COMPLIANCE = "compliance"
    DATAQUALITY = "dataquality"


@dataclass
class LibraryImport:
    """Representa un import de libreria Robot Framework"""
    name: str
    alias: Optional[str] = None
    args: List[str] = field(default_factory=list)

    def to_robot(self) -> str:
        """Genera linea de import para Robot Framework"""
        line = f"Library    {self.name}"
        if self.args:
            line += "    " + "    ".join(self.args)
        if self.alias:
            line += f"    WITH NAME    {self.alias}"
        return line


@dataclass
class NodeMapping:
    """Mapeo de un nodo DSL a Robot Framework"""
    node_type: str
    category: NodeCategory
    keyword: str
    library: LibraryImport
    description: str
    config_mapping: Dict[str, str] = field(default_factory=dict)
    pre_keywords: List[str] = field(default_factory=list)
    post_keywords: List[str] = field(default_factory=list)
    return_variable: Optional[str] = None
    error_handler: Optional[str] = None

    def generate_robot_code(self, config: Dict[str, Any], node_id: str) -> str:
        """
        Genera el codigo Robot Framework para este nodo.

        Args:
            config: Configuracion del nodo desde el DSL
            node_id: ID del nodo para logging/error handling

        Returns:
            Codigo Robot Framework como string
        """
        lines = []

        # Pre-keywords
        for pre in self.pre_keywords:
            lines.append(f"    {pre}")

        # Keyword principal con argumentos
        args = []
        for config_key, rf_arg in self.config_mapping.items():
            if config_key in config:
                value = config[config_key]
                if isinstance(value, bool):
                    value = str(value).lower()
                elif isinstance(value, str) and " " in value:
                    value = f"'{value}'"
                args.append(f"{rf_arg}={value}")

        keyword_line = f"    {self.keyword}"
        if args:
            keyword_line += "    " + "    ".join(args)

        if self.return_variable:
            keyword_line = f"    ${{{self.return_variable}}}=    " + self.keyword
            if args:
                keyword_line += "    " + "    ".join(args)

        lines.append(keyword_line)

        # Post-keywords
        for post in self.post_keywords:
            lines.append(f"    {post}")

        return "\n".join(lines)


# =============================================================================
# REGISTRY DE NODOS
# =============================================================================

NODE_REGISTRY: Dict[str, NodeMapping] = {}


def register_node(mapping: NodeMapping) -> None:
    """Registra un mapeo de nodo"""
    NODE_REGISTRY[mapping.node_type] = mapping


def get_node_mapping(node_type: str) -> Optional[NodeMapping]:
    """Obtiene el mapeo para un tipo de nodo"""
    return NODE_REGISTRY.get(node_type)


def get_required_libraries(node_types: List[str]) -> List[LibraryImport]:
    """Obtiene las librerias requeridas para un conjunto de nodos"""
    libraries = {}
    for node_type in node_types:
        mapping = get_node_mapping(node_type)
        if mapping:
            lib = mapping.library
            if lib.name not in libraries:
                libraries[lib.name] = lib
    return list(libraries.values())


# =============================================================================
# LIBRERIAS COMUNES
# =============================================================================

LIB_BROWSER_PLAYWRIGHT = LibraryImport("RPA.Browser.Playwright")
LIB_BROWSER_SELENIUM = LibraryImport("RPA.Browser.Selenium")
LIB_DESKTOP = LibraryImport("RPA.Desktop")
LIB_WINDOWS = LibraryImport("RPA.Windows")
LIB_FILESYSTEM = LibraryImport("RPA.FileSystem")
LIB_ARCHIVE = LibraryImport("RPA.Archive")
LIB_EXCEL_FILES = LibraryImport("RPA.Excel.Files")
LIB_EXCEL_APP = LibraryImport("RPA.Excel.Application")
LIB_TABLES = LibraryImport("RPA.Tables")
LIB_EMAIL_IMAP = LibraryImport("RPA.Email.ImapSmtp")
LIB_EMAIL_EXCHANGE = LibraryImport("RPA.Email.Exchange")
LIB_HTTP = LibraryImport("RPA.HTTP")
LIB_JSON = LibraryImport("RPA.JSON")
LIB_FTP = LibraryImport("RPA.FTP")
LIB_DATABASE = LibraryImport("RPA.Database")
LIB_PDF = LibraryImport("RPA.PDF")
LIB_IMAGES = LibraryImport("RPA.Images")
LIB_RECOGNITION = LibraryImport("RPA.recognition")
LIB_BUILTIN = LibraryImport("BuiltIn")
LIB_COLLECTIONS = LibraryImport("Collections")
LIB_STRING = LibraryImport("String")
LIB_DATETIME = LibraryImport("DateTime")
LIB_PROCESS = LibraryImport("Process")
LIB_OPERATINGSYSTEM = LibraryImport("OperatingSystem")


# =============================================================================
# TRIGGER NODES
# =============================================================================

register_node(NodeMapping(
    node_type="trigger.manual",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Manual trigger - marks start of execution",
    config_mapping={},
    pre_keywords=["Log    Bot execution started    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.schedule",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Schedule trigger - handled by Orchestrator",
    config_mapping={"cron": "message"},
    pre_keywords=["Log    Scheduled execution triggered    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.webhook",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Webhook trigger - handled by Orchestrator",
    config_mapping={},
    pre_keywords=["Log    Webhook execution triggered    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.file_watch",
    category=NodeCategory.TRIGGER,
    keyword="Wait Until Created",
    library=LIB_FILESYSTEM,
    description="File watch trigger",
    config_mapping={"path": "path", "pattern": "pattern"},
))

register_node(NodeMapping(
    node_type="trigger.email_received",
    category=NodeCategory.TRIGGER,
    keyword="Wait For Message",
    library=LIB_EMAIL_IMAP,
    description="Email trigger",
    config_mapping={"folder": "folder", "filter": "criterion"},
))

register_node(NodeMapping(
    node_type="trigger.queue",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Queue trigger - handled by Orchestrator",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="trigger.form",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Form trigger - starts when form is submitted",
    config_mapping={
        "formTitle": "form_title",
        "formDescription": "form_description",
    },
    pre_keywords=["Log    Form submission received    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.api_polling",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="API Polling trigger - polls endpoint at intervals",
    config_mapping={
        "url": "url",
        "interval": "interval",
        "method": "method",
    },
    pre_keywords=["Log    API polling condition met    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.database_change",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Database change trigger - CDC events",
    config_mapping={
        "table": "table",
        "event": "event",
    },
    pre_keywords=["Log    Database change detected    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.storage_event",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Storage event trigger - S3/MinIO events",
    config_mapping={
        "bucket": "bucket",
        "event": "event",
    },
    pre_keywords=["Log    Storage event received    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.message_bus",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Message bus trigger - Kafka/RabbitMQ/Redis",
    config_mapping={
        "provider": "provider",
        "topic": "topic",
    },
    pre_keywords=["Log    Message received from bus    level=INFO"],
))

register_node(NodeMapping(
    node_type="trigger.chat",
    category=NodeCategory.TRIGGER,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Chat trigger - Slack/Teams/Telegram",
    config_mapping={
        "platform": "platform",
        "channel": "channel",
        "command": "command",
    },
    pre_keywords=["Log    Chat message trigger activated    level=INFO"],
))


# =============================================================================
# WEB NODES (Browser Automation)
# =============================================================================

register_node(NodeMapping(
    node_type="web.open_browser",
    category=NodeCategory.WEB,
    keyword="New Browser",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Open a web browser",
    config_mapping={
        "browser": "browser",
        "headless": "headless",
    },
    post_keywords=["New Page    ${config}[url]"],
))

register_node(NodeMapping(
    node_type="web.navigate",
    category=NodeCategory.WEB,
    keyword="Go To",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Navigate to URL",
    config_mapping={"url": "url"},
))

register_node(NodeMapping(
    node_type="web.click",
    category=NodeCategory.WEB,
    keyword="Click",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Click on element",
    config_mapping={"selector": "selector"},
))

register_node(NodeMapping(
    node_type="web.type",
    category=NodeCategory.WEB,
    keyword="Fill Text",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Type text into field",
    config_mapping={
        "selector": "selector",
        "text": "txt",
    },
))

register_node(NodeMapping(
    node_type="web.select_option",
    category=NodeCategory.WEB,
    keyword="Select Options By",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Select dropdown option",
    config_mapping={
        "selector": "selector",
        "value": "value",
    },
))

register_node(NodeMapping(
    node_type="web.get_text",
    category=NodeCategory.WEB,
    keyword="Get Text",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Extract text from element",
    config_mapping={"selector": "selector"},
    return_variable="extracted_text",
))

register_node(NodeMapping(
    node_type="web.get_attribute",
    category=NodeCategory.WEB,
    keyword="Get Attribute",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Get element attribute",
    config_mapping={
        "selector": "selector",
        "attribute": "attribute",
    },
    return_variable="attribute_value",
))

register_node(NodeMapping(
    node_type="web.screenshot",
    category=NodeCategory.WEB,
    keyword="Take Screenshot",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Take a screenshot",
    config_mapping={
        "path": "filename",
        "full_page": "fullPage",
    },
))

register_node(NodeMapping(
    node_type="web.wait_element",
    category=NodeCategory.WEB,
    keyword="Wait For Elements State",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Wait for element state",
    config_mapping={
        "selector": "selector",
        "state": "state",
        "timeout": "timeout",
    },
))

register_node(NodeMapping(
    node_type="web.execute_js",
    category=NodeCategory.WEB,
    keyword="Evaluate JavaScript",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Execute JavaScript",
    config_mapping={"script": "expression"},
    return_variable="js_result",
))

register_node(NodeMapping(
    node_type="web.scroll",
    category=NodeCategory.WEB,
    keyword="Scroll To Element",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Scroll page",
    config_mapping={"selector": "selector"},
))

register_node(NodeMapping(
    node_type="web.handle_alert",
    category=NodeCategory.WEB,
    keyword="Handle Future Dialogs",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Handle browser alerts",
    config_mapping={"action": "action"},
))

register_node(NodeMapping(
    node_type="web.switch_tab",
    category=NodeCategory.WEB,
    keyword="Switch Page",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Switch browser tab",
    config_mapping={"tab_index": "index"},
))

register_node(NodeMapping(
    node_type="web.close_browser",
    category=NodeCategory.WEB,
    keyword="Close Browser",
    library=LIB_BROWSER_PLAYWRIGHT,
    description="Close browser",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="web.download_file",
    category=NodeCategory.WEB,
    keyword="Download",
    library=LIB_HTTP,
    description="Download file from URL",
    config_mapping={
        "url": "url",
        "path": "target_file",
    },
))


# =============================================================================
# DESKTOP NODES
# =============================================================================

register_node(NodeMapping(
    node_type="desktop.open_app",
    category=NodeCategory.DESKTOP,
    keyword="Open Application",
    library=LIB_DESKTOP,
    description="Launch application",
    config_mapping={
        "path": "application",
        "args": "args",
    },
))

register_node(NodeMapping(
    node_type="desktop.click",
    category=NodeCategory.DESKTOP,
    keyword="Click",
    library=LIB_DESKTOP,
    description="Desktop click",
    config_mapping={
        "locator": "locator",
        "x": "x",
        "y": "y",
    },
))

register_node(NodeMapping(
    node_type="desktop.type_text",
    category=NodeCategory.DESKTOP,
    keyword="Type Text",
    library=LIB_DESKTOP,
    description="Type with keyboard",
    config_mapping={
        "text": "text",
        "interval": "interval",
    },
))

register_node(NodeMapping(
    node_type="desktop.hotkey",
    category=NodeCategory.DESKTOP,
    keyword="Press Keys",
    library=LIB_DESKTOP,
    description="Press keyboard shortcut",
    config_mapping={"keys": "keys"},
))

register_node(NodeMapping(
    node_type="desktop.get_window",
    category=NodeCategory.DESKTOP,
    keyword="Get Window List",
    library=LIB_DESKTOP,
    description="Find window",
    config_mapping={"title": "title"},
    return_variable="windows",
    post_keywords=["Set Focus    ${windows}[0]"],
))

register_node(NodeMapping(
    node_type="desktop.minimize",
    category=NodeCategory.DESKTOP,
    keyword="Minimize Window",
    library=LIB_DESKTOP,
    description="Minimize window",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="desktop.maximize",
    category=NodeCategory.DESKTOP,
    keyword="Maximize Window",
    library=LIB_DESKTOP,
    description="Maximize window",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="desktop.close_window",
    category=NodeCategory.DESKTOP,
    keyword="Close Window",
    library=LIB_DESKTOP,
    description="Close window",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="desktop.screenshot",
    category=NodeCategory.DESKTOP,
    keyword="Take Screenshot",
    library=LIB_DESKTOP,
    description="Desktop screenshot",
    config_mapping={
        "path": "filename",
        "region": "region",
    },
))

register_node(NodeMapping(
    node_type="desktop.image_click",
    category=NodeCategory.DESKTOP,
    keyword="Click Image",
    library=LIB_IMAGES,
    description="Click on image",
    config_mapping={
        "image_path": "image",
        "confidence": "confidence",
    },
))

register_node(NodeMapping(
    node_type="desktop.wait_image",
    category=NodeCategory.DESKTOP,
    keyword="Wait For Image",
    library=LIB_IMAGES,
    description="Wait for image",
    config_mapping={
        "image_path": "image",
        "timeout": "timeout",
    },
))

register_node(NodeMapping(
    node_type="desktop.clipboard_copy",
    category=NodeCategory.DESKTOP,
    keyword="Copy To Clipboard",
    library=LIB_DESKTOP,
    description="Copy to clipboard",
    config_mapping={"text": "text"},
))


# =============================================================================
# FILES NODES
# =============================================================================

register_node(NodeMapping(
    node_type="files.read",
    category=NodeCategory.FILES,
    keyword="Read File",
    library=LIB_FILESYSTEM,
    description="Read file contents",
    config_mapping={
        "path": "path",
        "encoding": "encoding",
    },
    return_variable="file_content",
))

register_node(NodeMapping(
    node_type="files.write",
    category=NodeCategory.FILES,
    keyword="Create File",
    library=LIB_FILESYSTEM,
    description="Write to file",
    config_mapping={
        "path": "path",
        "content": "content",
        "append": "append",
    },
))

register_node(NodeMapping(
    node_type="files.copy",
    category=NodeCategory.FILES,
    keyword="Copy File",
    library=LIB_FILESYSTEM,
    description="Copy file",
    config_mapping={
        "source": "source",
        "destination": "destination",
    },
))

register_node(NodeMapping(
    node_type="files.move",
    category=NodeCategory.FILES,
    keyword="Move File",
    library=LIB_FILESYSTEM,
    description="Move file",
    config_mapping={
        "source": "source",
        "destination": "destination",
    },
))

register_node(NodeMapping(
    node_type="files.delete",
    category=NodeCategory.FILES,
    keyword="Remove File",
    library=LIB_FILESYSTEM,
    description="Delete file",
    config_mapping={"path": "path"},
))

register_node(NodeMapping(
    node_type="files.create_folder",
    category=NodeCategory.FILES,
    keyword="Create Directory",
    library=LIB_FILESYSTEM,
    description="Create folder",
    config_mapping={"path": "path"},
))

register_node(NodeMapping(
    node_type="files.list",
    category=NodeCategory.FILES,
    keyword="List Files In Directory",
    library=LIB_FILESYSTEM,
    description="List files",
    config_mapping={
        "path": "path",
        "pattern": "pattern",
    },
    return_variable="file_list",
))

register_node(NodeMapping(
    node_type="files.exists",
    category=NodeCategory.FILES,
    keyword="Does File Exist",
    library=LIB_FILESYSTEM,
    description="Check if file exists",
    config_mapping={"path": "path"},
    return_variable="file_exists",
))

register_node(NodeMapping(
    node_type="files.zip",
    category=NodeCategory.FILES,
    keyword="Create Archive",
    library=LIB_ARCHIVE,
    description="Create ZIP",
    config_mapping={
        "source": "folder",
        "destination": "archive",
    },
))

register_node(NodeMapping(
    node_type="files.unzip",
    category=NodeCategory.FILES,
    keyword="Extract Archive",
    library=LIB_ARCHIVE,
    description="Extract ZIP",
    config_mapping={
        "source": "archive",
        "destination": "folder",
    },
))

register_node(NodeMapping(
    node_type="files.get_info",
    category=NodeCategory.FILES,
    keyword="Get File Info",
    library=LIB_FILESYSTEM,
    description="Get file metadata",
    config_mapping={"path": "path"},
    return_variable="file_info",
))

register_node(NodeMapping(
    node_type="files.watch",
    category=NodeCategory.FILES,
    keyword="Wait Until Created",
    library=LIB_FILESYSTEM,
    description="Watch folder",
    config_mapping={
        "path": "path",
        "pattern": "pattern",
    },
))


# =============================================================================
# EXCEL NODES
# =============================================================================

register_node(NodeMapping(
    node_type="excel.open",
    category=NodeCategory.EXCEL,
    keyword="Open Workbook",
    library=LIB_EXCEL_FILES,
    description="Open Excel workbook",
    config_mapping={"path": "path"},
))

register_node(NodeMapping(
    node_type="excel.read_range",
    category=NodeCategory.EXCEL,
    keyword="Read Worksheet As Table",
    library=LIB_EXCEL_FILES,
    description="Read Excel range",
    config_mapping={
        "sheet": "name",
        "header": "header",
    },
    return_variable="excel_data",
))

register_node(NodeMapping(
    node_type="excel.write_range",
    category=NodeCategory.EXCEL,
    keyword="Set Worksheet Value",
    library=LIB_EXCEL_FILES,
    description="Write to Excel",
    config_mapping={
        "range": "row",
        "sheet": "name",
    },
))

register_node(NodeMapping(
    node_type="excel.read_cell",
    category=NodeCategory.EXCEL,
    keyword="Get Cell Value",
    library=LIB_EXCEL_FILES,
    description="Read Excel cell",
    config_mapping={
        "cell": "cell",
        "sheet": "name",
    },
    return_variable="cell_value",
))

register_node(NodeMapping(
    node_type="excel.write_cell",
    category=NodeCategory.EXCEL,
    keyword="Set Cell Value",
    library=LIB_EXCEL_FILES,
    description="Write Excel cell",
    config_mapping={
        "cell": "row",
        "value": "value",
        "sheet": "name",
    },
))

register_node(NodeMapping(
    node_type="excel.add_row",
    category=NodeCategory.EXCEL,
    keyword="Append Rows To Worksheet",
    library=LIB_EXCEL_FILES,
    description="Add row to Excel",
    config_mapping={
        "data": "content",
        "sheet": "name",
    },
))

register_node(NodeMapping(
    node_type="excel.filter",
    category=NodeCategory.EXCEL,
    keyword="Filter Table By Column",
    library=LIB_TABLES,
    description="Filter Excel data",
    config_mapping={
        "column": "column",
        "condition": "operator",
    },
    return_variable="filtered_data",
))

register_node(NodeMapping(
    node_type="excel.save",
    category=NodeCategory.EXCEL,
    keyword="Save Workbook",
    library=LIB_EXCEL_FILES,
    description="Save Excel",
    config_mapping={"path": "path"},
))

register_node(NodeMapping(
    node_type="excel.close",
    category=NodeCategory.EXCEL,
    keyword="Close Workbook",
    library=LIB_EXCEL_FILES,
    description="Close Excel",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="excel.csv_read",
    category=NodeCategory.EXCEL,
    keyword="Read Table From Csv",
    library=LIB_TABLES,
    description="Read CSV file",
    config_mapping={
        "path": "path",
        "delimiter": "delimiters",
        "header": "header",
    },
    return_variable="csv_data",
))

register_node(NodeMapping(
    node_type="excel.csv_write",
    category=NodeCategory.EXCEL,
    keyword="Write Table To Csv",
    library=LIB_TABLES,
    description="Write CSV file",
    config_mapping={
        "path": "path",
        "delimiter": "delimiter",
    },
))

register_node(NodeMapping(
    node_type="excel.pivot",
    category=NodeCategory.EXCEL,
    keyword="Group Table By Column",
    library=LIB_TABLES,
    description="Create pivot table",
    config_mapping={"rows": "column"},
    return_variable="pivot_data",
))


# =============================================================================
# EMAIL NODES
# =============================================================================

register_node(NodeMapping(
    node_type="email.send",
    category=NodeCategory.EMAIL,
    keyword="Send Message",
    library=LIB_EMAIL_IMAP,
    description="Send email",
    config_mapping={
        "to": "recipients",
        "subject": "subject",
        "body": "body",
        "html": "html",
    },
))

register_node(NodeMapping(
    node_type="email.read",
    category=NodeCategory.EMAIL,
    keyword="List Messages",
    library=LIB_EMAIL_IMAP,
    description="Read emails",
    config_mapping={
        "folder": "folder",
        "filter": "criterion",
        "limit": "count",
    },
    return_variable="emails",
))

register_node(NodeMapping(
    node_type="email.reply",
    category=NodeCategory.EMAIL,
    keyword="Send Message",
    library=LIB_EMAIL_IMAP,
    description="Reply to email",
    config_mapping={
        "body": "body",
        "message_id": "in_reply_to",
    },
))

register_node(NodeMapping(
    node_type="email.forward",
    category=NodeCategory.EMAIL,
    keyword="Send Message",
    library=LIB_EMAIL_IMAP,
    description="Forward email",
    config_mapping={"to": "recipients"},
))

register_node(NodeMapping(
    node_type="email.download_attachment",
    category=NodeCategory.EMAIL,
    keyword="Save Attachments",
    library=LIB_EMAIL_IMAP,
    description="Download attachment",
    config_mapping={
        "save_path": "target_folder",
    },
))

register_node(NodeMapping(
    node_type="email.move",
    category=NodeCategory.EMAIL,
    keyword="Move Messages",
    library=LIB_EMAIL_IMAP,
    description="Move email",
    config_mapping={"folder": "target_folder"},
))

register_node(NodeMapping(
    node_type="email.delete",
    category=NodeCategory.EMAIL,
    keyword="Delete Messages",
    library=LIB_EMAIL_IMAP,
    description="Delete email",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="email.mark_read",
    category=NodeCategory.EMAIL,
    keyword="Mark As Read",
    library=LIB_EMAIL_IMAP,
    description="Mark email as read",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="email.search",
    category=NodeCategory.EMAIL,
    keyword="List Messages",
    library=LIB_EMAIL_IMAP,
    description="Search emails",
    config_mapping={
        "query": "criterion",
        "folder": "folder",
    },
    return_variable="search_results",
))


# =============================================================================
# API NODES
# =============================================================================

register_node(NodeMapping(
    node_type="api.http_request",
    category=NodeCategory.API,
    keyword="HTTP Request",
    library=LIB_HTTP,
    description="HTTP request",
    config_mapping={
        "method": "method",
        "url": "url",
        "headers": "headers",
        "body": "body",
    },
    return_variable="response",
))

register_node(NodeMapping(
    node_type="api.graphql",
    category=NodeCategory.API,
    keyword="HTTP Request",
    library=LIB_HTTP,
    description="GraphQL query",
    config_mapping={
        "endpoint": "url",
        "query": "body",
    },
    return_variable="graphql_response",
    pre_keywords=["${method}=    Set Variable    POST"],
))

register_node(NodeMapping(
    node_type="api.rest_get",
    category=NodeCategory.API,
    keyword="GET",
    library=LIB_HTTP,
    description="REST GET",
    config_mapping={
        "url": "url",
        "headers": "headers",
    },
    return_variable="get_response",
))

register_node(NodeMapping(
    node_type="api.rest_post",
    category=NodeCategory.API,
    keyword="POST",
    library=LIB_HTTP,
    description="REST POST",
    config_mapping={
        "url": "url",
        "body": "data",
        "headers": "headers",
    },
    return_variable="post_response",
))

register_node(NodeMapping(
    node_type="api.soap",
    category=NodeCategory.API,
    keyword="POST",
    library=LIB_HTTP,
    description="SOAP request",
    config_mapping={
        "wsdl": "url",
        "body": "data",
    },
    return_variable="soap_response",
))

register_node(NodeMapping(
    node_type="api.oauth_token",
    category=NodeCategory.API,
    keyword="POST",
    library=LIB_HTTP,
    description="Get OAuth token",
    config_mapping={
        "token_url": "url",
    },
    return_variable="oauth_token",
))

register_node(NodeMapping(
    node_type="api.parse_json",
    category=NodeCategory.API,
    keyword="Convert String To Json",
    library=LIB_JSON,
    description="Parse JSON",
    config_mapping={"input": "json_string"},
    return_variable="parsed_json",
))

register_node(NodeMapping(
    node_type="api.json_path",
    category=NodeCategory.API,
    keyword="Get Value From Json",
    library=LIB_JSON,
    description="JSONPath query",
    config_mapping={
        "json": "json_object",
        "path": "json_path",
    },
    return_variable="json_value",
))

register_node(NodeMapping(
    node_type="api.ftp_upload",
    category=NodeCategory.API,
    keyword="Upload File",
    library=LIB_FTP,
    description="FTP upload",
    config_mapping={
        "local_path": "local_path",
        "remote_path": "remote_path",
    },
    pre_keywords=["Connect    ${config}[host]    ${config}[username]    ${config}[password]"],
    post_keywords=["Close Connection"],
))


# =============================================================================
# DATABASE NODES
# =============================================================================

register_node(NodeMapping(
    node_type="database.connect",
    category=NodeCategory.DATABASE,
    keyword="Connect To Database",
    library=LIB_DATABASE,
    description="Connect to database",
    config_mapping={
        "type": "dbapiModuleName",
        "connection_string": "dbConfigFile",
    },
))

register_node(NodeMapping(
    node_type="database.query",
    category=NodeCategory.DATABASE,
    keyword="Query",
    library=LIB_DATABASE,
    description="Execute SQL query",
    config_mapping={"query": "selectStatement"},
    return_variable="query_results",
))

register_node(NodeMapping(
    node_type="database.insert",
    category=NodeCategory.DATABASE,
    keyword="Execute Sql String",
    library=LIB_DATABASE,
    description="Insert row",
    config_mapping={},
    pre_keywords=["${sql}=    Set Variable    INSERT INTO ${config}[table] VALUES (${config}[data])"],
))

register_node(NodeMapping(
    node_type="database.update",
    category=NodeCategory.DATABASE,
    keyword="Execute Sql String",
    library=LIB_DATABASE,
    description="Update rows",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="database.delete",
    category=NodeCategory.DATABASE,
    keyword="Execute Sql String",
    library=LIB_DATABASE,
    description="Delete rows",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="database.call_procedure",
    category=NodeCategory.DATABASE,
    keyword="Call Stored Procedure",
    library=LIB_DATABASE,
    description="Call stored procedure",
    config_mapping={
        "procedure": "spName",
        "params": "spParams",
    },
    return_variable="procedure_result",
))

register_node(NodeMapping(
    node_type="database.transaction",
    category=NodeCategory.DATABASE,
    keyword="Set Auto Commit",
    library=LIB_DATABASE,
    description="Start transaction",
    config_mapping={},
    pre_keywords=["Set Auto Commit    False"],
))

register_node(NodeMapping(
    node_type="database.commit",
    category=NodeCategory.DATABASE,
    keyword="Commit",
    library=LIB_DATABASE,
    description="Commit transaction",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="database.close",
    category=NodeCategory.DATABASE,
    keyword="Disconnect From Database",
    library=LIB_DATABASE,
    description="Close database",
    config_mapping={},
))


# =============================================================================
# DOCUMENT NODES
# =============================================================================

register_node(NodeMapping(
    node_type="document.pdf_read",
    category=NodeCategory.DOCUMENT,
    keyword="Get Text From Pdf",
    library=LIB_PDF,
    description="Read PDF text",
    config_mapping={
        "path": "source_path",
        "pages": "pages",
    },
    return_variable="pdf_text",
))

register_node(NodeMapping(
    node_type="document.pdf_merge",
    category=NodeCategory.DOCUMENT,
    keyword="Add Files To Pdf",
    library=LIB_PDF,
    description="Merge PDFs",
    config_mapping={
        "files": "files",
        "output": "target_document",
    },
))

register_node(NodeMapping(
    node_type="document.pdf_split",
    category=NodeCategory.DOCUMENT,
    keyword="Save Pdf Pages",
    library=LIB_PDF,
    description="Split PDF",
    config_mapping={
        "path": "source_path",
        "pages": "pages",
        "output": "target_path",
    },
))

register_node(NodeMapping(
    node_type="document.pdf_to_image",
    category=NodeCategory.DOCUMENT,
    keyword="Convert Pdf To Images",
    library=LIB_PDF,
    description="PDF to images",
    config_mapping={
        "path": "source_path",
        "output_dir": "output_dir",
    },
))

register_node(NodeMapping(
    node_type="document.ocr",
    category=NodeCategory.DOCUMENT,
    keyword="Read Text From Image",
    library=LIB_RECOGNITION,
    description="OCR extraction",
    config_mapping={
        "path": "image",
        "language": "language",
    },
    return_variable="ocr_text",
))

register_node(NodeMapping(
    node_type="document.word_read",
    category=NodeCategory.DOCUMENT,
    keyword="Get Text From Document",
    library=LibraryImport("RPA.Word.Application"),
    description="Read Word document",
    config_mapping={"path": "filename"},
    return_variable="word_text",
))

register_node(NodeMapping(
    node_type="document.word_write",
    category=NodeCategory.DOCUMENT,
    keyword="Create Document",
    library=LibraryImport("RPA.Word.Application"),
    description="Write Word document",
    config_mapping={
        "path": "filename",
        "content": "text",
    },
))

register_node(NodeMapping(
    node_type="document.html_to_pdf",
    category=NodeCategory.DOCUMENT,
    keyword="Html To Pdf",
    library=LIB_PDF,
    description="HTML to PDF",
    config_mapping={
        "html": "content",
        "output": "output_path",
    },
))

register_node(NodeMapping(
    node_type="document.pdf_fill_form",
    category=NodeCategory.DOCUMENT,
    keyword="Set Field Value",
    library=LIB_PDF,
    description="Fill PDF form",
    config_mapping={
        "path": "source_path",
        "output": "output_path",
    },
))


# =============================================================================
# CONTROL NODES (Robot Framework Built-in)
# =============================================================================

register_node(NodeMapping(
    node_type="control.if",
    category=NodeCategory.CONTROL,
    keyword="IF",
    library=LIB_BUILTIN,
    description="Conditional branch",
    config_mapping={"condition": "condition"},
))

register_node(NodeMapping(
    node_type="control.switch",
    category=NodeCategory.CONTROL,
    keyword="IF",
    library=LIB_BUILTIN,
    description="Multi-way branch",
    config_mapping={"expression": "condition"},
))

register_node(NodeMapping(
    node_type="control.loop",
    category=NodeCategory.CONTROL,
    keyword="FOR",
    library=LIB_BUILTIN,
    description="For loop",
    config_mapping={
        "items": "items",
        "item_var": "item",
    },
))

register_node(NodeMapping(
    node_type="control.while",
    category=NodeCategory.CONTROL,
    keyword="WHILE",
    library=LIB_BUILTIN,
    description="While loop",
    config_mapping={
        "condition": "condition",
        "max_iterations": "limit",
    },
))

register_node(NodeMapping(
    node_type="control.wait",
    category=NodeCategory.CONTROL,
    keyword="Sleep",
    library=LIB_BUILTIN,
    description="Wait/delay",
    config_mapping={"seconds": "time"},
))

register_node(NodeMapping(
    node_type="control.set_variable",
    category=NodeCategory.CONTROL,
    keyword="Set Variable",
    library=LIB_BUILTIN,
    description="Set variable",
    config_mapping={
        "name": "name",
        "value": "value",
    },
))

register_node(NodeMapping(
    node_type="control.try_catch",
    category=NodeCategory.CONTROL,
    keyword="TRY",
    library=LIB_BUILTIN,
    description="Error handling",
    config_mapping={},
))

register_node(NodeMapping(
    node_type="control.parallel",
    category=NodeCategory.CONTROL,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Parallel execution (requires pabot)",
    config_mapping={},
    pre_keywords=["Log    Parallel execution started    level=INFO"],
))

register_node(NodeMapping(
    node_type="control.stop",
    category=NodeCategory.CONTROL,
    keyword="Fatal Error",
    library=LIB_BUILTIN,
    description="Stop execution",
    config_mapping={"status": "msg"},
))

register_node(NodeMapping(
    node_type="control.goto",
    category=NodeCategory.CONTROL,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Jump to node (not recommended)",
    config_mapping={"target_node": "message"},
    pre_keywords=["Log    GOTO is not recommended - use proper flow control    level=WARN"],
))


# =============================================================================
# LOGGING NODES
# =============================================================================

register_node(NodeMapping(
    node_type="logging.log",
    category=NodeCategory.LOGGING,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Log message",
    config_mapping={
        "message": "message",
        "level": "level",
    },
))

register_node(NodeMapping(
    node_type="logging.screenshot",
    category=NodeCategory.LOGGING,
    keyword="Take Screenshot",
    library=LIB_DESKTOP,
    description="Log screenshot",
    config_mapping={"description": "filename"},
))

register_node(NodeMapping(
    node_type="logging.metric",
    category=NodeCategory.LOGGING,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Log metric",
    config_mapping={},
    pre_keywords=["${metric}=    Create Dictionary    name=${config}[name]    value=${config}[value]"],
))

register_node(NodeMapping(
    node_type="logging.timer_start",
    category=NodeCategory.LOGGING,
    keyword="Get Time",
    library=LIB_DATETIME,
    description="Start timer",
    config_mapping={"name": "format"},
    return_variable="timer_start",
))

register_node(NodeMapping(
    node_type="logging.timer_stop",
    category=NodeCategory.LOGGING,
    keyword="Get Time",
    library=LIB_DATETIME,
    description="Stop timer",
    config_mapping={},
    return_variable="timer_end",
    post_keywords=["${duration}=    Subtract Time From Time    ${timer_end}    ${timer_start}"],
))

register_node(NodeMapping(
    node_type="logging.notification",
    category=NodeCategory.LOGGING,
    keyword="Send Message",
    library=LIB_EMAIL_IMAP,
    description="Send notification",
    config_mapping={
        "message": "body",
        "channel": "channel",
    },
))

register_node(NodeMapping(
    node_type="logging.audit",
    category=NodeCategory.LOGGING,
    keyword="Log",
    library=LIB_BUILTIN,
    description="Audit log",
    config_mapping={
        "action": "message",
    },
    pre_keywords=["${audit}=    Create Dictionary    action=${config}[action]    timestamp=${OUTPUT_DIR}"],
))

register_node(NodeMapping(
    node_type="logging.export",
    category=NodeCategory.LOGGING,
    keyword="Copy File",
    library=LIB_FILESYSTEM,
    description="Export logs",
    config_mapping={
        "path": "destination",
    },
    pre_keywords=["${log_file}=    Set Variable    ${OUTPUT_DIR}/log.html"],
))


# =============================================================================
# PYTHON NODES
# =============================================================================

register_node(NodeMapping(
    node_type="python.execute",
    category=NodeCategory.PYTHON,
    keyword="Evaluate",
    library=LIB_BUILTIN,
    description="Execute Python code",
    config_mapping={"code": "expression"},
    return_variable="python_result",
))

register_node(NodeMapping(
    node_type="python.project",
    category=NodeCategory.PYTHON,
    keyword="Run Process",
    library=LIB_PROCESS,
    description="Run Python project",
    config_mapping={
        "project_path": "cwd",
        "entrypoint": "command",
        "args": "args",
    },
    return_variable="process_result",
    pre_keywords=["${cmd}=    Set Variable    python ${config}[entrypoint]"],
))

register_node(NodeMapping(
    node_type="python.pip_install",
    category=NodeCategory.PYTHON,
    keyword="Run Process",
    library=LIB_PROCESS,
    description="Install packages",
    config_mapping={"packages": "args"},
    pre_keywords=["${cmd}=    Set Variable    pip install"],
))

register_node(NodeMapping(
    node_type="python.virtualenv",
    category=NodeCategory.PYTHON,
    keyword="Run Process",
    library=LIB_PROCESS,
    description="Create virtualenv",
    config_mapping={"path": "args"},
    pre_keywords=["${cmd}=    Set Variable    python -m venv"],
))

register_node(NodeMapping(
    node_type="python.function",
    category=NodeCategory.PYTHON,
    keyword="Evaluate",
    library=LIB_BUILTIN,
    description="Define Python function",
    config_mapping={"code": "expression"},
))

register_node(NodeMapping(
    node_type="python.import_module",
    category=NodeCategory.PYTHON,
    keyword="Import Library",
    library=LIB_BUILTIN,
    description="Import Python module",
    config_mapping={
        "module": "name",
        "alias": "alias",
    },
))

register_node(NodeMapping(
    node_type="python.notebook",
    category=NodeCategory.PYTHON,
    keyword="Run Process",
    library=LIB_PROCESS,
    description="Run Jupyter notebook",
    config_mapping={
        "path": "args",
        "output_path": "stdout",
    },
    pre_keywords=["${cmd}=    Set Variable    jupyter nbconvert --execute --to notebook"],
))

register_node(NodeMapping(
    node_type="python.eval",
    category=NodeCategory.PYTHON,
    keyword="Evaluate",
    library=LIB_BUILTIN,
    description="Evaluate expression",
    config_mapping={"expression": "expression"},
    return_variable="eval_result",
))


# =============================================================================
# AI NODES (SkuldAI Library - skuldbot.libs.ai)
# =============================================================================

# Librería SkuldAI con alias AI
LIB_SKULD_AI = LibraryImport("skuldbot.libs.ai.SkuldAI", alias="AI")

register_node(NodeMapping(
    node_type="ai.llm_prompt",
    category=NodeCategory.AI,
    keyword="Send LLM Prompt",
    library=LIB_SKULD_AI,
    description="Send prompt to LLM and get response",
    config_mapping={
        "prompt": "prompt",
        "system_prompt": "system_message",
        "temperature": "temperature",
        "max_tokens": "max_tokens",
        "json_mode": "json_mode",
    },
    return_variable="llm_response",
    pre_keywords=["Configure AI Provider    ${AI_PROVIDER}    ${AI_API_KEY}    ${AI_MODEL}"],
))

register_node(NodeMapping(
    node_type="ai.agent",
    category=NodeCategory.AI,
    keyword="Send Agent Message",
    library=LIB_SKULD_AI,
    description="Run AI agent conversation",
    config_mapping={
        "message": "message",
    },
    return_variable="agent_response",
    pre_keywords=["Start AI Agent Session    ${AGENT_SYSTEM_PROMPT}    ${AGENT_NAME}"],
))

register_node(NodeMapping(
    node_type="ai.extract_data",
    category=NodeCategory.AI,
    keyword="Extract Data From Text",
    library=LIB_SKULD_AI,
    description="Extract structured data using AI",
    config_mapping={
        "text": "text",
        "schema": "schema",
        "instructions": "instructions",
    },
    return_variable="extracted_data",
))

register_node(NodeMapping(
    node_type="ai.summarize",
    category=NodeCategory.AI,
    keyword="Summarize Text",
    library=LIB_SKULD_AI,
    description="Summarize text using AI",
    config_mapping={
        "text": "text",
        "max_length": "max_length",
        "style": "style",
        "language": "language",
    },
    return_variable="summary",
))

register_node(NodeMapping(
    node_type="ai.classify",
    category=NodeCategory.AI,
    keyword="Classify Text",
    library=LIB_SKULD_AI,
    description="Classify text into categories",
    config_mapping={
        "text": "text",
        "categories": "categories",
        "multi_label": "multi_label",
        "include_confidence": "include_confidence",
    },
    return_variable="classification",
))

register_node(NodeMapping(
    node_type="ai.translate",
    category=NodeCategory.AI,
    keyword="Translate Text",
    library=LIB_SKULD_AI,
    description="Translate text to another language",
    config_mapping={
        "text": "text",
        "target_language": "target_language",
        "source_language": "source_language",
    },
    return_variable="translation",
))

register_node(NodeMapping(
    node_type="ai.sentiment",
    category=NodeCategory.AI,
    keyword="Analyze Sentiment",
    library=LIB_SKULD_AI,
    description="Analyze text sentiment",
    config_mapping={
        "text": "text",
        "detailed": "detailed",
    },
    return_variable="sentiment",
))

register_node(NodeMapping(
    node_type="ai.vision",
    category=NodeCategory.AI,
    keyword="Analyze Image",
    library=LIB_SKULD_AI,
    description="Analyze image using AI vision",
    config_mapping={
        "image_path": "image_path",
        "prompt": "prompt",
        "extract_text": "extract_text",
    },
    return_variable="vision_result",
))

register_node(NodeMapping(
    node_type="ai.embeddings",
    category=NodeCategory.AI,
    keyword="Generate Embeddings",
    library=LIB_SKULD_AI,
    description="Generate vector embeddings for text",
    config_mapping={
        "text": "text",
        "model": "model",
    },
    return_variable="embeddings",
))

register_node(NodeMapping(
    node_type="ai.repair_data",
    category=NodeCategory.AI,
    keyword="AI Repair Data",
    library=LIB_SKULD_AI,
    description="Intelligently repair data quality issues using AI",
    config_mapping={
        "data": "data",
        "validation_report": "validation_report",
        "context": "context",
        "allow_format_normalization": "allow_format_normalization",
        "allow_semantic_cleanup": "allow_semantic_cleanup",
        "allow_value_inference": "allow_value_inference",
        "allow_sensitive_repair": "allow_sensitive_repair",
        "min_confidence": "min_confidence",
    },
    return_variable="repair_result",
))

register_node(NodeMapping(
    node_type="ai.suggest_repairs",
    category=NodeCategory.AI,
    keyword="AI Suggest Data Repairs",
    library=LIB_SKULD_AI,
    description="Preview repair suggestions without applying (for human review)",
    config_mapping={
        "data": "data",
        "validation_report": "validation_report",
        "context": "context",
    },
    return_variable="repair_suggestions",
))


# =============================================================================
# SECURITY NODES (SkuldVault Library - skuldbot.libs.vault)
# =============================================================================

# Librería SkuldVault con alias Vault
LIB_SKULD_VAULT = LibraryImport("skuldbot.libs.vault.SkuldVault", alias="Vault")

register_node(NodeMapping(
    node_type="security.get_secret",
    category=NodeCategory.SECURITY,
    keyword="Get Secret",
    library=LIB_SKULD_VAULT,
    description="Get secret from vault",
    config_mapping={
        "name": "name",
        "key": "key",
    },
    return_variable="secret_value",
    pre_keywords=["Configure Vault    ${VAULT_PROVIDER}"],
))

register_node(NodeMapping(
    node_type="security.set_secret",
    category=NodeCategory.SECURITY,
    keyword="Set Secret",
    library=LIB_SKULD_VAULT,
    description="Set secret in vault",
    config_mapping={
        "name": "name",
        "value": "value",
    },
))

register_node(NodeMapping(
    node_type="security.delete_secret",
    category=NodeCategory.SECURITY,
    keyword="Delete Secret",
    library=LIB_SKULD_VAULT,
    description="Delete secret from vault",
    config_mapping={
        "name": "name",
    },
))

register_node(NodeMapping(
    node_type="security.list_secrets",
    category=NodeCategory.SECURITY,
    keyword="List Secrets",
    library=LIB_SKULD_VAULT,
    description="List available secrets",
    config_mapping={},
    return_variable="secret_names",
))

register_node(NodeMapping(
    node_type="security.encrypt",
    category=NodeCategory.SECURITY,
    keyword="Evaluate",
    library=LIB_BUILTIN,
    description="Encrypt data",
    config_mapping={"data": "expression"},
    return_variable="encrypted_data",
    pre_keywords=["Import Library    cryptography"],
))

register_node(NodeMapping(
    node_type="security.decrypt",
    category=NodeCategory.SECURITY,
    keyword="Evaluate",
    library=LIB_BUILTIN,
    description="Decrypt data",
    config_mapping={"data": "expression"},
    return_variable="decrypted_data",
))

register_node(NodeMapping(
    node_type="security.hash",
    category=NodeCategory.SECURITY,
    keyword="Hash Secret",
    library=LIB_SKULD_VAULT,
    description="Hash data securely",
    config_mapping={
        "value": "value",
        "algorithm": "algorithm",
    },
    return_variable="hash_value",
))

register_node(NodeMapping(
    node_type="security.mask_data",
    category=NodeCategory.SECURITY,
    keyword="Mask Secret In String",
    library=LIB_SKULD_VAULT,
    description="Mask sensitive data in string",
    config_mapping={
        "text": "text",
        "secret_name": "secret_name",
        "mask_char": "mask_char",
    },
    return_variable="masked_text",
))

register_node(NodeMapping(
    node_type="security.validate_cert",
    category=NodeCategory.SECURITY,
    keyword="GET",
    library=LIB_HTTP,
    description="Validate SSL certificate",
    config_mapping={"url": "url"},
))


# =============================================================================
# HUMAN-IN-THE-LOOP NODES (SkuldHuman Library - skuldbot.libs.human)
# =============================================================================

# Librería SkuldHuman con alias Human
LIB_SKULD_HUMAN = LibraryImport("skuldbot.libs.human.SkuldHuman", alias="Human")

register_node(NodeMapping(
    node_type="human.approval",
    category=NodeCategory.HUMAN,
    keyword="Request Approval",
    library=LIB_SKULD_HUMAN,
    description="Request human approval to continue",
    config_mapping={
        "title": "title",
        "description": "description",
        "data": "data",
        "assignee": "assignee",
        "priority": "priority",
        "timeout_minutes": "timeout_minutes",
    },
    return_variable="approval_result",
    pre_keywords=["Configure Human Tasks    ${HUMAN_MODE}    ${ORCHESTRATOR_URL}    ${ORCHESTRATOR_KEY}"],
))

register_node(NodeMapping(
    node_type="human.input",
    category=NodeCategory.HUMAN,
    keyword="Request User Input",
    library=LIB_SKULD_HUMAN,
    description="Request structured input from user",
    config_mapping={
        "title": "title",
        "fields": "fields",
        "description": "description",
        "assignee": "assignee",
    },
    return_variable="user_input",
))

register_node(NodeMapping(
    node_type="human.review",
    category=NodeCategory.HUMAN,
    keyword="Request Data Review",
    library=LIB_SKULD_HUMAN,
    description="Request human review of data",
    config_mapping={
        "title": "title",
        "data": "data",
        "editable_fields": "editable_fields",
        "instructions": "instructions",
        "assignee": "assignee",
    },
    return_variable="reviewed_data",
))

register_node(NodeMapping(
    node_type="human.exception",
    category=NodeCategory.HUMAN,
    keyword="Request Exception Handling",
    library=LIB_SKULD_HUMAN,
    description="Request human decision for exception",
    config_mapping={
        "title": "title",
        "error_details": "error_details",
        "context": "context",
        "options": "options",
        "assignee": "assignee",
    },
    return_variable="decision",
))

register_node(NodeMapping(
    node_type="human.notification",
    category=NodeCategory.HUMAN,
    keyword="Send Human Notification",
    library=LIB_SKULD_HUMAN,
    description="Send notification to users",
    config_mapping={
        "recipients": "recipients",
        "title": "title",
        "message": "message",
        "channel": "channel",
        "require_acknowledgment": "require_acknowledgment",
    },
))

register_node(NodeMapping(
    node_type="human.escalate",
    category=NodeCategory.HUMAN,
    keyword="Escalate Task",
    library=LIB_SKULD_HUMAN,
    description="Escalate task to another user/level",
    config_mapping={
        "task_id": "task_id",
        "reason": "escalation_reason",
        "new_assignee": "new_assignee",
    },
))

register_node(NodeMapping(
    node_type="human.file_upload",
    category=NodeCategory.HUMAN,
    keyword="Request File Upload",
    library=LIB_SKULD_HUMAN,
    description="Request file upload from user",
    config_mapping={
        "title": "title",
        "description": "description",
        "allowed_types": "allowed_types",
        "multiple": "multiple",
        "assignee": "assignee",
    },
    return_variable="uploaded_files",
))


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_all_nodes() -> List[NodeMapping]:
    """Retorna todos los nodos registrados"""
    return list(NODE_REGISTRY.values())


def get_nodes_by_category(category: NodeCategory) -> List[NodeMapping]:
    """Retorna nodos de una categoria especifica"""
    return [n for n in NODE_REGISTRY.values() if n.category == category]


def get_node_count() -> int:
    """Retorna el numero total de nodos registrados"""
    return len(NODE_REGISTRY)


def get_category_summary() -> Dict[str, int]:
    """Retorna resumen de nodos por categoria"""
    summary = {}
    for node in NODE_REGISTRY.values():
        cat = node.category.value
        summary[cat] = summary.get(cat, 0) + 1
    return summary


# =============================================================================
# COMPLIANCE NODES (SkuldCompliance Library - skuldbot.libs.compliance)
# =============================================================================

# Librería SkuldCompliance con alias Compliance
LIB_SKULD_COMPLIANCE = LibraryImport("skuldbot.libs.compliance.SkuldCompliance", alias="Compliance")

register_node(NodeMapping(
    node_type="compliance.detect_sensitive",
    category=NodeCategory.COMPLIANCE,
    keyword="Detect Sensitive Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Detect PII and PHI in data",
    config_mapping={
        "data": "data",
        "regulations": "regulations",
    },
    return_variable="detection_result",
))

register_node(NodeMapping(
    node_type="compliance.detect_pii",
    category=NodeCategory.COMPLIANCE,
    keyword="Detect PII",
    library=LIB_SKULD_COMPLIANCE,
    description="Detect PII (Personal Identifiable Information)",
    config_mapping={
        "data": "data",
    },
    return_variable="pii_result",
))

register_node(NodeMapping(
    node_type="compliance.detect_phi",
    category=NodeCategory.COMPLIANCE,
    keyword="Detect PHI",
    library=LIB_SKULD_COMPLIANCE,
    description="Detect PHI (Protected Health Information)",
    config_mapping={
        "data": "data",
    },
    return_variable="phi_result",
))

register_node(NodeMapping(
    node_type="compliance.mask_data",
    category=NodeCategory.COMPLIANCE,
    keyword="Mask Sensitive Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Mask sensitive data with asterisks",
    config_mapping={
        "data": "data",
        "fields": "fields",
        "mask_char": "mask_char",
        "visible_chars": "visible_chars",
    },
    return_variable="masked_data",
))

register_node(NodeMapping(
    node_type="compliance.redact_data",
    category=NodeCategory.COMPLIANCE,
    keyword="Redact Sensitive Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Completely remove sensitive data",
    config_mapping={
        "data": "data",
        "fields": "fields",
        "replacement": "replacement",
    },
    return_variable="redacted_data",
))

register_node(NodeMapping(
    node_type="compliance.pseudonymize",
    category=NodeCategory.COMPLIANCE,
    keyword="Pseudonymize Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Replace sensitive data with consistent fake IDs",
    config_mapping={
        "data": "data",
        "fields": "fields",
        "prefix": "prefix",
    },
    return_variable="pseudonymized_data",
))

register_node(NodeMapping(
    node_type="compliance.hash_data",
    category=NodeCategory.COMPLIANCE,
    keyword="Hash Sensitive Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Cryptographically hash sensitive data",
    config_mapping={
        "data": "data",
        "fields": "fields",
        "algorithm": "algorithm",
        "salt": "salt",
    },
    return_variable="hashed_data",
))

register_node(NodeMapping(
    node_type="compliance.generalize_data",
    category=NodeCategory.COMPLIANCE,
    keyword="Generalize Data",
    library=LIB_SKULD_COMPLIANCE,
    description="Generalize data (ages to ranges, zip to partial)",
    config_mapping={
        "data": "data",
        "rules": "rules",
    },
    return_variable="generalized_data",
))

register_node(NodeMapping(
    node_type="compliance.safe_harbor",
    category=NodeCategory.COMPLIANCE,
    keyword="Apply HIPAA Safe Harbor",
    library=LIB_SKULD_COMPLIANCE,
    description="Apply all HIPAA Safe Harbor de-identification methods",
    config_mapping={
        "data": "data",
        "phi_fields": "phi_fields",
    },
    return_variable="deidentified_data",
))

register_node(NodeMapping(
    node_type="compliance.validate_hipaa",
    category=NodeCategory.COMPLIANCE,
    keyword="Validate HIPAA Compliance",
    library=LIB_SKULD_COMPLIANCE,
    description="Validate that data is HIPAA compliant",
    config_mapping={
        "data": "data",
    },
    return_variable="compliance_result",
))

register_node(NodeMapping(
    node_type="compliance.sensitive_gate",
    category=NodeCategory.COMPLIANCE,
    keyword="Check Sensitive Data Gate",
    library=LIB_SKULD_COMPLIANCE,
    description="Gate that blocks flow if sensitive data detected",
    config_mapping={
        "data": "data",
        "block_on_pii": "block_on_pii",
        "block_on_phi": "block_on_phi",
    },
    return_variable="gate_result",
))

register_node(NodeMapping(
    node_type="compliance.audit_log",
    category=NodeCategory.COMPLIANCE,
    keyword="Log Compliance Event",
    library=LIB_SKULD_COMPLIANCE,
    description="Log compliance audit event",
    config_mapping={
        "event_type": "event_type",
        "data_classification": "data_classification",
        "action": "action",
        "user": "user",
    },
    return_variable="audit_entry",
))

register_node(NodeMapping(
    node_type="compliance.classify_data",
    category=NodeCategory.COMPLIANCE,
    keyword="Classify Data Sensitivity",
    library=LIB_SKULD_COMPLIANCE,
    description="Classify data sensitivity level",
    config_mapping={
        "data": "data",
    },
    return_variable="classification",
))


# =============================================================================
# DATA QUALITY NODES (SkuldDataQuality Library - skuldbot.libs.data_quality)
# =============================================================================

# Librería SkuldDataQuality con alias DataQuality
LIB_SKULD_DATAQUALITY = LibraryImport("skuldbot.libs.data_quality.SkuldDataQuality", alias="DataQuality")

register_node(NodeMapping(
    node_type="dataquality.validate_schema",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Schema",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate data against a schema",
    config_mapping={
        "data": "data",
        "schema": "schema",
    },
    return_variable="schema_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_not_null",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Column Not Null",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column has no null values",
    config_mapping={
        "data": "data",
        "column": "column",
        "threshold": "threshold",
    },
    return_variable="not_null_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_unique",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Column Unique",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column has unique values",
    config_mapping={
        "data": "data",
        "column": "column",
    },
    return_variable="unique_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_in_set",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Column In Set",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column values are in allowed set",
    config_mapping={
        "data": "data",
        "column": "column",
        "allowed_values": "allowed_values",
    },
    return_variable="in_set_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_between",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Column Between",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column values are within range",
    config_mapping={
        "data": "data",
        "column": "column",
        "min_value": "min_value",
        "max_value": "max_value",
    },
    return_variable="between_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_regex",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Column Regex",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column values match regex pattern",
    config_mapping={
        "data": "data",
        "column": "column",
        "pattern": "pattern",
    },
    return_variable="regex_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_email",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Email Format",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column contains valid email addresses",
    config_mapping={
        "data": "data",
        "column": "column",
    },
    return_variable="email_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_date",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Date Format",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate column contains valid dates",
    config_mapping={
        "data": "data",
        "column": "column",
        "format": "format",
    },
    return_variable="date_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_row_count",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate Row Count",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate data has expected row count",
    config_mapping={
        "data": "data",
        "min_rows": "min_rows",
        "max_rows": "max_rows",
    },
    return_variable="row_count_result",
))

register_node(NodeMapping(
    node_type="dataquality.profile_data",
    category=NodeCategory.DATAQUALITY,
    keyword="Profile Data",
    library=LIB_SKULD_DATAQUALITY,
    description="Generate automatic data profile with statistics",
    config_mapping={
        "data": "data",
    },
    return_variable="data_profile",
))

register_node(NodeMapping(
    node_type="dataquality.run_suite",
    category=NodeCategory.DATAQUALITY,
    keyword="Run Validation Suite",
    library=LIB_SKULD_DATAQUALITY,
    description="Run multiple validations from expectation suite",
    config_mapping={
        "data": "data",
        "suite": "suite",
    },
    return_variable="suite_result",
))

register_node(NodeMapping(
    node_type="dataquality.generate_report",
    category=NodeCategory.DATAQUALITY,
    keyword="Generate Quality Report",
    library=LIB_SKULD_DATAQUALITY,
    description="Generate comprehensive data quality report",
    config_mapping={
        "data": "data",
        "data_source": "data_source",
    },
    return_variable="quality_report",
))

register_node(NodeMapping(
    node_type="dataquality.list_profiles",
    category=NodeCategory.DATAQUALITY,
    keyword="List Quality Profiles",
    library=LIB_SKULD_DATAQUALITY,
    description="List available quality profiles by vertical",
    config_mapping={
        "vertical": "vertical",
    },
    return_variable="profiles_list",
))

register_node(NodeMapping(
    node_type="dataquality.get_profile",
    category=NodeCategory.DATAQUALITY,
    keyword="Get Quality Profile",
    library=LIB_SKULD_DATAQUALITY,
    description="Get a specific quality profile by name",
    config_mapping={
        "profile_name": "profile_id",
    },
    return_variable="profile",
))

register_node(NodeMapping(
    node_type="dataquality.apply_profile",
    category=NodeCategory.DATAQUALITY,
    keyword="Apply Quality Profile",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate data using a predefined quality profile",
    config_mapping={
        "data": "data",
        "profile_name": "profile_id",
        "fail_on_error": "strict",
    },
    return_variable="profile_result",
))

register_node(NodeMapping(
    node_type="dataquality.validate_and_repair",
    category=NodeCategory.DATAQUALITY,
    keyword="Validate With Profile And Repair",
    library=LIB_SKULD_DATAQUALITY,
    description="Validate with profile and auto-repair with AI",
    config_mapping={
        "data": "data",
        "profile_name": "profile_id",
        "min_confidence": "min_confidence",
    },
    return_variable="repair_result",
))

register_node(NodeMapping(
    node_type="dataquality.create_custom_profile",
    category=NodeCategory.DATAQUALITY,
    keyword="Create Custom Profile",
    library=LIB_SKULD_DATAQUALITY,
    description="Create a custom quality profile",
    config_mapping={
        "name": "profile_id",
        "description": "description",
        "vertical": "vertical",
        "expectations": "expectations",
    },
    return_variable="custom_profile",
))


# Print summary when module loads (for debugging)
if __name__ == "__main__":
    print(f"Total nodes registered: {get_node_count()}")
    print("\nBy category:")
    for cat, count in sorted(get_category_summary().items()):
        print(f"  {cat}: {count}")
