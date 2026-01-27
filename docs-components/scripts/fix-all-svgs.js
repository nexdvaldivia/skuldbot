#!/usr/bin/env node
/**
 * Replace all inline SVGs with Lucide icon names
 */

const fs = require('fs');
const path = require('path');

// Mapping from lucide kebab-case to PascalCase
const kebabToPascal = {
  'globe': 'Globe',
  'external-link': 'ExternalLink',
  'mouse-pointer-2': 'MousePointer2',
  'mouse-pointer': 'MousePointer',
  'type': 'Type',
  'chevron-down': 'ChevronDown',
  'text-cursor': 'TextCursor',
  'tag': 'Tag',
  'camera': 'Camera',
  'clock': 'Clock',
  'code': 'Code',
  'arrow-down': 'ArrowDown',
  'circle-alert': 'AlertCircle',
  'alert-circle': 'AlertCircle',
  'panel-left': 'PanelLeft',
  'x': 'X',
  'download': 'Download',
  'app-window': 'AppWindow',
  'keyboard': 'Keyboard',
  'command': 'Command',
  'square': 'Square',
  'minus': 'Minus',
  'maximize-2': 'Maximize2',
  'x-square': 'XSquare',
  'monitor': 'Monitor',
  'image': 'Image',
  'scan-search': 'ScanSearch',
  'copy': 'Copy',
  'database': 'Database',
  'arrow-left-right': 'ArrowLeftRight',
  'refresh-cw': 'RefreshCw',
  'file-input': 'FileInput',
  'file-output': 'FileOutput',
  'folder-input': 'FolderInput',
  'trash-2': 'Trash2',
  'folder-plus': 'FolderPlus',
  'folder-open': 'FolderOpen',
  'file-search': 'FileSearch',
  'file-text': 'FileText',
  'archive': 'Archive',
  'folder-archive': 'FolderArchive',
  'eye': 'Eye',
  'link': 'Link',
  'file-spreadsheet': 'FileSpreadsheet',
  'table': 'Table',
  'table-2': 'Table2',
  'square-stack': 'SquareStack',
  'pen-line': 'PenLine',
  'list-plus': 'ListPlus',
  'filter': 'Filter',
  'save': 'Save',
  'pie-chart': 'PieChart',
  'file-plus-2': 'FilePlus2',
  'plus': 'Plus',
  'edit-3': 'Edit3',
  'layers': 'Layers',
  'rows-icon': 'RowsIcon',
  'columns': 'Columns',
  'paint-bucket': 'PaintBucket',
  'merge': 'Merge',
  'arrow-up-down': 'ArrowUpDown',
  'search-code': 'SearchCode',
  'line-chart': 'LineChart',
  'file-down': 'FileDown',
  'search': 'Search',
  'send': 'Send',
  'mail-open': 'MailOpen',
  'reply': 'Reply',
  'forward': 'Forward',
  'paperclip': 'Paperclip',
  'check-circle': 'CheckCircle',
  'inbox': 'Inbox',
  'file-edit': 'FileEdit',
  'folders': 'Folders',
  'files': 'Files',
  'scissors': 'Scissors',
  'scan-text': 'ScanText',
  'clipboard-pen': 'ClipboardPen',
  'git-branch': 'GitBranch',
  'check': 'Check',
  'git-graph': 'GitGraph',
  'upload': 'Upload',
  'file-code': 'FileCode',
  'key': 'Key',
  'braces': 'Braces',
  'bot': 'Bot',
  'tags': 'Tags',
  'languages': 'Languages',
  'heart': 'Heart',
  'wrench': 'Wrench',
  'lightbulb': 'Lightbulb',
  'binary': 'Binary',
  'cpu': 'Cpu',
  'route': 'Route',
  'repeat': 'Repeat',
  'variable': 'Variable',
  'shield-alert': 'ShieldAlert',
  'stop-circle': 'StopCircle',
  'corner-right-down': 'CornerRightDown',
  'shuffle': 'Shuffle',
  'combine': 'Combine',
  'terminal': 'Terminal',
  'package': 'Package',
  'folder-code': 'FolderCode',
  'book-open': 'BookOpen',
  'play': 'Play',
  'arrow-down-to-line': 'ArrowDownToLine',
  'arrow-up-from-line': 'ArrowUpFromLine',
  'list-ordered': 'ListOrdered',
  'shield-check': 'ShieldCheck',
  'shield-plus': 'ShieldPlus',
  'clipboard-list': 'ClipboardList',
  'bar-chart': 'BarChart',
  'file-bar-chart': 'FileBarChart',
  'user-check': 'UserCheck',
  'message-square': 'MessageSquare',
  'alert-triangle': 'AlertTriangle',
  'bell': 'Bell',
  'activity': 'Activity',
  'timer': 'Timer',
  'timer-off': 'TimerOff',
  'lock': 'Lock',
  'unlock': 'Unlock',
  'hash': 'Hash',
  'eye-off': 'EyeOff',
  'phone': 'Phone',
  'phone-call': 'PhoneCall',
  'phone-off': 'PhoneOff',
  'volume-2': 'Volume2',
  'mic': 'Mic',
  'audio-lines': 'AudioLines',
  'phone-forwarded': 'PhoneForwarded',
  'users': 'Users',
  'mail': 'Mail',
  'flag': 'Flag',
  'folder-minus': 'FolderMinus',
  'snowflake': 'Snowflake',
  'cloud': 'Cloud',
  'hexagon': 'Hexagon',
  'credit-card': 'CreditCard',
  'hard-drive': 'HardDrive',
  'server': 'Server',
  'webhook': 'Webhook',
  'zap': 'Zap',
  'radio': 'Radio',
  'message-circle': 'MessageCircle',
  'phone-incoming': 'PhoneIncoming',
  'folder-search': 'FolderSearch',
  'database-zap': 'DatabaseZap',
  'layout-dashboard': 'LayoutDashboard',
  'settings': 'Settings',
  'settings-2': 'Settings2',
  'cog': 'Cog',
  'sliders': 'Sliders',
  'git-merge': 'GitMerge',
  'git-pull-request': 'GitPullRequest',
  'workflow': 'Workflow',
  'share-2': 'Share2',
  'share': 'Share',
};

// Fallback icon based on ID pattern
const idToIconFallback = {
  // API
  'api-http_request': 'Globe',
  'api-http-request': 'Globe',
  'api-graphql': 'GitGraph',
  'api-rest_get': 'Download',
  'api-rest-get': 'Download',
  'api-rest_post': 'Upload',
  'api-rest-post': 'Upload',
  'api-soap': 'FileCode',
  'api-oauth_token': 'Key',
  'api-oauth-token': 'Key',
  'api-parse_json': 'Braces',
  'api-parse-json': 'Braces',
  'api-json_path': 'Search',
  'api-json-path': 'Search',
  'api-ftp_upload': 'Upload',
  'api-ftp-upload': 'Upload',
  
  // Bot
  'bot-call': 'Play',
  'bot-input': 'ArrowDownToLine',
  'bot-output': 'ArrowUpFromLine',
  'bot-queue': 'ListOrdered',
  'bot-map': 'Shuffle',
  
  // Excel
  'excel-cell': 'SquareStack',
  'excel-csv': 'FileSpreadsheet',
  'excel-sheets': 'Layers',
  'excel-format': 'PaintBucket',
  'excel-charts': 'LineChart',
  
  // Python
  'python-script': 'FileCode',
  'python-virtualenv': 'Package',
  'python-project': 'FolderCode',
  'python-notebook': 'BookOpen',
  'python-activate_venv': 'Package',
  'python-pip_install': 'Package',
  'python-execute': 'Play',
  'python-function': 'Code',
  'python-import_module': 'FileCode',
  'python-eval': 'Code',
  
  // Storage
  'storage-provider': 'Database',
  'storage-transfer': 'ArrowLeftRight',
  'storage-sync': 'RefreshCw',
  'provider-local': 'HardDrive',
  'provider-s3': 'Cloud',
  'provider-azure': 'Cloud',
  'provider-gcs': 'Cloud',
  'provider-sharepoint': 'Cloud',
  'provider-onedrive': 'Cloud',
  'provider-gdrive': 'Cloud',
  'provider-sftp': 'Server',
  'provider-ftp': 'Server',
  'provider-webdav': 'Server',
  
  // Vector DB
  'vectordb-connect': 'Database',
  'vectordb-upsert': 'Upload',
  'vectordb-query': 'Search',
  'vectordb-delete': 'Trash2',
  'vectordb-configure': 'Settings',
  'vectordb-memory': 'Database',
  
  // Voice
  'voice-call': 'Phone',
  'voice-answer': 'PhoneCall',
  'voice-hangup': 'PhoneOff',
  'voice-play_audio': 'Volume2',
  'voice-record': 'Mic',
  'voice-speech_to_text': 'AudioLines',
  'voice-text_to_speech': 'Volume2',
  'voice-dtmf': 'Hash',
  'voice-transfer': 'PhoneForwarded',
  'voice-conference': 'Users',
  'voice-speak': 'Volume2',
  'voice-listen': 'Mic',
  'voice-conversation': 'MessageCircle',
  
  // Data taps/targets
  'data-tap-postgres': 'Database',
  'data-tap-mysql': 'Database',
  'data-tap-mssql': 'Database',
  'data-tap-mongodb': 'Database',
  'data-tap-snowflake': 'Snowflake',
  'data-tap-salesforce': 'Cloud',
  'data-tap-hubspot': 'Hexagon',
  'data-tap-google_analytics': 'BarChart',
  'data-tap-stripe': 'CreditCard',
  'data-tap-csv': 'FileSpreadsheet',
  'data-tap-json': 'Braces',
  'data-tap-s3': 'Cloud',
  'data-tap-rest_api': 'Globe',
  'data-tap-graphql': 'GitGraph',
  'data-target-postgres': 'Database',
  'data-target-snowflake': 'Snowflake',
  'data-target-bigquery': 'Database',
  'data-target-s3': 'Cloud',
  'data-target-csv': 'FileSpreadsheet',
  
  // Files
  'files-watch': 'Eye',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  let count = 0;

  // Match NodeHeader with inline SVG
  const regex = /<NodeHeader\s+id="([^"]+)"\s+icon=\{`\s*<svg[^>]*class="lucide\s+lucide-([^"]+)"[^>]*>[\s\S]*?<\/svg>\s*`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/g;

  content = content.replace(regex, (match, id, lucideClass, label, description, bgColor, textColor) => {
    count++;
    modified = true;
    
    // Try to get icon from kebab case
    let iconName = kebabToPascal[lucideClass];
    
    // If not found, try fallback by ID
    if (!iconName) {
      iconName = idToIconFallback[id];
    }
    
    // Last resort: convert kebab to pascal manually
    if (!iconName) {
      iconName = lucideClass
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    }
    
    console.log(`  ${id}: ${lucideClass} -> ${iconName}`);
    return `<NodeHeader id="${id}" icon="${iconName}" label="${label}" description="${description}" bgColor="${bgColor}" textColor="${textColor}" />`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    return count;
  }
  return 0;
}

// Main
const docsDir = path.join(__dirname, '..', 'src', 'app', 'components');
const files = fs.readdirSync(docsDir);

console.log('Replacing inline SVGs with Lucide icon names...\n');

let totalFixed = 0;
for (const file of files) {
  const filePath = path.join(docsDir, file, 'page.mdx');
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('icon={`')) {
      console.log(`Processing: ${file}/page.mdx`);
      const fixed = processFile(filePath);
      if (fixed > 0) {
        totalFixed += fixed;
        console.log(`  ✓ Fixed ${fixed} SVGs\n`);
      }
    }
  }
}

console.log(`\nDone! Fixed ${totalFixed} total SVGs.`);


