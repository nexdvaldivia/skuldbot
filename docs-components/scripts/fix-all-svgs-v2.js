#!/usr/bin/env node
/**
 * Replace all inline SVGs with Lucide icon names (handles SVGs without class)
 */

const fs = require('fs');
const path = require('path');

// Mapping from label to icon name
const labelToIcon = {
  // Bot
  'Bot Call': 'Play',
  'Call Bot': 'Play',
  'Bot Input': 'ArrowDownToLine',
  'Bot Output': 'ArrowUpFromLine',
  'Bot Queue': 'ListOrdered',
  'Bot Map': 'Shuffle',
  'Bot Subprocess Overview': 'Settings2',
  'Bot Subprocess': 'Settings2',
  
  // Storage
  'Storage Provider': 'Database',
  'Cross-Provider Transfer': 'ArrowLeftRight',
  'Directory Sync': 'RefreshCw',
  'Local Filesystem': 'HardDrive',
  'Amazon S3': 'Cloud',
  'Azure Blob Storage': 'Cloud',
  'Google Cloud Storage': 'Cloud',
  'SharePoint': 'Cloud',
  'OneDrive': 'Cloud',
  'Google Drive': 'Cloud',
  'SFTP': 'Server',
  'FTP': 'Server',
  'WebDAV': 'Server',
  
  // Data taps
  'PostgreSQL Tap': 'Database',
  'MySQL Tap': 'Database',
  'SQL Server Tap': 'Database',
  'MongoDB Tap': 'Database',
  'Oracle Tap': 'Database',
  'Snowflake Tap': 'Snowflake',
  'Salesforce Tap': 'Cloud',
  'HubSpot Tap': 'Hexagon',
  'Google Analytics Tap': 'BarChart',
  'Stripe Tap': 'CreditCard',
  'CSV Tap': 'FileSpreadsheet',
  'JSON Tap': 'Braces',
  'S3 Tap': 'Cloud',
  'REST API Tap': 'Globe',
  'GraphQL Tap': 'GitGraph',
  
  // Data targets
  'PostgreSQL Target': 'Database',
  'Snowflake Target': 'Snowflake',
  'BigQuery Target': 'Database',
  'S3 Target': 'Cloud',
  'CSV Target': 'FileSpreadsheet',
  'Excel Target': 'FileSpreadsheet',
  
  // Files
  'Watch Folder': 'Eye',
  
  // Voice
  'Speak': 'Volume2',
  'Listen': 'Mic',
  'Conversation': 'MessageCircle',
};

// ID-based fallbacks
const idToIcon = {
  'bot-call': 'Play',
  'bot-input': 'ArrowDownToLine',
  'bot-output': 'ArrowUpFromLine',
  'bot-queue': 'ListOrdered',
  'bot-map': 'Shuffle',
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
  'data-tap-postgres': 'Database',
  'data-tap-mysql': 'Database',
  'data-tap-mssql': 'Database',
  'data-tap-mongodb': 'Database',
  'data-tap-oracle': 'Database',
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
  'files-watch': 'Eye',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  let count = 0;

  // Match NodeHeader with inline SVG (without class) - handles both with and without id
  // Pattern 1: With id
  const regexWithId = /<NodeHeader\s+id="([^"]+)"\s+icon=\{`\s*<svg[^>]*>[\s\S]*?<\/svg>\s*`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/g;
  
  content = content.replace(regexWithId, (match, id, label, description, bgColor, textColor) => {
    // Skip if already processed (has lucide class that was captured before)
    if (match.includes('class="lucide')) return match;
    
    count++;
    modified = true;
    
    let iconName = idToIcon[id] || labelToIcon[label];
    
    if (!iconName) {
      // Try partial match on label
      for (const [lbl, icon] of Object.entries(labelToIcon)) {
        if (label.toLowerCase().includes(lbl.toLowerCase()) || lbl.toLowerCase().includes(label.toLowerCase())) {
          iconName = icon;
          break;
        }
      }
    }
    
    if (!iconName) {
      iconName = 'Circle'; // Fallback
      console.log(`  WARNING: No icon found for id="${id}" label="${label}", using Circle`);
    }
    
    console.log(`  ${id}: ${label} -> ${iconName}`);
    return `<NodeHeader id="${id}" icon="${iconName}" label="${label}" description="${description}" bgColor="${bgColor}" textColor="${textColor}" />`;
  });

  // Pattern 2: Without id
  const regexWithoutId = /<NodeHeader\s+icon=\{`\s*<svg[^>]*>[\s\S]*?<\/svg>\s*`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/g;
  
  content = content.replace(regexWithoutId, (match, label, description, bgColor, textColor) => {
    count++;
    modified = true;
    
    let iconName = labelToIcon[label];
    
    if (!iconName) {
      // Try partial match
      for (const [lbl, icon] of Object.entries(labelToIcon)) {
        if (label.toLowerCase().includes(lbl.toLowerCase()) || lbl.toLowerCase().includes(label.toLowerCase())) {
          iconName = icon;
          break;
        }
      }
    }
    
    // Generate ID from label
    const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    if (!iconName) {
      iconName = 'Circle';
      console.log(`  WARNING: No icon found for label="${label}", using Circle`);
    }
    
    console.log(`  (no id) ${label} -> ${iconName}`);
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

console.log('Replacing remaining inline SVGs...\n');

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
      } else {
        console.log(`  - No matches\n`);
      }
    }
  }
}

console.log(`\nDone! Fixed ${totalFixed} total SVGs.`);


