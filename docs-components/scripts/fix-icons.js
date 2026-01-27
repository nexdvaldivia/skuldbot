#!/usr/bin/env node
/**
 * Script to fix all NodeHeader icons in documentation pages
 * Replaces inline SVGs with Lucide icon names from nodeTemplates.ts
 */

const fs = require('fs');
const path = require('path');

// Icon mappings from nodeTemplates.ts (type → icon name)
const iconMappings = {
  // Triggers
  'trigger.file_watch': 'FolderSearch',
  'trigger.email_received': 'MailOpen',
  'trigger.webhook': 'Webhook',
  'trigger.queue': 'ListOrdered',
  'trigger.manual': 'Play',
  'trigger.form': 'ClipboardList',
  'trigger.api_polling': 'RefreshCw',
  'trigger.database_change': 'DatabaseZap',
  'trigger.storage_event': 'HardDrive',
  'trigger.message_bus': 'Radio',
  'trigger.chat': 'MessageCircle',
  'trigger.voice_inbound': 'PhoneIncoming',
  'trigger.ms365_email': 'Mail',
  
  // Web
  'web.open_browser': 'Globe',
  'web.navigate': 'ExternalLink',
  'web.click': 'MousePointer2',
  'web.type': 'Type',
  'web.select_option': 'ChevronDown',
  'web.get_text': 'TextCursor',
  'web.get_attribute': 'Tag',
  'web.screenshot': 'Camera',
  'web.wait_element': 'Clock',
  'web.execute_js': 'Code',
  'web.scroll': 'ArrowDown',
  'web.handle_alert': 'AlertCircle',
  'web.switch_tab': 'PanelLeft',
  'web.close_browser': 'X',
  'web.download_file': 'Download',
  
  // Desktop
  'desktop.open_app': 'AppWindow',
  'desktop.click': 'MousePointer',
  'desktop.type_text': 'Keyboard',
  'desktop.hotkey': 'Command',
  'desktop.get_window': 'Square',
  'desktop.minimize': 'Minus',
  'desktop.maximize': 'Maximize2',
  'desktop.close_window': 'XSquare',
  'desktop.screenshot': 'Monitor',
  'desktop.image_click': 'Image',
  'desktop.wait_image': 'ScanSearch',
  'desktop.clipboard_copy': 'Copy',
  
  // Storage
  'storage.provider': 'Database',
  'storage.transfer': 'ArrowLeftRight',
  'storage.sync': 'RefreshCw',
  
  // Files
  'files.read': 'FileInput',
  'files.write': 'FileOutput',
  'files.copy': 'Copy',
  'files.move': 'FolderInput',
  'files.delete': 'Trash2',
  'files.create_folder': 'FolderPlus',
  'files.list': 'FolderOpen',
  'files.exists': 'FileSearch',
  'files.get_info': 'FileText',
  'files.zip': 'Archive',
  'files.unzip': 'FolderArchive',
  'files.watch': 'Eye',
  'files.presigned_url': 'Link',
  
  // Excel
  'excel.open': 'FileSpreadsheet',
  'excel.read_range': 'Table',
  'excel.write_range': 'Table2',
  'excel.read_cell': 'SquareStack',
  'excel.write_cell': 'PenLine',
  'excel.add_row': 'ListPlus',
  'excel.filter': 'Filter',
  'excel.save': 'Save',
  'excel.close': 'X',
  'excel.csv_read': 'FileText',
  'excel.csv_write': 'FileOutput',
  'excel.pivot': 'PieChart',
  'excel.create': 'FilePlus2',
  'excel.create_sheet': 'Plus',
  'excel.delete_sheet': 'Trash2',
  'excel.rename_sheet': 'Edit3',
  'excel.get_sheets': 'Layers',
  'excel.delete_row': 'RowsIcon',
  'excel.delete_column': 'Columns',
  'excel.insert_row': 'ListPlus',
  'excel.set_format': 'PaintBucket',
  'excel.merge_cells': 'Merge',
  'excel.auto_filter': 'Filter',
  'excel.sort_data': 'ArrowUpDown',
  'excel.find_replace': 'SearchCode',
  'excel.create_chart': 'LineChart',
  'excel.export_pdf': 'FileDown',
  'excel.vlookup': 'Search',
  
  // Email
  'email.send': 'Send',
  'email.read': 'MailOpen',
  'email.reply': 'Reply',
  'email.forward': 'Forward',
  'email.download_attachment': 'Paperclip',
  'email.move': 'FolderInput',
  'email.delete': 'Trash2',
  'email.mark_read': 'CheckCircle',
  'email.search': 'Search',
  'email.send_smtp': 'Send',
  'email.send_outlook': 'Mail',
  'email.send_gmail': 'Mail',
  'email.read_imap': 'Inbox',
  'email.create_draft': 'FileEdit',
  'email.get_folders': 'Folders',
  
  // Document
  'document.pdf_read': 'FileText',
  'document.pdf_merge': 'Files',
  'document.pdf_split': 'Scissors',
  'document.pdf_to_image': 'Image',
  'document.ocr': 'ScanText',
  'document.word_read': 'FileText',
  'document.word_write': 'FileEdit',
  'document.html_to_pdf': 'FileDown',
  'document.pdf_fill_form': 'ClipboardPen',
  
  // Database
  'database.connect': 'Database',
  'database.query': 'Search',
  'database.insert': 'Plus',
  'database.update': 'RefreshCw',
  'database.delete': 'Trash2',
  'database.call_procedure': 'Play',
  'database.transaction': 'GitBranch',
  'database.commit': 'Check',
  'database.close': 'X',
  
  // API
  'api.http_request': 'Globe',
  'api.graphql': 'GitGraph',
  'api.rest_get': 'Download',
  'api.rest_post': 'Upload',
  'api.soap': 'FileCode',
  'api.oauth_token': 'Key',
  'api.parse_json': 'Braces',
  'api.json_path': 'Search',
  'api.ftp_upload': 'Upload',
  
  // AI
  'ai.agent': 'Bot',
  'ai.extract_data': 'FileSearch',
  'ai.summarize': 'FileText',
  'ai.classify': 'Tags',
  'ai.translate': 'Languages',
  'ai.sentiment': 'Heart',
  'ai.vision': 'Eye',
  'ai.repair_data': 'Wrench',
  'ai.suggest_repairs': 'Lightbulb',
  'ai.embeddings': 'Binary',
  'ai.model': 'Cpu',
  
  // Control
  'control.if': 'GitBranch',
  'control.switch': 'Route',
  'control.loop': 'Repeat',
  'control.while': 'RefreshCw',
  'control.wait': 'Clock',
  'control.set_variable': 'Variable',
  'control.try_catch': 'ShieldAlert',
  'control.parallel': 'GitBranch',
  'control.stop': 'StopCircle',
  'control.goto': 'CornerRightDown',
  'control.map': 'Shuffle',
  'control.append': 'ListPlus',
  'control.filter': 'Filter',
  'control.reduce': 'Combine',
  
  // Code
  'code.python': 'Code',
  'code.javascript': 'Braces',
  'code.shell': 'Terminal',
  
  // Python
  'python.script': 'FileCode',
  'python.virtualenv': 'Package',
  'python.project': 'FolderCode',
  'python.notebook': 'BookOpen',
  
  // Bot
  'bot.call': 'Play',
  'bot.input': 'ArrowDownToLine',
  'bot.output': 'ArrowUpFromLine',
  'bot.queue': 'ListOrdered',
  
  // Compliance
  'compliance.protect_pii': 'ShieldCheck',
  'compliance.protect_phi': 'ShieldPlus',
  'compliance.audit_log': 'ClipboardList',
  
  // Data Quality
  'dataquality.validate': 'CheckCircle',
  'dataquality.profile_data': 'BarChart',
  'dataquality.generate_report': 'FileBarChart',
  
  // Human
  'human.approval': 'UserCheck',
  'human.input': 'MessageSquare',
  'human.review': 'Eye',
  'human.exception': 'AlertTriangle',
  'human.notification': 'Bell',
  
  // Logging
  'logging.log': 'FileText',
  'logging.screenshot': 'Camera',
  'logging.metric': 'Activity',
  'logging.timer_start': 'Timer',
  'logging.timer_stop': 'TimerOff',
  'logging.notification': 'Bell',
  'logging.audit': 'ClipboardList',
  'logging.export': 'Download',
  
  // Security
  'security.get_secret': 'Key',
  'security.encrypt': 'Lock',
  'security.decrypt': 'Unlock',
  'security.hash': 'Hash',
  'security.mask_data': 'EyeOff',
  'security.validate_cert': 'ShieldCheck',
  
  // Vector DB
  'vectordb.connect': 'Database',
  'vectordb.upsert': 'Upload',
  'vectordb.query': 'Search',
  'vectordb.delete': 'Trash2',
  
  // Voice
  'voice.call': 'Phone',
  'voice.answer': 'PhoneCall',
  'voice.hangup': 'PhoneOff',
  'voice.play_audio': 'Volume2',
  'voice.record': 'Mic',
  'voice.speech_to_text': 'AudioLines',
  'voice.text_to_speech': 'Volume2',
  'voice.dtmf': 'Hash',
  'voice.transfer': 'PhoneForwarded',
  'voice.conference': 'Users',
  
  // MS365
  'ms365.connection': 'Link',
  'ms365.email_list': 'Mail',
  'ms365.email_get': 'MailOpen',
  'ms365.email_search': 'Search',
  'ms365.email_send': 'Send',
  'ms365.email_reply': 'Reply',
  'ms365.email_forward': 'Forward',
  'ms365.email_draft': 'FileEdit',
  'ms365.email_move': 'FolderInput',
  'ms365.email_copy': 'Copy',
  'ms365.email_delete': 'Trash2',
  'ms365.email_mark_read': 'CheckCircle',
  'ms365.email_flag': 'Flag',
  'ms365.email_categories': 'Tags',
  'ms365.email_importance': 'AlertCircle',
  'ms365.email_get_attachments': 'Paperclip',
  'ms365.email_download_attachment': 'Download',
  'ms365.folder_list': 'Folders',
  'ms365.folder_create': 'FolderPlus',
  'ms365.folder_delete': 'FolderMinus',
  
  // Insurance
  'insurance.fnol_record': 'FileText',
  'insurance.lookup_policy': 'Search',
  'insurance.validate_policy': 'ShieldCheck',
  'insurance.extract_claim_data': 'FileSearch',
  
  // Data Taps
  'data.tap.postgres': 'Database',
  'data.tap.mysql': 'Database',
  'data.tap.mssql': 'Database',
  'data.tap.mongodb': 'Database',
  'data.tap.snowflake': 'Snowflake',
  'data.tap.salesforce': 'Cloud',
  'data.tap.hubspot': 'Hexagon',
  'data.tap.google_analytics': 'BarChart',
  'data.tap.stripe': 'CreditCard',
  'data.tap.csv': 'FileSpreadsheet',
  'data.tap.json': 'Braces',
  'data.tap.s3': 'Cloud',
  'data.tap.rest_api': 'Globe',
  'data.tap.graphql': 'GitGraph',
  
  // Data Targets
  'data.target.postgres': 'Database',
  'data.target.snowflake': 'Snowflake',
  'data.target.bigquery': 'Database',
  'data.target.s3': 'Cloud',
  'data.target.csv': 'FileSpreadsheet',
};

// ID to type mapping (for documentation IDs like "web-open_browser" → "web.open_browser")
function idToType(id) {
  return id.replace(/-/g, '.').replace(/_/g, '_');
}

// Process a single MDX file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Regex to match NodeHeader with inline SVG
  const nodeHeaderRegex = /<NodeHeader\s+id="([^"]+)"\s+icon=\{`[\s\S]*?`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/g;
  
  content = content.replace(nodeHeaderRegex, (match, id, label, description, bgColor, textColor) => {
    const nodeType = idToType(id);
    const iconName = iconMappings[nodeType];
    
    if (iconName) {
      modified = true;
      return `<NodeHeader id="${id}" icon="${iconName}" label="${label}" description="${description}" bgColor="${bgColor}" textColor="${textColor}" />`;
    }
    
    // If no mapping found, keep original
    console.log(`  Warning: No icon mapping for ${nodeType}`);
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

// Main
const docsDir = path.join(__dirname, '..', 'src', 'app', 'components');
const files = fs.readdirSync(docsDir);

console.log('Fixing NodeHeader icons in documentation pages...\n');

let updatedCount = 0;
for (const file of files) {
  const filePath = path.join(docsDir, file, 'page.mdx');
  if (fs.existsSync(filePath)) {
    console.log(`Processing: ${file}/page.mdx`);
    if (processFile(filePath)) {
      updatedCount++;
      console.log(`  ✓ Updated`);
    } else {
      console.log(`  - No changes needed`);
    }
  }
}

console.log(`\nDone! Updated ${updatedCount} files.`);


