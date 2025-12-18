// ============================================================
// Project System Types for SkuldBot Studio
// ============================================================

import { FlowNode, FlowEdge } from "./flow";

// ============================================================
// Project Manifest (.skuld file)
// ============================================================

export interface ProjectManifest {
  version: "1.0";
  project: {
    id: string;
    name: string;
    description?: string;
    created: string;
    updated: string;
    author?: string;
  };
  settings: ProjectSettings;
  bots: BotReference[];
}

export interface ProjectSettings {
  defaultBrowser?: "chromium" | "firefox" | "webkit";
  defaultHeadless?: boolean;
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  autoSave?: {
    enabled: boolean;
    intervalMs: number;
  };
  versionHistory?: {
    enabled: boolean;
    maxVersions: number;
  };
}

export interface BotReference {
  id: string;
  name: string;
  path: string; // Relative path from project root, e.g., "bots/extractor"
  description?: string;
  tags?: string[];
  created: string;
  updated: string;
}

// ============================================================
// Bot State (extends BotDSL for editor state)
// ============================================================

export interface BotState {
  // Bot metadata
  id: string;
  name: string;
  description?: string;

  // Flow editor state
  nodes: FlowNode[];
  edges: FlowEdge[];

  // File state
  path?: string; // Full path to bot.json
  isDirty: boolean;
  lastSaved?: string;

  // Version history
  historyIndex: number;
  history: BotSnapshot[];
}

export interface BotSnapshot {
  id: string;
  timestamp: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  description?: string; // Optional description of what changed
}

// ============================================================
// Project Structure
// ============================================================

/**
 * Project folder structure:
 *
 * mi-proyecto/
 * ├── proyecto.skuld                 # Manifest principal (JSON)
 * ├── bots/
 * │   ├── extractor/
 * │   │   ├── bot.json              # DSL del bot
 * │   │   ├── .history/             # Historial de versiones
 * │   │   └── assets/               # Assets específicos del bot
 * │   └── procesador/
 * │       └── ...
 * ├── shared/
 * │   ├── assets/                   # Assets compartidos
 * │   ├── scripts/                  # Python scripts reutilizables
 * │   └── node-templates/           # Templates de nodos custom
 * ├── .skuldbot/
 * │   ├── config.json               # Config local (no se commitea)
 * │   ├── env.local                 # Variables locales (gitignored)
 * │   └── cache/                    # Cache de compilación
 * └── .gitignore
 */

export interface ProjectStructure {
  rootPath: string;
  manifestPath: string;
  botsDir: string;
  sharedDir: string;
  configDir: string;
}

// ============================================================
// Assets
// ============================================================

export type AssetType = "image" | "file" | "script" | "template" | "data";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string; // Relative path from project root
  size: number;
  mimeType?: string;
  created: string;
  updated: string;
  thumbnail?: string; // Base64 for images
  scope: "bot" | "shared"; // Bot-specific or shared
  botId?: string; // If scope is "bot"
}

// ============================================================
// Environment Variables
// ============================================================

export type EnvScope = "development" | "staging" | "production";

export interface EnvVariable {
  name: string;
  value: string;
  isSecret: boolean;
  scope: EnvScope[];
  description?: string;
}

export interface EnvConfig {
  activeScope: EnvScope;
  variables: EnvVariable[];
}

// ============================================================
// Templates
// ============================================================

export interface NodeGroupTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  thumbnail?: string;
  author?: string;
  created: string;
  tags?: string[];
}

// ============================================================
// Recent Projects
// ============================================================

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  thumbnail?: string;
}

// ============================================================
// Tab System
// ============================================================

export interface Tab {
  id: string;
  type: "bot" | "settings" | "env" | "assets";
  botId?: string;
  title: string;
  icon?: string;
  isDirty: boolean;
  isActive: boolean;
}

// ============================================================
// Navigation
// ============================================================

export type NavigationView =
  | "welcome"      // Welcome screen / no project
  | "quickstart"   // Quick Start mode - single bot without project
  | "project"      // Project with bots
  | "loading";     // Loading state

export interface NavigationState {
  currentView: NavigationView;
  sidebarCollapsed: boolean;
  rightPanelWidth: number;
  projectExplorerWidth: number;
}

// ============================================================
// Store Types
// ============================================================

export interface ProjectStoreState {
  // Current project
  project: ProjectManifest | null;
  projectPath: string | null;

  // Project structure
  structure: ProjectStructure | null;

  // Bots in project
  bots: Map<string, BotState>;
  activeBotId: string | null;

  // Recent projects
  recentProjects: RecentProject[];

  // Environment
  envConfig: EnvConfig | null;

  // Actions
  createProject: (path: string, name: string, description?: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  saveProject: () => Promise<void>;

  // Bot actions
  createBot: (name: string, description?: string) => Promise<string>;
  openBot: (botId: string) => Promise<void>;
  saveBot: (botId: string) => Promise<void>;
  deleteBot: (botId: string) => Promise<void>;
  renameBot: (botId: string, newName: string) => Promise<void>;

  // Active bot
  getActiveBot: () => BotState | null;
  setActiveBot: (botId: string | null) => void;
}

export interface TabsStoreState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab: (tab: Omit<Tab, "isActive">) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

export interface NavigationStoreState {
  currentView: NavigationView;
  sidebarCollapsed: boolean;
  projectExplorerWidth: number;
  rightPanelWidth: number;
  logsHeight: number;

  // Actions
  setView: (view: NavigationView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setProjectExplorerWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setLogsHeight: (height: number) => void;
}

// ============================================================
// Tauri Command Results
// ============================================================

export interface ProjectCommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: string;
}
