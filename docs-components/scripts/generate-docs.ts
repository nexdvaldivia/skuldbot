#!/usr/bin/env node

/**
 * Documentation Generator for SkuldBot Components
 *
 * Reads nodeTemplates.ts from the Studio and generates:
 * 1. nodes.json - Consolidated node metadata
 * 2. MDX pages for each category with icons and rich examples
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as lucideStatic from 'lucide-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to nodeTemplates.ts
const NODE_TEMPLATES_PATH = path.join(__dirname, '../../studio/src/data/nodeTemplates.ts');
const OUTPUT_DIR = path.join(__dirname, '../src/app/components');
const NODES_JSON_PATH = path.join(__dirname, '../src/data/nodes.json');

interface ConfigField {
  name: string;
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface OutputField {
  name: string;
  type: string;
  description: string;
}

interface NodeTemplate {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  configSchema: ConfigField[];
  outputSchema: OutputField[];
}

// Category metadata for nice display
const CATEGORY_META: Record<string, {
  title: string;
  description: string;
  icon: string;
  useCases: string[];
  relatedCategories: string[];
}> = {
  trigger: {
    title: 'Triggers',
    description: 'Components that start your automation workflow. Every workflow needs at least one trigger.',
    icon: 'Zap',
    useCases: [
      'Start workflows on schedule',
      'React to file changes or emails',
      'Process incoming webhooks',
      'Accept form submissions'
    ],
    relatedCategories: ['control', 'logging']
  },
  control: {
    title: 'Control Flow',
    description: 'Components for controlling the flow of your automation. Build complex logic with conditionals, loops, and error handling.',
    icon: 'GitBranch',
    useCases: [
      'Branch logic based on conditions',
      'Iterate over data collections',
      'Handle errors gracefully',
      'Add delays between operations'
    ],
    relatedCategories: ['trigger', 'logging', 'data']
  },
  logging: {
    title: 'Logging',
    description: 'Components for logging, debugging, and monitoring your automation workflows.',
    icon: 'FileText',
    useCases: [
      'Debug workflow execution',
      'Track progress and metrics',
      'Send alerts and notifications',
      'Create audit trails'
    ],
    relatedCategories: ['control', 'email']
  },
  web: {
    title: 'Web Automation',
    description: 'Components for browser automation. Automate any website - click buttons, fill forms, extract data.',
    icon: 'Globe',
    useCases: [
      'Scrape data from websites',
      'Automate form submissions',
      'Download files from web portals',
      'Take screenshots for documentation'
    ],
    relatedCategories: ['api', 'data', 'files']
  },
  desktop: {
    title: 'Desktop Automation',
    description: 'Components for desktop application automation. Control Windows applications, manage windows, simulate keyboard and mouse.',
    icon: 'Monitor',
    useCases: [
      'Automate legacy desktop apps',
      'Control SAP, Oracle, or custom apps',
      'Interact with Windows dialogs',
      'Manage multiple windows'
    ],
    relatedCategories: ['web', 'files', 'excel']
  },
  files: {
    title: 'File Operations',
    description: 'Components for reading, writing, and managing files on the filesystem.',
    icon: 'Folder',
    useCases: [
      'Read and write text files',
      'Process CSV data',
      'Manage directories',
      'Copy, move, and delete files'
    ],
    relatedCategories: ['excel', 'document', 'data']
  },
  excel: {
    title: 'Excel',
    description: 'Components for reading, writing, and manipulating Excel spreadsheets. Full support for formulas, formatting, and multiple sheets.',
    icon: 'Table',
    useCases: [
      'Read data from Excel reports',
      'Generate Excel reports',
      'Update existing spreadsheets',
      'Work with multiple sheets'
    ],
    relatedCategories: ['files', 'data', 'database']
  },
  email: {
    title: 'Email',
    description: 'Components for sending and receiving emails via SMTP/IMAP. Support for attachments and HTML templates.',
    icon: 'Mail',
    useCases: [
      'Send notification emails',
      'Process incoming emails',
      'Extract email attachments',
      'Send reports with HTML formatting'
    ],
    relatedCategories: ['files', 'logging', 'trigger']
  },
  api: {
    title: 'API / HTTP',
    description: 'Components for making HTTP requests and working with REST/GraphQL APIs. Full support for authentication and headers.',
    icon: 'Cloud',
    useCases: [
      'Integrate with REST APIs',
      'Call GraphQL endpoints',
      'Authenticate with OAuth2',
      'Parse JSON responses'
    ],
    relatedCategories: ['data', 'database', 'web']
  },
  database: {
    title: 'Database',
    description: 'Components for connecting to and querying databases. Support for PostgreSQL, MySQL, SQL Server, MongoDB, and more.',
    icon: 'Database',
    useCases: [
      'Query relational databases',
      'Insert and update records',
      'Work with MongoDB documents',
      'Execute stored procedures'
    ],
    relatedCategories: ['api', 'data', 'excel']
  },
  document: {
    title: 'Document Processing',
    description: 'Components for processing documents with OCR, PDF extraction, and intelligent parsing.',
    icon: 'FileSearch',
    useCases: [
      'Extract text from PDFs',
      'OCR scanned documents',
      'Parse invoices and receipts',
      'Generate PDF reports'
    ],
    relatedCategories: ['ai', 'files', 'data']
  },
  ai: {
    title: 'AI / LLM',
    description: 'Components for integrating AI and Large Language Models. Support for OpenAI, Anthropic Claude, and local models.',
    icon: 'Brain',
    useCases: [
      'Generate text with GPT/Claude',
      'Extract structured data from documents',
      'Classify and categorize content',
      'Summarize long documents'
    ],
    relatedCategories: ['document', 'data', 'voice']
  },
  python: {
    title: 'Python',
    description: 'Components for running Python scripts and projects within your automation. Full access to Python ecosystem.',
    icon: 'Code',
    useCases: [
      'Run custom Python scripts',
      'Use specialized Python libraries',
      'Complex data transformations',
      'Machine learning operations'
    ],
    relatedCategories: ['data', 'ai', 'api']
  },
  voice: {
    title: 'Voice',
    description: 'Components for text-to-speech, speech recognition, and voice interactions.',
    icon: 'Mic',
    useCases: [
      'Convert text to audio',
      'Transcribe audio files',
      'Build voice assistants',
      'Generate audio reports'
    ],
    relatedCategories: ['ai', 'files', 'api']
  },
  data: {
    title: 'Data Transform',
    description: 'Components for transforming, mapping, and manipulating data. JSON, XML, CSV parsing and generation.',
    icon: 'Shuffle',
    useCases: [
      'Parse JSON and XML',
      'Transform data structures',
      'Filter and aggregate data',
      'Format dates and numbers'
    ],
    relatedCategories: ['api', 'database', 'excel']
  },
  compliance: {
    title: 'Compliance',
    description: 'Components for ensuring regulatory compliance (HIPAA, SOC2, GDPR, etc.).',
    icon: 'Shield',
    useCases: [
      'Audit data access',
      'Mask sensitive information',
      'Validate compliance rules',
      'Generate compliance reports'
    ],
    relatedCategories: ['security', 'dataquality', 'logging']
  },
  dataquality: {
    title: 'Data Quality',
    description: 'Components for validating and ensuring data quality in your workflows.',
    icon: 'CheckCircle',
    useCases: [
      'Validate data formats',
      'Check for duplicates',
      'Enforce business rules',
      'Clean and standardize data'
    ],
    relatedCategories: ['data', 'compliance', 'database']
  },
  security: {
    title: 'Security & Secrets',
    description: 'Components for security operations like encryption, hashing, and secrets management.',
    icon: 'Lock',
    useCases: [
      'Encrypt sensitive data',
      'Manage API keys securely',
      'Hash passwords',
      'Generate secure tokens'
    ],
    relatedCategories: ['compliance', 'api', 'database']
  },
  human: {
    title: 'Human in Loop',
    description: 'Components for human approval, review, and intervention in automated workflows.',
    icon: 'User',
    useCases: [
      'Request human approval',
      'Review AI decisions',
      'Escalate exceptions',
      'Collect human input'
    ],
    relatedCategories: ['control', 'email', 'logging']
  },
  insurance: {
    title: 'Insurance',
    description: 'Components specific to insurance workflows like FNOL processing, claims management, and policy handling.',
    icon: 'FileCheck',
    useCases: [
      'Process first notice of loss',
      'Validate policy information',
      'Calculate premiums',
      'Handle claims workflow'
    ],
    relatedCategories: ['document', 'ai', 'compliance']
  }
};

// Category colors from design-tokens.ts (hex values for CSS)
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  trigger: { bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },     // emerald
  web: { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },         // blue
  desktop: { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' },     // indigo
  files: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },       // orange
  excel: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },       // green
  email: { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },       // pink
  api: { bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },         // emerald
  database: { bg: '#cffafe', text: '#0e7490', border: '#a5f3fc' },    // cyan
  document: { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },    // red
  ai: { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },          // violet
  python: { bg: '#fef9c3', text: '#a16207', border: '#fef08a' },      // yellow
  control: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },     // slate
  logging: { bg: '#f4f4f5', text: '#52525b', border: '#e4e4e7' },     // zinc
  security: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },    // amber
  human: { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' },       // teal
  compliance: { bg: '#ffe4e6', text: '#be123c', border: '#fecdd3' },  // rose
  dataquality: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' }, // sky
  data: { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' },        // teal
  voice: { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },       // violet
  insurance: { bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },   // emerald
};

// Lucide icon to SVG path mapping - all icons used in nodeTemplates.ts
const ICON_PATHS: Record<string, string> = {
  // Category icons
  Zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  GitBranch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  FileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  Globe: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  Monitor: 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  Folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  FolderOpen: 'M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
  Table: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  Table2: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  Mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
  Cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  Database: 'M21 5c0 1.657-4.03 3-9 3S3 6.657 3 5m18 0c0-1.657-4.03-3-9-3S3 3.343 3 5m18 0v14c0 1.66-4 3-9 3s-9-1.34-9-3V5m18 7c0 1.66-4 3-9 3s-9-1.34-9-3',
  FileSearch: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M11.5 14.5 15 18M9.5 12.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  Brain: 'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z M12 5v13 M10 17.5c-2.5 0-5-1.5-5-5 M14 17.5c2.5 0 5-1.5 5-5',
  Code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  Code2: 'M17 17l5-5-5-5M7 7l-5 5 5 5',
  Mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  Shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  Shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  ShieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  ShieldAlert: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  BadgeCheck: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76zM9 12l2 2 4-4',
  CheckCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  Lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  Unlock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1',
  Key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  KeyRound: 'M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4zM16.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  User: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  UserCheck: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4',
  FileCheck: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4',
  FileWarning: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 11v4M12 19h.01',
  ScrollText: 'M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4M19 17V5a2 2 0 0 0-2-2H4',
  Sparkles: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0zM20 3v4M22 5h-4M4 17v2M5 18H3',
  Webhook: 'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M9 10a4 4 0 0 1 8 0c0 .7-.2 1.4-.57 2M15 17.02c.21-.19.44-.36.68-.5a4 4 0 1 1 3.89 6.48',
  // Component-specific icons
  Eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  EyeOff: 'M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20',
  MailOpen: 'M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6zM22 10l-8.97 5.7a2 2 0 0 1-2.06 0L2 10',
  ListOrdered: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  Play: 'M5 3l14 9-14 9V3z',
  RefreshCw: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  DatabaseZap: 'M4 6c0 1.657 3.582 3 8 3s8-1.343 8-3-3.582-3-8-3-8 1.343-8 3zM4 6v6M4 12c0 1.66 3.582 3 8 3M20 12V6M15 11v7l3-2 3 2v-7',
  DatabaseBackup: 'M12 8a2 2 0 0 0 2-2V4a2 2 0 0 0-4 0v2a2 2 0 0 0 2 2zM3 12v8c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z',
  HardDrive: 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01',
  Radio: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  MessageCircle: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  MessageSquare: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  MessageSquarePlus: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v6M9 10h6',
  ExternalLink: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  MousePointer: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3zM13 13l6 6',
  MousePointer2: 'M21 11l-8.27 8.27a2.5 2.5 0 0 1-3.54 0l-4.95-4.95a2.5 2.5 0 0 1 0-3.54L12.51 3M3 3l8 8',
  Type: 'M4 7V4h16v3M9 20h6M12 4v16',
  ChevronDown: 'M6 9l6 6 6-6',
  TextCursor: 'M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1M7 22h1a4 4 0 0 0 4-4V6a4 4 0 0 0-4-4H7M5 12h14',
  Box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  Tag: 'M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2zM7 7h.01',
  Tags: 'M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5zM6 9.01V9M15 5s2 0 2 2v3M22 12l-4.67 4.67a2.424 2.424 0 0 1-3.43 0L9 11.77',
  Camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  Clock: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  Timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  TimerOff: 'M10 2h4M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2M2 2l20 20M12 12v-2',
  ArrowDown: 'M12 5v14M19 12l-7 7-7-7',
  ArrowUpDown: 'M7 15l5 5 5-5M7 9l5-5 5 5',
  ArrowDownToLine: 'M12 17V3M6 11l6 6 6-6M19 21H5',
  ArrowUpToLine: 'M12 7v14M18 13l-6-6-6 6M5 3h14',
  AlertCircle: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01',
  AlertTriangle: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  Bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  X: 'M18 6L6 18M6 6l12 12',
  Download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  Upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  AppWindow: 'M2 8h20M5 4.5v-.01M8 4.5v-.01M11 4.5v-.01M2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6z',
  Keyboard: 'M2 6h20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8',
  Command: 'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3',
  Square: 'M3 3h18v18H3V3z',
  Minus: 'M5 12h14',
  Plus: 'M12 5v14M5 12h14',
  Maximize2: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  XSquare: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 9l6 6M15 9l-6 6',
  Image: 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  ScanSearch: 'M10.5 20H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6.5M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM22 22l-3-3',
  ScanLine: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  Copy: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  FileInput: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15l3 3 3-3',
  FileOutput: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 12v6M9 18l3-3 3 3',
  FileCode: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2',
  FileDown: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15l3 3 3-3',
  FileEdit: 'M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5M14 2v6h6M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l1-3.95 5.42-5.44z',
  FilePlus: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6',
  FilePlus2: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M12 10v6',
  FileSpreadsheet: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h2M14 13h2M8 17h2M14 17h2',
  FileType: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M13 21v-4M9 21v-4',
  FileType2: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13v5h4v-5M9 14h4',
  FileBarChart: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 18v-4M12 18v-6M16 18v-8',
  FolderInput: 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H11M2 13h10M9 16l3-3-3-3',
  FolderTree: 'M2 16h20M9 5h11a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 3v18M2 12h5M2 6h5',
  FolderCode: 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7zM10 13l-2 2 2 2M14 17l2-2-2-2',
  Trash2: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  FolderPlus: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2zM12 10v6M9 13h6',
  FolderArchive: 'M22 20V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2zM14 13h-4M12 10v6',
  Archive: 'M3 4h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8zM10 12h4',
  PenLine: 'M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  PenTool: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  Edit3: 'M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  ListPlus: 'M11 12H3M16 6H3M16 18H3M18 9v6M21 12h-6',
  Filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  Save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  PieChart: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  BarChart3: 'M12 20V10M18 20V4M6 20v-4',
  LineChart: 'M3 3v18h18M19 9l-5 5-4-4-3 3',
  Layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  RowsIcon: 'M3 3h18v6H3V3zM3 15h18v6H3v-6z',
  Columns: 'M3 3h6v18H3V3zM15 3h6v18h-6V3z',
  PaintBucket: 'M19 11h-6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zM5 2l5 5-5 5M22 22l-2-2M5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  Merge: 'M8 6l4-4 4 4M4 22l4-4-4-4M20 22l-4-4 4-4M12 2v12a4 4 0 0 1-4 4H4M12 14a4 4 0 0 0 4 4h4',
  SearchCode: 'M9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM10.5 8.5l-1 1M13.5 8.5l1 1M12 10v.5M7.2 2h9.6c1.7 0 2.5.8 2.5 2.5v1.3M7.2 2c-1.7 0-2.5.8-2.5 2.5v15c0 1.7.8 2.5 2.5 2.5h9.6c1.7 0 2.5-.8 2.5-2.5v-6',
  Search: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  Send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  Reply: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  Forward: 'M21 15a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12l4 4z',
  Paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  Server: 'M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zM2 15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4zM6 7h.01M6 17h.01',
  ServerCog: 'M5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1M5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-1M6 6h.01M6 18h.01M12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  Inbox: 'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  Braces: 'M4 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2M20 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2M8 6h.01M8 18h.01M16 6h.01M16 18h.01M12 6h.01M12 18h.01',
  GitFork: 'M6 3v6M18 3v6M6 21v-6M18 21v-6M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 15a9 9 0 0 0 12 0',
  GitMerge: 'M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v12M18 15V9c0-3-2-3-6-3',
  Repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  Variable: 'M8 21s-4-3-4-9 4-9 4-9M16 3s4 3 4 9-4 9-4 9M15 9l-6 6M9 9l6 6',
  StopCircle: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9 9h6v6H9V9z',
  CornerRightDown: 'M10 15l5 5 5-5M15 20V4H4',
  Combine: 'M10 18H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3M10 22h9a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-9a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3z',
  ClipboardList: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12h4M12 16h4M8 12h.01M8 16h.01',
  ClipboardCheck: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4',
  Hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  Binary: 'M6 20h4M14 10h4M6 14h2v6M14 4h2v6M6 4h4v6H6V4zM14 14h4v6h-4v-6z',
  Wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  Lightbulb: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4',
  Package: 'M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  Import: 'M12 3v12M19 9l-7 7-7-7M5 21h14',
  BookOpen: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2V3zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7V3z',
  Calculator: 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M8 16h.01M16 16h.01M12 12h.01',
  SquareStack: 'M4 10h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM6 6h12a2 2 0 0 1 2 2v8M10 2h12a2 2 0 0 1 2 2v8',
  Scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12',
  CircleDot: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  Volume2: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07',
  HeartPulse: 'M19.5 12.572l-7.5 7.428-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.572zM5 12h2l2-4 4 8 2-4h4',
  Snowflake: 'M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4',
  CloudUpload: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9M8 17l4-4 4 4',
  Phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  PhoneIncoming: 'M16 2v6h6M23 1l-7 7M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  PhoneOutgoing: 'M22 8V2h-6M22 2l-7 7M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  PhoneForwarded: 'M18 2l4 4-4 4M22 6H14M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  PhoneOff: 'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91M23 1L1 23',
  Bot: 'M12 8V4H8M8 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 18v4M15 18v4M2 8h4M18 8h4M9 8h.01M15 8h.01',
  Languages: 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6',
  ThumbsUp: 'M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z',
  AlignLeft: 'M21 6H3M15 12H3M17 18H3',
  Check: 'M20 6L9 17l-5-5',
};

function parseNodeTemplates(): NodeTemplate[] {
  const content = fs.readFileSync(NODE_TEMPLATES_PATH, 'utf-8');
  const nodes: NodeTemplate[] = [];

  let i = 0;
  const len = content.length;

  while (i < len) {
    const typeMatch = content.slice(i).match(/{\s*type:\s*"([^"]+)"/);
    if (!typeMatch) break;

    const objStart = i + content.slice(i).indexOf('{');
    const nodeType = typeMatch[1];

    let braceCount = 1;
    let j = objStart + 1;
    while (braceCount > 0 && j < len) {
      if (content[j] === '{') braceCount++;
      if (content[j] === '}') braceCount--;
      j++;
    }

    const objStr = content.substring(objStart, j);

    const categoryMatch = objStr.match(/category:\s*"([^"]+)"/);
    const labelMatch = objStr.match(/label:\s*"([^"]+)"/);
    const descMatch = objStr.match(/description:\s*"([^"]+)"/);
    const iconMatch = objStr.match(/icon:\s*"([^"]+)"/);

    if (categoryMatch && labelMatch && descMatch) {
      const node: NodeTemplate = {
        type: nodeType,
        category: categoryMatch[1],
        label: labelMatch[1],
        description: descMatch[1],
        icon: iconMatch ? iconMatch[1] : 'Box',
        configSchema: [],
        outputSchema: []
      };

      // Extract configSchema array
      const configStart = objStr.indexOf('configSchema:');
      if (configStart !== -1) {
        const configArrayStart = objStr.indexOf('[', configStart);
        if (configArrayStart !== -1) {
          let bracketCount = 1;
          let k = configArrayStart + 1;
          while (bracketCount > 0 && k < objStr.length) {
            if (objStr[k] === '[') bracketCount++;
            if (objStr[k] === ']') bracketCount--;
            k++;
          }
          const configArrayStr = objStr.substring(configArrayStart, k);

          const fieldRegex = /{\s*name:\s*"([^"]+)"[^}]*label:\s*"([^"]+)"[^}]*type:\s*"([^"]+)"[^}]*}/g;
          let fieldMatch;
          while ((fieldMatch = fieldRegex.exec(configArrayStr)) !== null) {
            const required = fieldMatch[0].includes('required: true');
            const placeholderMatch = fieldMatch[0].match(/placeholder:\s*"([^"]*)"/);
            const defaultMatch = fieldMatch[0].match(/default:\s*(?:"([^"]*)"|(\d+)|(\w+))/);
            node.configSchema.push({
              name: fieldMatch[1],
              label: fieldMatch[2],
              type: fieldMatch[3],
              required,
              placeholder: placeholderMatch ? placeholderMatch[1] : undefined,
              default: defaultMatch ? (defaultMatch[1] || defaultMatch[2] || defaultMatch[3]) : undefined
            });
          }
        }
      }

      // Extract outputSchema array
      const outputStart = objStr.indexOf('outputSchema:');
      if (outputStart !== -1) {
        const outputArrayStart = objStr.indexOf('[', outputStart);
        if (outputArrayStart !== -1) {
          let bracketCount = 1;
          let k = outputArrayStart + 1;
          while (bracketCount > 0 && k < objStr.length) {
            if (objStr[k] === '[') bracketCount++;
            if (objStr[k] === ']') bracketCount--;
            k++;
          }
          const outputArrayStr = objStr.substring(outputArrayStart, k);

          const outFieldRegex = /{\s*name:\s*"([^"]+)"[^}]*type:\s*"([^"]+)"[^}]*description:\s*"([^"]+)"/g;
          let outMatch;
          while ((outMatch = outFieldRegex.exec(outputArrayStr)) !== null) {
            node.outputSchema.push({
              name: outMatch[1],
              type: outMatch[2],
              description: outMatch[3]
            });
          }
        }
      }

      nodes.push(node);
    }

    i = j;
  }

  return nodes;
}

function escapeForMdx(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

function getIconSvg(iconName: string): string {
  // lucide-static exports icons with PascalCase keys (e.g., "FileText", "Phone", "Mic")
  // Try the icon name directly first
  let iconSvg = (lucideStatic as any)[iconName];

  if (iconSvg) {
    return iconSvg;
  }

  // Fallback to Box icon (note: PascalCase)
  return (lucideStatic as any)['Box'] || '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
}

// Prerequisites and setup guides for components that need external configuration
const COMPONENT_PREREQUISITES: Record<string, {
  prerequisites: string[];
  setupGuide?: string;
}> = {
  // AI components
  'ai.generate_text': {
    prerequisites: [
      'API key from OpenAI, Anthropic, or Azure OpenAI',
      'API endpoint configured in Orchestrator secrets'
    ],
    setupGuide: `
<Collapsible title="Configure OpenAI">

1. Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. In Orchestrator, go to **Settings > Secrets**
3. Add a new secret with Name: \`openai_api_key\` and Value: Your API key
4. Reference in workflows: \`\${vault.openai_api_key}\`

</Collapsible>

<Collapsible title="Configure Azure OpenAI">

1. Create an Azure OpenAI resource in Azure Portal
2. Deploy a model (e.g., gpt-4, gpt-35-turbo)
3. Get your endpoint and key from **Keys and Endpoint**
4. In Orchestrator secrets, add: \`azure_openai_endpoint\`, \`azure_openai_key\`, \`azure_openai_deployment\`
5. In the component config, set provider to \`azure\` and configure endpoint and deployment

</Collapsible>

<Collapsible title="Configure Anthropic Claude">

1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Add to Orchestrator secrets as \`anthropic_api_key\`
3. In config, set \`provider: "anthropic"\` and \`model: "claude-3-opus"\`

</Collapsible>
`
  },
  'ai.extract_structured': {
    prerequisites: [
      'Configured AI provider (OpenAI, Azure, or Anthropic)',
      'JSON schema for the data you want to extract'
    ],
    setupGuide: `
<Collapsible title="Define Extraction Schema">

The schema defines what data to extract. For invoices, define fields like: \`vendor\` (string), \`invoice_number\` (string), \`date\` (date in YYYY-MM-DD format), \`line_items\` (array with description, quantity, unit_price), and \`total\` (number).

</Collapsible>
`
  },

  // Database components
  'database.query': {
    prerequisites: [
      'Database connection configured in Orchestrator',
      'Network access to database server',
      'Database user with appropriate permissions'
    ],
    setupGuide: `
<Collapsible title="Configure PostgreSQL Connection">

1. In Orchestrator, go to **Connections > Database**
2. Click **Add Connection** and fill in:
   - **Name**: \`postgres-main\` (use this in your workflows)
   - **Type**: PostgreSQL
   - **Host**: \`db.example.com\`
   - **Port**: \`5432\`
   - **Database**: \`myapp\`
   - **Username**: \`bot_user\`
   - **Password**: Store in Secrets as \`db_password\`
3. Test the connection before saving

</Collapsible>

<Collapsible title="Configure MySQL Connection">

1. Add connection with Type: MySQL
2. Default port: \`3306\`
3. For SSL, enable "Use SSL" and upload certificates if required

</Collapsible>

<Collapsible title="Configure SQL Server Connection">

1. Add connection with Type: SQL Server
2. Default port: \`1433\`
3. For Windows Auth, use: \`Server=host;Database=db;Trusted_Connection=True;\`

</Collapsible>
`
  },
  'database.mongodb_query': {
    prerequisites: [
      'MongoDB connection string',
      'Network access to MongoDB cluster'
    ],
    setupGuide: `
<Collapsible title="Configure MongoDB Connection">

1. Get your connection string from MongoDB Atlas or your server
2. Format: \`mongodb+srv://user:password@cluster.mongodb.net/database\`
3. In Orchestrator Connections:
   - Name: \`mongodb-main\`
   - Connection String: Use Secrets for password
4. Example: \`mongodb+srv://\${vault.mongo_user}:\${vault.mongo_pass}@cluster0.abc123.mongodb.net/mydb\`

</Collapsible>
`
  },

  // Email components
  'email.send': {
    prerequisites: [
      'SMTP server credentials',
      'Network access to SMTP server (port 587 or 465)'
    ],
    setupGuide: `
<Collapsible title="Configure Gmail SMTP">

1. Enable 2FA on your Google account
2. Generate an App Password: Google Account > Security > App Passwords
3. SMTP Settings:
   - Host: \`smtp.gmail.com\`
   - Port: \`587\` (TLS) or \`465\` (SSL)
   - Username: Your Gmail address
   - Password: The App Password (not your regular password)

</Collapsible>

<Collapsible title="Configure Microsoft 365 SMTP">

1. Enable SMTP AUTH for the mailbox in Microsoft 365 admin
2. SMTP Settings:
   - Host: \`smtp.office365.com\`
   - Port: \`587\`
   - Username: Full email address
   - Password: Account password or App Password

</Collapsible>

<Collapsible title="Configure SendGrid">

1. Create an API key in SendGrid dashboard
2. SMTP Settings:
   - Host: \`smtp.sendgrid.net\`
   - Port: \`587\`
   - Username: \`apikey\` (literal text)
   - Password: Your SendGrid API key

</Collapsible>
`
  },
  'email.read': {
    prerequisites: [
      'IMAP server credentials',
      'Network access to IMAP server (port 993)'
    ],
    setupGuide: `
<Collapsible title="Configure Gmail IMAP">

1. Enable IMAP in Gmail settings
2. Use App Password (not regular password)
3. IMAP Settings:
   - Host: \`imap.gmail.com\`
   - Port: \`993\`
   - SSL: Enabled

</Collapsible>

<Collapsible title="Configure Microsoft 365 IMAP">

1. IMAP Settings:
   - Host: \`outlook.office365.com\`
   - Port: \`993\`
   - SSL: Enabled
   - For modern auth, use OAuth2 token

</Collapsible>
`
  },

  // API components
  'api.http_request': {
    prerequisites: [
      'API endpoint URL',
      'Authentication credentials (API key, OAuth, etc.)'
    ],
    setupGuide: `
<Collapsible title="Configure API Authentication">

**Bearer Token:** Add header \`Authorization: Bearer \${vault.api_token}\`

**API Key:** Add header \`X-API-Key: \${vault.api_key}\`

**Basic Auth:** Configure auth type as \`basic\` with \`\${vault.api_user}\` and \`\${vault.api_pass}\`

</Collapsible>
`
  },
  'api.oauth2_token': {
    prerequisites: [
      'OAuth2 client credentials (client_id, client_secret)',
      'Token endpoint URL'
    ],
    setupGuide: `
<Collapsible title="Configure OAuth2 Client Credentials">

1. Register your application with the API provider
2. Get Client ID and Client Secret
3. Store in Orchestrator Secrets:
   - \`oauth_client_id\`
   - \`oauth_client_secret\`
4. Common token endpoints:
   - Microsoft: \`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token\`
   - Google: \`https://oauth2.googleapis.com/token\`
   - Salesforce: \`https://login.salesforce.com/services/oauth2/token\`

</Collapsible>
`
  },

  // Web components
  'web.open_browser': {
    prerequisites: [
      'Browser driver installed (automatic with SkuldBot)',
      'Network access to target website'
    ],
    setupGuide: `
<Collapsible title="Browser Options">

**Headless Mode:** Set \`headless: true\` to run without visible window (faster, ideal for servers)

**Proxy:** Configure \`proxy.server\`, \`proxy.username\`, and \`proxy.password\` using vault secrets

**Custom User Agent:** Set \`userAgent\` to a custom browser identification string

</Collapsible>
`
  },

  // Voice components
  'voice.text_to_speech': {
    prerequisites: [
      'Text-to-speech provider API key (Azure, AWS, Google, or ElevenLabs)',
    ],
    setupGuide: `
<Collapsible title="Configure Azure Speech">

1. Create a Speech resource in Azure Portal
2. Get key and region from Keys and Endpoint
3. Add to secrets: \`azure_speech_key\`, \`azure_speech_region\`
4. Voices: \`es-MX-DaliaNeural\`, \`en-US-JennyNeural\`, etc.

</Collapsible>

<Collapsible title="Configure ElevenLabs">

1. Get API key from ElevenLabs dashboard
2. Add to secrets as \`elevenlabs_key\`
3. Get voice_id from Voice Library
4. High-quality, natural sounding voices

</Collapsible>
`
  },
  'voice.speech_to_text': {
    prerequisites: [
      'Speech recognition provider API key',
      'Audio file in supported format (WAV, MP3, M4A)'
    ],
    setupGuide: `
<Collapsible title="Configure Whisper (OpenAI)">

Uses your OpenAI API key with \`provider: "openai"\` and \`model: "whisper-1"\`. Supports 57+ languages with automatic detection.

</Collapsible>

<Collapsible title="Configure Azure Speech-to-Text">

1. Same Azure Speech resource as text-to-speech
2. Supports real-time and batch transcription
3. Custom speech models available for domain-specific vocabulary

</Collapsible>
`
  },

  // Document components
  'document.ocr': {
    prerequisites: [
      'OCR provider configured (Azure Document Intelligence, AWS Textract, or Google Vision)',
      'Image or PDF file to process'
    ],
    setupGuide: `
<Collapsible title="Configure Azure Document Intelligence">

1. Create a Document Intelligence resource in Azure
2. Get endpoint and key
3. Add to secrets: \`azure_doc_endpoint\`, \`azure_doc_key\`
4. Supports: Invoices, Receipts, IDs, Custom models

</Collapsible>

<Collapsible title="Configure AWS Textract">

1. Create IAM user with Textract permissions
2. Add to secrets: \`aws_access_key\`, \`aws_secret_key\`, \`aws_region\`
3. Supports: Tables, Forms, Queries

</Collapsible>
`
  }
};

// Use cases for each node type - provides real-world examples
const NODE_USE_CASES: Record<string, string[]> = {
  // ===== TRIGGERS =====
  'trigger.manual': [
    'Testing and debugging workflows before scheduling',
    'Running ad-hoc reports on demand',
    'One-time data migrations or cleanups',
    'Demo and training scenarios'
  ],
  'trigger.schedule': [
    'Daily report generation at 8 AM',
    'Weekly data synchronization between systems',
    'Monthly invoice processing on the 1st',
    'Hourly monitoring checks for system health'
  ],
  'trigger.webhook': [
    'Process incoming orders from e-commerce platforms',
    'Handle Stripe/PayPal payment notifications',
    'React to GitHub/GitLab CI/CD events',
    'Receive alerts from monitoring systems'
  ],
  'trigger.file_watch': [
    'Process invoices dropped into a shared folder',
    'Import CSV data when uploaded to SFTP',
    'Monitor log files for error patterns',
    'Auto-process scanned documents from scanners'
  ],
  'trigger.email_received': [
    'Parse incoming purchase orders from vendors',
    'Process customer support tickets',
    'Extract attachments from automated reports',
    'Forward filtered emails to specific teams'
  ],
  'trigger.form': [
    'Employee onboarding request forms',
    'IT support ticket submission',
    'Expense report submission with receipts',
    'Customer feedback collection'
  ],
  'trigger.queue': [
    'Process items from a work queue (FIFO)',
    'Distribute tasks among multiple bot runners',
    'Handle high-volume transaction processing',
    'Retry failed items with exponential backoff'
  ],
  'trigger.api_polling': [
    'Check for new orders in an ERP system every 5 minutes',
    'Monitor stock levels in inventory systems',
    'Poll legacy systems without webhook support',
    'Sync data from APIs with rate limits'
  ],
  'trigger.database_change': [
    'React to new customer registrations',
    'Process orders when status changes to "approved"',
    'Audit trail for sensitive data modifications',
    'Sync changes to external systems in real-time'
  ],
  'trigger.storage_event': [
    'Process files uploaded to S3/Azure Blob/MinIO',
    'Trigger ML pipelines when training data arrives',
    'Archive documents after processing',
    'Generate thumbnails for uploaded images'
  ],
  'trigger.message_bus': [
    'Process events from Kafka streams',
    'Handle RabbitMQ work queues',
    'React to Redis pub/sub messages',
    'Integrate with enterprise event buses'
  ],
  'trigger.chat': [
    'Bot commands in Slack channels',
    'Microsoft Teams approval workflows',
    'Telegram notifications with actions',
    'Discord server automation'
  ],

  // ===== WEB AUTOMATION =====
  'web.open_browser': [
    'Start a web scraping session',
    'Begin automated testing of web applications',
    'Log into web portals for data extraction',
    'Open multiple browser contexts for parallel processing'
  ],
  'web.navigate': [
    'Navigate to specific pages within a web app',
    'Follow pagination links in search results',
    'Access deep links with query parameters',
    'Handle multi-step checkout processes'
  ],
  'web.click': [
    'Click login buttons after filling credentials',
    'Accept cookie consent dialogs',
    'Navigate through multi-page wizards',
    'Download files by clicking download links'
  ],
  'web.type': [
    'Fill login forms with credentials from vault',
    'Enter search queries in search boxes',
    'Fill out customer registration forms',
    'Input data into web-based ERP systems'
  ],
  'web.select_option': [
    'Select country from dropdown menus',
    'Choose date ranges in report filters',
    'Select payment methods in checkout',
    'Pick categories for product listing'
  ],
  'web.get_text': [
    'Extract order totals from confirmation pages',
    'Scrape product prices from e-commerce sites',
    'Read error messages for error handling',
    'Capture confirmation numbers after submissions'
  ],
  'web.get_attribute': [
    'Get href links from anchor elements',
    'Extract image URLs from src attributes',
    'Read data-* attributes for hidden values',
    'Get input values for validation'
  ],
  'web.screenshot': [
    'Capture proof of completed transactions',
    'Document error states for debugging',
    'Generate visual reports of dashboards',
    'Create audit trail of bot actions'
  ],
  'web.wait_element': [
    'Wait for page to finish loading after navigation',
    'Wait for AJAX content to appear',
    'Handle slow-loading dynamic content',
    'Ensure modals are fully rendered before interaction'
  ],
  'web.execute_js': [
    'Scroll infinite scroll pages to load more content',
    'Access JavaScript variables from the page',
    'Trigger client-side events programmatically',
    'Bypass complex UI interactions via direct DOM manipulation'
  ],
  'web.scroll': [
    'Scroll to load lazy-loaded images',
    'Navigate to specific sections of long pages',
    'Trigger infinite scroll pagination',
    'Ensure elements are in viewport before clicking'
  ],
  'web.handle_alert': [
    'Accept confirmation dialogs automatically',
    'Dismiss warning popups during automation',
    'Handle unexpected alert boxes gracefully',
    'Capture alert text for logging'
  ],
  'web.switch_tab': [
    'Handle links that open in new tabs',
    'Switch between multiple application windows',
    'Close advertisement tabs automatically',
    'Manage popup windows from third-party auth'
  ],
  'web.close_browser': [
    'Clean up after workflow completion',
    'Release browser resources',
    'End session and logout implicitly',
    'Prevent memory leaks in long-running bots'
  ],
  'web.download_file': [
    'Download reports from web portals',
    'Fetch invoices from supplier portals',
    'Download attachments from web email',
    'Get CSV exports from analytics platforms'
  ],

  // ===== DESKTOP AUTOMATION =====
  'desktop.open_app': [
    'Launch SAP GUI for enterprise automation',
    'Open legacy Windows applications',
    'Start desktop-based accounting software',
    'Run custom in-house desktop tools'
  ],
  'desktop.click': [
    'Click buttons in desktop applications',
    'Select items in list views',
    'Interact with ribbon menus',
    'Click toolbar icons'
  ],
  'desktop.type_text': [
    'Enter data into text fields in desktop apps',
    'Fill forms in legacy systems',
    'Input search queries in desktop search bars',
    'Type commands in terminal applications'
  ],
  'desktop.hotkey': [
    'Use Ctrl+C/Ctrl+V for copy/paste operations',
    'Press Enter to submit forms',
    'Use Alt+Tab to switch windows',
    'Trigger keyboard shortcuts for menu actions'
  ],
  'desktop.get_window': [
    'Find and focus specific application windows',
    'Handle multiple instances of the same app',
    'Wait for application windows to appear',
    'Get window state for conditional logic'
  ],
  'desktop.minimize': [
    'Minimize distracting windows during automation',
    'Clean up screen for screenshots',
    'Reduce interference with user activities',
    'Manage desktop real estate'
  ],
  'desktop.maximize': [
    'Ensure consistent UI element positions',
    'Prepare window for full-screen screenshots',
    'Maximize data grid visibility',
    'Standardize window state for image-based automation'
  ],
  'desktop.close_window': [
    'Close dialog boxes after confirmation',
    'Clean up temporary windows',
    'Exit applications gracefully',
    'Handle unexpected popup windows'
  ],
  'desktop.screenshot': [
    'Capture desktop state for audit trails',
    'Debug failed automation steps',
    'Document completed transactions',
    'Create training materials'
  ],
  'desktop.image_click': [
    'Click buttons identified by image in Citrix/VDI',
    'Interact with non-standard UI controls',
    'Handle applications without accessible UI elements',
    'Automate remote desktop sessions'
  ],
  'desktop.wait_image': [
    'Wait for application to fully load',
    'Detect when dialogs appear',
    'Handle variable loading times',
    'Ensure UI is ready before interaction'
  ],
  'desktop.clipboard_copy': [
    'Extract data via copy/paste from locked fields',
    'Transfer data between applications',
    'Work around read-only text fields',
    'Bulk copy data from desktop apps'
  ],

  // ===== FILES =====
  'files.read': [
    'Read configuration files (JSON, YAML, INI)',
    'Load text templates for email generation',
    'Read CSV data for processing',
    'Load scripts or queries from files'
  ],
  'files.write': [
    'Save processed results to output files',
    'Generate reports in various formats',
    'Create log files for audit trails',
    'Export data to CSV/JSON for downstream systems'
  ],
  'files.copy': [
    'Archive processed files to backup folders',
    'Distribute files to multiple destinations',
    'Create working copies for safe processing',
    'Copy templates before modification'
  ],
  'files.move': [
    'Move processed files to "completed" folder',
    'Organize files into dated directories',
    'Transfer files between systems',
    'Clean up input folders after processing'
  ],
  'files.delete': [
    'Remove temporary files after processing',
    'Clean up old archive files',
    'Delete sensitive data after use',
    'Remove failed/invalid input files'
  ],
  'files.create_folder': [
    'Create dated output directories',
    'Set up folder structure for new projects',
    'Ensure destination folders exist before copy',
    'Organize files by category or date'
  ],
  'files.list': [
    'Find all files matching a pattern for batch processing',
    'Get list of files to process in a directory',
    'Monitor folders for new arrivals',
    'Generate file inventories'
  ],
  'files.exists': [
    'Check if required input files are present',
    'Verify processing prerequisites',
    'Conditional logic based on file presence',
    'Avoid overwriting existing files'
  ],
  'files.zip': [
    'Compress multiple files for email attachment',
    'Archive completed batches',
    'Reduce storage space for backups',
    'Package deliverables for distribution'
  ],
  'files.unzip': [
    'Extract uploaded archive files',
    'Decompress downloaded packages',
    'Access individual files from compressed backups',
    'Process zip attachments from emails'
  ],
  'files.get_info': [
    'Check file size before processing large files',
    'Get modification date for version control',
    'Verify file type before processing',
    'Audit file metadata'
  ],
  'files.watch': [
    'Monitor hot folders for new files',
    'React to file system changes',
    'Implement file-based triggers',
    'Watch for completion signals'
  ],

  // ===== EXCEL =====
  'excel.open': [
    'Open existing reports for updates',
    'Load templates for report generation',
    'Access shared Excel files from network drives',
    'Open password-protected workbooks'
  ],
  'excel.read_range': [
    'Read sales data for processing',
    'Extract customer lists for email campaigns',
    'Load configuration tables from Excel',
    'Import data for database updates'
  ],
  'excel.write_range': [
    'Write processed results back to Excel',
    'Update status columns in tracking sheets',
    'Populate templates with dynamic data',
    'Generate data tables from API results'
  ],
  'excel.read_cell': [
    'Read specific configuration values',
    'Get totals from summary cells',
    'Check status indicators',
    'Read last processed row numbers'
  ],
  'excel.write_cell': [
    'Update individual status cells',
    'Write timestamps for audit',
    'Set formula results',
    'Mark items as processed'
  ],
  'excel.add_row': [
    'Append new records to logs',
    'Add transactions to ledgers',
    'Insert new data rows to existing tables',
    'Build reports incrementally'
  ],
  'excel.filter': [
    'Filter orders by status or date',
    'Extract records matching criteria',
    'Create subsets for specific processing',
    'Separate valid from invalid records'
  ],
  'excel.save': [
    'Save changes after modifications',
    'Save with new filename for versioning',
    'Convert formats (xlsx to csv)',
    'Create backup copies'
  ],
  'excel.close': [
    'Release file locks after processing',
    'Clean up Excel instances',
    'Allow other processes to access files',
    'Prevent memory leaks'
  ],
  'excel.csv_read': [
    'Import CSV exports from other systems',
    'Read bank statement downloads',
    'Process CSV data feeds',
    'Load delimited log files'
  ],
  'excel.csv_write': [
    'Export data for system imports',
    'Generate CSV reports for download',
    'Create data feeds for BI tools',
    'Produce files for legacy system imports'
  ],
  'excel.pivot': [
    'Create summary reports from detail data',
    'Aggregate sales by region/product',
    'Generate statistical summaries',
    'Build dashboard data sources'
  ],
  'excel.add_sheet': [
    'Create new sheets for different data types',
    'Add monthly tabs to annual reports',
    'Separate output by category',
    'Create summary sheets'
  ],
  'excel.delete_sheet': [
    'Remove template sheets after copying',
    'Clean up temporary worksheets',
    'Delete obsolete tabs',
    'Prepare workbooks for distribution'
  ],
  'excel.create_workbook': [
    'Generate new reports from scratch',
    'Create empty workbooks for data export',
    'Initialize new tracking spreadsheets',
    'Build formatted templates programmatically'
  ],
  'excel.format_range': [
    'Highlight important data with colors',
    'Apply currency formatting to amounts',
    'Set date formats for consistency',
    'Create professional report layouts'
  ],
  'excel.add_formula': [
    'Add SUM formulas for totals',
    'Insert VLOOKUP for data enrichment',
    'Create calculated columns',
    'Add conditional formulas'
  ],
  'excel.create_chart': [
    'Generate sales trend charts',
    'Create pie charts for distributions',
    'Build dashboard visualizations',
    'Add charts to automated reports'
  ],
  'excel.sort_range': [
    'Sort data by date or priority',
    'Order customers alphabetically',
    'Rank items by value',
    'Organize data for reports'
  ],
  'excel.merge_cells': [
    'Create report headers',
    'Format title rows',
    'Build professional layouts',
    'Create grouped sections'
  ],
  'excel.get_sheets': [
    'List available worksheets for selection',
    'Validate expected sheets exist',
    'Iterate over all sheets for processing',
    'Check workbook structure'
  ],
  'excel.apply_template': [
    'Generate branded reports from templates',
    'Create invoices with company formatting',
    'Produce standardized documents',
    'Apply consistent styling'
  ],
  'excel.validate_data': [
    'Check data types before processing',
    'Validate required fields are filled',
    'Verify data ranges and formats',
    'Quality check input data'
  ],
  'excel.remove_duplicates': [
    'Clean customer lists before import',
    'Deduplicate transaction records',
    'Prepare data for unique constraints',
    'Clean up merged datasets'
  ],
  'excel.find_replace': [
    'Standardize data formats',
    'Fix common data entry errors',
    'Update old codes to new codes',
    'Clean text data'
  ],
  'excel.set_print_area': [
    'Configure reports for printing',
    'Set up multi-page print layouts',
    'Prepare documents for PDF export',
    'Control what gets printed'
  ],
  'excel.protect_sheet': [
    'Lock formulas from accidental edits',
    'Protect templates from modification',
    'Secure sensitive calculations',
    'Control user access to data'
  ],
  'excel.add_comment': [
    'Document data sources',
    'Add processing notes',
    'Flag items for review',
    'Provide context for values'
  ],

  // ===== EMAIL =====
  'email.send': [
    'Send automated report emails with attachments',
    'Notify stakeholders of process completion',
    'Send alerts when exceptions occur',
    'Distribute invoices to customers'
  ],
  'email.read': [
    'Process incoming orders from vendor emails',
    'Extract data from automated notifications',
    'Monitor inbox for specific senders',
    'Parse email content for processing'
  ],
  'email.reply': [
    'Acknowledge receipt of requests',
    'Send automated responses with status',
    'Respond to customer inquiries',
    'Confirm order processing'
  ],
  'email.forward': [
    'Route emails to appropriate teams',
    'Escalate urgent messages',
    'Distribute newsletters to groups',
    'Forward exceptions for review'
  ],
  'email.download_attachment': [
    'Save invoice PDFs from emails',
    'Extract Excel reports for processing',
    'Download images from notifications',
    'Get documents for archival'
  ],
  'email.move': [
    'Organize processed emails to folders',
    'Archive completed requests',
    'Sort emails by category',
    'Clean up inbox after processing'
  ],
  'email.delete': [
    'Remove spam or irrelevant emails',
    'Clean up processed notifications',
    'Delete temporary emails',
    'Manage mailbox size'
  ],
  'email.mark_read': [
    'Mark processed emails as read',
    'Update email status after handling',
    'Track which emails have been processed',
    'Maintain clean inbox state'
  ],
  'email.search': [
    'Find emails from specific senders',
    'Search by subject or date range',
    'Locate emails with attachments',
    'Find unprocessed items'
  ],
  'email.get_folders': [
    'List available mail folders',
    'Find target folders for moving',
    'Discover folder structure',
    'Validate folder existence'
  ],
  'email.create_folder': [
    'Create archive folders by date/category',
    'Set up folder structure for organization',
    'Create project-specific folders',
    'Establish processing workflow folders'
  ],
  'email.outlook_send': [
    'Send emails through corporate Outlook',
    'Use Exchange/Office 365 integration',
    'Access shared mailboxes',
    'Send meeting invitations'
  ],
  'email.outlook_read': [
    'Read from Exchange mailboxes',
    'Access shared/delegated inboxes',
    'Read calendar invitations',
    'Process Outlook-specific features'
  ],
  'email.imap_connect': [
    'Connect to IMAP email servers',
    'Access Gmail via IMAP',
    'Connect to custom mail servers',
    'Establish secure email connections'
  ],

  // ===== API =====
  'api.http_request': [
    'Fetch data from REST APIs',
    'Submit forms to web services',
    'Call microservice endpoints',
    'Integrate with third-party platforms'
  ],
  'api.graphql': [
    'Query GraphQL APIs efficiently',
    'Fetch nested data in single request',
    'Perform mutations with variables',
    'Integrate with modern API platforms'
  ],
  'api.rest_get': [
    'Retrieve records from CRM systems',
    'Fetch user data from identity providers',
    'Get product catalogs from e-commerce APIs',
    'Read configuration from remote services'
  ],
  'api.rest_post': [
    'Create new records in external systems',
    'Submit orders to fulfillment services',
    'Post data to analytics platforms',
    'Send notifications to messaging services'
  ],
  'api.soap': [
    'Integrate with legacy enterprise systems',
    'Call SAP web services',
    'Access banking/financial SOAP APIs',
    'Interface with government services'
  ],
  'api.oauth_token': [
    'Get access tokens for API authentication',
    'Refresh expired OAuth tokens',
    'Implement OAuth2 client credentials flow',
    'Authenticate with Microsoft/Google APIs'
  ],
  'api.parse_json': [
    'Parse API response bodies',
    'Convert JSON strings to objects',
    'Process webhook payloads',
    'Handle configuration files'
  ],
  'api.json_path': [
    'Extract specific values from JSON',
    'Navigate nested API responses',
    'Filter arrays in JSON data',
    'Access deeply nested properties'
  ],
  'api.ftp_upload': [
    'Upload files to FTP/SFTP servers',
    'Send reports to partner systems',
    'Distribute files to remote locations',
    'Transfer data to legacy systems'
  ],

  // ===== DATABASE =====
  'database.connect': [
    'Establish connection to production database',
    'Connect to data warehouses',
    'Access MongoDB clusters',
    'Connect with connection pooling'
  ],
  'database.query': [
    'Fetch pending orders for processing',
    'Query customer data for reports',
    'Select records matching criteria',
    'Execute complex analytical queries'
  ],
  'database.insert': [
    'Save processed results to database',
    'Log audit records',
    'Create new customer records',
    'Store webhook data'
  ],
  'database.update': [
    'Update order status after processing',
    'Mark records as processed',
    'Sync data changes from external systems',
    'Update timestamps and flags'
  ],
  'database.delete': [
    'Remove expired records',
    'Clean up temporary data',
    'Delete cancelled orders',
    'Purge old audit logs'
  ],
  'database.call_procedure': [
    'Execute complex business logic in stored procedures',
    'Run database maintenance procedures',
    'Call functions that return results',
    'Execute batch operations'
  ],
  'database.transaction': [
    'Ensure data consistency across multiple operations',
    'Implement all-or-nothing updates',
    'Handle complex multi-table inserts',
    'Manage financial transactions'
  ],
  'database.commit': [
    'Finalize successful transactions',
    'Make changes permanent',
    'Release row locks',
    'Complete batch operations'
  ],
  'database.close': [
    'Release database connections',
    'Clean up connection pools',
    'Free database resources',
    'End database sessions'
  ],

  // ===== DOCUMENT =====
  'document.pdf_read': [
    'Extract text from invoices for processing',
    'Read content from contracts',
    'Parse PDF reports for data extraction',
    'Get text from scanned documents (with OCR)'
  ],
  'document.pdf_merge': [
    'Combine multiple invoices into one PDF',
    'Merge report pages into single document',
    'Create document packages',
    'Consolidate statements'
  ],
  'document.pdf_split': [
    'Extract specific pages from large PDFs',
    'Separate combined documents',
    'Extract invoice pages from batch scans',
    'Create individual documents from merged files'
  ],
  'document.pdf_to_image': [
    'Convert PDF pages for image processing',
    'Create thumbnails for document preview',
    'Prepare documents for OCR',
    'Generate images for web display'
  ],
  'document.ocr': [
    'Extract text from scanned documents',
    'Digitize paper invoices',
    'Process handwritten forms',
    'Read text from images'
  ],
  'document.word_read': [
    'Extract content from Word documents',
    'Parse document templates',
    'Read contracts and agreements',
    'Process Word-based reports'
  ],
  'document.word_write': [
    'Generate contracts from templates',
    'Create formatted reports',
    'Produce mail merge documents',
    'Build proposals and quotes'
  ],
  'document.html_to_pdf': [
    'Convert web pages to PDF reports',
    'Generate PDF from HTML templates',
    'Create printable documents from web content',
    'Archive web pages as PDFs'
  ],
  'document.pdf_fill_form': [
    'Fill out PDF forms automatically',
    'Complete government/tax forms',
    'Populate application forms',
    'Fill insurance claim forms'
  ],

  // ===== AI =====
  'ai.llm_prompt': [
    'Generate email responses based on context',
    'Summarize long documents',
    'Answer questions about extracted data',
    'Create natural language reports'
  ],
  'ai.agent': [
    'Handle complex multi-step reasoning tasks',
    'Conduct interactive Q&A sessions',
    'Make decisions based on context',
    'Navigate ambiguous situations'
  ],
  'ai.extract_data': [
    'Extract invoice fields (vendor, amount, date)',
    'Parse resumes for candidate information',
    'Extract entities from contracts',
    'Structure unstructured text data'
  ],
  'ai.summarize': [
    'Summarize meeting transcripts',
    'Create executive summaries of reports',
    'Condense long emails',
    'Generate document abstracts'
  ],
  'ai.classify': [
    'Categorize support tickets by type',
    'Classify documents by department',
    'Route emails to appropriate teams',
    'Categorize expenses by type'
  ],
  'ai.translate': [
    'Translate customer communications',
    'Localize content for different markets',
    'Translate documents for processing',
    'Enable multilingual workflows'
  ],
  'ai.sentiment': [
    'Analyze customer feedback sentiment',
    'Monitor social media mentions',
    'Evaluate survey responses',
    'Detect urgent/angry communications'
  ],
  'ai.vision': [
    'Analyze product images for defects',
    'Read text from screenshots',
    'Classify images by content',
    'Extract data from photos'
  ],
  'ai.embeddings': [
    'Create searchable document indexes',
    'Find similar documents',
    'Power semantic search features',
    'Cluster related content'
  ],
  'ai.repair_data': [
    'Auto-fix data quality issues',
    'Correct formatting inconsistencies',
    'Standardize address formats',
    'Clean and normalize data'
  ],
  'ai.suggest_repairs': [
    'Preview data fixes before applying',
    'Generate repair recommendations',
    'Create data quality reports',
    'Propose corrections for review'
  ],

  // ===== PYTHON =====
  'python.execute': [
    'Run custom data transformations',
    'Execute specialized algorithms',
    'Perform complex calculations',
    'Use Python-specific libraries'
  ],
  'python.project': [
    'Run existing Python projects/scripts',
    'Execute ML model inference',
    'Run data science pipelines',
    'Integrate legacy Python code'
  ],
  'python.pip_install': [
    'Install required Python packages',
    'Update dependencies',
    'Install custom packages from git',
    'Manage package versions'
  ],
  'python.virtualenv': [
    'Create isolated Python environments',
    'Manage dependency conflicts',
    'Set up project-specific dependencies',
    'Ensure reproducible environments'
  ],
  'python.function': [
    'Define reusable Python functions',
    'Create custom transformations',
    'Build helper utilities',
    'Implement complex logic'
  ],
  'python.import_module': [
    'Import standard library modules',
    'Load custom Python libraries',
    'Access specialized packages',
    'Use third-party integrations'
  ],
  'python.notebook': [
    'Run Jupyter notebooks for analysis',
    'Execute data science workflows',
    'Generate notebook-based reports',
    'Run ML experiments'
  ],
  'python.eval': [
    'Evaluate Python expressions',
    'Calculate dynamic values',
    'Perform inline computations',
    'Quick string/math operations'
  ],

  // ===== CONTROL =====
  'control.if': [
    'Route workflows based on conditions',
    'Handle different scenarios',
    'Implement business rules',
    'Create decision branches'
  ],
  'control.switch': [
    'Handle multiple distinct cases',
    'Route by document type',
    'Branch by status values',
    'Implement complex routing logic'
  ],
  'control.loop': [
    'Process each row in a dataset',
    'Iterate over file lists',
    'Handle batch operations',
    'Process collections of items'
  ],
  'control.while': [
    'Retry operations until success',
    'Poll for completion status',
    'Process until queue is empty',
    'Implement wait loops'
  ],
  'control.wait': [
    'Wait for systems to be ready',
    'Add delays between API calls (rate limiting)',
    'Pause for human review',
    'Wait for file availability'
  ],
  'control.set_variable': [
    'Store intermediate results',
    'Set configuration values',
    'Track processing state',
    'Accumulate values in loops'
  ],
  'control.try_catch': [
    'Handle errors gracefully',
    'Implement fallback logic',
    'Continue processing after failures',
    'Log errors without stopping'
  ],
  'control.parallel': [
    'Process multiple items concurrently',
    'Run independent tasks simultaneously',
    'Speed up batch operations',
    'Handle parallel API calls'
  ],
  'control.stop': [
    'Terminate workflow on critical error',
    'End processing early when done',
    'Implement circuit breakers',
    'Stop on validation failure'
  ],
  'control.goto': [
    'Jump to specific workflow sections',
    'Implement complex flow patterns',
    'Skip sections conditionally',
    'Create reusable workflow segments'
  ],
  'control.retry': [
    'Retry failed API calls',
    'Handle transient errors',
    'Implement exponential backoff',
    'Ensure operation completion'
  ],
  'control.parallel_for': [
    'Process items in parallel batches',
    'Speed up bulk operations',
    'Concurrent file processing',
    'Parallel API requests'
  ],
  'control.await': [
    'Wait for parallel operations to complete',
    'Synchronize concurrent tasks',
    'Collect parallel results',
    'Ensure all tasks finish'
  ],
  'control.group': [
    'Organize related nodes logically',
    'Create reusable node groups',
    'Improve workflow readability',
    'Define functional blocks'
  ],

  // ===== LOGGING =====
  'logging.log': [
    'Track workflow progress',
    'Debug issues during development',
    'Create audit trails',
    'Log business events'
  ],
  'logging.screenshot': [
    'Capture UI state for debugging',
    'Document completed transactions',
    'Create visual audit trails',
    'Debug automation failures'
  ],
  'logging.metric': [
    'Track KPIs and performance metrics',
    'Monitor processing volumes',
    'Measure cycle times',
    'Report business metrics'
  ],
  'logging.timer_start': [
    'Measure operation duration',
    'Track performance metrics',
    'Identify bottlenecks',
    'Benchmark processes'
  ],
  'logging.timer_stop': [
    'Calculate elapsed time',
    'Report performance data',
    'Log duration metrics',
    'Complete timing measurements'
  ],
  'logging.notification': [
    'Alert teams of completions/failures',
    'Send Slack/Teams notifications',
    'Notify stakeholders of issues',
    'Trigger escalation alerts'
  ],
  'logging.audit': [
    'Record compliance events',
    'Track data access',
    'Log security events',
    'Create regulatory audit trails'
  ],
  'logging.export': [
    'Export logs for analysis',
    'Archive execution logs',
    'Generate log reports',
    'Share logs with stakeholders'
  ],

  // ===== VOICE =====
  'voice.call': [
    'Make automated outbound calls to customers',
    'Send appointment reminders via phone',
    'Conduct automated surveys',
    'Trigger alert calls for urgent notifications'
  ],
  'voice.speak': [
    'Generate audio for IVR systems',
    'Create voiceovers for videos',
    'Convert text reports to audio',
    'Build accessible audio content'
  ],
  'voice.listen': [
    'Transcribe customer call recordings',
    'Convert voice notes to text',
    'Process audio messages',
    'Enable voice-to-text workflows'
  ],
  'voice.twiml_say': [
    'Build dynamic IVR prompts',
    'Create call scripts',
    'Generate welcome messages',
    'Build interactive voice menus'
  ],
  'voice.twiml_gather': [
    'Collect user input via keypad or speech',
    'Build IVR menu selections',
    'Gather survey responses',
    'Capture account numbers from callers'
  ],
  'voice.transfer': [
    'Transfer calls to human agents',
    'Route calls to appropriate departments',
    'Escalate calls to supervisors',
    'Connect callers to specialists'
  ],
  'voice.hangup': [
    'End calls gracefully with farewell message',
    'Terminate automated calls',
    'Clean up call resources',
    'Complete call workflows'
  ],
  'voice.get_recording': [
    'Retrieve call recordings for review',
    'Archive calls for compliance',
    'Get recordings for transcription',
    'Access call audio for quality assurance'
  ],
  'voice.add_turn': [
    'Build conversation history for context',
    'Track call dialog for AI processing',
    'Record conversation flow',
    'Build transcript incrementally'
  ],
  'voice.get_transcript': [
    'Get full call transcript for analysis',
    'Export conversation for compliance',
    'Feed transcript to AI for processing',
    'Generate call summaries'
  ],
  'voice.set_context': [
    'Store caller information during call',
    'Track conversation state',
    'Save data between call steps',
    'Maintain context for AI decisions'
  ],
  'voice.get_context': [
    'Retrieve stored call data',
    'Access previous responses',
    'Get caller details for personalization',
    'Retrieve context for decision making'
  ],

  // ===== DATA TRANSFORM =====
  'data.map': [
    'Transform data structures',
    'Rename and restructure fields',
    'Convert formats between systems',
    'Normalize API responses'
  ],
  'data.filter': [
    'Remove invalid records',
    'Select items matching criteria',
    'Filter by date ranges',
    'Extract subsets of data'
  ],
  'data.sort': [
    'Order records by priority',
    'Sort by date or alphabetically',
    'Rank items by value',
    'Organize data for reports'
  ],
  'data.group': [
    'Aggregate data by categories',
    'Sum values by group',
    'Create summary statistics',
    'Build pivot-like groupings'
  ],
  'data.merge': [
    'Combine data from multiple sources',
    'Join related datasets',
    'Merge API responses',
    'Consolidate records'
  ],
  'data.split': [
    'Divide data into batches',
    'Separate records by type',
    'Create chunks for parallel processing',
    'Split large datasets'
  ],
  'data.parse_json': [
    'Parse JSON strings to objects',
    'Handle API responses',
    'Process configuration files',
    'Decode JSON payloads'
  ],
  'data.to_json': [
    'Convert data to JSON format',
    'Prepare data for API calls',
    'Serialize objects for storage',
    'Format output for downstream systems'
  ],
  'data.parse_xml': [
    'Parse XML documents',
    'Handle SOAP responses',
    'Process XML feeds',
    'Read legacy XML formats'
  ],
  'data.parse_csv': [
    'Parse CSV strings to arrays',
    'Process CSV text data',
    'Handle inline CSV data',
    'Convert CSV to structured data'
  ],
  'data.format_date': [
    'Convert between date formats',
    'Standardize date representations',
    'Format dates for display/storage',
    'Parse various date strings'
  ],
  'data.format_number': [
    'Format currency values',
    'Add thousand separators',
    'Round to decimal places',
    'Convert number formats'
  ],
  'data.format_string': [
    'Build dynamic strings from templates',
    'Concatenate with formatting',
    'Apply text transformations',
    'Generate formatted output'
  ],

  // ===== SECURITY =====
  'security.get_secret': [
    'Retrieve API keys securely',
    'Get database passwords',
    'Access encrypted credentials',
    'Fetch configuration secrets'
  ],
  'security.set_secret': [
    'Store new credentials securely',
    'Update rotated passwords',
    'Save API keys to vault',
    'Securely store sensitive data'
  ],
  'security.delete_secret': [
    'Remove expired credentials',
    'Delete rotated secrets',
    'Clean up unused keys',
    'Revoke access credentials'
  ],
  'security.list_secrets': [
    'Audit available secrets',
    'Check for required credentials',
    'Inventory secret store',
    'Verify secret existence'
  ],
  'security.encrypt': [
    'Encrypt sensitive data before storage',
    'Protect PII in transit',
    'Secure data for transmission',
    'Encrypt files before archiving'
  ],
  'security.decrypt': [
    'Decrypt protected data for processing',
    'Access encrypted files',
    'Decode secure messages',
    'Decrypt stored credentials'
  ],
  'security.hash': [
    'Hash passwords for storage',
    'Create data fingerprints',
    'Generate checksums',
    'Verify data integrity'
  ],
  'security.mask_data': [
    'Hide sensitive data in logs',
    'Mask credit card numbers',
    'Redact PII for display',
    'Protect data in reports'
  ],
  'security.validate_cert': [
    'Verify SSL certificates',
    'Check certificate expiry',
    'Validate certificate chains',
    'Ensure secure connections'
  ],
  'security.generate_token': [
    'Create authentication tokens',
    'Generate session IDs',
    'Create secure random strings',
    'Issue temporary access codes'
  ],

  // ===== HUMAN-IN-THE-LOOP =====
  'human.approval': [
    'Request manager approval for high-value transactions',
    'Get sign-off before processing sensitive data',
    'Approve exceptions before continuing',
    'Gate critical operations with human review'
  ],
  'human.input': [
    'Collect missing information from users',
    'Request clarification on ambiguous data',
    'Get user preferences for processing',
    'Gather additional details needed for workflow'
  ],
  'human.review': [
    'Review AI-extracted data before processing',
    'Verify critical data before submission',
    'Quality check automated outputs',
    'Validate processed results'
  ],
  'human.exception': [
    'Handle cases AI cannot resolve',
    'Route complex issues to humans',
    'Escalate edge cases for decision',
    'Manage workflow exceptions'
  ],
  'human.notification': [
    'Alert users of workflow status',
    'Notify stakeholders of completions',
    'Send progress updates',
    'Inform teams of issues'
  ],
  'human.escalate': [
    'Escalate urgent issues to managers',
    'Route to senior staff when needed',
    'Escalate SLA breaches',
    'Notify leadership of critical issues'
  ],
  'human.file_upload': [
    'Request supporting documents from users',
    'Collect signed forms',
    'Get image uploads for verification',
    'Request evidence/attachments'
  ],

  // ===== COMPLIANCE =====
  'compliance.detect_sensitive': [
    'Scan data for PII/PHI before processing',
    'Identify sensitive data in documents',
    'Audit data for compliance',
    'Flag regulated data types'
  ],
  'compliance.detect_pii': [
    'Find personal information in text',
    'Identify names, SSNs, emails',
    'Scan documents for PII',
    'Locate identifying information'
  ],
  'compliance.detect_phi': [
    'Identify health information (HIPAA)',
    'Find medical record numbers',
    'Detect healthcare-related PII',
    'Scan for protected health data'
  ],
  'compliance.mask_data': [
    'Mask SSNs before display (***-**-1234)',
    'Hide credit card digits',
    'Redact phone numbers',
    'Protect data in reports'
  ],
  'compliance.redact_data': [
    'Remove sensitive data completely',
    'Redact PII from documents',
    'Strip confidential information',
    'Remove regulated data fields'
  ],
  'compliance.pseudonymize': [
    'Replace names with consistent IDs',
    'Anonymize for analytics',
    'Enable de-identified processing',
    'Create reversible anonymization'
  ],
  'compliance.hash_data': [
    'One-way hash sensitive fields',
    'Create data fingerprints',
    'Hash for comparison without exposure',
    'Secure data deduplication'
  ],
  'compliance.generalize_data': [
    'Convert exact ages to ranges (30-40)',
    'Reduce zip to first 3 digits',
    'Generalize dates to months/years',
    'K-anonymity transformations'
  ],
  'compliance.safe_harbor': [
    'Apply all HIPAA Safe Harbor rules',
    'De-identify health data fully',
    'Ensure HIPAA compliance',
    'Remove all 18 PHI identifiers'
  ],
  'compliance.validate_hipaa': [
    'Check data meets HIPAA requirements',
    'Verify de-identification completeness',
    'Audit for compliance gaps',
    'Generate compliance reports'
  ],
  'compliance.sensitive_gate': [
    'Block workflows containing PII',
    'Stop processing if PHI detected',
    'Implement compliance checkpoints',
    'Gate sensitive data flows'
  ],
  'compliance.audit_log': [
    'Log data access events',
    'Record compliance actions',
    'Track data handling',
    'Create audit trails'
  ],
  'compliance.classify_data': [
    'Classify data sensitivity levels',
    'Tag data by regulation type',
    'Identify data categories',
    'Label data for handling rules'
  ],

  // ===== DATA QUALITY =====
  'dataquality.validate_schema': [
    'Verify data matches expected schema',
    'Validate API response structure',
    'Check document format compliance',
    'Ensure data integrity'
  ],
  'dataquality.validate_not_null': [
    'Check required fields are filled',
    'Validate mandatory data present',
    'Ensure completeness',
    'Flag missing values'
  ],
  'dataquality.validate_unique': [
    'Check for duplicate records',
    'Validate unique identifiers',
    'Ensure no duplicates before import',
    'Verify uniqueness constraints'
  ],
  'dataquality.validate_in_set': [
    'Check values are in allowed list',
    'Validate status codes',
    'Ensure valid category values',
    'Verify enum compliance'
  ],
  'dataquality.validate_between': [
    'Check values in valid ranges',
    'Validate dates within bounds',
    'Ensure amounts are reasonable',
    'Verify numeric ranges'
  ],
  'dataquality.validate_regex': [
    'Validate phone number formats',
    'Check email format',
    'Verify ID number patterns',
    'Validate code formats'
  ],
  'dataquality.validate_email': [
    'Ensure valid email addresses',
    'Check email format compliance',
    'Validate contact information',
    'Filter invalid emails'
  ],
  'dataquality.validate_date': [
    'Verify date format correctness',
    'Check date validity',
    'Validate date ranges',
    'Ensure parseable dates'
  ],
  'dataquality.validate_row_count': [
    'Ensure expected data volume',
    'Validate file completeness',
    'Check batch sizes',
    'Verify data not truncated'
  ],
  'dataquality.profile_data': [
    'Generate automatic data statistics',
    'Discover data patterns',
    'Identify anomalies',
    'Understand data characteristics'
  ],
  'dataquality.run_suite': [
    'Execute multiple validations at once',
    'Run comprehensive data checks',
    'Apply validation rule sets',
    'Batch quality checks'
  ],
  'dataquality.generate_report': [
    'Create data quality scorecards',
    'Generate validation reports',
    'Document data issues',
    'Report quality metrics'
  ],

  // ===== INSURANCE =====
  'insurance.fnol_record': [
    'Create First Notice of Loss records',
    'Document insurance claims intake',
    'Record accident/incident reports',
    'Initialize claim processing'
  ],
  'insurance.lookup_policy': [
    'Find policy by phone/name/DOB',
    'Verify policyholder identity',
    'Look up coverage information',
    'Search for matching policies'
  ],
  'insurance.validate_policy': [
    'Confirm policy is active',
    'Verify coverage applies to claim',
    'Check policy effective dates',
    'Validate coverage limits'
  ],
  'insurance.extract_claim_data': [
    'Extract claim details from transcripts',
    'Parse incident descriptions',
    'Structure claim information',
    'AI-extract claim fields'
  ],

  // ===== DATA INTEGRATION =====
  'data.salesforce_query': [
    'Query Salesforce objects (Accounts, Leads)',
    'Run SOQL queries',
    'Fetch CRM data',
    'Extract Salesforce reports'
  ],
  'data.salesforce_create': [
    'Create new Salesforce records',
    'Insert Leads from forms',
    'Create Cases from tickets',
    'Sync data to Salesforce'
  ],
  'data.salesforce_update': [
    'Update existing Salesforce records',
    'Sync changes to CRM',
    'Update Opportunity stages',
    'Modify Account information'
  ],
  'data.hubspot_query': [
    'Query HubSpot contacts and companies',
    'Fetch deal information',
    'Get marketing data',
    'Extract HubSpot records'
  ],
  'data.hubspot_create': [
    'Create HubSpot contacts',
    'Add new deals to pipeline',
    'Insert companies',
    'Sync leads to HubSpot'
  ],
  'data.hubspot_update': [
    'Update HubSpot records',
    'Modify contact properties',
    'Update deal stages',
    'Sync changes to HubSpot'
  ],
  'data.bigquery_query': [
    'Run BigQuery SQL queries',
    'Analyze large datasets',
    'Generate analytics reports',
    'Query data warehouse'
  ],
  'data.bigquery_insert': [
    'Insert data into BigQuery tables',
    'Load processed data to warehouse',
    'Stream data to BigQuery',
    'Populate analytics tables'
  ],
  'data.snowflake_query': [
    'Query Snowflake data warehouse',
    'Run analytical queries',
    'Extract transformed data',
    'Access data marts'
  ],
  'data.snowflake_write': [
    'Write data to Snowflake',
    'Load ETL results',
    'Insert processed records',
    'Populate Snowflake tables'
  ],

  // ===== SECRETS =====
  'secrets.local_vault': [
    'Access locally stored secrets',
    'Use development credentials',
    'Load secrets from encrypted local store',
    'Manage local API keys'
  ],
};

function getRealisticExample(node: NodeTemplate): string {
  const examples: Record<string, Record<string, any>> = {
    // Trigger examples
    'trigger.manual': {},
    'trigger.webhook': { path: '/api/invoices/process', method: 'POST' },
    'trigger.file_watch': { path: '/data/incoming', pattern: '*.csv' },
    'trigger.email_received': { folder: 'INBOX', filter: 'Invoice*' },
    'trigger.form': { formTitle: 'New Employee Request', submitButtonLabel: 'Submit Request' },

    // Web examples
    'web.open_browser': { url: 'https://portal.example.com/login', browser: 'chromium', headless: false },
    'web.click': { selector: '#submit-btn', timeout: 30000 },
    'web.type': { selector: '#username', text: '${credentials.username}', clear: true },
    'web.get_text': { selector: '.invoice-total' },
    'web.screenshot': { path: '/reports/screenshot.png', fullPage: true },

    // Excel examples
    'excel.open': { file: '/data/reports/sales-q4.xlsx' },
    'excel.read_range': { sheet: 'Sales', range: 'A1:F100', header: true },
    'excel.write_range': { sheet: 'Output', range: 'A1', data: '${Process Data.results}' },
    'excel.create_workbook': { file: '/reports/monthly-report.xlsx' },

    // API examples
    'api.http_request': { url: 'https://api.example.com/invoices', method: 'GET', headers: '{"Authorization": "Bearer ${api_token}"}' },
    'api.graphql': { url: 'https://api.example.com/graphql', query: 'query { users { id name } }' },

    // Database examples
    'database.query': { connection: 'postgres-main', query: 'SELECT * FROM invoices WHERE status = $1', params: '["pending"]' },
    'database.insert': { connection: 'postgres-main', table: 'audit_log', data: '${Process Data.record}' },

    // AI examples
    'ai.generate_text': { prompt: 'Summarize this invoice: ${Extract PDF.text}', model: 'gpt-4', maxTokens: 500 },
    'ai.extract_structured': { text: '${Read PDF.content}', schema: '{"vendor": "string", "amount": "number", "date": "date"}' },

    // Control examples
    'control.if': { condition: '${Invoice.amount} > 10000' },
    'control.for_each': { items: '${Read Excel.data}', variable: 'row' },
    'control.try_catch': {},
    'control.delay': { seconds: 5 },

    // File examples
    'files.read': { path: '/data/config.json' },
    'files.write': { path: '/output/results.json', content: '${Process Data.output}' },
    'files.copy': { source: '/inbox/file.pdf', destination: '/processed/file.pdf' },
  };

  const preset = examples[node.type];
  if (preset && Object.keys(preset).length > 0) {
    const lines = Object.entries(preset).map(([key, val]) => {
      let value: string;
      if (typeof val === 'string') {
        // Escape internal quotes and format as JSON string
        value = `"${val.replace(/"/g, '\\"')}"`;
      } else {
        value = JSON.stringify(val);
      }
      return `    "${key}": ${value}`;
    });
    return lines.join(',\n');
  }

  // Generate from schema
  const config: Record<string, any> = {};
  for (const field of node.configSchema.slice(0, 4)) {
    if (field.placeholder) {
      config[field.name] = field.placeholder;
    } else if (field.default !== undefined) {
      config[field.name] = field.default;
    } else if (field.type === 'number') {
      config[field.name] = 0;
    } else if (field.type === 'boolean' || field.type === 'checkbox') {
      config[field.name] = true;
    } else if (field.type === 'select') {
      config[field.name] = 'option';
    } else {
      config[field.name] = `your-${field.name}`;
    }
  }

  if (Object.keys(config).length === 0) {
    return '    // No configuration required';
  }

  const lines = Object.entries(config).map(([key, val]) => {
    const value = typeof val === 'string' ? `"${val}"` : JSON.stringify(val);
    return `    "${key}": ${value}`;
  });
  return lines.join(',\n');
}

function generateCategoryMDX(category: string, nodes: NodeTemplate[]): string {
  const meta = CATEGORY_META[category] || {
    title: category.charAt(0).toUpperCase() + category.slice(1),
    description: `Components in the ${category} category.`,
    icon: 'Box',
    useCases: [],
    relatedCategories: []
  };

  const nodeCount = nodes.length;
  const relatedLinks = meta.relatedCategories
    .filter(c => CATEGORY_META[c])
    .map(c => `[${CATEGORY_META[c].title}](/components/${c})`)
    .join(' · ');

  let mdx = `export const metadata = {
  title: '${meta.title}',
  description: '${meta.description}',
}

export const sections = [
${nodes.map(n => `  { title: '${n.label}', id: '${n.type.replace(/\./g, '-')}' },`).join('\n')}
]

# ${meta.title}

${meta.description} {{ className: 'lead' }}

<Note>
  This category contains **${nodeCount} components**.${relatedLinks ? ` See also: ${relatedLinks}` : ''}
</Note>

`;

  // Add use cases if available
  if (meta.useCases && meta.useCases.length > 0) {
    mdx += `## Common Use Cases

${meta.useCases.map(uc => `- ${uc}`).join('\n')}

---

`;
  }

  // Generate documentation for each node
  for (const node of nodes) {
    const nodeId = node.type.replace(/\./g, '-');
    const iconName = node.icon || 'Box';
    const iconSvg = getIconSvg(iconName);
    const prereqs = COMPONENT_PREREQUISITES[node.type];
    const useCases = NODE_USE_CASES[node.type];
    const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.trigger;

    mdx += `## ${node.label} {{ id: '${nodeId}' }}

<NodeHeader icon={\`${iconSvg}\`} label="${node.label}" description="${escapeForMdx(node.description)}" bgColor="${categoryColor.bg}" textColor="${categoryColor.text}" />

<Properties>
  <Property name="type" type="string">
    \`${node.type}\`
  </Property>
</Properties>

`;

    // Use cases if available
    if (useCases && useCases.length > 0) {
      mdx += `### When to Use

${useCases.map(uc => `- ${uc}`).join('\n')}

`;
    }

    // Prerequisites if available
    if (prereqs && prereqs.prerequisites.length > 0) {
      mdx += `<Prerequisites>

${prereqs.prerequisites.map(p => `- ${p}`).join('\n')}

</Prerequisites>

`;
    }

    // Config fields
    if (node.configSchema.length > 0) {
      mdx += `### Configuration

<Properties>
`;
      for (const field of node.configSchema) {
        const required = field.required ? ' required' : '';
        const defaultVal = field.default !== undefined ? ` Default: \`${field.default}\`` : '';

        // For long placeholders, put example on separate line
        if (field.placeholder && field.placeholder.length > 30) {
          mdx += `  <Property name="${field.name}" type="${field.type}"${required}>
    ${escapeForMdx(field.label)}${defaultVal}

    Example: \`${escapeForMdx(field.placeholder)}\`
  </Property>
`;
        } else {
          const placeholder = field.placeholder ? ` (e.g., \`${escapeForMdx(field.placeholder)}\`)` : '';
          mdx += `  <Property name="${field.name}" type="${field.type}"${required}>
    ${escapeForMdx(field.label)}${placeholder}${defaultVal}
  </Property>
`;
        }
      }
      mdx += `</Properties>

`;
    }

    // Setup guide if available (collapsible sections)
    if (prereqs && prereqs.setupGuide) {
      mdx += `### Setup Guide

${prereqs.setupGuide}

`;
    }

    // Output fields
    if (node.outputSchema.length > 0) {
      mdx += `### Output Variables

Access these variables in subsequent nodes using \`\${${node.label}.variableName}\`.

<Properties>
`;
      for (const field of node.outputSchema) {
        mdx += `  <Property name="${field.name}" type="${field.type}">
    ${escapeForMdx(field.description)}
  </Property>
`;
      }
      mdx += `</Properties>

`;
    }

    // Example
    mdx += `### Example

\`\`\`json
{
  "id": "node-1",
  "type": "${node.type}",
  "label": "${node.label}",
  "config": {
${getRealisticExample(node)}
  },
  "outputs": {
    "success": "next-node",
    "error": "error-handler"
  }
}
\`\`\`

---

`;
  }

  return mdx;
}

function main() {
  console.log('Parsing nodeTemplates.ts...');
  const nodes = parseNodeTemplates();
  console.log(`Found ${nodes.length} nodes`);

  // Group by category
  const byCategory: Record<string, NodeTemplate[]> = {};
  for (const node of nodes) {
    if (!byCategory[node.category]) {
      byCategory[node.category] = [];
    }
    byCategory[node.category].push(node);
  }

  console.log('\nCategories:');
  for (const [cat, catNodes] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${catNodes.length} nodes`);
  }

  // Create output directories
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(NODES_JSON_PATH), { recursive: true });

  // Save nodes.json
  fs.writeFileSync(NODES_JSON_PATH, JSON.stringify(nodes, null, 2));
  console.log(`\nSaved nodes.json with ${nodes.length} nodes`);

  // Generate MDX for each category
  for (const [category, catNodes] of Object.entries(byCategory)) {
    const categoryDir = path.join(OUTPUT_DIR, category);
    fs.mkdirSync(categoryDir, { recursive: true });

    const mdx = generateCategoryMDX(category, catNodes);
    fs.writeFileSync(path.join(categoryDir, 'page.mdx'), mdx);
    console.log(`Generated ${category}/page.mdx (${catNodes.length} nodes)`);
  }

  console.log('\nDone!');
}

main();
