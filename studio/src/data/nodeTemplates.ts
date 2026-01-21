import { NodeTemplate } from "../types/flow";

export const nodeTemplates: NodeTemplate[] = [
  // ============================================
  // TRIGGER - Scheduling & Triggers
  // ============================================
  // NOTE: Schedule Trigger removed - scheduling is handled by the Orchestrator, not Studio
  {
    type: "trigger.file_watch",
    category: "trigger",
    label: "File Watch",
    description: "Trigger when file changes",
    icon: "Eye",
    defaultConfig: { path: "", events: ["created", "modified"] },
    configSchema: [
      { name: "path", label: "Watch Path", type: "text", required: true, placeholder: "/path/to/folder" },
      { name: "pattern", label: "File Pattern", type: "text", placeholder: "*.csv" },
    ],
    outputSchema: [
      { name: "filePath", type: "string", description: "Full path of the changed file" },
      { name: "fileName", type: "string", description: "Name of the changed file" },
      { name: "event", type: "string", description: "Event type: created, modified, deleted" },
      { name: "timestamp", type: "string", description: "When the event occurred" },
    ],
  },
  {
    type: "trigger.email_received",
    category: "trigger",
    label: "Email Trigger",
    description: "Trigger when email received",
    icon: "MailOpen",
    defaultConfig: {},
    configSchema: [
      { name: "folder", label: "Mail Folder", type: "text", default: "INBOX" },
      { name: "filter", label: "Subject Filter", type: "text", placeholder: "Invoice*" },
    ],
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    label: "Webhook Trigger",
    description: "Trigger via HTTP webhook",
    icon: "Webhook",
    defaultConfig: { method: "POST" },
    configSchema: [
      { name: "path", label: "Webhook Path", type: "text", required: true, placeholder: "/webhook/my-trigger" },
      { name: "method", label: "HTTP Method", type: "select", default: "POST", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] },
    ],
    outputSchema: [
      { name: "body", type: "object", description: "Request body (JSON)" },
      { name: "headers", type: "object", description: "Request headers" },
      { name: "query", type: "object", description: "Query parameters" },
    ],
  },
  {
    type: "trigger.queue",
    category: "trigger",
    label: "Queue Trigger",
    description: "Trigger from message queue",
    icon: "ListOrdered",
    defaultConfig: {},
    configSchema: [
      { name: "queue_name", label: "Queue Name", type: "text", required: true },
    ],
    outputSchema: [
      { name: "message", type: "object", description: "Message payload from queue" },
      { name: "messageId", type: "string", description: "Unique message identifier" },
      { name: "timestamp", type: "string", description: "When message was received" },
    ],
  },
  {
    type: "trigger.manual",
    category: "trigger",
    label: "Manual Trigger",
    description: "Start workflow manually",
    icon: "Play",
    defaultConfig: {},
    configSchema: [],
    outputSchema: [
      { name: "triggeredAt", type: "string", description: "Timestamp when manually triggered" },
      { name: "triggeredBy", type: "string", description: "User who triggered the workflow" },
    ],
  },
  {
    type: "trigger.form",
    category: "trigger",
    label: "Form Trigger",
    description: "Start workflow when form is submitted",
    icon: "FileText",
    defaultConfig: {
      formTitle: "My Form",
      formDescription: "",
      submitButtonLabel: "Submit",
      fields: [],
    },
    configSchema: [
      { name: "formTitle", label: "Form Title", type: "text", required: true, placeholder: "Contact Form" },
      { name: "formDescription", label: "Description", type: "textarea", placeholder: "Please fill out this form..." },
      { name: "submitButtonLabel", label: "Submit Button Text", type: "text", default: "Submit" },
      { name: "fields", label: "", type: "form-builder" },
    ],
    // Output: all form fields are available as ${formData.fieldId}
    outputSchema: [
      { name: "formData", type: "object", description: "All submitted form data", example: '{"nombre": "Juan", "email": "j@mail.com"}' },
      { name: "submissionId", type: "string", description: "Unique submission ID" },
      { name: "submittedAt", type: "string", description: "Timestamp of submission" },
    ],
  },
  {
    type: "trigger.api_polling",
    category: "trigger",
    label: "API Polling",
    description: "Poll an API endpoint at intervals",
    icon: "RefreshCw",
    defaultConfig: { method: "GET", interval: 60 },
    configSchema: [
      { name: "url", label: "API URL", type: "text", required: true, placeholder: "https://api.example.com/status" },
      { name: "method", label: "HTTP Method", type: "select", default: "GET", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] },
      { name: "interval", label: "Polling Interval (seconds)", type: "number", default: 60 },
      { name: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ..."}' },
      { name: "condition", label: "Trigger Condition (JSONPath)", type: "text", placeholder: "$.status == 'ready'" },
    ],
    outputSchema: [
      { name: "response", type: "object", description: "API response data" },
      { name: "statusCode", type: "number", description: "HTTP status code" },
      { name: "headers", type: "object", description: "Response headers" },
    ],
  },
  {
    type: "trigger.database_change",
    category: "trigger",
    label: "Database Change",
    description: "Trigger when database records change",
    icon: "DatabaseZap",
    defaultConfig: { event: "INSERT" },
    configSchema: [
      { name: "connection", label: "Connection Name", type: "text", required: true },
      { name: "table", label: "Table Name", type: "text", required: true },
      { name: "event", label: "Event Type", type: "select", default: "INSERT", options: [{ value: "INSERT", label: "Insert" }, { value: "UPDATE", label: "Update" }, { value: "DELETE", label: "Delete" }, { value: "ALL", label: "All Changes" }] },
      { name: "filter", label: "Filter Condition", type: "text", placeholder: "status = 'pending'" },
    ],
    outputSchema: [
      { name: "record", type: "object", description: "Changed record data" },
      { name: "event", type: "string", description: "Event type: INSERT, UPDATE, DELETE" },
      { name: "table", type: "string", description: "Table name" },
      { name: "timestamp", type: "string", description: "When the change occurred" },
    ],
  },
  {
    type: "trigger.storage_event",
    category: "trigger",
    label: "Storage Event",
    description: "Trigger on S3/MinIO storage events",
    icon: "HardDrive",
    defaultConfig: { event: "ObjectCreated" },
    configSchema: [
      { name: "bucket", label: "Bucket Name", type: "text", required: true },
      { name: "prefix", label: "Path Prefix", type: "text", placeholder: "uploads/" },
      { name: "event", label: "Event Type", type: "select", default: "ObjectCreated", options: [{ value: "ObjectCreated", label: "Object Created" }, { value: "ObjectRemoved", label: "Object Removed" }, { value: "ObjectModified", label: "Object Modified" }] },
      { name: "suffix", label: "File Suffix Filter", type: "text", placeholder: ".pdf" },
    ],
    outputSchema: [
      { name: "bucket", type: "string", description: "Bucket name" },
      { name: "key", type: "string", description: "Object key/path" },
      { name: "event", type: "string", description: "Event type" },
      { name: "size", type: "number", description: "Object size in bytes" },
      { name: "timestamp", type: "string", description: "When the event occurred" },
    ],
  },
  {
    type: "trigger.message_bus",
    category: "trigger",
    label: "Message Bus",
    description: "Trigger from Kafka/RabbitMQ/Redis",
    icon: "Radio",
    defaultConfig: { provider: "rabbitmq" },
    configSchema: [
      { name: "provider", label: "Provider", type: "select", default: "rabbitmq", options: [{ value: "rabbitmq", label: "RabbitMQ" }, { value: "kafka", label: "Kafka" }, { value: "redis", label: "Redis Pub/Sub" }, { value: "sqs", label: "AWS SQS" }] },
      { name: "connection", label: "Connection String", type: "text", required: true, placeholder: "amqp://localhost:5672" },
      { name: "topic", label: "Topic/Queue Name", type: "text", required: true },
      { name: "consumer_group", label: "Consumer Group", type: "text", placeholder: "skuldbot-workers" },
    ],
    outputSchema: [
      { name: "message", type: "object", description: "Message payload" },
      { name: "messageId", type: "string", description: "Message identifier" },
      { name: "topic", type: "string", description: "Topic/queue name" },
      { name: "timestamp", type: "string", description: "When message was received" },
    ],
  },
  {
    type: "trigger.chat",
    category: "trigger",
    label: "Chat Trigger",
    description: "Trigger from chat message (Slack, Teams, Telegram)",
    icon: "MessageCircle",
    defaultConfig: { platform: "slack" },
    configSchema: [
      { name: "platform", label: "Platform", type: "select", default: "slack", options: [{ value: "slack", label: "Slack" }, { value: "teams", label: "Microsoft Teams" }, { value: "telegram", label: "Telegram" }, { value: "discord", label: "Discord" }] },
      { name: "bot_token", label: "Bot Token", type: "password", required: true },
      { name: "channel", label: "Channel/Chat ID", type: "text", placeholder: "#general or C12345678" },
      { name: "command", label: "Command Prefix", type: "text", placeholder: "/runbot" },
      { name: "mention_only", label: "Only on Mention", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "message", type: "string", description: "Chat message text" },
      { name: "sender", type: "string", description: "Username/ID of sender" },
      { name: "channel", type: "string", description: "Channel/chat ID" },
      { name: "platform", type: "string", description: "Chat platform" },
      { name: "timestamp", type: "string", description: "When message was sent" },
    ],
  },

  // ============================================
  // WEB - Web Automation
  // ============================================
  {
    type: "web.open_browser",
    category: "web",
    label: "Open Browser",
    description: "Open a web browser",
    icon: "Globe",
    defaultConfig: { browser: "chromium", headless: false },
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true, placeholder: "https://example.com" },
      { name: "browser", label: "Browser", type: "select", default: "chromium", options: [{ value: "chromium", label: "Chromium" }, { value: "firefox", label: "Firefox" }, { value: "webkit", label: "WebKit" }] },
      { name: "headless", label: "Headless Mode (invisible browser)", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "title", type: "string", description: "Page title" },
      { name: "url", type: "string", description: "Current URL" },
    ],
  },
  {
    type: "web.navigate",
    category: "web",
    label: "Navigate To",
    description: "Navigate to URL",
    icon: "ExternalLink",
    defaultConfig: {},
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true, placeholder: "https://example.com" },
      { name: "wait_until", label: "Wait Until", type: "select", default: "load", options: [{ value: "load", label: "Page Load" }, { value: "domcontentloaded", label: "DOM Ready" }, { value: "networkidle", label: "Network Idle" }] },
    ],
    outputSchema: [
      { name: "title", type: "string", description: "Page title" },
      { name: "url", type: "string", description: "Final URL after navigation" },
    ],
  },
  {
    type: "web.click",
    category: "web",
    label: "Click Element",
    description: "Click on an element",
    icon: "MousePointer2",
    defaultConfig: {},
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true, placeholder: "#button-id" },
      { name: "timeout", label: "Timeout (ms)", type: "number", default: 30000 },
    ],
    outputSchema: [
      { name: "clicked", type: "boolean", description: "Whether click was successful" },
    ],
  },
  {
    type: "web.type",
    category: "web",
    label: "Type Text",
    description: "Type text into field",
    icon: "Type",
    defaultConfig: {},
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true },
      { name: "text", label: "Text to Type", type: "text", required: true },
      { name: "clear", label: "Clear Field First", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "typed", type: "boolean", description: "Whether text was typed successfully" },
    ],
  },
  {
    type: "web.select_option",
    category: "web",
    label: "Select Option",
    description: "Select dropdown option",
    icon: "ChevronDown",
    defaultConfig: {},
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true },
      { name: "value", label: "Value", type: "text", required: true },
    ],
  },
  {
    type: "web.get_text",
    category: "web",
    label: "Get Text",
    description: "Extract text from element",
    icon: "TextCursor",
    defaultConfig: {},
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "text", type: "string", description: "Extracted text content" },
    ],
  },
  {
    type: "web.get_attribute",
    category: "web",
    label: "Get Attribute",
    description: "Get element attribute",
    icon: "Tag",
    defaultConfig: {},
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true, supportsExpressions: true },
      { name: "attribute", label: "Attribute Name", type: "text", required: true, placeholder: "href" },
    ],
    outputSchema: [
      { name: "value", type: "string", description: "Attribute value" },
    ],
  },
  {
    type: "web.screenshot",
    category: "web",
    label: "Screenshot",
    description: "Take a screenshot",
    icon: "Camera",
    defaultConfig: { full_page: false },
    configSchema: [
      { name: "path", label: "Save Path", type: "text", placeholder: "./screenshot.png" },
      { name: "full_page", label: "Full Page", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "path", type: "string", description: "Path to saved screenshot" },
      { name: "width", type: "number", description: "Screenshot width in pixels" },
      { name: "height", type: "number", description: "Screenshot height in pixels" },
    ],
  },
  {
    type: "web.wait_element",
    category: "web",
    label: "Wait for Element",
    description: "Wait for element to appear",
    icon: "Clock",
    defaultConfig: { timeout: 30000 },
    configSchema: [
      { name: "selector", label: "CSS Selector", type: "text", required: true },
      { name: "state", label: "Wait For", type: "select", default: "visible", options: [{ value: "visible", label: "Visible" }, { value: "hidden", label: "Hidden" }, { value: "attached", label: "Attached" }] },
      { name: "timeout", label: "Timeout (ms)", type: "number", default: 30000 },
    ],
  },
  {
    type: "web.execute_js",
    category: "web",
    label: "Execute JavaScript",
    description: "Run JavaScript in browser",
    icon: "Code",
    defaultConfig: {},
    configSchema: [
      { name: "script", label: "JavaScript Code", type: "textarea", required: true, placeholder: "return document.title;" },
    ],
    outputSchema: [
      { name: "result", type: "any", description: "Return value from JavaScript" },
    ],
  },
  {
    type: "web.scroll",
    category: "web",
    label: "Scroll Page",
    description: "Scroll the page",
    icon: "ArrowDown",
    defaultConfig: {},
    configSchema: [
      { name: "direction", label: "Direction", type: "select", default: "down", options: [{ value: "down", label: "Down" }, { value: "up", label: "Up" }, { value: "to_element", label: "To Element" }] },
      { name: "selector", label: "Element (if To Element)", type: "text" },
    ],
  },
  {
    type: "web.handle_alert",
    category: "web",
    label: "Handle Alert",
    description: "Accept/dismiss alerts",
    icon: "AlertCircle",
    defaultConfig: { action: "accept" },
    configSchema: [
      { name: "action", label: "Action", type: "select", default: "accept", options: [{ value: "accept", label: "Accept" }, { value: "dismiss", label: "Dismiss" }] },
    ],
  },
  {
    type: "web.switch_tab",
    category: "web",
    label: "Switch Tab",
    description: "Switch browser tab",
    icon: "PanelLeft",
    defaultConfig: {},
    configSchema: [
      { name: "tab_index", label: "Tab Index", type: "number", default: 0 },
    ],
  },
  {
    type: "web.close_browser",
    category: "web",
    label: "Close Browser",
    description: "Close the browser",
    icon: "X",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "web.download_file",
    category: "web",
    label: "Download File",
    description: "Download a file",
    icon: "Download",
    defaultConfig: {},
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true },
      { name: "path", label: "Save Path", type: "text", required: true },
    ],
  },

  // ============================================
  // DESKTOP - Desktop Automation (Windows)
  // ============================================
  {
    type: "desktop.open_app",
    category: "desktop",
    label: "Open Application",
    description: "Launch an application",
    icon: "AppWindow",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Application Path", type: "text", required: true },
      { name: "args", label: "Arguments", type: "text" },
    ],
  },
  {
    type: "desktop.click",
    category: "desktop",
    label: "Desktop Click",
    description: "Click at coordinates or element",
    icon: "MousePointer",
    defaultConfig: {},
    configSchema: [
      { name: "locator", label: "Element Locator", type: "text", placeholder: "name:Button1" },
      { name: "x", label: "X Coordinate", type: "number" },
      { name: "y", label: "Y Coordinate", type: "number" },
    ],
  },
  {
    type: "desktop.type_text",
    category: "desktop",
    label: "Type Text",
    description: "Type text with keyboard",
    icon: "Keyboard",
    defaultConfig: {},
    configSchema: [
      { name: "text", label: "Text", type: "text", required: true },
      { name: "interval", label: "Key Interval (ms)", type: "number", default: 50 },
    ],
  },
  {
    type: "desktop.hotkey",
    category: "desktop",
    label: "Send Hotkey",
    description: "Press keyboard shortcut",
    icon: "Command",
    defaultConfig: {},
    configSchema: [
      { name: "keys", label: "Key Combination", type: "text", required: true, placeholder: "ctrl+c" },
    ],
  },
  {
    type: "desktop.get_window",
    category: "desktop",
    label: "Get Window",
    description: "Find and focus window",
    icon: "Square",
    defaultConfig: {},
    configSchema: [
      { name: "title", label: "Window Title", type: "text", required: true },
      { name: "partial_match", label: "Partial Match", type: "boolean", default: true },
    ],
  },
  {
    type: "desktop.minimize",
    category: "desktop",
    label: "Minimize Window",
    description: "Minimize active window",
    icon: "Minus",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "desktop.maximize",
    category: "desktop",
    label: "Maximize Window",
    description: "Maximize active window",
    icon: "Maximize2",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "desktop.close_window",
    category: "desktop",
    label: "Close Window",
    description: "Close active window",
    icon: "XSquare",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "desktop.screenshot",
    category: "desktop",
    label: "Desktop Screenshot",
    description: "Capture screen region",
    icon: "Monitor",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Save Path", type: "text", required: true },
      { name: "region", label: "Region (x,y,w,h)", type: "text", placeholder: "0,0,1920,1080" },
    ],
  },
  {
    type: "desktop.image_click",
    category: "desktop",
    label: "Click Image",
    description: "Find and click image on screen",
    icon: "Image",
    defaultConfig: {},
    configSchema: [
      { name: "image_path", label: "Image Path", type: "text", required: true },
      { name: "confidence", label: "Confidence (0-1)", type: "number", default: 0.9 },
    ],
  },
  {
    type: "desktop.wait_image",
    category: "desktop",
    label: "Wait for Image",
    description: "Wait for image to appear",
    icon: "ScanSearch",
    defaultConfig: { timeout: 30000 },
    configSchema: [
      { name: "image_path", label: "Image Path", type: "text", required: true },
      { name: "timeout", label: "Timeout (ms)", type: "number", default: 30000 },
    ],
  },
  {
    type: "desktop.clipboard_copy",
    category: "desktop",
    label: "Copy to Clipboard",
    description: "Copy text to clipboard",
    icon: "Copy",
    defaultConfig: {},
    configSchema: [
      { name: "text", label: "Text", type: "text", required: true },
    ],
  },

  // ============================================
  // FILES - Files & Folders
  // ============================================
  {
    type: "files.read",
    category: "files",
    label: "Read File",
    description: "Read file contents",
    icon: "FileInput",
    defaultConfig: { encoding: "utf-8" },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
      { name: "encoding", label: "Encoding", type: "select", default: "utf-8", options: [{ value: "utf-8", label: "UTF-8" }, { value: "ascii", label: "ASCII" }, { value: "latin1", label: "Latin-1" }] },
    ],
    outputSchema: [
      { name: "content", type: "string", description: "File contents" },
      { name: "size", type: "number", description: "File size in bytes" },
      { name: "path", type: "string", description: "Full file path" },
    ],
  },
  {
    type: "files.write",
    category: "files",
    label: "Write File",
    description: "Write to file",
    icon: "FileOutput",
    defaultConfig: { append: false },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
      { name: "content", label: "Content", type: "textarea", required: true },
      { name: "append", label: "Append Mode", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "path", type: "string", description: "Written file path" },
      { name: "bytesWritten", type: "number", description: "Bytes written" },
    ],
  },
  {
    type: "files.copy",
    category: "files",
    label: "Copy File",
    description: "Copy file or folder",
    icon: "Copy",
    defaultConfig: {},
    configSchema: [
      { name: "source", label: "Source Path", type: "text", required: true },
      { name: "destination", label: "Destination", type: "text", required: true },
    ],
    outputSchema: [
      { name: "destination", type: "string", description: "Destination path" },
      { name: "copied", type: "boolean", description: "Copy successful" },
    ],
  },
  {
    type: "files.move",
    category: "files",
    label: "Move File",
    description: "Move or rename file",
    icon: "FolderInput",
    defaultConfig: {},
    configSchema: [
      { name: "source", label: "Source Path", type: "text", required: true },
      { name: "destination", label: "Destination", type: "text", required: true },
    ],
    outputSchema: [
      { name: "destination", type: "string", description: "New file path" },
      { name: "moved", type: "boolean", description: "Move successful" },
    ],
  },
  {
    type: "files.delete",
    category: "files",
    label: "Delete File",
    description: "Delete file or folder",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Path", type: "text", required: true },
      { name: "recursive", label: "Recursive (folders)", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "deleted", type: "boolean", description: "Deletion successful" },
      { name: "path", type: "string", description: "Deleted path" },
    ],
  },
  {
    type: "files.create_folder",
    category: "files",
    label: "Create Folder",
    description: "Create new folder",
    icon: "FolderPlus",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Folder Path", type: "text", required: true },
    ],
    outputSchema: [
      { name: "path", type: "string", description: "Created folder path" },
      { name: "created", type: "boolean", description: "Creation successful" },
    ],
  },
  {
    type: "files.list",
    category: "files",
    label: "List Files",
    description: "List files in folder",
    icon: "FolderOpen",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Folder Path", type: "text", required: true },
      { name: "pattern", label: "Pattern", type: "text", placeholder: "*.csv" },
      { name: "recursive", label: "Recursive", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "files", type: "array", description: "List of file paths" },
      { name: "count", type: "number", description: "Number of files found" },
    ],
  },
  {
    type: "files.exists",
    category: "files",
    label: "File Exists",
    description: "Check if file exists",
    icon: "FileSearch",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
    ],
    outputSchema: [
      { name: "exists", type: "boolean", description: "Whether file exists" },
      { name: "isFile", type: "boolean", description: "Is a file (not folder)" },
      { name: "isDirectory", type: "boolean", description: "Is a directory" },
    ],
  },
  {
    type: "files.zip",
    category: "files",
    label: "Create ZIP",
    description: "Compress files to ZIP",
    icon: "Archive",
    defaultConfig: {},
    configSchema: [
      { name: "source", label: "Source Path", type: "text", required: true },
      { name: "destination", label: "ZIP Path", type: "text", required: true },
    ],
    outputSchema: [
      { name: "path", type: "string", description: "Created ZIP path" },
      { name: "size", type: "number", description: "ZIP file size" },
      { name: "filesCount", type: "number", description: "Number of files compressed" },
    ],
  },
  {
    type: "files.unzip",
    category: "files",
    label: "Extract ZIP",
    description: "Extract ZIP archive",
    icon: "FolderArchive",
    defaultConfig: {},
    configSchema: [
      { name: "source", label: "ZIP Path", type: "text", required: true },
      { name: "destination", label: "Extract To", type: "text", required: true },
    ],
    outputSchema: [
      { name: "path", type: "string", description: "Extraction folder path" },
      { name: "files", type: "array", description: "List of extracted files" },
      { name: "filesCount", type: "number", description: "Number of files extracted" },
    ],
  },
  {
    type: "files.get_info",
    category: "files",
    label: "Get File Info",
    description: "Get file metadata",
    icon: "FileText",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
    ],
    outputSchema: [
      { name: "name", type: "string", description: "File name" },
      { name: "size", type: "number", description: "File size in bytes" },
      { name: "extension", type: "string", description: "File extension" },
      { name: "created", type: "string", description: "Creation timestamp" },
      { name: "modified", type: "string", description: "Last modified timestamp" },
    ],
  },
  {
    type: "files.watch",
    category: "files",
    label: "Watch Folder",
    description: "Monitor folder for changes",
    icon: "Eye",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Folder Path", type: "text", required: true },
      { name: "pattern", label: "File Pattern", type: "text", placeholder: "*.*" },
    ],
    outputSchema: [
      { name: "changedFile", type: "string", description: "Path of changed file" },
      { name: "event", type: "string", description: "Event type: created, modified, deleted" },
      { name: "timestamp", type: "string", description: "When change occurred" },
    ],
  },

  // ============================================
  // EXCEL - Excel / CSV / Data
  // ============================================
  {
    type: "excel.open",
    category: "excel",
    label: "Open Excel",
    description: "Open Excel workbook",
    icon: "FileSpreadsheet",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
    ],
  },
  {
    type: "excel.read_range",
    category: "excel",
    label: "Read Range",
    description: "Read cell range",
    icon: "Table",
    defaultConfig: { header: true },
    configSchema: [
      { name: "range", label: "Range", type: "text", placeholder: "A1:D100" },
      { name: "sheet", label: "Sheet", type: "text" },
      { name: "header", label: "First Row as Header", type: "boolean", default: true },
      { name: "column_names", label: "Column Names", type: "text", placeholder: "Name, Date, Status, Amount" },
    ],
    outputSchema: [
      { name: "data", type: "array", description: "Array of rows (objects if header=true or column_names defined)" },
      { name: "rowCount", type: "number", description: "Number of rows read" },
    ],
  },
  {
    type: "excel.write_range",
    category: "excel",
    label: "Write Range",
    description: "Write data to cells",
    icon: "Table2",
    defaultConfig: {},
    configSchema: [
      { name: "range", label: "Start Cell", type: "text", required: true, placeholder: "A1" },
      { name: "data", label: "Data (JSON)", type: "textarea", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.read_cell",
    category: "excel",
    label: "Read Cell",
    description: "Read single cell",
    icon: "SquareStack",
    defaultConfig: {},
    configSchema: [
      { name: "cell", label: "Cell", type: "text", required: true, placeholder: "A1" },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
    outputSchema: [
      { name: "value", type: "any", description: "Cell value" },
    ],
  },
  {
    type: "excel.write_cell",
    category: "excel",
    label: "Write Cell",
    description: "Write to single cell",
    icon: "PenLine",
    defaultConfig: {},
    configSchema: [
      { name: "cell", label: "Cell", type: "text", required: true, placeholder: "A1" },
      { name: "value", label: "Value", type: "text", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.add_row",
    category: "excel",
    label: "Add Row",
    description: "Append row to sheet",
    icon: "ListPlus",
    defaultConfig: {},
    configSchema: [
      { name: "data", label: "Row Data (JSON array)", type: "textarea", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.filter",
    category: "excel",
    label: "Filter Data",
    description: "Filter Excel data",
    icon: "Filter",
    defaultConfig: {},
    configSchema: [
      { name: "column", label: "Column", type: "text", required: true },
      { name: "condition", label: "Condition", type: "text", required: true, placeholder: "> 100" },
    ],
  },
  {
    type: "excel.save",
    category: "excel",
    label: "Save Excel",
    description: "Save workbook",
    icon: "Save",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Save Path (optional)", type: "text" },
    ],
  },
  {
    type: "excel.close",
    category: "excel",
    label: "Close Excel",
    description: "Close workbook",
    icon: "X",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "excel.csv_read",
    category: "excel",
    label: "Read CSV",
    description: "Read CSV file",
    icon: "FileText",
    defaultConfig: { delimiter: "," },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
      { name: "delimiter", label: "Delimiter", type: "text", default: "," },
      { name: "header", label: "Has Header", type: "boolean", default: true },
    ],
  },
  {
    type: "excel.csv_write",
    category: "excel",
    label: "Write CSV",
    description: "Write to CSV file",
    icon: "FileOutput",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
      { name: "data", label: "Data (JSON)", type: "textarea", required: true },
      { name: "delimiter", label: "Delimiter", type: "text", default: "," },
    ],
  },
  {
    type: "excel.pivot",
    category: "excel",
    label: "Create Pivot",
    description: "Create pivot table",
    icon: "PieChart",
    defaultConfig: {},
    configSchema: [
      { name: "source_range", label: "Source Range", type: "text", required: true },
      { name: "rows", label: "Row Fields", type: "text", required: true },
      { name: "values", label: "Value Fields", type: "text", required: true },
    ],
  },
  {
    type: "excel.create",
    category: "excel",
    label: "Create Excel",
    description: "Create new workbook",
    icon: "FilePlus2",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
      { name: "sheet_name", label: "Initial Sheet Name", type: "text", default: "Sheet1" },
    ],
  },
  {
    type: "excel.create_sheet",
    category: "excel",
    label: "Create Sheet",
    description: "Create new worksheet",
    icon: "Plus",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Sheet Name", type: "text", required: true },
    ],
  },
  {
    type: "excel.delete_sheet",
    category: "excel",
    label: "Delete Sheet",
    description: "Delete worksheet",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Sheet Name", type: "text", required: true },
    ],
  },
  {
    type: "excel.rename_sheet",
    category: "excel",
    label: "Rename Sheet",
    description: "Rename worksheet",
    icon: "Edit3",
    defaultConfig: {},
    configSchema: [
      { name: "old_name", label: "Current Name", type: "text", required: true },
      { name: "new_name", label: "New Name", type: "text", required: true },
    ],
  },
  {
    type: "excel.get_sheets",
    category: "excel",
    label: "Get Sheets",
    description: "List all worksheets",
    icon: "Layers",
    defaultConfig: {},
    configSchema: [],
    outputSchema: [
      { name: "sheets", type: "array", description: "List of sheet names" },
    ],
  },
  {
    type: "excel.delete_row",
    category: "excel",
    label: "Delete Row",
    description: "Delete row from sheet",
    icon: "RowsIcon",
    defaultConfig: {},
    configSchema: [
      { name: "row", label: "Row Number", type: "number", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.delete_column",
    category: "excel",
    label: "Delete Column",
    description: "Delete column from sheet",
    icon: "Columns",
    defaultConfig: {},
    configSchema: [
      { name: "column", label: "Column (e.g., A, B)", type: "text", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.insert_row",
    category: "excel",
    label: "Insert Row",
    description: "Insert row at position",
    icon: "ListPlus",
    defaultConfig: {},
    configSchema: [
      { name: "row", label: "Row Position", type: "number", required: true },
      { name: "data", label: "Row Data (JSON array)", type: "textarea" },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.set_format",
    category: "excel",
    label: "Set Format",
    description: "Apply cell formatting",
    icon: "PaintBucket",
    defaultConfig: {},
    configSchema: [
      { name: "range", label: "Range", type: "text", required: true, placeholder: "A1:D10" },
      { name: "bold", label: "Bold", type: "boolean", default: false },
      { name: "font_size", label: "Font Size", type: "number" },
      { name: "bg_color", label: "Background Color", type: "text", placeholder: "#FFFFFF" },
      { name: "number_format", label: "Number Format", type: "text", placeholder: "#,##0.00" },
    ],
  },
  {
    type: "excel.merge_cells",
    category: "excel",
    label: "Merge Cells",
    description: "Merge cell range",
    icon: "Merge",
    defaultConfig: {},
    configSchema: [
      { name: "range", label: "Range", type: "text", required: true, placeholder: "A1:D1" },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.auto_filter",
    category: "excel",
    label: "Auto Filter",
    description: "Apply auto filter",
    icon: "Filter",
    defaultConfig: {},
    configSchema: [
      { name: "range", label: "Range", type: "text", required: true },
      { name: "sheet", label: "Sheet", type: "text" },
    ],
  },
  {
    type: "excel.sort",
    category: "excel",
    label: "Sort Data",
    description: "Sort range data",
    icon: "ArrowUpDown",
    defaultConfig: { ascending: true },
    configSchema: [
      { name: "range", label: "Range", type: "text", required: true },
      { name: "column", label: "Sort Column", type: "text", required: true },
      { name: "ascending", label: "Ascending", type: "boolean", default: true },
    ],
  },
  {
    type: "excel.find_replace",
    category: "excel",
    label: "Find & Replace",
    description: "Find and replace values",
    icon: "SearchCode",
    defaultConfig: {},
    configSchema: [
      { name: "find", label: "Find", type: "text", required: true },
      { name: "replace", label: "Replace With", type: "text", required: true },
      { name: "range", label: "Range (optional)", type: "text" },
    ],
  },
  {
    type: "excel.create_chart",
    category: "excel",
    label: "Create Chart",
    description: "Create chart from data",
    icon: "LineChart",
    defaultConfig: { chart_type: "bar" },
    configSchema: [
      { name: "data_range", label: "Data Range", type: "text", required: true },
      { name: "chart_type", label: "Chart Type", type: "select", default: "bar", options: [{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "pie", label: "Pie" }, { value: "scatter", label: "Scatter" }] },
      { name: "title", label: "Chart Title", type: "text" },
    ],
  },
  {
    type: "excel.export_pdf",
    category: "excel",
    label: "Export to PDF",
    description: "Export workbook to PDF",
    icon: "FileDown",
    defaultConfig: {},
    configSchema: [
      { name: "output_path", label: "Output Path", type: "text", required: true },
      { name: "sheet", label: "Sheet (optional, all if empty)", type: "text" },
    ],
  },
  {
    type: "excel.vlookup",
    category: "excel",
    label: "VLOOKUP",
    description: "Perform VLOOKUP",
    icon: "Search",
    defaultConfig: {},
    configSchema: [
      { name: "lookup_value", label: "Lookup Value", type: "text", required: true },
      { name: "table_range", label: "Table Range", type: "text", required: true },
      { name: "col_index", label: "Column Index", type: "number", required: true },
    ],
    outputSchema: [
      { name: "result", type: "any", description: "Found value" },
    ],
  },

  // ============================================
  // EMAIL - Email Operations
  // ============================================
  {
    type: "email.send",
    category: "email",
    label: "Send Email",
    description: "Send an email",
    icon: "Send",
    defaultConfig: {},
    configSchema: [
      { name: "to", label: "To", type: "text", required: true },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea", required: true },
      { name: "html", label: "HTML Body", type: "boolean", default: false },
    ],
  },
  {
    type: "email.read",
    category: "email",
    label: "Read Emails",
    description: "Read emails from mailbox",
    icon: "MailOpen",
    defaultConfig: { folder: "INBOX", limit: 10 },
    configSchema: [
      { name: "folder", label: "Folder", type: "text", default: "INBOX" },
      { name: "filter", label: "Subject Filter", type: "text" },
      { name: "unread_only", label: "Unread Only", type: "boolean", default: true },
      { name: "limit", label: "Max Emails", type: "number", default: 10 },
    ],
  },
  {
    type: "email.reply",
    category: "email",
    label: "Reply to Email",
    description: "Reply to an email",
    icon: "Reply",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Original Message ID", type: "text", required: true },
      { name: "body", label: "Reply Body", type: "textarea", required: true },
    ],
  },
  {
    type: "email.forward",
    category: "email",
    label: "Forward Email",
    description: "Forward an email",
    icon: "Forward",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Original Message ID", type: "text", required: true },
      { name: "to", label: "Forward To", type: "text", required: true },
    ],
  },
  {
    type: "email.download_attachment",
    category: "email",
    label: "Download Attachment",
    description: "Save email attachment",
    icon: "Paperclip",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true },
      { name: "save_path", label: "Save Path", type: "text", required: true },
    ],
  },
  {
    type: "email.move",
    category: "email",
    label: "Move Email",
    description: "Move email to folder",
    icon: "FolderInput",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true },
      { name: "folder", label: "Target Folder", type: "text", required: true },
    ],
  },
  {
    type: "email.delete",
    category: "email",
    label: "Delete Email",
    description: "Delete an email",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true },
    ],
  },
  {
    type: "email.mark_read",
    category: "email",
    label: "Mark as Read",
    description: "Mark email as read/unread",
    icon: "CheckCircle",
    defaultConfig: { read: true },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true },
      { name: "read", label: "Mark as Read", type: "boolean", default: true },
    ],
  },
  {
    type: "email.search",
    category: "email",
    label: "Search Emails",
    description: "Search emails with criteria",
    icon: "Search",
    defaultConfig: {},
    configSchema: [
      { name: "query", label: "Search Query", type: "text", required: true },
      { name: "folder", label: "Folder", type: "text", default: "INBOX" },
    ],
  },
  {
    type: "email.send_smtp",
    category: "email",
    label: "Send via SMTP",
    description: "Send email via SMTP server",
    icon: "Server",
    defaultConfig: { port: 587, tls: true },
    configSchema: [
      { name: "smtp_host", label: "SMTP Host", type: "text", required: true },
      { name: "port", label: "Port", type: "number", default: 587 },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
      { name: "tls", label: "Use TLS", type: "boolean", default: true },
      { name: "to", label: "To", type: "text", required: true },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea", required: true },
    ],
  },
  {
    type: "email.send_outlook",
    category: "email",
    label: "Send via Outlook",
    description: "Send email via Outlook",
    icon: "Mail",
    defaultConfig: {},
    configSchema: [
      { name: "to", label: "To", type: "text", required: true },
      { name: "cc", label: "CC", type: "text" },
      { name: "bcc", label: "BCC", type: "text" },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea", required: true },
      { name: "html", label: "HTML Body", type: "boolean", default: false },
      { name: "attachments", label: "Attachments (paths)", type: "textarea" },
    ],
  },
  {
    type: "email.send_gmail",
    category: "email",
    label: "Send via Gmail",
    description: "Send email via Gmail API",
    icon: "Mail",
    defaultConfig: {},
    configSchema: [
      { name: "to", label: "To", type: "text", required: true },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea", required: true },
      { name: "html", label: "HTML Body", type: "boolean", default: false },
    ],
  },
  {
    type: "email.read_imap",
    category: "email",
    label: "Read via IMAP",
    description: "Read emails via IMAP",
    icon: "Inbox",
    defaultConfig: { port: 993, ssl: true },
    configSchema: [
      { name: "imap_host", label: "IMAP Host", type: "text", required: true },
      { name: "port", label: "Port", type: "number", default: 993 },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
      { name: "ssl", label: "Use SSL", type: "boolean", default: true },
      { name: "folder", label: "Folder", type: "text", default: "INBOX" },
      { name: "limit", label: "Max Emails", type: "number", default: 10 },
    ],
  },
  {
    type: "email.create_draft",
    category: "email",
    label: "Create Draft",
    description: "Create email draft",
    icon: "FileEdit",
    defaultConfig: {},
    configSchema: [
      { name: "to", label: "To", type: "text" },
      { name: "subject", label: "Subject", type: "text" },
      { name: "body", label: "Body", type: "textarea" },
    ],
  },
  {
    type: "email.get_folders",
    category: "email",
    label: "Get Folders",
    description: "List email folders",
    icon: "FolderTree",
    defaultConfig: {},
    configSchema: [],
    outputSchema: [
      { name: "folders", type: "array", description: "List of folder names" },
    ],
  },

  // ============================================
  // API - API & Integration
  // ============================================
  {
    type: "api.http_request",
    category: "api",
    label: "HTTP Request",
    description: "Make HTTP request",
    icon: "Globe",
    defaultConfig: { method: "GET" },
    configSchema: [
      { name: "method", label: "Method", type: "select", default: "GET", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }, { value: "PATCH", label: "PATCH" }, { value: "DELETE", label: "DELETE" }] },
      { name: "url", label: "URL", type: "text", required: true, supportsExpressions: true },
      { name: "headers", label: "Headers (JSON)", type: "textarea", supportsExpressions: true },
      { name: "body", label: "Body (JSON)", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "statusCode", type: "number", description: "HTTP status code", example: "200" },
      { name: "body", type: "object", description: "Response body (JSON)" },
      { name: "headers", type: "object", description: "Response headers" },
    ],
  },
  {
    type: "api.graphql",
    category: "api",
    label: "GraphQL Query",
    description: "Execute GraphQL query",
    icon: "Braces",
    defaultConfig: {},
    configSchema: [
      { name: "endpoint", label: "Endpoint", type: "text", required: true },
      { name: "query", label: "Query", type: "textarea", required: true },
      { name: "variables", label: "Variables (JSON)", type: "textarea" },
    ],
  },
  {
    type: "api.rest_get",
    category: "api",
    label: "REST GET",
    description: "Simple GET request",
    icon: "ArrowDownToLine",
    defaultConfig: {},
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true },
      { name: "headers", label: "Headers (JSON)", type: "textarea" },
    ],
  },
  {
    type: "api.rest_post",
    category: "api",
    label: "REST POST",
    description: "Simple POST request",
    icon: "ArrowUpToLine",
    defaultConfig: {},
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true },
      { name: "body", label: "Body (JSON)", type: "textarea", required: true },
      { name: "headers", label: "Headers (JSON)", type: "textarea" },
    ],
  },
  {
    type: "api.soap",
    category: "api",
    label: "SOAP Request",
    description: "Make SOAP request",
    icon: "FileCode",
    defaultConfig: {},
    configSchema: [
      { name: "wsdl", label: "WSDL URL", type: "text", required: true },
      { name: "operation", label: "Operation", type: "text", required: true },
      { name: "body", label: "XML Body", type: "textarea" },
    ],
  },
  {
    type: "api.oauth_token",
    category: "api",
    label: "Get OAuth Token",
    description: "Authenticate with OAuth",
    icon: "Key",
    defaultConfig: { grant_type: "client_credentials" },
    configSchema: [
      { name: "token_url", label: "Token URL", type: "text", required: true },
      { name: "client_id", label: "Client ID", type: "text", required: true },
      { name: "client_secret", label: "Client Secret", type: "text", required: true },
      { name: "grant_type", label: "Grant Type", type: "select", default: "client_credentials", options: [{ value: "client_credentials", label: "Client Credentials" }, { value: "password", label: "Password" }] },
    ],
  },
  {
    type: "api.parse_json",
    category: "api",
    label: "Parse JSON",
    description: "Parse JSON string",
    icon: "Braces",
    defaultConfig: {},
    configSchema: [
      { name: "input", label: "JSON String", type: "textarea", required: true },
    ],
  },
  {
    type: "api.json_path",
    category: "api",
    label: "JSONPath Query",
    description: "Extract with JSONPath",
    icon: "GitBranch",
    defaultConfig: {},
    configSchema: [
      { name: "json", label: "JSON Data", type: "textarea", required: true },
      { name: "path", label: "JSONPath", type: "text", required: true, placeholder: "$.data[*].name" },
    ],
  },
  {
    type: "api.ftp_upload",
    category: "api",
    label: "FTP Upload",
    description: "Upload file via FTP",
    icon: "Upload",
    defaultConfig: {},
    configSchema: [
      { name: "host", label: "FTP Host", type: "text", required: true },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "text", required: true },
      { name: "local_path", label: "Local File", type: "text", required: true },
      { name: "remote_path", label: "Remote Path", type: "text", required: true },
    ],
  },

  // ============================================
  // DATABASE - Database Operations
  // ============================================
  {
    type: "database.connect",
    category: "database",
    label: "Connect Database",
    description: "Connect to database using individual credentials (supports vault references)",
    icon: "Database",
    defaultConfig: { type: "postgresql", port: 5432 },
    configSchema: [
      { name: "type", label: "Database Type", type: "select", default: "postgresql", options: [
        { value: "postgresql", label: "PostgreSQL" },
        { value: "mysql", label: "MySQL" },
        { value: "mssql", label: "SQL Server" },
        { value: "oracle", label: "Oracle" },
        { value: "sqlite", label: "SQLite" },
      ]},
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost or ${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 5432, placeholder: "5432" },
      { name: "database", label: "Database Name", type: "text", required: true, placeholder: "mydb", supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "connected", type: "boolean", description: "Connection status" },
      { name: "connectionId", type: "string", description: "Connection identifier for use in subsequent nodes" },
      { name: "database", type: "string", description: "Connected database name" },
    ],
  },
  {
    type: "database.query",
    category: "database",
    label: "Execute Query",
    description: "Run SQL query on connected database",
    icon: "Code",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", placeholder: "${Connect Database.connectionId}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea", required: true, supportsExpressions: true },
      { name: "params", label: "Parameters (JSON)", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Query result rows" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of rows returned" },
    ],
  },
  {
    type: "database.insert",
    category: "database",
    label: "Insert Row",
    description: "Insert data into table",
    icon: "Plus",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", placeholder: "${Connect Database.connectionId}", supportsExpressions: true },
      { name: "table", label: "Table Name", type: "text", required: true, supportsExpressions: true },
      { name: "data", label: "Data (JSON)", type: "textarea", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "insertedId", type: "string", description: "ID of inserted row" },
      { name: "rowsAffected", type: "number", description: "Number of rows inserted" },
    ],
  },
  {
    type: "database.update",
    category: "database",
    label: "Update Rows",
    description: "Update table data",
    icon: "RefreshCw",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", placeholder: "${Connect Database.connectionId}", supportsExpressions: true },
      { name: "table", label: "Table Name", type: "text", required: true, supportsExpressions: true },
      { name: "data", label: "Data (JSON)", type: "textarea", required: true, supportsExpressions: true },
      { name: "where", label: "WHERE Clause", type: "text", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "rowsAffected", type: "number", description: "Number of rows updated" },
    ],
  },
  {
    type: "database.delete",
    category: "database",
    label: "Delete Rows",
    description: "Delete from table",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", placeholder: "${Connect Database.connectionId}", supportsExpressions: true },
      { name: "table", label: "Table Name", type: "text", required: true, supportsExpressions: true },
      { name: "where", label: "WHERE Clause", type: "text", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "rowsAffected", type: "number", description: "Number of rows deleted" },
    ],
  },
  {
    type: "database.call_procedure",
    category: "database",
    label: "Call Procedure",
    description: "Execute stored procedure",
    icon: "Play",
    defaultConfig: {},
    configSchema: [
      { name: "procedure", label: "Procedure Name", type: "text", required: true },
      { name: "params", label: "Parameters (JSON)", type: "textarea" },
    ],
    outputSchema: [
      { name: "result", type: "object", description: "Procedure return value" },
      { name: "outParams", type: "object", description: "Output parameters" },
    ],
  },
  {
    type: "database.transaction",
    category: "database",
    label: "Transaction",
    description: "Start database transaction",
    icon: "GitMerge",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "database.commit",
    category: "database",
    label: "Commit",
    description: "Commit transaction",
    icon: "Check",
    defaultConfig: {},
    configSchema: [],
  },
  {
    type: "database.close",
    category: "database",
    label: "Close Connection",
    description: "Close database connection",
    icon: "X",
    defaultConfig: {},
    configSchema: [],
  },

  // ============================================
  // DOCUMENT - PDF / OCR / Documents
  // ============================================
  {
    type: "document.pdf_read",
    category: "document",
    label: "Read PDF",
    description: "Extract text from PDF",
    icon: "FileText",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "PDF Path", type: "text", required: true },
      { name: "pages", label: "Pages (e.g., 1-5)", type: "text" },
    ],
  },
  {
    type: "document.pdf_merge",
    category: "document",
    label: "Merge PDFs",
    description: "Combine multiple PDFs",
    icon: "FilePlus",
    defaultConfig: {},
    configSchema: [
      { name: "files", label: "PDF Files (JSON array)", type: "textarea", required: true },
      { name: "output", label: "Output Path", type: "text", required: true },
    ],
  },
  {
    type: "document.pdf_split",
    category: "document",
    label: "Split PDF",
    description: "Split PDF into pages",
    icon: "Scissors",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "PDF Path", type: "text", required: true },
      { name: "pages", label: "Pages to Extract", type: "text", required: true },
      { name: "output", label: "Output Path", type: "text", required: true },
    ],
  },
  {
    type: "document.pdf_to_image",
    category: "document",
    label: "PDF to Image",
    description: "Convert PDF to images",
    icon: "Image",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "PDF Path", type: "text", required: true },
      { name: "output_dir", label: "Output Directory", type: "text", required: true },
      { name: "format", label: "Image Format", type: "select", default: "png", options: [{ value: "png", label: "PNG" }, { value: "jpg", label: "JPEG" }] },
    ],
  },
  {
    type: "document.ocr",
    category: "document",
    label: "OCR Extract",
    description: "Extract text with OCR",
    icon: "ScanLine",
    defaultConfig: { language: "eng" },
    configSchema: [
      { name: "path", label: "Image Path", type: "text", required: true },
      { name: "language", label: "Language", type: "select", default: "eng", options: [{ value: "eng", label: "English" }, { value: "spa", label: "Spanish" }, { value: "deu", label: "German" }, { value: "fra", label: "French" }] },
    ],
  },
  {
    type: "document.word_read",
    category: "document",
    label: "Read Word",
    description: "Read Word document",
    icon: "FileType",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true },
    ],
  },
  {
    type: "document.word_write",
    category: "document",
    label: "Write Word",
    description: "Create Word document",
    icon: "FileType2",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Output Path", type: "text", required: true },
      { name: "content", label: "Content", type: "textarea", required: true },
    ],
  },
  {
    type: "document.html_to_pdf",
    category: "document",
    label: "HTML to PDF",
    description: "Convert HTML to PDF",
    icon: "FileDown",
    defaultConfig: {},
    configSchema: [
      { name: "html", label: "HTML Content or URL", type: "textarea", required: true },
      { name: "output", label: "Output Path", type: "text", required: true },
    ],
  },
  {
    type: "document.pdf_fill_form",
    category: "document",
    label: "Fill PDF Form",
    description: "Fill PDF form fields",
    icon: "PenTool",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "PDF Path", type: "text", required: true },
      { name: "fields", label: "Field Values (JSON)", type: "textarea", required: true },
      { name: "output", label: "Output Path", type: "text", required: true },
    ],
  },

  // ============================================
  // AI - AI / Intelligent Automation
  // ============================================
  // NOTE: ai.llm_prompt was removed - use AI Agent instead
  // AI Agent already has goal (prompt) and system_prompt
  // Connect AI Model node to configure the LLM provider
  {
    type: "ai.agent",
    category: "ai",
    label: "AI Agent",
    description: "Autonomous ReAct agent with tool execution. Connect an AI Model node to configure the LLM.",
    icon: "Bot",
    defaultConfig: { max_iterations: 10 },
    configSchema: [
      { name: "name", label: "Agent Name", type: "text", placeholder: "My Agent" },
      { name: "goal", label: "Goal / Task", type: "textarea", required: true, supportsExpressions: true, placeholder: "Describe what the agent should accomplish..." },
      { name: "system_prompt", label: "System Prompt", type: "textarea", placeholder: "You are a helpful assistant that can use tools to accomplish tasks." },
      { name: "max_iterations", label: "Max Iterations", type: "number", default: 10 },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
      // Note: Tools connect via "tool" edges → Tools handle
      // Note: Memory connects via "memory" edge from Vector Memory → Memory handle
      // Note: Embeddings connect via "embeddings" edge → Embed handle
    ],
    outputSchema: [
      { name: "result", type: "string", description: "Final agent response/result" },
      { name: "tool_calls", type: "array", description: "List of tools called during execution" },
      { name: "iterations", type: "number", description: "Number of reasoning iterations" },
      { name: "reasoning_trace", type: "array", description: "Step-by-step reasoning trace" },
    ],
  },
  {
    type: "ai.extract_data",
    category: "ai",
    label: "AI Extract Data",
    description: "Extract structured data from text. Connect AI Model node to configure LLM.",
    icon: "FileSearch",
    defaultConfig: {},
    configSchema: [
      { name: "input", label: "Input Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "schema", label: "Output Schema (JSON)", type: "textarea", required: true, placeholder: '{"name": "string", "email": "string", "amount": "number"}' },
      { name: "instructions", label: "Additional Instructions", type: "textarea", placeholder: "Optional extraction hints..." },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "extracted", type: "object", description: "Extracted data matching schema" },
    ],
  },
  {
    type: "ai.summarize",
    category: "ai",
    label: "AI Summarize",
    description: "Summarize text content. Connect AI Model node to configure LLM.",
    icon: "AlignLeft",
    defaultConfig: { style: "concise" },
    configSchema: [
      { name: "input", label: "Input Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "style", label: "Style", type: "select", default: "concise", options: [
        { value: "concise", label: "Concise" },
        { value: "detailed", label: "Detailed" },
        { value: "bullets", label: "Bullet Points" },
        { value: "executive", label: "Executive Summary" },
      ]},
      { name: "max_length", label: "Max Length (words)", type: "number", placeholder: "Optional limit" },
      { name: "language", label: "Output Language", type: "text", placeholder: "Same as input" },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "summary", type: "string", description: "Summarized text" },
    ],
  },
  {
    type: "ai.classify",
    category: "ai",
    label: "AI Classify",
    description: "Classify text into categories. Connect AI Model node to configure LLM.",
    icon: "Tags",
    defaultConfig: { multi_label: false },
    configSchema: [
      { name: "input", label: "Input Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "categories", label: "Categories (comma separated)", type: "text", required: true, placeholder: "spam, not_spam" },
      { name: "multi_label", label: "Allow Multiple Labels", type: "boolean", default: false },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "category", type: "string", description: "Classified category" },
      { name: "confidence", type: "number", description: "Confidence score (0-1)" },
      { name: "all_scores", type: "object", description: "Confidence for each category" },
    ],
  },
  {
    type: "ai.translate",
    category: "ai",
    label: "AI Translate",
    description: "Translate text to another language. Connect AI Model node to configure LLM.",
    icon: "Languages",
    defaultConfig: {},
    configSchema: [
      { name: "input", label: "Input Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "target_language", label: "Target Language", type: "text", required: true, placeholder: "Spanish, French, German..." },
      { name: "source_language", label: "Source Language", type: "text", placeholder: "Auto-detect if empty" },
      { name: "preserve_formatting", label: "Preserve Formatting", type: "boolean", default: true },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "translated", type: "string", description: "Translated text" },
      { name: "detected_language", type: "string", description: "Detected source language" },
    ],
  },
  {
    type: "ai.sentiment",
    category: "ai",
    label: "Sentiment Analysis",
    description: "Analyze text sentiment. Connect AI Model node to configure LLM.",
    icon: "ThumbsUp",
    defaultConfig: { detailed: false },
    configSchema: [
      { name: "input", label: "Input Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "detailed", label: "Detailed Analysis", type: "boolean", default: false },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "sentiment", type: "string", description: "positive, negative, or neutral" },
      { name: "score", type: "number", description: "Sentiment score (-1 to 1)" },
      { name: "emotions", type: "object", description: "Detected emotions (if detailed)" },
    ],
  },
  {
    type: "ai.vision",
    category: "ai",
    label: "AI Vision",
    description: "Analyze images with AI. Connect AI Model node (must support vision).",
    icon: "Eye",
    defaultConfig: {},
    configSchema: [
      { name: "image_path", label: "Image Path", type: "text", required: true, supportsExpressions: true },
      { name: "prompt", label: "Question about image", type: "textarea", required: true, placeholder: "What is in this image?" },
      { name: "detail", label: "Detail Level", type: "select", default: "auto", options: [
        { value: "auto", label: "Auto" },
        { value: "low", label: "Low (faster)" },
        { value: "high", label: "High (more detail)" },
      ]},
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
      // Must use a vision-capable model (GPT-4o, Claude 3, Gemini 1.5, etc.)
    ],
    outputSchema: [
      { name: "description", type: "string", description: "AI analysis of the image" },
    ],
  },
  {
    type: "ai.repair_data",
    category: "ai",
    label: "AI Repair Data",
    description: "Intelligently repair data quality issues. Connect AI Model node to configure LLM.",
    icon: "Wrench",
    defaultConfig: {
      context: "general",
      allow_format_normalization: true,
      allow_semantic_cleanup: true,
      allow_value_inference: false,
      allow_sensitive_repair: false,
      min_confidence: 0.9,
    },
    configSchema: [
      { name: "data", label: "Data to Repair", type: "textarea", required: true, supportsExpressions: true, placeholder: "${EXCEL_DATA}" },
      { name: "validation_report", label: "Validation Report", type: "textarea", required: true, supportsExpressions: true, placeholder: "${QUALITY_REPORT}" },
      { name: "context", label: "Context", type: "select", default: "general", options: [
        { value: "general", label: "General" },
        { value: "insurance", label: "Insurance" },
        { value: "healthcare", label: "Healthcare (HIPAA)" },
        { value: "finance", label: "Finance" },
      ]},
      { name: "allow_format_normalization", label: "Allow Format Normalization", type: "boolean", default: true },
      { name: "allow_semantic_cleanup", label: "Allow Semantic Cleanup", type: "boolean", default: true },
      { name: "allow_value_inference", label: "Allow Value Inference (CAUTION)", type: "boolean", default: false },
      { name: "allow_sensitive_repair", label: "Allow Sensitive Field Repair", type: "boolean", default: false },
      { name: "min_confidence", label: "Minimum Confidence (0.0-1.0)", type: "number", default: 0.9 },
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Result status: repaired, partially_fixed, failed" },
      { name: "original_quality", type: "number", description: "Original data quality score" },
      { name: "repaired_quality", type: "number", description: "Quality score after repairs" },
      { name: "improvement", type: "number", description: "Quality improvement percentage" },
      { name: "repaired_data", type: "array", description: "Data with applied repairs" },
      { name: "repairs", type: "array", description: "List of applied repairs with confidence scores" },
      { name: "issues_fixed", type: "number", description: "Number of issues fixed" },
    ],
  },
  {
    type: "ai.suggest_repairs",
    category: "ai",
    label: "AI Suggest Repairs",
    description: "Preview repair suggestions for human review. Connect AI Model node.",
    icon: "Lightbulb",
    defaultConfig: { context: "general" },
    configSchema: [
      { name: "data", label: "Data to Analyze", type: "textarea", required: true, supportsExpressions: true },
      { name: "validation_report", label: "Validation Report", type: "textarea", required: true, supportsExpressions: true },
      { name: "context", label: "Context", type: "select", default: "general", options: [
        { value: "general", label: "General" },
        { value: "insurance", label: "Insurance" },
        { value: "healthcare", label: "Healthcare" },
        { value: "finance", label: "Finance" },
      ]},
      // Note: LLM is configured via connected "AI Model" node (ai.model) → Model handle
    ],
    outputSchema: [
      { name: "suggestion_count", type: "number", description: "Total number of suggestions" },
      { name: "high_confidence", type: "array", description: "High confidence suggestions (>= 0.9)" },
      { name: "medium_confidence", type: "array", description: "Medium confidence suggestions (0.7-0.9)" },
      { name: "low_confidence", type: "array", description: "Low confidence suggestions (< 0.7)" },
      { name: "estimated_quality_after_repair", type: "number", description: "Estimated quality if all repairs applied" },
    ],
  },

  // ============================================
  // VECTORDB - Vector Databases / Memory (RAG)
  // ============================================

  // ──────────────────────────────────────────────────
  // pgvector - PostgreSQL with vector extension (LOCAL / On-Premise)
  // Best for: Enterprise, on-premise, existing PostgreSQL users
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.pgvector_connect",
    category: "vectordb",
    label: "pgvector Connect",
    description: "Connect to PostgreSQL with pgvector extension (local/on-premise)",
    icon: "Database",
    defaultConfig: { port: 5432, dimension: 1536, ssl: false, pool_size: 5, create_table_if_not_exists: true },
    configSchema: [
      // Connection Settings
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost", default: "localhost" },
      { name: "port", label: "Port", type: "number", default: 5432 },
      { name: "database", label: "Database", type: "text", required: true, placeholder: "vectors" },
      { name: "user", label: "Username", type: "text", required: true, supportsExpressions: true, placeholder: "${DB_USER}" },
      { name: "password", label: "Password", type: "password", required: true, supportsExpressions: true, placeholder: "${DB_PASSWORD}" },
      // SSL/Security
      { name: "ssl", label: "Use SSL", type: "boolean", default: false },
      { name: "ssl_mode", label: "SSL Mode", type: "select", default: "prefer", options: [
        { value: "disable", label: "Disable" },
        { value: "allow", label: "Allow" },
        { value: "prefer", label: "Prefer" },
        { value: "require", label: "Require" },
        { value: "verify-ca", label: "Verify CA" },
        { value: "verify-full", label: "Verify Full" },
      ]},
      // Table Configuration
      { name: "table", label: "Table Name", type: "text", required: true, placeholder: "embeddings" },
      { name: "dimension", label: "Vector Dimension", type: "number", default: 1536, placeholder: "1536 for OpenAI, 768 for BERT" },
      { name: "create_table_if_not_exists", label: "Auto-create Table", type: "boolean", default: true },
      // Index Configuration (critical for performance)
      { name: "index_type", label: "Index Type", type: "select", default: "ivfflat", options: [
        { value: "none", label: "No Index (small datasets)" },
        { value: "ivfflat", label: "IVFFlat (balanced)" },
        { value: "hnsw", label: "HNSW (fastest, more memory)" },
      ]},
      { name: "index_lists", label: "IVFFlat Lists (sqrt of rows)", type: "number", default: 100 },
      // Connection Pool
      { name: "pool_size", label: "Connection Pool Size", type: "number", default: 5 },
      { name: "connection_timeout", label: "Connection Timeout (seconds)", type: "number", default: 30 },
    ],
    outputSchema: [
      { name: "connection_id", type: "string", description: "Connection identifier for subsequent operations" },
      { name: "table_exists", type: "boolean", description: "Whether the table already exists" },
      { name: "table_created", type: "boolean", description: "Whether the table was created" },
      { name: "index_exists", type: "boolean", description: "Whether a vector index exists" },
      { name: "row_count", type: "number", description: "Current number of rows in table" },
      { name: "pg_version", type: "string", description: "PostgreSQL version" },
      { name: "pgvector_version", type: "string", description: "pgvector extension version" },
    ],
  },
  {
    type: "vectordb.pgvector_upsert",
    category: "vectordb",
    label: "pgvector Upsert",
    description: "Insert or update vectors in pgvector with batch support",
    icon: "DatabaseBackup",
    defaultConfig: { batch_size: 100, on_conflict: "update" },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true, placeholder: "${pgvector Connect.connection_id}" },
      // Data Input - supports multiple formats
      { name: "vectors", label: "Vectors", type: "textarea", required: true, supportsExpressions: true, placeholder: "JSON array of vectors or ${Generate Embeddings.embeddings}" },
      { name: "documents", label: "Documents/Content (optional)", type: "textarea", supportsExpressions: true, placeholder: "Original text content for retrieval" },
      { name: "metadata", label: "Metadata", type: "textarea", supportsExpressions: true, placeholder: "JSON array of metadata objects" },
      { name: "ids", label: "IDs (optional)", type: "textarea", supportsExpressions: true, placeholder: "Auto-generated UUIDs if empty" },
      // Batch Processing
      { name: "batch_size", label: "Batch Size", type: "number", default: 100 },
      { name: "on_conflict", label: "On Conflict", type: "select", default: "update", options: [
        { value: "update", label: "Update existing" },
        { value: "skip", label: "Skip duplicates" },
        { value: "error", label: "Raise error" },
      ]},
      // Metadata columns to update on conflict
      { name: "update_metadata", label: "Update Metadata on Conflict", type: "boolean", default: true },
      { name: "update_vector", label: "Update Vector on Conflict", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "upserted_count", type: "number", description: "Number of vectors upserted" },
      { name: "inserted_count", type: "number", description: "Number of new vectors inserted" },
      { name: "updated_count", type: "number", description: "Number of vectors updated" },
      { name: "skipped_count", type: "number", description: "Number of vectors skipped (duplicates)" },
      { name: "ids", type: "array", description: "IDs of all upserted vectors" },
      { name: "duration_ms", type: "number", description: "Operation duration in milliseconds" },
    ],
  },
  {
    type: "vectordb.pgvector_query",
    category: "vectordb",
    label: "pgvector Query",
    description: "Semantic search in pgvector with advanced filtering (RAG retrieval)",
    icon: "Search",
    defaultConfig: { top_k: 5, distance_metric: "cosine", include_metadata: true, include_documents: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      // Query Input - vector or text (auto-embed)
      { name: "query_vector", label: "Query Vector", type: "textarea", supportsExpressions: true, placeholder: "${Generate Embeddings.embedding}" },
      { name: "query_text", label: "OR Query Text (auto-embed)", type: "textarea", supportsExpressions: true, placeholder: "Natural language query" },
      { name: "embedding_model", label: "Embedding Model (for text)", type: "select", default: "text-embedding-3-small", options: [
        { value: "text-embedding-3-small", label: "OpenAI text-embedding-3-small" },
        { value: "text-embedding-3-large", label: "OpenAI text-embedding-3-large" },
        { value: "text-embedding-ada-002", label: "OpenAI Ada 002" },
      ]},
      // Search Parameters
      { name: "top_k", label: "Top K Results", type: "number", default: 5 },
      { name: "distance_metric", label: "Distance Metric", type: "select", default: "cosine", options: [
        { value: "cosine", label: "Cosine Similarity (recommended)" },
        { value: "l2", label: "Euclidean (L2)" },
        { value: "inner_product", label: "Inner Product (normalized vectors)" },
      ]},
      { name: "score_threshold", label: "Min Similarity Score (0-1)", type: "number", default: 0, placeholder: "0 = return all" },
      // Filtering
      { name: "filter", label: "Metadata Filter (SQL WHERE)", type: "textarea", supportsExpressions: true, placeholder: "category = 'docs' AND created_at > '2024-01-01'" },
      { name: "filter_json", label: "OR Filter (JSON)", type: "textarea", supportsExpressions: true, placeholder: '{"category": "docs", "status": "active"}' },
      // Output Options
      { name: "include_metadata", label: "Include Metadata", type: "boolean", default: true },
      { name: "include_documents", label: "Include Documents", type: "boolean", default: true },
      { name: "include_vectors", label: "Include Vectors", type: "boolean", default: false },
      { name: "include_distance", label: "Include Distance Score", type: "boolean", default: true },
      // Reranking (advanced)
      { name: "rerank", label: "Rerank Results", type: "boolean", default: false },
      { name: "rerank_model", label: "Rerank Model", type: "select", default: "none", options: [
        { value: "none", label: "No reranking" },
        { value: "cohere-rerank", label: "Cohere Rerank" },
        { value: "cross-encoder", label: "Cross-Encoder" },
      ]},
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Array of {id, score, metadata, document, vector}" },
      { name: "count", type: "number", description: "Number of results returned" },
      { name: "query_time_ms", type: "number", description: "Query execution time" },
      { name: "context", type: "string", description: "Combined document text for LLM context" },
      { name: "sources", type: "array", description: "Source citations with IDs and scores" },
    ],
  },
  {
    type: "vectordb.pgvector_delete",
    category: "vectordb",
    label: "pgvector Delete",
    description: "Delete vectors from pgvector by ID, filter, or TTL",
    icon: "Trash2",
    defaultConfig: { confirm_delete: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "ids", label: "IDs to Delete", type: "textarea", supportsExpressions: true, placeholder: "JSON array of IDs" },
      { name: "filter", label: "Filter (SQL WHERE)", type: "textarea", supportsExpressions: true, placeholder: "expires_at < NOW() OR status = 'archived'" },
      { name: "filter_json", label: "OR Filter (JSON)", type: "textarea", supportsExpressions: true },
      { name: "delete_all", label: "Delete ALL (DANGER)", type: "boolean", default: false },
      { name: "confirm_delete", label: "Confirm Delete (set false for scripts)", type: "boolean", default: true },
      { name: "dry_run", label: "Dry Run (count without deleting)", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "deleted_count", type: "number", description: "Number of vectors deleted" },
      { name: "would_delete", type: "number", description: "Count of vectors that would be deleted (dry run)" },
      { name: "deleted_ids", type: "array", description: "IDs of deleted vectors" },
    ],
  },
  {
    type: "vectordb.pgvector_admin",
    category: "vectordb",
    label: "pgvector Admin",
    description: "Administrative operations: vacuum, reindex, stats",
    icon: "Settings",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "operation", label: "Operation", type: "select", required: true, options: [
        { value: "stats", label: "Get Statistics" },
        { value: "vacuum", label: "Vacuum Table" },
        { value: "reindex", label: "Rebuild Index" },
        { value: "analyze", label: "Analyze Table" },
        { value: "truncate", label: "Truncate Table (DANGER)" },
        { value: "drop_index", label: "Drop Index" },
        { value: "create_index", label: "Create/Recreate Index" },
      ]},
      { name: "index_type", label: "Index Type (for create)", type: "select", default: "hnsw", options: [
        { value: "ivfflat", label: "IVFFlat" },
        { value: "hnsw", label: "HNSW" },
      ]},
    ],
    outputSchema: [
      { name: "success", type: "boolean", description: "Operation completed successfully" },
      { name: "row_count", type: "number", description: "Current row count" },
      { name: "table_size", type: "string", description: "Table size on disk" },
      { name: "index_size", type: "string", description: "Index size on disk" },
      { name: "message", type: "string", description: "Operation result message" },
    ],
  },

  // ──────────────────────────────────────────────────
  // Pinecone - Managed Vector Database (Cloud)
  // Best for: Production, serverless, managed infrastructure
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.pinecone_connect",
    category: "vectordb",
    label: "Pinecone Connect",
    description: "Connect to Pinecone serverless vector database",
    icon: "Cloud",
    defaultConfig: { metric: "cosine" },
    configSchema: [
      { name: "api_key", label: "API Key", type: "password", required: true, supportsExpressions: true, placeholder: "${PINECONE_API_KEY}" },
      { name: "environment", label: "Environment/Region", type: "text", required: true, placeholder: "us-east-1-aws or gcp-starter" },
      { name: "index_name", label: "Index Name", type: "text", required: true },
      { name: "namespace", label: "Namespace (multi-tenant isolation)", type: "text", supportsExpressions: true },
      // Auto-create index if not exists
      { name: "create_if_not_exists", label: "Create Index if Not Exists", type: "boolean", default: false },
      { name: "dimension", label: "Vector Dimension (for create)", type: "number", default: 1536 },
      { name: "metric", label: "Distance Metric (for create)", type: "select", default: "cosine", options: [
        { value: "cosine", label: "Cosine" },
        { value: "euclidean", label: "Euclidean" },
        { value: "dotproduct", label: "Dot Product" },
      ]},
      // Pod type (serverless vs pod-based)
      { name: "pod_type", label: "Pod Type", type: "select", default: "serverless", options: [
        { value: "serverless", label: "Serverless (recommended)" },
        { value: "p1.x1", label: "p1.x1 (pod-based)" },
        { value: "p2.x1", label: "p2.x1 (pod-based)" },
        { value: "s1.x1", label: "s1.x1 (storage optimized)" },
      ]},
    ],
    outputSchema: [
      { name: "connection_id", type: "string", description: "Connection identifier" },
      { name: "dimension", type: "number", description: "Vector dimension of the index" },
      { name: "total_vectors", type: "number", description: "Total vectors in the index" },
      { name: "namespaces", type: "array", description: "Available namespaces" },
      { name: "index_fullness", type: "number", description: "Index capacity usage (0-1)" },
      { name: "ready", type: "boolean", description: "Index is ready for queries" },
    ],
  },
  {
    type: "vectordb.pinecone_upsert",
    category: "vectordb",
    label: "Pinecone Upsert",
    description: "Insert or update vectors in Pinecone with batch processing",
    icon: "Upload",
    defaultConfig: { batch_size: 100, async_mode: false },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "namespace", label: "Namespace (override)", type: "text", supportsExpressions: true },
      // Data Input
      { name: "vectors", label: "Vectors", type: "textarea", required: true, supportsExpressions: true },
      { name: "ids", label: "IDs (required)", type: "textarea", required: true, supportsExpressions: true },
      { name: "metadata", label: "Metadata", type: "textarea", supportsExpressions: true },
      // Sparse vectors for hybrid search
      { name: "sparse_vectors", label: "Sparse Vectors (hybrid search)", type: "textarea", supportsExpressions: true },
      // Batch settings
      { name: "batch_size", label: "Batch Size (max 100)", type: "number", default: 100 },
      { name: "async_mode", label: "Async Mode (faster, no confirmation)", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "upserted_count", type: "number", description: "Number of vectors upserted" },
      { name: "batch_count", type: "number", description: "Number of batches processed" },
      { name: "duration_ms", type: "number", description: "Total operation time" },
    ],
  },
  {
    type: "vectordb.pinecone_query",
    category: "vectordb",
    label: "Pinecone Query",
    description: "Semantic and hybrid search in Pinecone",
    icon: "Search",
    defaultConfig: { top_k: 5, include_metadata: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "namespace", label: "Namespace (override)", type: "text", supportsExpressions: true },
      // Query Input
      { name: "query_vector", label: "Query Vector", type: "textarea", supportsExpressions: true },
      { name: "query_text", label: "OR Query Text (auto-embed)", type: "textarea", supportsExpressions: true },
      { name: "embedding_model", label: "Embedding Model", type: "select", default: "text-embedding-3-small", options: [
        { value: "text-embedding-3-small", label: "OpenAI text-embedding-3-small" },
        { value: "text-embedding-3-large", label: "OpenAI text-embedding-3-large" },
      ]},
      // Hybrid Search (dense + sparse)
      { name: "sparse_vector", label: "Sparse Vector (hybrid)", type: "textarea", supportsExpressions: true },
      { name: "alpha", label: "Hybrid Alpha (0=sparse, 1=dense)", type: "number", default: 0.5 },
      // Search Parameters
      { name: "top_k", label: "Top K Results", type: "number", default: 5 },
      { name: "score_threshold", label: "Min Score", type: "number", default: 0 },
      // Filtering
      { name: "filter", label: "Metadata Filter", type: "textarea", supportsExpressions: true, placeholder: '{"category": {"$eq": "docs"}}' },
      // Output Options
      { name: "include_metadata", label: "Include Metadata", type: "boolean", default: true },
      { name: "include_values", label: "Include Vector Values", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Array of {id, score, metadata, values}" },
      { name: "count", type: "number", description: "Number of results" },
      { name: "namespace", type: "string", description: "Namespace queried" },
      { name: "context", type: "string", description: "Combined text for LLM" },
    ],
  },
  {
    type: "vectordb.pinecone_delete",
    category: "vectordb",
    label: "Pinecone Delete",
    description: "Delete vectors from Pinecone",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "namespace", label: "Namespace", type: "text", supportsExpressions: true },
      { name: "ids", label: "IDs to Delete", type: "textarea", supportsExpressions: true },
      { name: "filter", label: "Metadata Filter", type: "textarea", supportsExpressions: true },
      { name: "delete_all", label: "Delete All in Namespace", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "success", type: "boolean", description: "Delete operation completed" },
      { name: "message", type: "string", description: "Result message" },
    ],
  },

  // ──────────────────────────────────────────────────
  // Qdrant - High-performance vector database
  // Best for: Self-hosted, high performance, advanced filtering
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.qdrant_connect",
    category: "vectordb",
    label: "Qdrant Connect",
    description: "Connect to Qdrant (local Docker or Qdrant Cloud)",
    icon: "Hexagon",
    defaultConfig: { grpc_port: 6334, prefer_grpc: true },
    configSchema: [
      // Connection
      { name: "url", label: "URL", type: "text", required: true, placeholder: "http://localhost:6333 or https://xxx.qdrant.io" },
      { name: "api_key", label: "API Key (Qdrant Cloud)", type: "password", supportsExpressions: true },
      { name: "prefer_grpc", label: "Use gRPC (faster)", type: "boolean", default: true },
      { name: "grpc_port", label: "gRPC Port", type: "number", default: 6334 },
      // Collection
      { name: "collection", label: "Collection Name", type: "text", required: true },
      // Auto-create collection
      { name: "create_if_not_exists", label: "Create if Not Exists", type: "boolean", default: true },
      { name: "dimension", label: "Vector Dimension", type: "number", default: 1536 },
      { name: "distance", label: "Distance Metric", type: "select", default: "Cosine", options: [
        { value: "Cosine", label: "Cosine" },
        { value: "Euclid", label: "Euclidean" },
        { value: "Dot", label: "Dot Product" },
      ]},
      // Optimization
      { name: "on_disk", label: "Store Vectors on Disk", type: "boolean", default: false },
      { name: "hnsw_config", label: "HNSW M Parameter", type: "number", default: 16 },
    ],
    outputSchema: [
      { name: "connection_id", type: "string", description: "Connection identifier" },
      { name: "collection_exists", type: "boolean", description: "Collection exists" },
      { name: "points_count", type: "number", description: "Number of points" },
      { name: "indexed_vectors_count", type: "number", description: "Indexed vectors" },
      { name: "segments_count", type: "number", description: "Number of segments" },
      { name: "status", type: "string", description: "Collection status" },
    ],
  },
  {
    type: "vectordb.qdrant_upsert",
    category: "vectordb",
    label: "Qdrant Upsert",
    description: "Insert or update points in Qdrant",
    icon: "Upload",
    defaultConfig: { batch_size: 100, wait: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      // Data
      { name: "vectors", label: "Vectors", type: "textarea", required: true, supportsExpressions: true },
      { name: "payloads", label: "Payloads (metadata)", type: "textarea", supportsExpressions: true },
      { name: "ids", label: "IDs (optional, auto-UUID)", type: "textarea", supportsExpressions: true },
      // Named vectors support
      { name: "vector_name", label: "Vector Name (multi-vector)", type: "text", placeholder: "Leave empty for default" },
      // Batch
      { name: "batch_size", label: "Batch Size", type: "number", default: 100 },
      { name: "wait", label: "Wait for Index", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "upserted_count", type: "number", description: "Points upserted" },
      { name: "ids", type: "array", description: "Point IDs" },
      { name: "status", type: "string", description: "Operation status" },
    ],
  },
  {
    type: "vectordb.qdrant_query",
    category: "vectordb",
    label: "Qdrant Query",
    description: "Vector search with advanced payload filtering",
    icon: "Search",
    defaultConfig: { top_k: 5, with_payload: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      // Query
      { name: "query_vector", label: "Query Vector", type: "textarea", supportsExpressions: true },
      { name: "query_text", label: "OR Query Text", type: "textarea", supportsExpressions: true },
      { name: "vector_name", label: "Vector Name (multi-vector)", type: "text" },
      // Parameters
      { name: "top_k", label: "Top K", type: "number", default: 5 },
      { name: "score_threshold", label: "Score Threshold", type: "number" },
      // Filtering (Qdrant's powerful filter syntax)
      { name: "filter", label: "Payload Filter", type: "textarea", supportsExpressions: true, placeholder: '{"must": [{"key": "category", "match": {"value": "docs"}}]}' },
      // Output
      { name: "with_payload", label: "Include Payload", type: "boolean", default: true },
      { name: "with_vectors", label: "Include Vectors", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Search results" },
      { name: "count", type: "number", description: "Result count" },
      { name: "context", type: "string", description: "Combined text" },
    ],
  },
  {
    type: "vectordb.qdrant_delete",
    category: "vectordb",
    label: "Qdrant Delete",
    description: "Delete points by ID or filter",
    icon: "Trash2",
    defaultConfig: { wait: true },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "ids", label: "Point IDs", type: "textarea", supportsExpressions: true },
      { name: "filter", label: "Payload Filter", type: "textarea", supportsExpressions: true },
      { name: "wait", label: "Wait for Completion", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "deleted_count", type: "number", description: "Points deleted" },
      { name: "status", type: "string", description: "Operation status" },
    ],
  },

  // ──────────────────────────────────────────────────
  // ChromaDB - Open-source embedding database
  // Best for: Local development, prototyping, simple RAG
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.chroma_connect",
    category: "vectordb",
    label: "ChromaDB Connect",
    description: "Connect to ChromaDB (in-memory, local, or server)",
    icon: "Palette",
    defaultConfig: { mode: "persistent" },
    configSchema: [
      // Mode selection
      { name: "mode", label: "Mode", type: "select", default: "persistent", options: [
        { value: "memory", label: "In-Memory (ephemeral)" },
        { value: "persistent", label: "Persistent (local disk)" },
        { value: "server", label: "Server (remote)" },
      ]},
      // Persistent mode
      { name: "persist_directory", label: "Persist Directory", type: "text", placeholder: "./chroma_data" },
      // Server mode
      { name: "host", label: "Server Host", type: "text", placeholder: "localhost" },
      { name: "port", label: "Server Port", type: "number", default: 8000 },
      { name: "ssl", label: "Use SSL", type: "boolean", default: false },
      { name: "headers", label: "Auth Headers (JSON)", type: "textarea", supportsExpressions: true },
      // Collection
      { name: "collection", label: "Collection Name", type: "text", required: true },
      // Embedding function
      { name: "embedding_function", label: "Embedding Function", type: "select", default: "openai", options: [
        { value: "openai", label: "OpenAI (text-embedding-3-small)" },
        { value: "openai-large", label: "OpenAI (text-embedding-3-large)" },
        { value: "sentence-transformers", label: "Sentence Transformers (local)" },
        { value: "none", label: "None (bring your own)" },
      ]},
      { name: "openai_api_key", label: "OpenAI API Key", type: "password", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "connection_id", type: "string", description: "Connection identifier" },
      { name: "collection_exists", type: "boolean", description: "Collection exists" },
      { name: "count", type: "number", description: "Document count" },
      { name: "metadata", type: "object", description: "Collection metadata" },
    ],
  },
  {
    type: "vectordb.chroma_add",
    category: "vectordb",
    label: "ChromaDB Add",
    description: "Add documents to ChromaDB (auto-embeds by default)",
    icon: "Plus",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      // Documents - the main input
      { name: "documents", label: "Documents (text)", type: "textarea", required: true, supportsExpressions: true },
      { name: "metadatas", label: "Metadata", type: "textarea", supportsExpressions: true },
      { name: "ids", label: "IDs (auto-generated if empty)", type: "textarea", supportsExpressions: true },
      // Optional pre-computed embeddings
      { name: "embeddings", label: "Embeddings (skip auto-embed)", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "added_count", type: "number", description: "Documents added" },
      { name: "ids", type: "array", description: "Document IDs" },
    ],
  },
  {
    type: "vectordb.chroma_query",
    category: "vectordb",
    label: "ChromaDB Query",
    description: "Semantic search in ChromaDB",
    icon: "Search",
    defaultConfig: { n_results: 5 },
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      // Query - text or embedding
      { name: "query_texts", label: "Query Text", type: "textarea", supportsExpressions: true },
      { name: "query_embeddings", label: "OR Query Embedding", type: "textarea", supportsExpressions: true },
      // Parameters
      { name: "n_results", label: "Number of Results", type: "number", default: 5 },
      // Filtering
      { name: "where", label: "Metadata Filter", type: "textarea", supportsExpressions: true, placeholder: '{"category": "docs"}' },
      { name: "where_document", label: "Document Filter", type: "textarea", supportsExpressions: true, placeholder: '{"$contains": "keyword"}' },
      // Include
      { name: "include", label: "Include Fields", type: "text", default: "documents,metadatas,distances" },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Search results" },
      { name: "count", type: "number", description: "Result count" },
      { name: "context", type: "string", description: "Combined documents" },
    ],
  },
  {
    type: "vectordb.chroma_update",
    category: "vectordb",
    label: "ChromaDB Update",
    description: "Update documents in ChromaDB",
    icon: "RefreshCw",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "ids", label: "IDs to Update", type: "textarea", required: true, supportsExpressions: true },
      { name: "documents", label: "New Documents", type: "textarea", supportsExpressions: true },
      { name: "metadatas", label: "New Metadata", type: "textarea", supportsExpressions: true },
      { name: "embeddings", label: "New Embeddings", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "updated_count", type: "number", description: "Documents updated" },
    ],
  },
  {
    type: "vectordb.chroma_delete",
    category: "vectordb",
    label: "ChromaDB Delete",
    description: "Delete documents from ChromaDB",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "connection", label: "Connection", type: "text", required: true, supportsExpressions: true },
      { name: "ids", label: "IDs to Delete", type: "textarea", supportsExpressions: true },
      { name: "where", label: "Metadata Filter", type: "textarea", supportsExpressions: true },
      { name: "where_document", label: "Document Filter", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "deleted_count", type: "number", description: "Documents deleted" },
    ],
  },

  // ──────────────────────────────────────────────────
  // SUPABASE - pgvector as a Service
  // Managed PostgreSQL with pgvector in the cloud
  // Best for: Production apps, serverless, Supabase ecosystem
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.supabase_connect",
    category: "vectordb",
    label: "Supabase Connect",
    description: "Connect to Supabase pgvector (managed cloud database)",
    icon: "Database",
    defaultConfig: { dimension: 1536, create_table_if_not_exists: true, index_type: "ivfflat" },
    configSchema: [
      // Project
      { name: "url", label: "Supabase URL", type: "text", required: true, placeholder: "https://xxx.supabase.co" },
      { name: "api_key", label: "Service Role Key", type: "password", required: true, supportsExpressions: true },
      // Table
      { name: "table", label: "Table Name", type: "text", required: true, default: "documents" },
      { name: "dimension", label: "Vector Dimension", type: "number", default: 1536 },
      { name: "create_table_if_not_exists", label: "Auto-create Table", type: "boolean", default: true },
      // Index
      { name: "index_type", label: "Index Type", type: "select", default: "ivfflat", options: [
        { value: "none", label: "No Index (small datasets)" },
        { value: "ivfflat", label: "IVFFlat (balanced, recommended)" },
        { value: "hnsw", label: "HNSW (fastest queries, more memory)" },
      ]},
    ],
    outputSchema: [
      { name: "connection_id", type: "string", description: "Connection identifier" },
      { name: "project_ref", type: "string", description: "Supabase project reference" },
      { name: "table_exists", type: "boolean", description: "Whether table existed" },
      { name: "table_created", type: "boolean", description: "Whether table was created" },
      { name: "row_count", type: "number", description: "Current row count" },
    ],
  },
  {
    type: "vectordb.supabase_upsert",
    category: "vectordb",
    label: "Supabase Upsert",
    description: "Insert or update documents in Supabase",
    icon: "Upload",
    defaultConfig: { auto_embed: true },
    configSchema: [
      { name: "documents", label: "Documents", type: "textarea", required: true, supportsExpressions: true, placeholder: '[{"id": "doc1", "content": "...", "metadata": {...}}]' },
      { name: "auto_embed", label: "Auto-generate Embeddings", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "inserted", type: "number", description: "New documents inserted" },
      { name: "updated", type: "number", description: "Existing documents updated" },
      { name: "total", type: "number", description: "Total documents processed" },
    ],
  },
  {
    type: "vectordb.supabase_query",
    category: "vectordb",
    label: "Supabase Query",
    description: "Semantic search in Supabase",
    icon: "Search",
    defaultConfig: { top_k: 5, min_score: 0.5, include_metadata: true, include_content: true },
    configSchema: [
      { name: "query", label: "Query Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "top_k", label: "Number of Results", type: "number", default: 5 },
      { name: "min_score", label: "Minimum Similarity Score", type: "number", default: 0.5, placeholder: "0.0 - 1.0" },
      { name: "filter_metadata", label: "Metadata Filter (JSONB)", type: "textarea", supportsExpressions: true, placeholder: '{"category": "docs"}' },
      { name: "include_metadata", label: "Include Metadata", type: "boolean", default: true },
      { name: "include_content", label: "Include Content", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Search results with id, score, content, metadata" },
      { name: "count", type: "number", description: "Number of results" },
    ],
  },
  {
    type: "vectordb.supabase_delete",
    category: "vectordb",
    label: "Supabase Delete",
    description: "Delete documents from Supabase",
    icon: "Trash2",
    defaultConfig: {},
    configSchema: [
      { name: "ids", label: "Document IDs", type: "textarea", supportsExpressions: true, placeholder: '["id1", "id2"]' },
      { name: "filter_metadata", label: "OR Metadata Filter", type: "textarea", supportsExpressions: true },
      { name: "delete_all", label: "Delete ALL (danger)", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "deleted", type: "number", description: "Documents deleted" },
    ],
  },
  {
    type: "vectordb.supabase_stats",
    category: "vectordb",
    label: "Supabase Stats",
    description: "Get Supabase table statistics",
    icon: "BarChart2",
    defaultConfig: {},
    configSchema: [],
    outputSchema: [
      { name: "table", type: "string", description: "Table name" },
      { name: "row_count", type: "number", description: "Total rows" },
      { name: "table_size", type: "string", description: "Table size" },
      { name: "supabase_url", type: "string", description: "Supabase URL" },
      { name: "project_ref", type: "string", description: "Project reference" },
    ],
  },

  // ──────────────────────────────────────────────────
  // Vector Memory - AI Agent Integration
  // Connects directly to AI Agent for automatic RAG
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.memory",
    category: "vectordb",
    label: "Vector Memory",
    description: "Vector store memory for AI Agent (automatic RAG). Connect to AI Agent's Memory input.",
    icon: "Brain",
    defaultConfig: { provider: "chroma", collection: "agent_memory", memory_type: "both", top_k: 5, min_score: 0.5 },
    configSchema: [
      // Provider selection
      { name: "provider", label: "Vector Store Provider", type: "select", default: "chroma", options: [
        { value: "chroma", label: "ChromaDB (Local, easy setup)" },
        { value: "pgvector", label: "pgvector (PostgreSQL, on-premise)" },
        { value: "supabase", label: "Supabase (pgvector cloud)" },
        { value: "pinecone", label: "Pinecone (Serverless cloud)" },
        { value: "qdrant", label: "Qdrant (High-performance)" },
      ]},
      // Collection/table name
      { name: "collection", label: "Collection Name", type: "text", default: "agent_memory", placeholder: "agent_memory" },
      // Memory behavior
      { name: "memory_type", label: "Memory Type", type: "select", default: "both", options: [
        { value: "retrieve", label: "Retrieve Only (RAG context injection)" },
        { value: "store", label: "Store Only (save agent interactions)" },
        { value: "both", label: "Both (full conversational memory)" },
      ]},
      // Retrieval settings
      { name: "top_k", label: "Results to Retrieve (top_k)", type: "number", default: 5 },
      { name: "min_score", label: "Min Similarity Score (0-1)", type: "number", default: 0.5 },
      // ChromaDB settings (shown when provider=chroma)
      { name: "persist_directory", label: "Persist Directory (ChromaDB)", type: "text", placeholder: "./chroma_data", visibleWhen: { field: "provider", value: "chroma" } },
      // pgvector settings (shown when provider=pgvector)
      { name: "host", label: "Host", type: "text", default: "localhost", visibleWhen: { field: "provider", value: "pgvector" } },
      { name: "port", label: "Port", type: "number", default: 5432, visibleWhen: { field: "provider", value: "pgvector" } },
      { name: "database", label: "Database", type: "text", default: "vectors", visibleWhen: { field: "provider", value: "pgvector" } },
      { name: "user", label: "User", type: "text", default: "postgres", visibleWhen: { field: "provider", value: "pgvector" } },
      { name: "password", label: "Password", type: "text", secret: true, visibleWhen: { field: "provider", value: "pgvector" } },
      { name: "table", label: "Table", type: "text", default: "embeddings", visibleWhen: { field: "provider", value: "pgvector" } },
      // Supabase settings (shown when provider=supabase)
      { name: "url", label: "Supabase URL", type: "text", placeholder: "https://xxx.supabase.co", visibleWhen: { field: "provider", value: "supabase" } },
      { name: "api_key", label: "Supabase API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "supabase" } },
      // Pinecone settings (shown when provider=pinecone)
      { name: "api_key", label: "Pinecone API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "pinecone" } },
      { name: "index_name", label: "Index Name", type: "text", visibleWhen: { field: "provider", value: "pinecone" } },
      { name: "namespace", label: "Namespace", type: "text", visibleWhen: { field: "provider", value: "pinecone" } },
      // Qdrant settings (shown when provider=qdrant)
      { name: "host", label: "Host", type: "text", default: "localhost", visibleWhen: { field: "provider", value: "qdrant" } },
      { name: "port", label: "Port", type: "number", default: 6333, visibleWhen: { field: "provider", value: "qdrant" } },
      { name: "api_key", label: "API Key (optional)", type: "text", secret: true, visibleWhen: { field: "provider", value: "qdrant" } },
    ],
    outputSchema: [
      { name: "provider", type: "string", description: "Vector store provider" },
      { name: "collection", type: "string", description: "Collection/table name" },
      { name: "memory_type", type: "string", description: "Memory type (retrieve/store/both)" },
      { name: "ready", type: "boolean", description: "Memory initialized and ready" },
    ],
  },

  // ──────────────────────────────────────────────────
  // Document Loaders - Prepare content for vector stores
  // ──────────────────────────────────────────────────
  {
    type: "vectordb.load_documents",
    category: "vectordb",
    label: "Load Documents",
    description: "Load and chunk documents for vector storage",
    icon: "FileText",
    defaultConfig: { chunk_size: 1000, chunk_overlap: 200, splitter: "recursive" },
    configSchema: [
      // Source
      { name: "source_type", label: "Source Type", type: "select", required: true, options: [
        { value: "text", label: "Raw Text" },
        { value: "file", label: "File Path" },
        { value: "url", label: "URL" },
        { value: "pdf", label: "PDF File" },
        { value: "docx", label: "Word Document" },
        { value: "csv", label: "CSV File" },
        { value: "json", label: "JSON File" },
        { value: "html", label: "HTML" },
        { value: "markdown", label: "Markdown" },
      ]},
      { name: "source", label: "Source (text, path, or URL)", type: "textarea", required: true, supportsExpressions: true },
      // Chunking
      { name: "splitter", label: "Text Splitter", type: "select", default: "recursive", options: [
        { value: "recursive", label: "Recursive Character (recommended)" },
        { value: "token", label: "Token-based" },
        { value: "sentence", label: "Sentence" },
        { value: "paragraph", label: "Paragraph" },
        { value: "markdown", label: "Markdown Headers" },
        { value: "code", label: "Code (language-aware)" },
      ]},
      { name: "chunk_size", label: "Chunk Size (chars)", type: "number", default: 1000 },
      { name: "chunk_overlap", label: "Chunk Overlap (chars)", type: "number", default: 200 },
      // Metadata
      { name: "add_source_metadata", label: "Add Source Metadata", type: "boolean", default: true },
      { name: "custom_metadata", label: "Custom Metadata", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "documents", type: "array", description: "Chunked documents with metadata" },
      { name: "chunk_count", type: "number", description: "Number of chunks created" },
      { name: "total_chars", type: "number", description: "Total characters processed" },
    ],
  },
  {
    type: "vectordb.embed_documents",
    category: "vectordb",
    label: "Embed Documents",
    description: "Generate embeddings for documents",
    icon: "Binary",
    defaultConfig: { model: "text-embedding-3-small", batch_size: 100 },
    configSchema: [
      { name: "documents", label: "Documents", type: "textarea", required: true, supportsExpressions: true, placeholder: "${Load Documents.documents}" },
      { name: "model", label: "Embedding Model", type: "select", default: "text-embedding-3-small", options: [
        { value: "text-embedding-3-small", label: "OpenAI text-embedding-3-small (1536d, fast)" },
        { value: "text-embedding-3-large", label: "OpenAI text-embedding-3-large (3072d, best)" },
        { value: "text-embedding-ada-002", label: "OpenAI Ada 002 (1536d, legacy)" },
      ]},
      { name: "api_key", label: "OpenAI API Key", type: "password", supportsExpressions: true, placeholder: "${OPENAI_API_KEY}" },
      { name: "batch_size", label: "Batch Size", type: "number", default: 100 },
    ],
    outputSchema: [
      { name: "embeddings", type: "array", description: "Generated embeddings" },
      { name: "documents", type: "array", description: "Documents with embeddings attached" },
      { name: "dimension", type: "number", description: "Embedding dimension" },
      { name: "tokens_used", type: "number", description: "Total tokens processed" },
    ],
  },

  // ──────────────────────────────────────────────────
  // Embeddings Model - Visual connector for embeddings config (n8n-style)
  // Connects to Vector Memory, Vector Stores, AI Agent via "embeddings" handle
  // ──────────────────────────────────────────────────
  {
    type: "ai.embeddings",
    category: "ai",
    label: "Embeddings",
    description: "Configure embeddings model. Connect to Vector Memory or AI Agent.",
    icon: "Sparkles",
    defaultConfig: { provider: "openai", model: "text-embedding-3-small", dimension: 1536 },
    configSchema: [
      // Provider selection
      { name: "provider", label: "Embeddings Provider", type: "select", required: true, default: "openai", options: [
        { value: "openai", label: "OpenAI" },
        { value: "azure", label: "Azure OpenAI" },
        { value: "ollama", label: "Ollama (Local)" },
        { value: "cohere", label: "Cohere" },
        { value: "huggingface", label: "HuggingFace" },
        { value: "google", label: "Google (Vertex AI)" },
        { value: "aws", label: "AWS Bedrock" },
      ]},
      // OpenAI models
      { name: "model", label: "Model", type: "select", default: "text-embedding-3-small", visibleWhen: { field: "provider", value: "openai" }, options: [
        { value: "text-embedding-3-small", label: "text-embedding-3-small (1536d, fastest)" },
        { value: "text-embedding-3-large", label: "text-embedding-3-large (3072d, best quality)" },
        { value: "text-embedding-ada-002", label: "text-embedding-ada-002 (1536d, legacy)" },
      ]},
      { name: "api_key", label: "OpenAI API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "openai" }, placeholder: "${OPENAI_API_KEY}" },
      // Azure OpenAI
      { name: "model", label: "Deployment Name", type: "text", visibleWhen: { field: "provider", value: "azure" }, placeholder: "text-embedding-ada-002" },
      { name: "api_key", label: "Azure API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "azure" } },
      { name: "base_url", label: "Azure Endpoint", type: "text", visibleWhen: { field: "provider", value: "azure" }, placeholder: "https://your-resource.openai.azure.com" },
      { name: "api_version", label: "API Version", type: "text", default: "2024-02-01", visibleWhen: { field: "provider", value: "azure" } },
      // Ollama (Local)
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "ollama" }, options: [
        { value: "nomic-embed-text", label: "nomic-embed-text (768d, recommended)" },
        { value: "mxbai-embed-large", label: "mxbai-embed-large (1024d)" },
        { value: "all-minilm", label: "all-minilm (384d, fast)" },
        { value: "snowflake-arctic-embed", label: "snowflake-arctic-embed (1024d)" },
      ]},
      { name: "base_url", label: "Ollama URL", type: "text", default: "http://localhost:11434", visibleWhen: { field: "provider", value: "ollama" } },
      // Cohere
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "cohere" }, options: [
        { value: "embed-english-v3.0", label: "embed-english-v3.0 (1024d)" },
        { value: "embed-multilingual-v3.0", label: "embed-multilingual-v3.0 (1024d)" },
        { value: "embed-english-light-v3.0", label: "embed-english-light-v3.0 (384d, fast)" },
      ]},
      { name: "api_key", label: "Cohere API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "cohere" } },
      // HuggingFace
      { name: "model", label: "Model ID", type: "text", visibleWhen: { field: "provider", value: "huggingface" }, placeholder: "sentence-transformers/all-MiniLM-L6-v2" },
      { name: "api_key", label: "HuggingFace API Token", type: "text", secret: true, visibleWhen: { field: "provider", value: "huggingface" } },
      { name: "base_url", label: "Inference Endpoint (optional)", type: "text", visibleWhen: { field: "provider", value: "huggingface" }, placeholder: "https://api-inference.huggingface.co" },
      // Google Vertex AI
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "google" }, options: [
        { value: "textembedding-gecko@003", label: "textembedding-gecko@003 (768d)" },
        { value: "textembedding-gecko-multilingual@001", label: "textembedding-gecko-multilingual (768d)" },
        { value: "text-embedding-004", label: "text-embedding-004 (768d, latest)" },
      ]},
      { name: "api_key", label: "Google API Key / Service Account", type: "text", secret: true, visibleWhen: { field: "provider", value: "google" } },
      { name: "project_id", label: "Project ID", type: "text", visibleWhen: { field: "provider", value: "google" } },
      { name: "location", label: "Location", type: "text", default: "us-central1", visibleWhen: { field: "provider", value: "google" } },
      // AWS Bedrock
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "aws" }, options: [
        { value: "amazon.titan-embed-text-v1", label: "Titan Embed Text v1 (1536d)" },
        { value: "amazon.titan-embed-text-v2:0", label: "Titan Embed Text v2 (1024d)" },
        { value: "cohere.embed-english-v3", label: "Cohere Embed English v3 (1024d)" },
        { value: "cohere.embed-multilingual-v3", label: "Cohere Embed Multilingual v3 (1024d)" },
      ]},
      { name: "aws_access_key", label: "AWS Access Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "aws" } },
      { name: "aws_secret_key", label: "AWS Secret Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "aws" } },
      { name: "region", label: "AWS Region", type: "text", default: "us-east-1", visibleWhen: { field: "provider", value: "aws" } },
      // Advanced settings
      { name: "dimension", label: "Vector Dimension (auto-detected)", type: "number", default: 1536 },
      { name: "batch_size", label: "Batch Size", type: "number", default: 100 },
    ],
    outputSchema: [
      { name: "provider", type: "string", description: "Embeddings provider name" },
      { name: "model", type: "string", description: "Model being used" },
      { name: "dimension", type: "number", description: "Vector dimension" },
      { name: "ready", type: "boolean", description: "Embeddings configured and ready" },
    ],
  },

  // ──────────────────────────────────────────────────
  // LLM Model - Visual connector for LLM config (n8n-style)
  // Connects to AI Agent via "model" handle
  // ──────────────────────────────────────────────────
  {
    type: "ai.model",
    category: "ai",
    label: "AI Model",
    description: "Configure AI/LLM model. Connect to AI Agent.",
    icon: "Cpu",
    defaultConfig: { provider: "openai", model: "gpt-4o", temperature: 0.7 },
    configSchema: [
      // Provider selection
      { name: "provider", label: "LLM Provider", type: "select", required: true, default: "openai", options: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic (Claude)" },
        { value: "azure", label: "Azure AI Foundry" },
        { value: "ollama", label: "Ollama (Local)" },
        { value: "google", label: "Google (Gemini)" },
        { value: "aws", label: "AWS Bedrock" },
        { value: "groq", label: "Groq" },
        { value: "mistral", label: "Mistral AI" },
      ]},
      // OpenAI models
      { name: "model", label: "Model", type: "select", default: "gpt-4o", visibleWhen: { field: "provider", value: "openai" }, options: [
        { value: "gpt-4o", label: "GPT-4o (recommended)" },
        { value: "gpt-4o-mini", label: "GPT-4o Mini (fast & cheap)" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
        { value: "gpt-4", label: "GPT-4" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
        { value: "o1-preview", label: "o1-preview (reasoning)" },
        { value: "o1-mini", label: "o1-mini (reasoning, fast)" },
      ]},
      { name: "api_key", label: "OpenAI API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "openai" }, placeholder: "${OPENAI_API_KEY}" },
      // Anthropic models
      { name: "model", label: "Model", type: "select", default: "claude-3-5-sonnet-20241022", visibleWhen: { field: "provider", value: "anthropic" }, options: [
        { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (recommended)" },
        { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (fast)" },
        { value: "claude-3-opus-20240229", label: "Claude 3 Opus (most capable)" },
        { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
        { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
      ]},
      { name: "api_key", label: "Anthropic API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "anthropic" }, placeholder: "${ANTHROPIC_API_KEY}" },
      // Azure AI Foundry
      { name: "model", label: "Deployment Name", type: "text", visibleWhen: { field: "provider", value: "azure" }, placeholder: "gpt-4o" },
      { name: "api_key", label: "Azure API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "azure" } },
      { name: "base_url", label: "Azure Endpoint", type: "text", visibleWhen: { field: "provider", value: "azure" }, placeholder: "https://your-resource.services.ai.azure.com" },
      { name: "api_version", label: "API Version", type: "text", default: "2024-10-01-preview", visibleWhen: { field: "provider", value: "azure" } },
      // Ollama (Local)
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "ollama" }, options: [
        { value: "llama3.2", label: "Llama 3.2 (recommended)" },
        { value: "llama3.1", label: "Llama 3.1" },
        { value: "mistral", label: "Mistral 7B" },
        { value: "mixtral", label: "Mixtral 8x7B" },
        { value: "codellama", label: "Code Llama" },
        { value: "phi3", label: "Phi-3" },
        { value: "qwen2.5", label: "Qwen 2.5" },
      ]},
      { name: "base_url", label: "Ollama URL", type: "text", default: "http://localhost:11434", visibleWhen: { field: "provider", value: "ollama" } },
      // Google Gemini
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "google" }, options: [
        { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (fast)" },
        { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (experimental)" },
      ]},
      { name: "api_key", label: "Google API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "google" } },
      // AWS Bedrock
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "aws" }, options: [
        { value: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet v2" },
        { value: "anthropic.claude-3-5-haiku-20241022-v1:0", label: "Claude 3.5 Haiku" },
        { value: "amazon.titan-text-premier-v1:0", label: "Titan Text Premier" },
        { value: "meta.llama3-2-90b-instruct-v1:0", label: "Llama 3.2 90B" },
        { value: "mistral.mistral-large-2407-v1:0", label: "Mistral Large" },
      ]},
      { name: "aws_access_key", label: "AWS Access Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "aws" } },
      { name: "aws_secret_key", label: "AWS Secret Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "aws" } },
      { name: "region", label: "AWS Region", type: "text", default: "us-east-1", visibleWhen: { field: "provider", value: "aws" } },
      // Groq
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "groq" }, options: [
        { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
        { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
        { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
        { value: "gemma2-9b-it", label: "Gemma 2 9B" },
      ]},
      { name: "api_key", label: "Groq API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "groq" } },
      // Mistral AI
      { name: "model", label: "Model", type: "select", visibleWhen: { field: "provider", value: "mistral" }, options: [
        { value: "mistral-large-latest", label: "Mistral Large" },
        { value: "mistral-medium-latest", label: "Mistral Medium" },
        { value: "mistral-small-latest", label: "Mistral Small" },
        { value: "codestral-latest", label: "Codestral (code)" },
      ]},
      { name: "api_key", label: "Mistral API Key", type: "text", secret: true, visibleWhen: { field: "provider", value: "mistral" } },
      // Common settings
      { name: "temperature", label: "Temperature", type: "number", default: 0.7 },
      { name: "max_tokens", label: "Max Tokens (optional)", type: "number" },
    ],
    outputSchema: [
      { name: "provider", type: "string", description: "LLM provider name" },
      { name: "model", type: "string", description: "Model being used" },
      { name: "ready", type: "boolean", description: "Model configured and ready" },
    ],
  },

  // ============================================
  // PYTHON - Python Project Execution
  // ============================================
  {
    type: "python.execute",
    category: "python",
    label: "Execute Python",
    description: "Run Python code",
    icon: "Code2",
    defaultConfig: {},
    configSchema: [
      { name: "code", label: "Python Code", type: "textarea", required: true },
      { name: "variables", label: "Input Variables (JSON)", type: "textarea" },
    ],
  },
  {
    type: "python.project",
    category: "python",
    label: "Run Python Project",
    description: "Execute Python project",
    icon: "FolderCode",
    defaultConfig: {},
    configSchema: [
      { name: "project_path", label: "Project Path", type: "text", required: true },
      { name: "entrypoint", label: "Entrypoint", type: "text", required: true, placeholder: "main.py" },
      { name: "args", label: "Arguments", type: "text" },
    ],
  },
  {
    type: "python.pip_install",
    category: "python",
    label: "Pip Install",
    description: "Install Python packages",
    icon: "Package",
    defaultConfig: {},
    configSchema: [
      { name: "packages", label: "Packages", type: "text", required: true, placeholder: "pandas numpy" },
      { name: "requirements", label: "Requirements File", type: "text" },
    ],
  },
  {
    type: "python.virtualenv",
    category: "python",
    label: "Create Virtualenv",
    description: "Create Python environment",
    icon: "Box",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Environment Path", type: "text", required: true },
      { name: "python_version", label: "Python Version", type: "text", default: "3.10" },
    ],
  },
  {
    type: "python.function",
    category: "python",
    label: "Python Function",
    description: "Define reusable function",
    icon: "Braces",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Function Name", type: "text", required: true },
      { name: "code", label: "Function Code", type: "textarea", required: true },
      { name: "params", label: "Parameters", type: "text" },
    ],
  },
  {
    type: "python.import_module",
    category: "python",
    label: "Import Module",
    description: "Import Python module",
    icon: "Import",
    defaultConfig: {},
    configSchema: [
      { name: "module", label: "Module Name", type: "text", required: true },
      { name: "alias", label: "Alias", type: "text" },
    ],
  },
  {
    type: "python.notebook",
    category: "python",
    label: "Run Notebook",
    description: "Execute Jupyter notebook",
    icon: "BookOpen",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "Notebook Path", type: "text", required: true },
      { name: "output_path", label: "Output Path", type: "text" },
    ],
  },
  {
    type: "python.eval",
    category: "python",
    label: "Python Eval",
    description: "Evaluate expression",
    icon: "Calculator",
    defaultConfig: {},
    configSchema: [
      { name: "expression", label: "Expression", type: "text", required: true },
    ],
  },

  // ============================================
  // CONTROL - Control Flow
  // ============================================
  // === CONTAINER NODES (rendered as GroupNode) ===
  {
    type: "control.if",
    category: "control",
    label: "If Condition",
    description: "Container: branch based on condition. Drag nodes inside to execute when condition is true.",
    icon: "GitBranch",
    defaultConfig: {},
    configSchema: [
      { name: "condition", label: "Condition", type: "text", required: true, placeholder: "${count} > 10", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "result", type: "boolean", description: "Condition evaluation result" },
    ],
  },
  {
    type: "control.switch",
    category: "control",
    label: "Switch",
    description: "Multi-way branch",
    icon: "GitFork",
    defaultConfig: {},
    configSchema: [
      { name: "expression", label: "Expression", type: "text", required: true, supportsExpressions: true },
      { name: "cases", label: "Cases (JSON)", type: "textarea", required: true },
    ],
    outputSchema: [
      { name: "matched_case", type: "string", description: "Which case was matched" },
    ],
  },
  {
    type: "control.loop",
    category: "control",
    label: "For Each",
    description: "Container: iterate over a collection. Drag nodes inside to process each item. Use 'done' output to continue after loop completes.",
    icon: "Repeat",
    defaultConfig: { item_var: "item", accumulator_var: "results" },
    configSchema: [
      { name: "items", label: "Items Array", type: "text", required: true, placeholder: "${Query.records}", supportsExpressions: true },
      { name: "item_var", label: "Item Variable Name (access as ${item})", type: "text", default: "item", placeholder: "item" },
      { name: "accumulator_var", label: "Accumulator Variable (use control.append)", type: "text", default: "results", placeholder: "results" },
    ],
    outputSchema: [
      { name: "index", type: "number", description: "Current iteration index (0-based)" },
      { name: "total", type: "number", description: "Total number of items" },
      { name: "isFirst", type: "boolean", description: "True if first iteration" },
      { name: "isLast", type: "boolean", description: "True if last iteration" },
      { name: "results", type: "array", description: "Accumulated results array (available after loop completes)" },
      { name: "iterations", type: "number", description: "Total iterations completed" },
    ],
  },
  {
    type: "control.while",
    category: "control",
    label: "While Loop",
    description: "Container: loop while condition is true. Use 'done' output to continue after loop ends.",
    icon: "RefreshCw",
    defaultConfig: { max_iterations: 100, accumulator_var: "results" },
    configSchema: [
      { name: "condition", label: "Condition", type: "text", required: true, placeholder: "${hasMore} == true", supportsExpressions: true },
      { name: "max_iterations", label: "Max Iterations (safety limit)", type: "number", default: 100 },
      { name: "accumulator_var", label: "Accumulator Variable (use control.append)", type: "text", default: "results", placeholder: "results" },
    ],
    outputSchema: [
      { name: "iteration", type: "number", description: "Current iteration number (1-based)" },
      { name: "total_iterations", type: "number", description: "Total iterations executed" },
      { name: "results", type: "array", description: "Accumulated results array (available after loop completes)" },
      { name: "exit_reason", type: "string", description: "Why loop exited: 'condition_false' | 'max_iterations' | 'break'" },
    ],
  },
  {
    type: "control.wait",
    category: "control",
    label: "Wait",
    description: "Pause execution",
    icon: "Clock",
    defaultConfig: { seconds: 1 },
    configSchema: [
      { name: "seconds", label: "Seconds", type: "number", required: true, default: 1 },
    ],
  },
  {
    type: "control.set_variable",
    category: "control",
    label: "Set Variable",
    description: "Define or update a variable. Use 'global' scope to access outside loops.",
    icon: "Variable",
    defaultConfig: { scope: "global" },
    configSchema: [
      { name: "name", label: "Variable Name", type: "text", required: true, placeholder: "my_variable" },
      { name: "value", label: "Value", type: "textarea", required: true, placeholder: "${some_value} or literal", supportsExpressions: true },
      { name: "scope", label: "Scope", type: "select", default: "global", options: [
        { value: "global", label: "Global - Available everywhere" },
        { value: "local", label: "Local - Only in current container" },
      ]},
    ],
    outputSchema: [
      { name: "value", type: "any", description: "The value that was set" },
      { name: "name", type: "string", description: "The variable name" },
    ],
  },
  {
    type: "control.try_catch",
    category: "control",
    label: "Try/Catch",
    description: "Container: handle errors gracefully. Drag nodes inside to execute with error handling.",
    icon: "ShieldAlert",
    defaultConfig: { retry_count: 0 },
    configSchema: [
      { name: "retry_count", label: "Retry Count", type: "number", default: 0 },
      { name: "retry_delay", label: "Retry Delay (seconds)", type: "number", default: 1 },
    ],
    outputSchema: [
      { name: "success", type: "boolean", description: "True if executed without errors" },
      { name: "error_message", type: "string", description: "Error message if failed" },
      { name: "retry_attempts", type: "number", description: "Number of retry attempts made" },
    ],
  },
  {
    type: "control.parallel",
    category: "control",
    label: "Parallel",
    description: "Run branches in parallel",
    icon: "GitBranch",
    defaultConfig: {},
    configSchema: [
      { name: "branches", label: "Number of Branches", type: "number", default: 2 },
    ],
  },
  {
    type: "control.stop",
    category: "control",
    label: "Stop Bot",
    description: "Stop execution",
    icon: "StopCircle",
    defaultConfig: {},
    configSchema: [
      { name: "status", label: "Exit Status", type: "select", default: "success", options: [{ value: "success", label: "Success" }, { value: "error", label: "Error" }] },
    ],
  },
  {
    type: "control.goto",
    category: "control",
    label: "Go To",
    description: "Jump to node",
    icon: "CornerRightDown",
    defaultConfig: {},
    configSchema: [
      { name: "target_node", label: "Target Node ID", type: "text", required: true },
    ],
  },
  {
    type: "control.map",
    category: "control",
    label: "Map/Transform",
    description: "Transform each item in a collection using an expression",
    icon: "Shuffle",
    defaultConfig: {},
    configSchema: [
      { name: "items", label: "Input Array", type: "text", required: true, placeholder: "${Query.records}", supportsExpressions: true },
      { name: "expression", label: "Transform Expression", type: "textarea", required: true, placeholder: "{ id: ${item.id}, fullName: ${item.first} + ' ' + ${item.last} }", supportsExpressions: true },
      { name: "item_var", label: "Item Variable Name", type: "text", default: "item", placeholder: "item" },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Transformed array" },
      { name: "count", type: "number", description: "Number of items transformed" },
    ],
  },
  {
    type: "control.append",
    category: "control",
    label: "Append to List",
    description: "Add an item to the end of a list",
    icon: "ListPlus",
    defaultConfig: {},
    configSchema: [
      { name: "list", label: "Target List Variable", type: "text", required: true, placeholder: "results", supportsExpressions: false },
      { name: "item", label: "Item to Append", type: "textarea", required: true, placeholder: "${transformed_item}", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "length", type: "number", description: "New length of the list" },
      { name: "list", type: "array", description: "Updated list reference" },
    ],
  },
  {
    type: "control.filter",
    category: "control",
    label: "Filter List",
    description: "Filter items that match a condition",
    icon: "Filter",
    defaultConfig: {},
    configSchema: [
      { name: "items", label: "Input Array", type: "text", required: true, placeholder: "${Query.records}", supportsExpressions: true },
      { name: "condition", label: "Filter Condition", type: "text", required: true, placeholder: "${item.status} == 'active'", supportsExpressions: true },
      { name: "item_var", label: "Item Variable Name", type: "text", default: "item", placeholder: "item" },
    ],
    outputSchema: [
      { name: "results", type: "array", description: "Filtered array (matching items)" },
      { name: "rejected", type: "array", description: "Rejected array (non-matching items)" },
      { name: "count", type: "number", description: "Number of matching items" },
    ],
  },
  {
    type: "control.reduce",
    category: "control",
    label: "Reduce/Aggregate",
    description: "Reduce array to a single value (sum, count, etc.)",
    icon: "Combine",
    defaultConfig: { initial: "0" },
    configSchema: [
      { name: "items", label: "Input Array", type: "text", required: true, placeholder: "${Query.records}", supportsExpressions: true },
      { name: "expression", label: "Reducer Expression", type: "text", required: true, placeholder: "${acc} + ${item.amount}", supportsExpressions: true },
      { name: "initial", label: "Initial Value", type: "text", default: "0", placeholder: "0", supportsExpressions: true },
      { name: "item_var", label: "Item Variable Name", type: "text", default: "item", placeholder: "item" },
    ],
    outputSchema: [
      { name: "result", type: "any", description: "Final accumulated value" },
      { name: "count", type: "number", description: "Number of items processed" },
    ],
  },

  // ============================================
  // LOGGING - Logging & Monitoring
  // ============================================
  {
    type: "logging.log",
    category: "logging",
    label: "Log Message",
    description: "Write log message",
    icon: "FileText",
    defaultConfig: { level: "INFO" },
    configSchema: [
      { name: "message", label: "Message", type: "textarea", required: true },
      { name: "level", label: "Level", type: "select", default: "INFO", options: [{ value: "DEBUG", label: "DEBUG" }, { value: "INFO", label: "INFO" }, { value: "WARN", label: "WARN" }, { value: "ERROR", label: "ERROR" }] },
    ],
    outputSchema: [
      { name: "message", type: "string", description: "The logged message" },
      { name: "level", type: "string", description: "Log level used" },
      { name: "timestamp", type: "string", description: "Timestamp when logged" },
    ],
  },
  {
    type: "logging.screenshot",
    category: "logging",
    label: "Log Screenshot",
    description: "Capture screenshot to log",
    icon: "Camera",
    defaultConfig: {},
    configSchema: [
      { name: "description", label: "Description", type: "text" },
    ],
  },
  {
    type: "logging.metric",
    category: "logging",
    label: "Log Metric",
    description: "Record numeric metric",
    icon: "BarChart3",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Metric Name", type: "text", required: true },
      { name: "value", label: "Value", type: "number", required: true },
      { name: "unit", label: "Unit", type: "text" },
    ],
  },
  {
    type: "logging.timer_start",
    category: "logging",
    label: "Start Timer",
    description: "Start performance timer",
    icon: "Timer",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Timer Name", type: "text", required: true },
    ],
  },
  {
    type: "logging.timer_stop",
    category: "logging",
    label: "Stop Timer",
    description: "Stop and log timer",
    icon: "TimerOff",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Timer Name", type: "text", required: true },
    ],
  },
  {
    type: "logging.notification",
    category: "logging",
    label: "Send Notification",
    description: "Send alert notification",
    icon: "Bell",
    defaultConfig: { channel: "email" },
    configSchema: [
      { name: "channel", label: "Channel", type: "select", default: "email", options: [{ value: "email", label: "Email" }, { value: "slack", label: "Slack" }, { value: "teams", label: "Teams" }, { value: "webhook", label: "Webhook" }] },
      { name: "message", label: "Message", type: "textarea", required: true },
    ],
  },
  {
    type: "logging.audit",
    category: "logging",
    label: "Audit Log",
    description: "Create audit entry",
    icon: "ClipboardList",
    defaultConfig: {},
    configSchema: [
      { name: "action", label: "Action", type: "text", required: true },
      { name: "details", label: "Details (JSON)", type: "textarea" },
    ],
  },
  {
    type: "logging.export",
    category: "logging",
    label: "Export Logs",
    description: "Export run logs",
    icon: "FileDown",
    defaultConfig: { format: "json" },
    configSchema: [
      { name: "path", label: "Output Path", type: "text", required: true },
      { name: "format", label: "Format", type: "select", default: "json", options: [{ value: "json", label: "JSON" }, { value: "csv", label: "CSV" }, { value: "html", label: "HTML" }] },
    ],
  },

  // ============================================
  // SECURITY - Security & Secrets
  // ============================================
  {
    type: "security.get_secret",
    category: "security",
    label: "Get Secret",
    description: "Retrieve secret from vault",
    icon: "Key",
    defaultConfig: {},
    configSchema: [
      { name: "name", label: "Secret Name", type: "text", required: true },
      { name: "vault", label: "Vault", type: "select", default: "orchestrator", options: [{ value: "orchestrator", label: "Orchestrator" }, { value: "env", label: "Environment" }, { value: "azure", label: "Azure Key Vault" }, { value: "aws", label: "AWS Secrets" }] },
    ],
  },
  {
    type: "security.encrypt",
    category: "security",
    label: "Encrypt Data",
    description: "Encrypt sensitive data",
    icon: "Lock",
    defaultConfig: {},
    configSchema: [
      { name: "data", label: "Data", type: "textarea", required: true },
      { name: "key", label: "Encryption Key", type: "text", required: true },
    ],
  },
  {
    type: "security.decrypt",
    category: "security",
    label: "Decrypt Data",
    description: "Decrypt encrypted data",
    icon: "Unlock",
    defaultConfig: {},
    configSchema: [
      { name: "data", label: "Encrypted Data", type: "textarea", required: true },
      { name: "key", label: "Decryption Key", type: "text", required: true },
    ],
  },
  {
    type: "security.hash",
    category: "security",
    label: "Hash Data",
    description: "Create data hash",
    icon: "Hash",
    defaultConfig: { algorithm: "sha256" },
    configSchema: [
      { name: "data", label: "Data", type: "textarea", required: true },
      { name: "algorithm", label: "Algorithm", type: "select", default: "sha256", options: [{ value: "sha256", label: "SHA-256" }, { value: "sha512", label: "SHA-512" }, { value: "md5", label: "MD5" }] },
    ],
  },
  {
    type: "security.mask_data",
    category: "security",
    label: "Mask Data",
    description: "Mask sensitive data in logs",
    icon: "EyeOff",
    defaultConfig: {},
    configSchema: [
      { name: "pattern", label: "Pattern to Mask", type: "text", required: true },
      { name: "mask_char", label: "Mask Character", type: "text", default: "*" },
    ],
  },
  {
    type: "security.validate_cert",
    category: "security",
    label: "Validate Certificate",
    description: "Validate SSL certificate",
    icon: "ShieldCheck",
    defaultConfig: {},
    configSchema: [
      { name: "url", label: "URL", type: "text", required: true },
    ],
  },

  // --- Vault Providers (Enterprise Secrets Management) ---
  {
    type: "secrets.azure_keyvault",
    category: "security",
    label: "Azure Key Vault",
    description: "Connect to Azure Key Vault (credentials from BotRunner env)",
    icon: "KeyRound",
    defaultConfig: { use_managed_identity: false },
    configSchema: [
      { name: "vault_url", label: "Vault URL", type: "text", required: true, placeholder: "https://myvault.vault.azure.net", supportsExpressions: true },
      { name: "tenant_id", label: "Tenant ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { name: "client_id", label: "Client ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { name: "use_managed_identity", label: "Use Managed Identity", type: "boolean", default: false },
      { name: "secrets", label: "Secrets to Load", type: "textarea", placeholder: "db_password\napi_key\nconnection_string" },
    ],
    outputSchema: [
      { name: "loaded", type: "number", description: "Number of secrets loaded" },
      { name: "secretNames", type: "array", description: "Names of loaded secrets" },
    ],
  },
  {
    type: "secrets.aws_secrets",
    category: "security",
    label: "AWS Secrets Manager",
    description: "Connect to AWS Secrets Manager (credentials from BotRunner env or IAM Role)",
    icon: "KeyRound",
    defaultConfig: { region: "us-east-1", use_iam_role: true },
    configSchema: [
      { name: "region", label: "AWS Region", type: "select", default: "us-east-1", options: [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-east-2", label: "US East (Ohio)" },
        { value: "us-west-1", label: "US West (N. California)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "Europe (Ireland)" },
        { value: "eu-west-2", label: "Europe (London)" },
        { value: "eu-central-1", label: "Europe (Frankfurt)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
        { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
        { value: "sa-east-1", label: "South America (São Paulo)" },
      ]},
      { name: "use_iam_role", label: "Use IAM Role", type: "boolean", default: true },
      { name: "secrets", label: "Secrets to Load", type: "textarea", placeholder: "prod/db/password\nprod/api/key" },
    ],
    outputSchema: [
      { name: "loaded", type: "number", description: "Number of secrets loaded" },
      { name: "secretNames", type: "array", description: "Names of loaded secrets" },
    ],
  },
  {
    type: "secrets.hashicorp_vault",
    category: "security",
    label: "HashiCorp Vault",
    description: "Connect to HashiCorp Vault (credentials from BotRunner env)",
    icon: "KeyRound",
    defaultConfig: { auth_method: "token", mount_point: "secret" },
    configSchema: [
      { name: "vault_addr", label: "Vault Address", type: "text", required: true, placeholder: "https://vault.example.com:8200", supportsExpressions: true },
      { name: "auth_method", label: "Auth Method", type: "select", default: "token", options: [
        { value: "token", label: "Token (from VAULT_TOKEN env)" },
        { value: "approle", label: "AppRole (from VAULT_ROLE_ID + VAULT_SECRET_ID env)" },
      ]},
      { name: "mount_point", label: "Secrets Engine Mount", type: "text", default: "secret", placeholder: "secret" },
      { name: "secrets_path", label: "Secrets Path", type: "text", required: true, placeholder: "myapp/prod" },
      { name: "secrets", label: "Keys to Load (optional)", type: "textarea", placeholder: "db_password\napi_key" },
    ],
    outputSchema: [
      { name: "loaded", type: "number", description: "Number of secrets loaded" },
      { name: "secretNames", type: "array", description: "Names of loaded secrets" },
    ],
  },
  {
    type: "secrets.local_vault",
    category: "security",
    label: "Local Vault",
    description: "Unlock local encrypted vault on BotRunner (AES-256-GCM)",
    icon: "Lock",
    defaultConfig: { vault_path: ".skuldbot" },
    configSchema: [
      { name: "vault_path", label: "Vault Path", type: "text", default: ".skuldbot", placeholder: ".skuldbot or /etc/skuldbot/vault" },
      { name: "secrets", label: "Secrets to Load (optional)", type: "textarea", placeholder: "db_password\napi_key" },
    ],
    outputSchema: [
      { name: "unlocked", type: "boolean", description: "Vault unlock status" },
      { name: "secretCount", type: "number", description: "Number of secrets loaded" },
      { name: "secretNames", type: "array", description: "Names of loaded secrets" },
    ],
  },

  // ============================================
  // HUMAN - Human-in-the-loop
  // ============================================
  {
    type: "human.approval",
    category: "human",
    label: "Request Approval",
    description: "Wait for human approval",
    icon: "UserCheck",
    defaultConfig: { timeout_minutes: 60 },
    configSchema: [
      { name: "title", label: "Request Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "approvers", label: "Approvers (emails)", type: "text" },
      { name: "timeout_minutes", label: "Timeout (minutes)", type: "number", default: 60 },
    ],
  },
  {
    type: "human.input",
    category: "human",
    label: "Request Input",
    description: "Request user input",
    icon: "MessageSquare",
    defaultConfig: {},
    configSchema: [
      { name: "prompt", label: "Prompt", type: "textarea", required: true },
      { name: "input_type", label: "Input Type", type: "select", default: "text", options: [{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "choice", label: "Choice" }, { value: "file", label: "File" }] },
      { name: "options", label: "Options (if Choice)", type: "text" },
    ],
  },
  {
    type: "human.review",
    category: "human",
    label: "Data Review",
    description: "Present data for review",
    icon: "ClipboardCheck",
    defaultConfig: {},
    configSchema: [
      { name: "title", label: "Review Title", type: "text", required: true },
      { name: "data", label: "Data to Review", type: "textarea", required: true },
      { name: "actions", label: "Available Actions", type: "text", default: "approve,reject,edit" },
    ],
  },
  {
    type: "human.exception",
    category: "human",
    label: "Handle Exception",
    description: "Human handles exception",
    icon: "AlertTriangle",
    defaultConfig: {},
    configSchema: [
      { name: "error", label: "Error Details", type: "textarea", required: true },
      { name: "options", label: "Resolution Options", type: "text", default: "retry,skip,abort" },
    ],
  },
  {
    type: "human.notification",
    category: "human",
    label: "Notify User",
    description: "Send notification to user",
    icon: "Bell",
    defaultConfig: {},
    configSchema: [
      { name: "recipient", label: "Recipient", type: "text", required: true },
      { name: "message", label: "Message", type: "textarea", required: true },
      { name: "priority", label: "Priority", type: "select", default: "normal", options: [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }] },
    ],
  },

  // ============================================
  // COMPLIANCE - PII/PHI Protection & HIPAA Safe Harbor
  // ============================================

  // --- UNIFIED PROTECTION NODES (Visual Builder) ---
  {
    type: "compliance.protect_pii",
    category: "compliance",
    label: "Protect PII",
    description: "Configure field-by-field PII protection with visual builder",
    icon: "ShieldCheck",
    defaultConfig: { rules: [] },
    configSchema: [
      { name: "data", label: "Data to Process", type: "textarea", required: true, supportsExpressions: true, placeholder: "${previous_node.records}" },
      { name: "rules", label: "Protection Rules", type: "protection-builder" },
    ],
    outputSchema: [
      { name: "protected_data", type: "object", description: "Data with protected PII fields" },
      { name: "fields_processed", type: "number", description: "Number of fields processed" },
      { name: "audit_log", type: "array", description: "Audit log of all protection operations" },
    ],
  },
  {
    type: "compliance.protect_phi",
    category: "compliance",
    label: "Protect PHI (HIPAA)",
    description: "Configure field-by-field PHI protection for HIPAA compliance",
    icon: "HeartPulse",
    defaultConfig: { rules: [], strict_hipaa: true },
    configSchema: [
      { name: "data", label: "Data to Process", type: "textarea", required: true, supportsExpressions: true, placeholder: "${previous_node.records}" },
      { name: "rules", label: "Protection Rules", type: "protection-builder" },
      { name: "strict_hipaa", label: "Strict HIPAA Mode", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "protected_data", type: "object", description: "Data with protected PHI fields" },
      { name: "hipaa_compliant", type: "boolean", description: "Whether result is HIPAA compliant" },
      { name: "fields_processed", type: "number", description: "Number of fields processed" },
      { name: "hipaa_identifiers_protected", type: "array", description: "List of HIPAA 18 identifiers that were protected" },
      { name: "audit_log", type: "array", description: "Audit log of all protection operations" },
    ],
  },

  // --- AUDIT NODE ---
  {
    type: "compliance.audit_log",
    category: "compliance",
    label: "Compliance Audit Log",
    description: "Create compliance audit log entry (cannot be disabled)",
    icon: "FileText",
    defaultConfig: { data_type: "PHI" },
    configSchema: [
      { name: "action", label: "Action", type: "select", required: true, options: [
        { value: "access", label: "Access" },
        { value: "modify", label: "Modify" },
        { value: "delete", label: "Delete" },
        { value: "export", label: "Export" },
        { value: "share", label: "Share" },
      ]},
      { name: "data_type", label: "Data Type", type: "select", default: "PHI", options: [
        { value: "PHI", label: "PHI (Protected Health Info)" },
        { value: "PII", label: "PII (Personal Info)" },
      ]},
      { name: "user", label: "User", type: "text", default: "${CURRENT_USER}", supportsExpressions: true },
      { name: "details", label: "Details", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "audit_entry", type: "object", description: "Created audit log entry" },
      { name: "timestamp", type: "string", description: "Entry timestamp" },
    ],
  },

  // ============================================
  // DATA QUALITY - Validation powered by Great Expectations
  // ============================================

  // --- UNIFIED VALIDATION NODE (Visual Builder) ---
  {
    type: "dataquality.validate",
    category: "dataquality",
    label: "Validate Data",
    description: "Configure field-by-field data validation rules with visual builder",
    icon: "ShieldCheck",
    defaultConfig: { rules: [], fail_on_error: true },
    configSchema: [
      { name: "data", label: "Data to Validate", type: "textarea", required: true, supportsExpressions: true, placeholder: "${previous_node.records}" },
      { name: "rules", label: "Validation Rules", type: "validation-builder" },
      { name: "fail_on_error", label: "Fail on Validation Error", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "valid", type: "boolean", description: "Whether all validations passed" },
      { name: "validated_data", type: "object", description: "The validated data" },
      { name: "errors", type: "array", description: "List of validation errors" },
      { name: "error_count", type: "number", description: "Number of validation errors" },
      { name: "rules_passed", type: "number", description: "Number of rules that passed" },
      { name: "rules_failed", type: "number", description: "Number of rules that failed" },
    ],
  },

  // --- UTILITY NODES ---
  {
    type: "dataquality.profile_data",
    category: "dataquality",
    label: "Profile Data",
    description: "Generate automatic data profile with statistics",
    icon: "BarChart3",
    defaultConfig: {},
    configSchema: [
      { name: "data", label: "Data", type: "textarea", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "row_count", type: "number", description: "Total number of rows" },
      { name: "column_count", type: "number", description: "Total number of columns" },
      { name: "columns", type: "object", description: "Column-by-column statistics (nulls, types, unique values)" },
    ],
  },
  {
    type: "dataquality.generate_report",
    category: "dataquality",
    label: "Generate Quality Report",
    description: "Generate comprehensive data quality report",
    icon: "FileBarChart",
    defaultConfig: {},
    configSchema: [
      { name: "data", label: "Data", type: "textarea", required: true, supportsExpressions: true },
      { name: "data_source", label: "Data Source Name", type: "text", default: "unknown", placeholder: "Customer Database" },
    ],
    outputSchema: [
      { name: "timestamp", type: "string", description: "Report generation timestamp" },
      { name: "data_source", type: "string", description: "Name of data source" },
      { name: "total_rows", type: "number", description: "Total rows analyzed" },
      { name: "validations_run", type: "number", description: "Total validations executed" },
      { name: "success_rate", type: "number", description: "Overall validation success rate" },
      { name: "profile", type: "object", description: "Data profile" },
      { name: "validation_results", type: "array", description: "All validation results" },
      { name: "summary", type: "object", description: "Quality summary with recommendations" },
    ],
  },
  // ============================================
  // DATA - Data Integration (Taps & Targets)
  // ============================================

  // --- DATABASE TAPS (Extractors) ---
  {
    type: "data.tap.sqlserver",
    category: "data",
    label: "Extract SQL Server",
    description: "Extract data from Microsoft SQL Server",
    icon: "Database",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost or ${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 1433 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM customers WHERE active = 1" },
      { name: "table", label: "Table (if no query)", type: "text", placeholder: "customers" },
      { name: "columns", label: "Columns (comma-separated)", type: "text", placeholder: "id, name, email" },
      { name: "filter", label: "WHERE Filter", type: "text", placeholder: "status = 'active'" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory (< 50K rows)" },
        { value: "batch", label: "Batch (large datasets)" },
        { value: "stream", label: "Stream (direct pipe)" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.oracle",
    category: "data",
    label: "Extract Oracle",
    description: "Extract data from Oracle Database",
    icon: "Database",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 1521 },
      { name: "database", label: "Service Name", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM customers WHERE ROWNUM <= 1000" },
      { name: "table", label: "Table (if no query)", type: "text" },
      { name: "columns", label: "Columns", type: "text" },
      { name: "filter", label: "WHERE Filter", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory" },
        { value: "batch", label: "Batch" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.postgres",
    category: "data",
    label: "Extract PostgreSQL",
    description: "Extract data from PostgreSQL",
    icon: "Database",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 5432 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM users LIMIT 1000" },
      { name: "table", label: "Table (if no query)", type: "text" },
      { name: "columns", label: "Columns", type: "text" },
      { name: "filter", label: "WHERE Filter", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory" },
        { value: "batch", label: "Batch" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.mysql",
    category: "data",
    label: "Extract MySQL",
    description: "Extract data from MySQL/MariaDB",
    icon: "Database",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 3306 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea" },
      { name: "table", label: "Table (if no query)", type: "text" },
      { name: "columns", label: "Columns", type: "text" },
      { name: "filter", label: "WHERE Filter", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory" },
        { value: "batch", label: "Batch" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.db2",
    category: "data",
    label: "Extract DB2",
    description: "Extract data from IBM DB2",
    icon: "Database",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 50000 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea" },
      { name: "table", label: "Table (if no query)", type: "text" },
      { name: "columns", label: "Columns", type: "text" },
      { name: "filter", label: "WHERE Filter", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory" },
        { value: "batch", label: "Batch" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.snowflake",
    category: "data",
    label: "Extract Snowflake",
    description: "Extract data from Snowflake",
    icon: "Snowflake",
    defaultConfig: { mode: "memory", batch_size: 10000 },
    configSchema: [
      { name: "account", label: "Account Identifier", type: "text", required: true, placeholder: "${vault.sf_account}", supportsExpressions: true },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "schema", label: "Schema", type: "text", default: "PUBLIC", supportsExpressions: true },
      { name: "warehouse", label: "Warehouse", type: "text", supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.sf_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.sf_password}", supportsExpressions: true },
      { name: "query", label: "SQL Query", type: "textarea" },
      { name: "table", label: "Table (if no query)", type: "text" },
      { name: "columns", label: "Columns", type: "text" },
      { name: "filter", label: "WHERE Filter", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
      { name: "mode", label: "Mode", type: "select", default: "memory", options: [
        { value: "memory", label: "Memory" },
        { value: "batch", label: "Batch" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 10000 },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },

  // --- FILE TAPS ---
  {
    type: "data.tap.csv",
    category: "data",
    label: "Read CSV",
    description: "Extract data from CSV file",
    icon: "FileSpreadsheet",
    defaultConfig: { delimiter: ",", encoding: "utf-8", header: true },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true, supportsExpressions: true },
      { name: "delimiter", label: "Delimiter", type: "text", default: "," },
      { name: "encoding", label: "Encoding", type: "select", default: "utf-8", options: [
        { value: "utf-8", label: "UTF-8" },
        { value: "latin-1", label: "Latin-1" },
        { value: "cp1252", label: "Windows-1252" },
      ]},
      { name: "header", label: "Has Header Row", type: "boolean", default: true },
      { name: "columns", label: "Column Names (if no header)", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.excel",
    category: "data",
    label: "Read Excel (Data)",
    description: "Extract data from Excel file for data integration",
    icon: "FileSpreadsheet",
    defaultConfig: { header: true },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true, supportsExpressions: true },
      { name: "sheet", label: "Sheet Name", type: "text" },
      { name: "header", label: "Has Header Row", type: "boolean", default: true },
      { name: "columns", label: "Column Names (if no header)", type: "text" },
      { name: "limit", label: "Row Limit", type: "number" },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },

  // --- CLOUD/TRANSFER TAPS ---
  {
    type: "data.tap.s3",
    category: "data",
    label: "Read from S3",
    description: "Extract data from AWS S3",
    icon: "Cloud",
    defaultConfig: { file_type: "csv", region: "us-east-1" },
    configSchema: [
      { name: "bucket", label: "Bucket Name", type: "text", required: true },
      { name: "key", label: "Object Key (path)", type: "text", required: true, placeholder: "data/customers.csv" },
      { name: "aws_access_key", label: "AWS Access Key", type: "text", required: true, supportsExpressions: true },
      { name: "aws_secret_key", label: "AWS Secret Key", type: "password", required: true, supportsExpressions: true },
      { name: "region", label: "Region", type: "text", default: "us-east-1" },
      { name: "file_type", label: "File Type", type: "select", default: "csv", options: [
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
      ]},
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.sftp",
    category: "data",
    label: "Read from SFTP",
    description: "Extract data from SFTP server",
    icon: "Server",
    defaultConfig: { file_type: "csv", port: 22 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true },
      { name: "port", label: "Port", type: "number", default: 22 },
      { name: "path", label: "File Path", type: "text", required: true, placeholder: "/data/file.csv" },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", supportsExpressions: true },
      { name: "private_key", label: "Private Key Path", type: "text" },
      { name: "file_type", label: "File Type", type: "select", default: "csv", options: [
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
      ]},
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Extracted records" },
      { name: "columns", type: "array", description: "Column names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },

  // --- SAAS TAPS ---
  {
    type: "data.tap.salesforce",
    category: "data",
    label: "Extract Salesforce",
    description: "Extract data from Salesforce using SOQL",
    icon: "Cloud",
    defaultConfig: { domain: "login" },
    configSchema: [
      { name: "username", label: "Username", type: "text", required: true, placeholder: "user@company.com" },
      { name: "password", label: "Password", type: "password", required: true, supportsExpressions: true },
      { name: "security_token", label: "Security Token", type: "password", required: true, supportsExpressions: true },
      { name: "query", label: "SOQL Query", type: "textarea", required: true, placeholder: "SELECT Id, Name, Email FROM Contact WHERE CreatedDate > LAST_MONTH" },
      { name: "domain", label: "Domain", type: "select", default: "login", options: [
        { value: "login", label: "Production (login)" },
        { value: "test", label: "Sandbox (test)" },
      ]},
    ],
    outputSchema: [
      { name: "records", type: "array", description: "Salesforce records" },
      { name: "columns", type: "array", description: "Field names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },
  {
    type: "data.tap.rest_api",
    category: "data",
    label: "Extract REST API",
    description: "Extract data from any REST API with pagination support",
    icon: "Globe",
    defaultConfig: { method: "GET" },
    configSchema: [
      { name: "url", label: "API URL", type: "text", required: true, supportsExpressions: true },
      { name: "method", label: "HTTP Method", type: "select", default: "GET", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ]},
      { name: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ${token}"}' },
      { name: "body", label: "Request Body (JSON)", type: "textarea" },
      { name: "auth_type", label: "Auth Type", type: "select", options: [
        { value: "", label: "None" },
        { value: "bearer", label: "Bearer Token" },
        { value: "api_key", label: "API Key" },
      ]},
      { name: "auth_value", label: "Auth Value", type: "password", supportsExpressions: true },
      { name: "pagination_type", label: "Pagination", type: "select", options: [
        { value: "", label: "None" },
        { value: "offset", label: "Offset" },
        { value: "page", label: "Page Number" },
        { value: "cursor", label: "Cursor" },
      ]},
      { name: "pagination_param", label: "Pagination Param", type: "text", placeholder: "offset or page or cursor" },
      { name: "data_path", label: "Data Path (JSONPath)", type: "text", placeholder: "$.data or $.results" },
      { name: "limit", label: "Max Records", type: "number" },
    ],
    outputSchema: [
      { name: "records", type: "array", description: "API response records" },
      { name: "columns", type: "array", description: "Field names" },
      { name: "recordCount", type: "number", description: "Number of records" },
    ],
  },

  // --- DATABASE TARGETS (Loaders) ---
  {
    type: "data.target.sqlserver",
    category: "data",
    label: "Load to SQL Server",
    description: "Load data into Microsoft SQL Server",
    icon: "DatabaseBackup",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 1433 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true, placeholder: "${Extract SQL Server.records}" },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
        { value: "upsert", label: "Upsert" },
        { value: "replace", label: "Replace" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "updatedCount", type: "number", description: "Records updated" },
      { name: "errorCount", type: "number", description: "Errors" },
      { name: "errors", type: "array", description: "Error details" },
    ],
  },
  {
    type: "data.target.oracle",
    category: "data",
    label: "Load to Oracle",
    description: "Load data into Oracle Database",
    icon: "DatabaseBackup",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 1521 },
      { name: "database", label: "Service Name", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
        { value: "upsert", label: "Upsert" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "updatedCount", type: "number", description: "Records updated" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },
  {
    type: "data.target.postgres",
    category: "data",
    label: "Load to PostgreSQL",
    description: "Load data into PostgreSQL",
    icon: "DatabaseBackup",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 5432 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
        { value: "upsert", label: "Upsert" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "updatedCount", type: "number", description: "Records updated" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },
  {
    type: "data.target.mysql",
    category: "data",
    label: "Load to MySQL",
    description: "Load data into MySQL/MariaDB",
    icon: "DatabaseBackup",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 3306 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
        { value: "upsert", label: "Upsert" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "updatedCount", type: "number", description: "Records updated" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },
  {
    type: "data.target.db2",
    category: "data",
    label: "Load to DB2",
    description: "Load data into IBM DB2",
    icon: "DatabaseBackup",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "${vault.db_host}", supportsExpressions: true },
      { name: "port", label: "Port", type: "number", default: 50000 },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.db_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.db_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },
  {
    type: "data.target.snowflake",
    category: "data",
    label: "Load to Snowflake",
    description: "Load data into Snowflake",
    icon: "Snowflake",
    defaultConfig: { mode: "insert", batch_size: 5000 },
    configSchema: [
      { name: "account", label: "Account Identifier", type: "text", required: true, placeholder: "${vault.sf_account}", supportsExpressions: true },
      { name: "database", label: "Database", type: "text", required: true, supportsExpressions: true },
      { name: "schema", label: "Schema", type: "text", default: "PUBLIC", supportsExpressions: true },
      { name: "warehouse", label: "Warehouse", type: "text", supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "${vault.sf_user}", supportsExpressions: true },
      { name: "password", label: "Password", type: "password", required: true, placeholder: "${vault.sf_password}", supportsExpressions: true },
      { name: "table", label: "Target Table", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "insert", options: [
        { value: "insert", label: "Insert" },
        { value: "upsert", label: "Upsert" },
      ]},
      { name: "batch_size", label: "Batch Size", type: "number", default: 5000 },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "updatedCount", type: "number", description: "Records updated" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },
  {
    type: "data.target.bigquery",
    category: "data",
    label: "Load to BigQuery",
    description: "Load data into Google BigQuery",
    icon: "Cloud",
    defaultConfig: { mode: "append" },
    configSchema: [
      { name: "project", label: "GCP Project ID", type: "text", required: true },
      { name: "dataset", label: "Dataset", type: "text", required: true },
      { name: "table", label: "Table", type: "text", required: true },
      { name: "credentials_json", label: "Credentials JSON Path", type: "text", required: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "mode", label: "Mode", type: "select", default: "append", options: [
        { value: "append", label: "Append" },
        { value: "truncate", label: "Truncate & Load" },
      ]},
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records inserted" },
      { name: "errorCount", type: "number", description: "Errors" },
    ],
  },

  // --- FILE TARGETS ---
  {
    type: "data.target.csv",
    category: "data",
    label: "Write CSV",
    description: "Write data to CSV file",
    icon: "FileSpreadsheet",
    defaultConfig: { delimiter: ",", encoding: "utf-8" },
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true, supportsExpressions: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "delimiter", label: "Delimiter", type: "text", default: "," },
      { name: "encoding", label: "Encoding", type: "select", default: "utf-8", options: [
        { value: "utf-8", label: "UTF-8" },
        { value: "latin-1", label: "Latin-1" },
        { value: "cp1252", label: "Windows-1252" },
      ]},
      { name: "append", label: "Append to Existing", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records written" },
    ],
  },
  {
    type: "data.target.excel",
    category: "data",
    label: "Write Excel (Data)",
    description: "Write data to Excel file",
    icon: "FileSpreadsheet",
    defaultConfig: {},
    configSchema: [
      { name: "path", label: "File Path", type: "text", required: true, supportsExpressions: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "sheet", label: "Sheet Name", type: "text", default: "Sheet1" },
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records written" },
    ],
  },

  // --- CLOUD TARGETS ---
  {
    type: "data.target.s3",
    category: "data",
    label: "Write to S3",
    description: "Upload data to AWS S3",
    icon: "CloudUpload",
    defaultConfig: { file_type: "csv", region: "us-east-1" },
    configSchema: [
      { name: "bucket", label: "Bucket Name", type: "text", required: true },
      { name: "key", label: "Object Key (path)", type: "text", required: true, supportsExpressions: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "aws_access_key", label: "AWS Access Key", type: "text", required: true, supportsExpressions: true },
      { name: "aws_secret_key", label: "AWS Secret Key", type: "password", required: true, supportsExpressions: true },
      { name: "region", label: "Region", type: "text", default: "us-east-1" },
      { name: "file_type", label: "File Type", type: "select", default: "csv", options: [
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
      ]},
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records uploaded" },
    ],
  },
  {
    type: "data.target.sftp",
    category: "data",
    label: "Write to SFTP",
    description: "Upload data to SFTP server",
    icon: "ServerCog",
    defaultConfig: { file_type: "csv", port: 22 },
    configSchema: [
      { name: "host", label: "Host", type: "text", required: true },
      { name: "port", label: "Port", type: "number", default: 22 },
      { name: "path", label: "Target Path", type: "text", required: true, supportsExpressions: true },
      { name: "records", label: "Records", type: "text", required: true, supportsExpressions: true },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", supportsExpressions: true },
      { name: "private_key", label: "Private Key Path", type: "text" },
      { name: "file_type", label: "File Type", type: "select", default: "csv", options: [
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
      ]},
    ],
    outputSchema: [
      { name: "insertedCount", type: "number", description: "Records uploaded" },
    ],
  },

  // ============================================
  // VOICE - Telephony & Speech (SkuldVoice)
  // ============================================

  // --- VOICE TRIGGER ---
  {
    type: "trigger.voice_inbound",
    category: "trigger",
    label: "Voice Inbound",
    description: "Trigger when phone call is received (Twilio)",
    icon: "PhoneIncoming",
    defaultConfig: {},
    configSchema: [
      { name: "account_sid", label: "Twilio Account SID", type: "text", required: true, placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { name: "auth_token", label: "Twilio Auth Token", type: "password", required: true, placeholder: "Your Twilio Auth Token" },
      { name: "phone_number", label: "Twilio Phone Number", type: "text", required: true, placeholder: "+1234567890" },
      { name: "webhook_path", label: "Webhook Path", type: "text", placeholder: "/voice/inbound", default: "/voice/inbound" },
      { name: "greeting", label: "Greeting Message", type: "textarea", placeholder: "Thank you for calling. How can I help you today?" },
    ],
    outputSchema: [
      { name: "call_sid", type: "string", description: "Twilio Call SID" },
      { name: "from_number", type: "string", description: "Caller phone number" },
      { name: "to_number", type: "string", description: "Called number" },
      { name: "direction", type: "string", description: "Call direction (inbound)" },
    ],
  },

  // --- VOICE ACTIONS ---
  {
    type: "voice.call",
    category: "voice",
    label: "Make Call",
    description: "Make an outbound voice call",
    icon: "PhoneOutgoing",
    defaultConfig: { record: true, timeout: 30 },
    configSchema: [
      { name: "account_sid", label: "Twilio Account SID", type: "text", required: true, placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { name: "auth_token", label: "Twilio Auth Token", type: "password", required: true, placeholder: "Your Twilio Auth Token" },
      { name: "from_number", label: "From Number (Twilio)", type: "text", required: true, placeholder: "+1234567890" },
      { name: "to_number", label: "To Number", type: "text", required: true, placeholder: "+1234567890", supportsExpressions: true },
      { name: "twiml_url", label: "TwiML URL", type: "text", placeholder: "https://your-app.com/voice/script" },
      { name: "twiml", label: "TwiML (inline)", type: "textarea", placeholder: "<Response><Say>Hello!</Say></Response>" },
      { name: "record", label: "Record Call", type: "boolean", default: true },
      { name: "timeout", label: "Timeout (seconds)", type: "number", default: 30 },
    ],
    outputSchema: [
      { name: "call_sid", type: "string", description: "Twilio Call SID" },
      { name: "status", type: "string", description: "Call status" },
    ],
  },
  {
    type: "voice.speak",
    category: "voice",
    label: "Text to Speech",
    description: "Convert text to speech audio (Azure TTS)",
    icon: "Volume2",
    defaultConfig: { voice: "en-US-JennyNeural", region: "eastus" },
    configSchema: [
      { name: "azure_speech_key", label: "Azure Speech Key", type: "password", required: true, placeholder: "Your Azure Speech Services Key" },
      { name: "azure_region", label: "Azure Region", type: "text", default: "eastus", placeholder: "eastus" },
      { name: "text", label: "Text to Speak", type: "textarea", required: true, supportsExpressions: true },
      { name: "output_path", label: "Output File Path", type: "text", placeholder: "/tmp/speech.wav" },
      { name: "voice", label: "Voice", type: "select", default: "en-US-JennyNeural", options: [
        { value: "en-US-JennyNeural", label: "Jenny (US English)" },
        { value: "en-US-GuyNeural", label: "Guy (US English)" },
        { value: "en-GB-SoniaNeural", label: "Sonia (UK English)" },
        { value: "es-ES-ElviraNeural", label: "Elvira (Spanish)" },
        { value: "es-MX-DaliaNeural", label: "Dalia (Mexican Spanish)" },
      ]},
      { name: "style", label: "Voice Style", type: "select", options: [
        { value: "customerservice", label: "Customer Service" },
        { value: "cheerful", label: "Cheerful" },
        { value: "empathetic", label: "Empathetic" },
        { value: "calm", label: "Calm" },
      ]},
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Synthesis status" },
      { name: "output_path", type: "string", description: "Path to audio file" },
      { name: "audio_data", type: "string", description: "Base64 encoded audio (if no output_path)" },
    ],
  },
  {
    type: "voice.listen",
    category: "voice",
    label: "Speech to Text",
    description: "Transcribe audio to text (Azure STT)",
    icon: "Mic",
    defaultConfig: { language: "en-US", region: "eastus" },
    configSchema: [
      { name: "azure_speech_key", label: "Azure Speech Key", type: "password", required: true, placeholder: "Your Azure Speech Services Key" },
      { name: "azure_region", label: "Azure Region", type: "text", default: "eastus", placeholder: "eastus" },
      { name: "audio_path", label: "Audio File Path", type: "text", required: true, supportsExpressions: true },
      { name: "language", label: "Language", type: "select", default: "en-US", options: [
        { value: "en-US", label: "English (US)" },
        { value: "en-GB", label: "English (UK)" },
        { value: "es-ES", label: "Spanish (Spain)" },
        { value: "es-MX", label: "Spanish (Mexico)" },
        { value: "fr-FR", label: "French" },
        { value: "de-DE", label: "German" },
        { value: "pt-BR", label: "Portuguese (Brazil)" },
      ]},
    ],
    outputSchema: [
      { name: "text", type: "string", description: "Transcribed text" },
      { name: "confidence", type: "number", description: "Recognition confidence (0-1)" },
      { name: "status", type: "string", description: "Recognition status" },
    ],
  },
  {
    type: "voice.twiml_say",
    category: "voice",
    label: "TwiML Say",
    description: "Generate TwiML to speak text in call",
    icon: "MessageSquare",
    defaultConfig: { voice: "Polly.Joanna", language: "en-US" },
    configSchema: [
      { name: "text", label: "Text to Say", type: "textarea", required: true, supportsExpressions: true },
      { name: "voice", label: "Twilio Voice", type: "select", default: "Polly.Joanna", options: [
        { value: "Polly.Joanna", label: "Joanna (US Female)" },
        { value: "Polly.Matthew", label: "Matthew (US Male)" },
        { value: "Polly.Amy", label: "Amy (UK Female)" },
        { value: "Polly.Brian", label: "Brian (UK Male)" },
        { value: "Polly.Conchita", label: "Conchita (Spanish Female)" },
      ]},
      { name: "language", label: "Language", type: "text", default: "en-US" },
    ],
    outputSchema: [
      { name: "twiml", type: "string", description: "Generated TwiML" },
    ],
  },
  {
    type: "voice.twiml_gather",
    category: "voice",
    label: "TwiML Gather",
    description: "Gather user input (voice or DTMF)",
    icon: "CircleDot",
    defaultConfig: { input_type: "speech dtmf", timeout: 5 },
    configSchema: [
      { name: "prompt_text", label: "Prompt Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "action_url", label: "Action URL", type: "text", required: true, placeholder: "https://your-app.com/process-input" },
      { name: "input_type", label: "Input Type", type: "select", default: "speech dtmf", options: [
        { value: "speech", label: "Speech Only" },
        { value: "dtmf", label: "DTMF Only" },
        { value: "speech dtmf", label: "Speech & DTMF" },
      ]},
      { name: "timeout", label: "Timeout (seconds)", type: "number", default: 5 },
      { name: "speech_timeout", label: "Speech Timeout", type: "text", default: "auto" },
    ],
    outputSchema: [
      { name: "twiml", type: "string", description: "Generated TwiML" },
    ],
  },
  {
    type: "voice.transfer",
    category: "voice",
    label: "Transfer Call",
    description: "Transfer call to another number or agent",
    icon: "PhoneForwarded",
    defaultConfig: {},
    configSchema: [
      { name: "transfer_to", label: "Transfer To", type: "text", required: true, placeholder: "+1987654321", supportsExpressions: true },
      { name: "call_sid", label: "Call SID", type: "text", supportsExpressions: true, placeholder: "Leave empty for current call" },
      { name: "announce_message", label: "Announce Message", type: "textarea", placeholder: "Please hold while I transfer your call..." },
    ],
    outputSchema: [
      { name: "call_sid", type: "string", description: "Original call SID" },
      { name: "transferred_to", type: "string", description: "Destination number" },
      { name: "status", type: "string", description: "Transfer status" },
    ],
  },
  {
    type: "voice.hangup",
    category: "voice",
    label: "End Call",
    description: "End the current voice call",
    icon: "PhoneOff",
    defaultConfig: {},
    configSchema: [
      { name: "call_sid", label: "Call SID", type: "text", supportsExpressions: true, placeholder: "Leave empty for current call" },
      { name: "farewell_message", label: "Farewell Message", type: "textarea", placeholder: "Thank you for calling. Goodbye!" },
    ],
    outputSchema: [
      { name: "call_sid", type: "string", description: "Call SID" },
      { name: "status", type: "string", description: "Final status" },
      { name: "conversation_turns", type: "number", description: "Total conversation turns" },
    ],
  },
  {
    type: "voice.get_recording",
    category: "voice",
    label: "Get Recording",
    description: "Get call recording URL",
    icon: "CircleDot",
    defaultConfig: {},
    configSchema: [
      { name: "call_sid", label: "Call SID", type: "text", supportsExpressions: true, placeholder: "Leave empty for current call" },
    ],
    outputSchema: [
      { name: "recording_sid", type: "string", description: "Recording SID" },
      { name: "url", type: "string", description: "Recording URL (MP3)" },
      { name: "duration", type: "number", description: "Recording duration in seconds" },
    ],
  },
  {
    type: "voice.add_turn",
    category: "voice",
    label: "Add Conversation Turn",
    description: "Add a turn to conversation history",
    icon: "MessageSquarePlus",
    defaultConfig: { confidence: 1.0 },
    configSchema: [
      { name: "role", label: "Role", type: "select", required: true, options: [
        { value: "caller", label: "Caller" },
        { value: "agent", label: "Agent" },
        { value: "system", label: "System" },
      ]},
      { name: "text", label: "Text", type: "textarea", required: true, supportsExpressions: true },
      { name: "confidence", label: "Confidence", type: "number", default: 1.0 },
    ],
    outputSchema: [],
  },
  {
    type: "voice.get_transcript",
    category: "voice",
    label: "Get Transcript",
    description: "Get full conversation transcript",
    icon: "FileText",
    defaultConfig: { format: "text" },
    configSchema: [
      { name: "format", label: "Format", type: "select", default: "text", options: [
        { value: "text", label: "Plain Text" },
        { value: "markdown", label: "Markdown" },
        { value: "json", label: "JSON" },
      ]},
    ],
    outputSchema: [
      { name: "transcript", type: "string", description: "Full conversation transcript" },
    ],
  },
  {
    type: "voice.set_context",
    category: "voice",
    label: "Set Call Context",
    description: "Store context data during call",
    icon: "Database",
    defaultConfig: {},
    configSchema: [
      { name: "key", label: "Key", type: "text", required: true },
      { name: "value", label: "Value", type: "textarea", required: true, supportsExpressions: true },
    ],
    outputSchema: [],
  },
  {
    type: "voice.get_context",
    category: "voice",
    label: "Get Call Context",
    description: "Retrieve context data from call",
    icon: "Database",
    defaultConfig: {},
    configSchema: [
      { name: "key", label: "Key", type: "text", placeholder: "Leave empty to get all context", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "context_value", type: "any", description: "Context value or all context" },
    ],
  },

  // ============================================
  // INSURANCE - FNOL & Policy Operations
  // ============================================

  {
    type: "insurance.fnol_record",
    category: "insurance",
    label: "Create FNOL Record",
    description: "Create canonical First Notice of Loss record",
    icon: "FileWarning",
    defaultConfig: {},
    configSchema: [
      { name: "caller_phone", label: "Caller Phone", type: "text", required: true, supportsExpressions: true },
      { name: "caller_name", label: "Caller Name", type: "text", supportsExpressions: true },
      { name: "policy_number", label: "Policy Number", type: "text", supportsExpressions: true },
      { name: "incident_type", label: "Incident Type", type: "select", required: true, options: [
        { value: "auto", label: "Auto/Vehicle" },
        { value: "property", label: "Property" },
        { value: "liability", label: "Liability" },
        { value: "health", label: "Health" },
        { value: "workers_comp", label: "Workers Compensation" },
        { value: "other", label: "Other" },
      ]},
      { name: "incident_date", label: "Incident Date", type: "text", supportsExpressions: true },
      { name: "incident_location", label: "Incident Location", type: "text", supportsExpressions: true },
      { name: "incident_description", label: "Description", type: "textarea", required: true, supportsExpressions: true },
      { name: "injuries", label: "Injuries Reported", type: "boolean", default: false },
      { name: "police_report", label: "Police Report Number", type: "text", supportsExpressions: true },
      { name: "recording_url", label: "Call Recording URL", type: "text", supportsExpressions: true },
      { name: "transcript", label: "Call Transcript", type: "textarea", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "fnol_id", type: "string", description: "Unique FNOL record ID" },
      { name: "fnol_record", type: "object", description: "Complete FNOL record object" },
      { name: "created_at", type: "string", description: "Record creation timestamp" },
    ],
  },
  {
    type: "insurance.lookup_policy",
    category: "insurance",
    label: "Lookup Policy",
    description: "Find policy by phone, name, DOB (caller often doesn't have policy number)",
    icon: "Search",
    defaultConfig: { method: "POST" },
    configSchema: [
      { name: "api_url", label: "Policy Lookup API URL", type: "text", required: true, placeholder: "https://your-insurance-system.com/api/policies/lookup" },
      // Primary: CallerID from Twilio (automatic)
      { name: "phone_number", label: "Phone Number (from CallerID)", type: "text", supportsExpressions: true, placeholder: "${Voice Trigger.caller_number}" },
      // Fallback criteria if phone doesn't match
      { name: "policyholder_name", label: "Policyholder Name", type: "text", supportsExpressions: true },
      { name: "date_of_birth", label: "Date of Birth", type: "text", supportsExpressions: true, placeholder: "YYYY-MM-DD" },
      { name: "ssn_last_four", label: "SSN Last 4 Digits", type: "text", supportsExpressions: true },
      { name: "address", label: "Address", type: "text", supportsExpressions: true },
      { name: "vin", label: "Vehicle VIN (for auto)", type: "text", supportsExpressions: true },
      // If caller has it
      { name: "policy_number", label: "Policy Number (if known)", type: "text", supportsExpressions: true },
      { name: "method", label: "HTTP Method", type: "select", default: "POST", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ]},
      { name: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ${API_KEY}"}', supportsExpressions: true },
    ],
    outputSchema: [
      { name: "found", type: "boolean", description: "Policy was found" },
      { name: "policy_id", type: "string", description: "Policy internal ID" },
      { name: "policy_number", type: "string", description: "Policy number" },
      { name: "policyholder_name", type: "string", description: "Policyholder name" },
      { name: "match_method", type: "string", description: "How policy was found (phone, name_dob, etc.)" },
      { name: "raw_response", type: "object", description: "Raw API response" },
    ],
  },
  {
    type: "insurance.validate_policy",
    category: "insurance",
    label: "Validate Policy",
    description: "Check if policy is active and has coverage for claim type",
    icon: "ShieldCheck",
    defaultConfig: { check_active: true },
    configSchema: [
      { name: "api_url", label: "Policy Validation API URL", type: "text", required: true, placeholder: "https://your-insurance-system.com/api/policies/validate" },
      { name: "policy_id", label: "Policy ID (from lookup)", type: "text", supportsExpressions: true, placeholder: "${Lookup Policy.policy_id}" },
      { name: "policy_number", label: "Policy Number", type: "text", supportsExpressions: true, placeholder: "${Lookup Policy.policy_number}" },
      { name: "claim_type", label: "Claim Type to Validate", type: "select", options: [
        { value: "auto", label: "Auto/Vehicle" },
        { value: "property", label: "Property" },
        { value: "liability", label: "Liability" },
        { value: "health", label: "Health" },
        { value: "any", label: "Any Coverage" },
      ]},
      { name: "check_active", label: "Check Policy is Active", type: "boolean", default: true },
      { name: "check_coverage", label: "Verify Coverage Type", type: "boolean", default: true },
      { name: "method", label: "HTTP Method", type: "select", default: "POST", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ]},
      { name: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ${API_KEY}"}', supportsExpressions: true },
    ],
    outputSchema: [
      { name: "valid", type: "boolean", description: "Policy is valid for this claim type" },
      { name: "is_active", type: "boolean", description: "Policy is currently active" },
      { name: "has_coverage", type: "boolean", description: "Policy has coverage for claim type" },
      { name: "policyholder_name", type: "string", description: "Policyholder name" },
      { name: "coverage_type", type: "string", description: "Type of coverage" },
      { name: "effective_date", type: "string", description: "Policy effective date" },
      { name: "expiration_date", type: "string", description: "Policy expiration date" },
      { name: "status", type: "string", description: "Policy status (active, cancelled, expired)" },
      { name: "deductible", type: "number", description: "Deductible amount" },
      { name: "coverage_limit", type: "number", description: "Coverage limit" },
      { name: "raw_response", type: "object", description: "Raw API response" },
    ],
  },
  {
    type: "insurance.extract_claim_data",
    category: "insurance",
    label: "Extract Claim Data",
    description: "Use AI to extract structured claim data from conversation",
    icon: "Brain",
    defaultConfig: {},
    configSchema: [
      { name: "transcript", label: "Conversation Transcript", type: "textarea", required: true, supportsExpressions: true },
      { name: "claim_type", label: "Expected Claim Type", type: "select", options: [
        { value: "auto", label: "Auto/Vehicle" },
        { value: "property", label: "Property" },
        { value: "any", label: "Any/Auto-detect" },
      ]},
      { name: "llm_provider", label: "LLM Provider", type: "select", default: "openai", options: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic Claude" },
        { value: "azure_openai", label: "Azure OpenAI" },
      ]},
    ],
    outputSchema: [
      { name: "extracted_data", type: "object", description: "Structured claim data" },
      { name: "confidence", type: "number", description: "Extraction confidence (0-1)" },
      { name: "missing_fields", type: "array", description: "Fields that couldn't be extracted" },
    ],
  },

  // ============================================
  // MICROSOFT 365 - Email, Calendar, OneDrive, Teams
  // ============================================

  // --- MS365 Connection ---
  {
    type: "ms365.connection",
    category: "ms365",
    label: "MS365 Connection",
    description: "Configure Microsoft 365 authentication",
    icon: "KeyRound",
    defaultConfig: { auth_type: "client_credentials" },
    configSchema: [
      { name: "tenant_id", label: "Tenant ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { name: "client_id", label: "Client (App) ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { name: "client_secret", label: "Client Secret", type: "password", required: true, supportsExpressions: true, placeholder: "${vault.ms365_secret}" },
      { name: "user_email", label: "Target Mailbox", type: "text", placeholder: "user@company.com", description: "Email address for delegated access" },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Connection status" },
      { name: "authenticated", type: "boolean", description: "Whether authentication succeeded" },
    ],
  },

  // --- MS365 Email Triggers ---
  {
    type: "trigger.ms365_email",
    category: "trigger",
    label: "MS365 Email Received",
    description: "Trigger when new email arrives in Microsoft 365 mailbox",
    icon: "Mail",
    defaultConfig: { folder: "inbox", check_interval: 60 },
    configSchema: [
      { name: "folder", label: "Mail Folder", type: "select", default: "inbox", options: [
        { value: "inbox", label: "Inbox" },
        { value: "sentitems", label: "Sent Items" },
        { value: "drafts", label: "Drafts" },
        { value: "archive", label: "Archive" },
        { value: "junkemail", label: "Junk" },
      ]},
      { name: "filter_from", label: "From (Email)", type: "text", placeholder: "sender@example.com" },
      { name: "filter_subject", label: "Subject Contains", type: "text", placeholder: "Invoice" },
      { name: "filter_has_attachment", label: "Has Attachment", type: "boolean" },
      { name: "filter_unread_only", label: "Unread Only", type: "boolean", default: true },
      { name: "check_interval", label: "Check Interval (seconds)", type: "number", default: 60 },
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Email message ID" },
      { name: "subject", type: "string", description: "Email subject" },
      { name: "from", type: "object", description: "Sender info { name, email }" },
      { name: "to", type: "array", description: "Recipients list" },
      { name: "body", type: "object", description: "Email body { content, contentType }" },
      { name: "bodyPreview", type: "string", description: "Preview of email body" },
      { name: "receivedDateTime", type: "string", description: "When email was received" },
      { name: "hasAttachments", type: "boolean", description: "Whether email has attachments" },
      { name: "isRead", type: "boolean", description: "Read status" },
      { name: "importance", type: "string", description: "Email importance" },
    ],
  },

  // --- MS365 Email Read Operations ---
  {
    type: "ms365.email_list",
    category: "ms365",
    label: "List Emails",
    description: "List emails from a Microsoft 365 folder",
    icon: "Mail",
    defaultConfig: { folder: "inbox", top: 10 },
    configSchema: [
      { name: "folder", label: "Mail Folder", type: "select", default: "inbox", options: [
        { value: "inbox", label: "Inbox" },
        { value: "sentitems", label: "Sent Items" },
        { value: "drafts", label: "Drafts" },
        { value: "archive", label: "Archive" },
        { value: "deleteditems", label: "Deleted Items" },
        { value: "junkemail", label: "Junk" },
      ]},
      { name: "top", label: "Max Results", type: "number", default: 10 },
      { name: "filter", label: "OData Filter", type: "text", placeholder: "isRead eq false", description: "OData filter expression" },
      { name: "search", label: "Search Query", type: "text", placeholder: "subject:invoice", description: "Search in email content" },
      { name: "order_by", label: "Order By", type: "select", default: "receivedDateTime desc", options: [
        { value: "receivedDateTime desc", label: "Newest First" },
        { value: "receivedDateTime asc", label: "Oldest First" },
        { value: "subject asc", label: "Subject A-Z" },
        { value: "from/emailAddress/name asc", label: "Sender A-Z" },
      ]},
    ],
    outputSchema: [
      { name: "emails", type: "array", description: "List of email objects" },
      { name: "count", type: "number", description: "Number of emails returned" },
    ],
  },
  {
    type: "ms365.email_get",
    category: "ms365",
    label: "Get Email",
    description: "Get a single email by ID with full details",
    icon: "FileText",
    defaultConfig: { include_body: true, include_attachments: false },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "include_body", label: "Include Body", type: "boolean", default: true },
      { name: "include_attachments", label: "Include Attachments", type: "boolean", default: false },
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Email message ID" },
      { name: "subject", type: "string", description: "Email subject" },
      { name: "from", type: "object", description: "Sender info { name, email }" },
      { name: "to", type: "array", description: "To recipients" },
      { name: "cc", type: "array", description: "CC recipients" },
      { name: "bcc", type: "array", description: "BCC recipients" },
      { name: "body", type: "object", description: "Email body { content, contentType }" },
      { name: "receivedDateTime", type: "string", description: "When received" },
      { name: "hasAttachments", type: "boolean", description: "Has attachments" },
      { name: "attachments", type: "array", description: "Attachment list if requested" },
    ],
  },
  {
    type: "ms365.email_search",
    category: "ms365",
    label: "Search Emails",
    description: "Search emails using Microsoft Search",
    icon: "Search",
    defaultConfig: { folder: "inbox", top: 25 },
    configSchema: [
      { name: "query", label: "Search Query", type: "text", required: true, supportsExpressions: true, placeholder: "from:john@example.com subject:urgent" },
      { name: "folder", label: "Folder", type: "select", default: "inbox", options: [
        { value: "inbox", label: "Inbox" },
        { value: "sentitems", label: "Sent Items" },
        { value: "all", label: "All Folders" },
      ]},
      { name: "top", label: "Max Results", type: "number", default: 25 },
    ],
    outputSchema: [
      { name: "emails", type: "array", description: "Matching emails" },
      { name: "count", type: "number", description: "Number of results" },
    ],
  },
  {
    type: "ms365.email_get_attachments",
    category: "ms365",
    label: "Get Attachments",
    description: "Get list of attachments from an email",
    icon: "Paperclip",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "attachments", type: "array", description: "List of attachments with id, name, size, contentType" },
      { name: "count", type: "number", description: "Number of attachments" },
    ],
  },
  {
    type: "ms365.email_download_attachment",
    category: "ms365",
    label: "Download Attachment",
    description: "Download an email attachment to file",
    icon: "Download",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "attachment_id", label: "Attachment ID", type: "text", required: true, supportsExpressions: true },
      { name: "save_path", label: "Save Path", type: "text", placeholder: "/downloads/file.pdf", supportsExpressions: true },
    ],
    outputSchema: [
      { name: "savedPath", type: "string", description: "Path where file was saved" },
      { name: "name", type: "string", description: "Attachment filename" },
      { name: "size", type: "number", description: "File size in bytes" },
      { name: "contentType", type: "string", description: "MIME type" },
    ],
  },

  // --- MS365 Email Send Operations ---
  {
    type: "ms365.email_send",
    category: "ms365",
    label: "Send Email",
    description: "Send a new email via Microsoft 365",
    icon: "Send",
    defaultConfig: { body_type: "html", importance: "normal", save_to_sent: true },
    configSchema: [
      { name: "to", label: "To", type: "text", required: true, supportsExpressions: true, placeholder: "recipient@example.com" },
      { name: "cc", label: "CC", type: "text", supportsExpressions: true, placeholder: "cc@example.com" },
      { name: "bcc", label: "BCC", type: "text", supportsExpressions: true, placeholder: "bcc@example.com" },
      { name: "subject", label: "Subject", type: "text", required: true, supportsExpressions: true },
      { name: "body", label: "Body", type: "textarea", required: true, supportsExpressions: true },
      { name: "body_type", label: "Body Type", type: "select", default: "html", options: [
        { value: "html", label: "HTML" },
        { value: "text", label: "Plain Text" },
      ]},
      { name: "importance", label: "Importance", type: "select", default: "normal", options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ]},
      { name: "attachments", label: "Attachments", type: "text", supportsExpressions: true, placeholder: "Comma-separated file paths" },
      { name: "save_to_sent", label: "Save to Sent Items", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Send status" },
      { name: "to", type: "array", description: "Recipients" },
      { name: "subject", type: "string", description: "Email subject" },
      { name: "timestamp", type: "string", description: "When sent" },
    ],
  },
  {
    type: "ms365.email_reply",
    category: "ms365",
    label: "Reply to Email",
    description: "Reply to an existing email",
    icon: "Reply",
    defaultConfig: { reply_all: false, body_type: "html" },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "body", label: "Reply Body", type: "textarea", required: true, supportsExpressions: true },
      { name: "reply_all", label: "Reply All", type: "boolean", default: false },
      { name: "body_type", label: "Body Type", type: "select", default: "html", options: [
        { value: "html", label: "HTML" },
        { value: "text", label: "Plain Text" },
      ]},
      { name: "attachments", label: "Attachments", type: "text", supportsExpressions: true, placeholder: "Comma-separated file paths" },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Reply status" },
      { name: "action", type: "string", description: "reply or reply_all" },
      { name: "originalMessageId", type: "string", description: "Original message ID" },
      { name: "timestamp", type: "string", description: "When sent" },
    ],
  },
  {
    type: "ms365.email_forward",
    category: "ms365",
    label: "Forward Email",
    description: "Forward an email to other recipients",
    icon: "Forward",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "to", label: "Forward To", type: "text", required: true, supportsExpressions: true, placeholder: "recipient@example.com" },
      { name: "comment", label: "Comment", type: "textarea", supportsExpressions: true, placeholder: "FYI - please review" },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Forward status" },
      { name: "originalMessageId", type: "string", description: "Original message ID" },
      { name: "to", type: "array", description: "Forward recipients" },
      { name: "timestamp", type: "string", description: "When forwarded" },
    ],
  },
  {
    type: "ms365.email_draft",
    category: "ms365",
    label: "Create Draft",
    description: "Create an email draft",
    icon: "FilePen",
    defaultConfig: { body_type: "html" },
    configSchema: [
      { name: "to", label: "To", type: "text", required: true, supportsExpressions: true },
      { name: "cc", label: "CC", type: "text", supportsExpressions: true },
      { name: "subject", label: "Subject", type: "text", required: true, supportsExpressions: true },
      { name: "body", label: "Body", type: "textarea", required: true, supportsExpressions: true },
      { name: "body_type", label: "Body Type", type: "select", default: "html", options: [
        { value: "html", label: "HTML" },
        { value: "text", label: "Plain Text" },
      ]},
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Draft message ID" },
      { name: "subject", type: "string", description: "Draft subject" },
      { name: "webLink", type: "string", description: "Link to draft in Outlook" },
    ],
  },

  // --- MS365 Email Manage Operations ---
  {
    type: "ms365.email_move",
    category: "ms365",
    label: "Move Email",
    description: "Move an email to another folder",
    icon: "FolderInput",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "destination_folder", label: "Destination Folder", type: "select", required: true, options: [
        { value: "inbox", label: "Inbox" },
        { value: "archive", label: "Archive" },
        { value: "deleteditems", label: "Deleted Items" },
        { value: "junkemail", label: "Junk" },
        { value: "drafts", label: "Drafts" },
      ]},
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Message ID in new location" },
      { name: "parentFolderId", type: "string", description: "New folder ID" },
    ],
  },
  {
    type: "ms365.email_copy",
    category: "ms365",
    label: "Copy Email",
    description: "Copy an email to another folder",
    icon: "Copy",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "destination_folder", label: "Destination Folder", type: "select", required: true, options: [
        { value: "inbox", label: "Inbox" },
        { value: "archive", label: "Archive" },
        { value: "drafts", label: "Drafts" },
      ]},
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Copied message ID" },
      { name: "parentFolderId", type: "string", description: "Destination folder ID" },
    ],
  },
  {
    type: "ms365.email_delete",
    category: "ms365",
    label: "Delete Email",
    description: "Delete an email (soft or permanent)",
    icon: "Trash2",
    defaultConfig: { permanent: false },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "permanent", label: "Permanent Delete", type: "boolean", default: false, description: "If unchecked, moves to Deleted Items" },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Delete status" },
      { name: "messageId", type: "string", description: "Deleted message ID" },
      { name: "permanent", type: "boolean", description: "Whether permanently deleted" },
    ],
  },
  {
    type: "ms365.email_mark_read",
    category: "ms365",
    label: "Mark Read/Unread",
    description: "Mark an email as read or unread",
    icon: "MailCheck",
    defaultConfig: { is_read: true },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "is_read", label: "Mark as Read", type: "boolean", default: true },
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Message ID" },
      { name: "isRead", type: "boolean", description: "New read status" },
    ],
  },
  {
    type: "ms365.email_flag",
    category: "ms365",
    label: "Flag Email",
    description: "Set follow-up flag on an email",
    icon: "Flag",
    defaultConfig: { flag_status: "flagged" },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "flag_status", label: "Flag Status", type: "select", default: "flagged", options: [
        { value: "flagged", label: "Flagged" },
        { value: "complete", label: "Complete" },
        { value: "notFlagged", label: "Not Flagged" },
      ]},
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Message ID" },
      { name: "flag", type: "string", description: "New flag status" },
    ],
  },
  {
    type: "ms365.email_categories",
    category: "ms365",
    label: "Set Categories",
    description: "Set categories on an email",
    icon: "Tags",
    defaultConfig: {},
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "categories", label: "Categories", type: "text", required: true, supportsExpressions: true, placeholder: "Important, Client, Follow-up" },
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Message ID" },
      { name: "categories", type: "array", description: "Applied categories" },
    ],
  },
  {
    type: "ms365.email_importance",
    category: "ms365",
    label: "Set Importance",
    description: "Set importance level on an email",
    icon: "AlertCircle",
    defaultConfig: { importance: "high" },
    configSchema: [
      { name: "message_id", label: "Message ID", type: "text", required: true, supportsExpressions: true },
      { name: "importance", label: "Importance", type: "select", default: "high", options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ]},
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Message ID" },
      { name: "importance", type: "string", description: "New importance level" },
    ],
  },

  // --- MS365 Folders ---
  {
    type: "ms365.folder_list",
    category: "ms365",
    label: "List Folders",
    description: "List mail folders",
    icon: "FolderTree",
    defaultConfig: {},
    configSchema: [
      { name: "parent_folder_id", label: "Parent Folder ID", type: "text", supportsExpressions: true, placeholder: "Leave empty for root folders" },
    ],
    outputSchema: [
      { name: "folders", type: "array", description: "List of folders with id, displayName, totalItemCount, unreadItemCount" },
      { name: "count", type: "number", description: "Number of folders" },
    ],
  },
  {
    type: "ms365.folder_create",
    category: "ms365",
    label: "Create Folder",
    description: "Create a new mail folder",
    icon: "FolderPlus",
    defaultConfig: {},
    configSchema: [
      { name: "display_name", label: "Folder Name", type: "text", required: true, supportsExpressions: true },
      { name: "parent_folder_id", label: "Parent Folder ID", type: "text", supportsExpressions: true, placeholder: "Leave empty for root level" },
    ],
    outputSchema: [
      { name: "id", type: "string", description: "Created folder ID" },
      { name: "displayName", type: "string", description: "Folder name" },
    ],
  },
  {
    type: "ms365.folder_delete",
    category: "ms365",
    label: "Delete Folder",
    description: "Delete a mail folder",
    icon: "FolderMinus",
    defaultConfig: {},
    configSchema: [
      { name: "folder_id", label: "Folder ID", type: "text", required: true, supportsExpressions: true },
    ],
    outputSchema: [
      { name: "status", type: "string", description: "Delete status" },
      { name: "folderId", type: "string", description: "Deleted folder ID" },
    ],
  },
];

export const getNodeTemplate = (type: string): NodeTemplate | undefined => {
  return nodeTemplates.find((t) => t.type === type);
};

export const getNodesByCategory = (category: string): NodeTemplate[] => {
  return nodeTemplates.filter((t) => t.category === category);
};
