/**
 * Design Tokens - Centralized design system for Skuldbot Studio
 * Single source of truth for colors, spacing, and component styles
 * 25 Categories for Complete RPA Platform
 */

import { NodeCategory } from "../types/flow";

// Category color system - unified across all components
export const categoryColors: Record<NodeCategory, {
  bg: string;
  bgLight: string;
  border: string;
  borderHover: string;
  text: string;
  textLight: string;
  accent: string;
  glow?: string;
  gradient?: string;
}> = {
  // Web Automation
  web: {
    bg: "bg-blue-100",
    bgLight: "bg-blue-50",
    border: "border-blue-200",
    borderHover: "border-blue-300",
    text: "text-blue-700",
    textLight: "text-blue-600",
    accent: "bg-blue-500",
    glow: "shadow-blue-500/20",
  },
  // Desktop Automation (Windows)
  desktop: {
    bg: "bg-indigo-100",
    bgLight: "bg-indigo-50",
    border: "border-indigo-200",
    borderHover: "border-indigo-300",
    text: "text-indigo-700",
    textLight: "text-indigo-600",
    accent: "bg-indigo-500",
    glow: "shadow-indigo-500/20",
  },
  // Storage - Multi-Provider (S3, Azure, GCS, SharePoint, etc.)
  storage: {
    bg: "bg-amber-100",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    borderHover: "border-amber-300",
    text: "text-amber-700",
    textLight: "text-amber-600",
    accent: "bg-gradient-to-r from-amber-500 to-orange-500",
    glow: "shadow-amber-500/30",
    gradient: "from-amber-500 to-orange-500",
  },
  // Files & Folders (uses Storage Provider)
  files: {
    bg: "bg-orange-100",
    bgLight: "bg-orange-50",
    border: "border-orange-200",
    borderHover: "border-orange-300",
    text: "text-orange-700",
    textLight: "text-orange-600",
    accent: "bg-orange-500",
    glow: "shadow-orange-500/20",
  },
  // Excel / CSV / Data
  excel: {
    bg: "bg-green-100",
    bgLight: "bg-green-50",
    border: "border-green-200",
    borderHover: "border-green-300",
    text: "text-green-700",
    textLight: "text-green-600",
    accent: "bg-green-500",
    glow: "shadow-green-500/20",
  },
  // Email
  email: {
    bg: "bg-pink-100",
    bgLight: "bg-pink-50",
    border: "border-pink-200",
    borderHover: "border-pink-300",
    text: "text-pink-700",
    textLight: "text-pink-600",
    accent: "bg-pink-500",
    glow: "shadow-pink-500/20",
  },
  // API & Integration
  api: {
    bg: "bg-emerald-100",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    borderHover: "border-emerald-300",
    text: "text-emerald-700",
    textLight: "text-emerald-600",
    accent: "bg-emerald-500",
    glow: "shadow-emerald-500/20",
  },
  // Database
  database: {
    bg: "bg-cyan-100",
    bgLight: "bg-cyan-50",
    border: "border-cyan-200",
    borderHover: "border-cyan-300",
    text: "text-cyan-700",
    textLight: "text-cyan-600",
    accent: "bg-cyan-500",
    glow: "shadow-cyan-500/20",
  },
  // PDF / OCR / Documents
  document: {
    bg: "bg-red-100",
    bgLight: "bg-red-50",
    border: "border-red-200",
    borderHover: "border-red-300",
    text: "text-red-700",
    textLight: "text-red-600",
    accent: "bg-red-500",
    glow: "shadow-red-500/20",
  },
  // AI / Intelligent Automation
  ai: {
    bg: "bg-violet-100",
    bgLight: "bg-violet-50",
    border: "border-violet-200",
    borderHover: "border-violet-300",
    text: "text-violet-700",
    textLight: "text-violet-600",
    accent: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
    glow: "shadow-violet-500/30",
    gradient: "from-violet-500 to-fuchsia-500",
  },
  // Code (JavaScript & Python - like n8n)
  code: {
    bg: "bg-slate-100",
    bgLight: "bg-slate-50",
    border: "border-slate-300",
    borderHover: "border-slate-400",
    text: "text-slate-700",
    textLight: "text-slate-600",
    accent: "bg-gradient-to-r from-orange-500 to-slate-600",
    glow: "shadow-slate-500/20",
    gradient: "from-orange-500 to-slate-600",
  },
  // Python Project Execution
  python: {
    bg: "bg-yellow-100",
    bgLight: "bg-yellow-50",
    border: "border-yellow-300",
    borderHover: "border-yellow-400",
    text: "text-yellow-700",
    textLight: "text-yellow-600",
    accent: "bg-gradient-to-r from-blue-500 to-yellow-500",
    glow: "shadow-yellow-500/20",
    gradient: "from-blue-500 to-yellow-500",
  },
  // Control Flow
  control: {
    bg: "bg-slate-100",
    bgLight: "bg-slate-50",
    border: "border-slate-200",
    borderHover: "border-slate-300",
    text: "text-slate-700",
    textLight: "text-slate-600",
    accent: "bg-slate-500",
  },
  // Logging & Monitoring
  logging: {
    bg: "bg-gray-100",
    bgLight: "bg-gray-50",
    border: "border-gray-200",
    borderHover: "border-gray-300",
    text: "text-gray-700",
    textLight: "text-gray-600",
    accent: "bg-gray-500",
  },
  // Security & Secrets
  security: {
    bg: "bg-amber-100",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    borderHover: "border-amber-300",
    text: "text-amber-700",
    textLight: "text-amber-600",
    accent: "bg-amber-500",
    glow: "shadow-amber-500/20",
  },
  // Human-in-the-loop
  human: {
    bg: "bg-teal-100",
    bgLight: "bg-teal-50",
    border: "border-teal-200",
    borderHover: "border-teal-300",
    text: "text-teal-700",
    textLight: "text-teal-600",
    accent: "bg-teal-500",
    glow: "shadow-teal-500/20",
  },
  // Compliance - PII/PHI Protection & HIPAA Safe Harbor
  compliance: {
    bg: "bg-rose-100",
    bgLight: "bg-rose-50",
    border: "border-rose-200",
    borderHover: "border-rose-300",
    text: "text-rose-700",
    textLight: "text-rose-600",
    accent: "bg-gradient-to-r from-rose-500 to-red-500",
    glow: "shadow-rose-500/30",
    gradient: "from-rose-500 to-red-500",
  },
  // Data Quality - Great Expectations
  dataquality: {
    bg: "bg-sky-100",
    bgLight: "bg-sky-50",
    border: "border-sky-200",
    borderHover: "border-sky-300",
    text: "text-sky-700",
    textLight: "text-sky-600",
    accent: "bg-gradient-to-r from-sky-500 to-blue-500",
    glow: "shadow-sky-500/30",
    gradient: "from-sky-500 to-blue-500",
  },
  // Scheduling & Triggers
  trigger: {
    bg: "bg-emerald-100",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    borderHover: "border-emerald-300",
    text: "text-emerald-700",
    textLight: "text-emerald-600",
    accent: "bg-emerald-500",
    glow: "shadow-emerald-500/20",
  },
  // Data Integration (Taps & Targets)
  data: {
    bg: "bg-teal-100",
    bgLight: "bg-teal-50",
    border: "border-teal-200",
    borderHover: "border-teal-300",
    text: "text-teal-700",
    textLight: "text-teal-600",
    accent: "bg-teal-500",
    glow: "shadow-teal-500/20",
    gradient: "from-teal-500 to-cyan-500",
  },
  // Vector Databases / Memory (RAG)
  vectordb: {
    bg: "bg-purple-100",
    bgLight: "bg-purple-50",
    border: "border-purple-200",
    borderHover: "border-purple-300",
    text: "text-purple-700",
    textLight: "text-purple-600",
    accent: "bg-gradient-to-r from-purple-500 to-indigo-500",
    glow: "shadow-purple-500/30",
    gradient: "from-purple-500 to-indigo-500",
  },
  // Voice & Telephony (Twilio + Azure Speech)
  voice: {
    bg: "bg-fuchsia-100",
    bgLight: "bg-fuchsia-50",
    border: "border-fuchsia-200",
    borderHover: "border-fuchsia-300",
    text: "text-fuchsia-700",
    textLight: "text-fuchsia-600",
    accent: "bg-fuchsia-500",
    glow: "shadow-fuchsia-500/20",
  },
  // Insurance (FNOL, Policy, Claims)
  insurance: {
    bg: "bg-lime-100",
    bgLight: "bg-lime-50",
    border: "border-lime-200",
    borderHover: "border-lime-300",
    text: "text-lime-700",
    textLight: "text-lime-600",
    accent: "bg-lime-500",
    glow: "shadow-lime-500/20",
  },
  // Microsoft 365 (Outlook, Calendar, OneDrive, Teams)
  ms365: {
    bg: "bg-sky-100",
    bgLight: "bg-sky-50",
    border: "border-sky-200",
    borderHover: "border-sky-300",
    text: "text-sky-700",
    textLight: "text-sky-600",
    accent: "bg-[#0078d4]",
    glow: "shadow-sky-500/20",
  },
  // Bot Subprocess (Call other bots)
  bot: {
    bg: "bg-rose-100",
    bgLight: "bg-rose-50",
    border: "border-rose-200",
    borderHover: "border-rose-300",
    text: "text-rose-700",
    textLight: "text-rose-600",
    accent: "bg-rose-500",
    glow: "shadow-rose-500/20",
  },
};

// Category icons for sidebar
export const categoryIcons: Record<NodeCategory, string> = {
  web: "Globe",
  desktop: "Monitor",
  storage: "HardDrive",
  files: "FolderOpen",
  excel: "Table2",
  email: "Mail",
  api: "Webhook",
  database: "Database",
  document: "FileText",
  ai: "Sparkles",
  code: "Code",
  python: "Code2",
  control: "GitBranch",
  logging: "ScrollText",
  security: "Shield",
  human: "UserCheck",
  compliance: "ShieldCheck",
  dataquality: "BadgeCheck",
  trigger: "Zap",
  data: "Database",
  vectordb: "Boxes",
  voice: "Phone",
  insurance: "FileCheck",
  ms365: "Cloud",
  bot: "Package",
};

// Category display names
export const categoryNames: Record<NodeCategory, string> = {
  web: "Web Automation",
  desktop: "Desktop Automation",
  storage: "Storage Providers",
  files: "Files & Folders",
  excel: "Excel / CSV / Data",
  email: "Email",
  api: "API & Integration",
  database: "Database",
  document: "PDF / OCR / Documents",
  ai: "AI / Intelligent",
  code: "Code (JS/Python)",
  python: "Python Execution",
  control: "Control Flow",
  logging: "Logging & Monitoring",
  security: "Security & Secrets",
  human: "Human-in-the-loop",
  compliance: "Compliance & Privacy",
  dataquality: "Data Quality",
  trigger: "Scheduling & Triggers",
  data: "Data Integration",
  vectordb: "Vector Database",
  voice: "Voice & Telephony",
  insurance: "Insurance",
  ms365: "Microsoft 365",
  bot: "Bot Subprocess",
};

// Category order for sidebar display (most used first)
export const categoryOrder: NodeCategory[] = [
  "trigger",
  "bot",         // Bot Subprocess (Call other bots)
  "web",
  "desktop",
  "storage",
  "files",
  "excel",
  "email",
  "ms365",       // Microsoft 365 (Outlook, Calendar, OneDrive, Teams)
  "api",
  "database",
  "data",        // Data Integration (Taps & Targets)
  "document",
  "ai",
  "vectordb",    // Vector Database / RAG
  "dataquality",
  "compliance",
  "code",        // Code (JS/Python)
  "python",
  "control",
  "logging",
  "security",
  "human",
  "voice",       // Voice & Telephony
  "insurance",   // Insurance
];

// Status colors for logs, toasts, etc.
export const statusColors = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "text-emerald-500",
    dark: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-400",
    },
  },
  error: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    icon: "text-rose-500",
    dark: {
      bg: "bg-rose-500/20",
      text: "text-rose-400",
    },
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "text-amber-500",
    dark: {
      bg: "bg-amber-500/20",
      text: "text-amber-400",
    },
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    icon: "text-sky-500",
    dark: {
      bg: "bg-sky-500/20",
      text: "text-sky-400",
    },
  },
  debug: {
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-600",
    icon: "text-neutral-400",
    dark: {
      bg: "bg-neutral-500/20",
      text: "text-neutral-400",
    },
  },
};

// Button variants
export const buttonVariants = {
  primary: `
    inline-flex items-center justify-center gap-2
    bg-primary text-primary-foreground font-medium
    hover:bg-primary/90 active:bg-primary/80
    shadow-sm hover:shadow
    disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
    transition-all duration-150
  `,
  secondary: `
    inline-flex items-center justify-center gap-2
    bg-white text-neutral-700 font-medium
    border border-neutral-300
    hover:bg-neutral-50 hover:border-neutral-400
    active:bg-neutral-100
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-all duration-150
  `,
  ghost: `
    inline-flex items-center justify-center gap-2
    text-neutral-500 font-medium
    hover:bg-neutral-100 hover:text-neutral-700
    active:bg-neutral-200
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-all duration-150
  `,
  danger: `
    inline-flex items-center justify-center gap-2
    text-neutral-500 font-medium
    hover:bg-rose-50 hover:text-rose-600
    active:bg-rose-100
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-all duration-150
  `,
};

// Button sizes
export const buttonSizes = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-10 px-5 text-sm rounded-lg",
  icon: {
    sm: "h-8 w-8 rounded-md",
    md: "h-9 w-9 rounded-lg",
    lg: "h-10 w-10 rounded-lg",
  },
};

// Input styles
export const inputStyles = {
  base: `
    w-full
    text-sm text-neutral-900 placeholder:text-neutral-400
    bg-neutral-50 border border-neutral-200 rounded-lg
    focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white
    transition-all duration-150
  `,
  sizes: {
    sm: "h-8 px-2.5 text-xs",
    md: "h-10 px-3",
    lg: "h-11 px-4",
  },
};

// Card styles
export const cardStyles = {
  base: "bg-white rounded-xl border border-neutral-200",
  elevated: "bg-white rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow",
  interactive: "bg-white rounded-xl border border-neutral-200 shadow-sm hover:shadow-lg hover:border-neutral-300 transition-all cursor-pointer",
};
