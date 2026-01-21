/**
 * Node Category Utilities
 * Common functions for getting category icons, colors, and labels
 */

import {
  Play,
  Globe,
  Mail,
  FileText,
  Table,
  File,
  Database,
  Bot,
  GitBranch,
  MessageSquare,
  Variable,
  FileJson,
  ShieldCheck,
  BarChart3,
  Key,
  Cog,
  Phone,
  FileWarning,
  Cloud,
  LucideIcon,
} from "lucide-react";

// ============================================================
// Category Colors
// ============================================================

const CATEGORY_COLORS: Record<string, string> = {
  trigger: "#10b981",     // Emerald
  web: "#3b82f6",         // Blue
  email: "#f59e0b",       // Amber
  excel: "#22c55e",       // Green
  files: "#8b5cf6",       // Violet
  pdf: "#ef4444",         // Red
  api: "#06b6d4",         // Cyan
  database: "#f97316",    // Orange
  data: "#06b6d4",        // Cyan (same as api)
  ai: "#a855f7",          // Purple
  control: "#64748b",     // Slate
  logging: "#71717a",     // Zinc
  variables: "#14b8a6",   // Teal
  json: "#eab308",        // Yellow
  compliance: "#059669",  // Emerald (dark)
  dataquality: "#0891b2", // Cyan (dark)
  secrets: "#dc2626",     // Red (dark)
  voice: "#7c3aed",       // Violet
  insurance: "#0d9488",   // Teal (dark)
  ms365: "#0078d4",       // Microsoft Blue
  default: "#6b7280",     // Gray
};

// ============================================================
// Category Icons
// ============================================================

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  trigger: Play,
  web: Globe,
  email: Mail,
  excel: Table,
  files: File,
  pdf: FileText,
  api: Cog,
  database: Database,
  data: Database,
  ai: Bot,
  control: GitBranch,
  logging: MessageSquare,
  variables: Variable,
  json: FileJson,
  compliance: ShieldCheck,
  dataquality: BarChart3,
  secrets: Key,
  voice: Phone,
  insurance: FileWarning,
  ms365: Cloud,
  default: Cog,
};

// ============================================================
// Category Labels
// ============================================================

const CATEGORY_LABELS: Record<string, string> = {
  trigger: "Triggers",
  web: "Web Automation",
  email: "Email",
  excel: "Excel",
  files: "Files",
  pdf: "PDF",
  api: "API",
  database: "Database",
  data: "Data Integration",
  ai: "AI",
  control: "Control Flow",
  logging: "Logging",
  variables: "Variables",
  json: "JSON",
  compliance: "Compliance",
  dataquality: "Data Quality",
  secrets: "Secrets",
  voice: "Voice & Telephony",
  insurance: "Insurance",
  ms365: "Microsoft 365",
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get the color for a category
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

/**
 * Get the icon component for a category
 */
export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
}

/**
 * Get the display label for a category
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Get all available categories
 */
export function getAllCategories(): string[] {
  return Object.keys(CATEGORY_LABELS);
}

/**
 * Check if a category exists
 */
export function isValidCategory(category: string): boolean {
  return category in CATEGORY_LABELS;
}

/**
 * Get category info object
 */
export function getCategoryInfo(category: string): {
  color: string;
  icon: LucideIcon;
  label: string;
} {
  return {
    color: getCategoryColor(category),
    icon: getCategoryIcon(category),
    label: getCategoryLabel(category),
  };
}
