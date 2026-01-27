#!/usr/bin/env node
/**
 * Script to fix all NodeHeader icons in documentation pages
 * Extracts icon mappings directly from nodeTemplates.ts
 */

const fs = require('fs');
const path = require('path');

// Read nodeTemplates.ts and extract type -> icon mappings
const nodeTemplatesPath = path.join(__dirname, '../../studio/src/data/nodeTemplates.ts');
const nodeTemplatesContent = fs.readFileSync(nodeTemplatesPath, 'utf-8');

// Extract all type/icon pairs using regex
const iconMappings = {};
const nodeRegex = /type:\s*"([^"]+)"[\s\S]*?icon:\s*"([^"]+)"/g;
let match;

while ((match = nodeRegex.exec(nodeTemplatesContent)) !== null) {
  const nodeType = match[1];
  const iconName = match[2];
  // Only keep actual node types (format: category.action)
  if (nodeType.includes('.') && !nodeType.startsWith('text') && !nodeType.startsWith('select')) {
    iconMappings[nodeType] = iconName;
  }
}

console.log(`Found ${Object.keys(iconMappings).length} node type -> icon mappings\n`);

// Function to convert doc ID to possible node types
function idToPossibleTypes(id) {
  // web-open_browser -> web.open_browser
  // ai-extract.data -> ai.extract_data
  const types = [];
  
  // Standard conversion: replace first - with . and keep _
  const standard = id.replace(/-/, '.').replace(/\./g, (m, i) => i === id.indexOf('-') ? '.' : '_');
  types.push(standard);
  
  // Also try: replace all - with . (for docs that use - instead of _)
  types.push(id.replace(/-/g, '.'));
  
  // Also try: replace - with . and . with _
  const alt = id.replace(/-/, '.').replace(/\./g, '_').replace('_', '.');
  types.push(alt);
  
  // Direct mapping for edge cases
  const cleaned = id.replace(/-/g, '.');
  types.push(cleaned);
  
  return [...new Set(types)];
}

// Process a single MDX file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  let changes = [];
  
  // Match NodeHeader with inline SVG (multi-line)
  const nodeHeaderRegex = /<NodeHeader\s+id="([^"]+)"\s+icon=\{`[\s\S]*?`\}\s+label="([^"]+)"\s+description="([^"]+)"\s+bgColor="([^"]+)"\s+textColor="([^"]+)"\s*\/>/g;
  
  content = content.replace(nodeHeaderRegex, (match, id, label, description, bgColor, textColor) => {
    const possibleTypes = idToPossibleTypes(id);
    
    // Find matching icon
    let iconName = null;
    let matchedType = null;
    for (const type of possibleTypes) {
      if (iconMappings[type]) {
        iconName = iconMappings[type];
        matchedType = type;
        break;
      }
    }
    
    if (iconName) {
      modified = true;
      changes.push(`  ${id} -> ${iconName} (via ${matchedType})`);
      return `<NodeHeader id="${id}" icon="${iconName}" label="${label}" description="${description}" bgColor="${bgColor}" textColor="${textColor}" />`;
    }
    
    // Try to find by label match
    for (const [type, icon] of Object.entries(iconMappings)) {
      const typeLabel = type.split('.').pop().replace(/_/g, ' ');
      if (label.toLowerCase().includes(typeLabel) || typeLabel.includes(label.toLowerCase())) {
        iconName = icon;
        matchedType = type;
        break;
      }
    }
    
    if (iconName) {
      modified = true;
      changes.push(`  ${id} -> ${iconName} (via label match: ${matchedType})`);
      return `<NodeHeader id="${id}" icon="${iconName}" label="${label}" description="${description}" bgColor="${bgColor}" textColor="${textColor}" />`;
    }
    
    console.log(`  Warning: No icon for ID "${id}" (tried: ${possibleTypes.join(', ')})`);
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    changes.forEach(c => console.log(c));
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
      console.log(`  ✓ Updated\n`);
    } else {
      console.log(`  - No SVG icons to replace\n`);
    }
  }
}

console.log(`\nDone! Updated ${updatedCount} files.`);

// Print icon mappings for reference
console.log('\n--- Icon Mappings Reference ---');
const categories = {};
for (const [type, icon] of Object.entries(iconMappings)) {
  const cat = type.split('.')[0];
  if (!categories[cat]) categories[cat] = [];
  categories[cat].push({ type, icon });
}

for (const [cat, nodes] of Object.entries(categories).sort()) {
  console.log(`\n${cat.toUpperCase()}:`);
  nodes.forEach(n => console.log(`  ${n.type} -> ${n.icon}`));
}


