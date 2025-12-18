import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import {
  ProjectManifest,
  BotReference,
  BotState,
  RecentProject,
  EnvConfig,
  ProjectStructure,
} from "../types/project";
import { FlowNode, FlowEdge, BotDSL } from "../types/flow";
import { useToastStore } from "./toastStore";

// ============================================================
// Project Store State
// ============================================================

interface ProjectStoreState {
  // Current project
  project: ProjectManifest | null;
  projectPath: string | null;
  structure: ProjectStructure | null;

  // Bots in project
  bots: Map<string, BotState>;
  activeBotId: string | null;

  // Recent projects
  recentProjects: RecentProject[];

  // Environment
  envConfig: EnvConfig | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;

  // Actions - Project
  createProject: (path: string, name: string, description?: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  saveProject: () => Promise<void>;

  // Actions - Bot
  createBot: (name: string, description?: string) => Promise<string | null>;
  openBot: (botId: string) => Promise<void>;
  saveBot: (botId: string, silent?: boolean) => Promise<void>;
  saveBotDSL: (botId: string, nodes: FlowNode[], edges: FlowEdge[]) => Promise<void>;
  deleteBot: (botId: string) => Promise<void>;
  renameBot: (botId: string, newName: string) => Promise<void>;

  // Actions - Active bot
  getActiveBot: () => BotState | null;
  setActiveBot: (botId: string | null) => void;
  updateActiveBotNodes: (nodes: FlowNode[]) => void;
  updateActiveBotEdges: (edges: FlowEdge[]) => void;
  setActiveBotDirty: (isDirty: boolean) => void;

  // Actions - Recent projects
  loadRecentProjects: () => Promise<void>;
  removeRecentProject: (path: string) => Promise<void>;

  // Helpers
  getBotFullPath: (botId: string) => string | null;
  hasUnsavedChanges: () => boolean;
}

// ============================================================
// Helper Functions
// ============================================================

function createProjectStructure(projectPath: string): ProjectStructure {
  return {
    rootPath: projectPath,
    manifestPath: `${projectPath}/proyecto.skuld`,
    botsDir: `${projectPath}/bots`,
    sharedDir: `${projectPath}/shared`,
    configDir: `${projectPath}/.skuldbot`,
  };
}

function dslToFlowNodes(dsl: BotDSL): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = dsl.nodes.map((dslNode, index) => ({
    id: dslNode.id,
    type: "customNode",
    // Use saved position if available, otherwise calculate a default
    position: dslNode.position || { x: 250, y: 100 + index * 150 },
    data: {
      label: dslNode.label || dslNode.type,
      nodeType: dslNode.type,
      config: dslNode.config,
      category: dslNode.type.split(".")[0] as any,
    },
  }));

  const edges: FlowEdge[] = [];
  dsl.nodes.forEach((dslNode) => {
    if (dslNode.outputs.success !== dslNode.id && dslNode.outputs.success !== "END") {
      edges.push({
        id: `${dslNode.id}-success-${dslNode.outputs.success}`,
        source: dslNode.id,
        target: dslNode.outputs.success,
        sourceHandle: "success",
        type: "animated",
        data: { edgeType: "success" },
      });
    }
    if (dslNode.outputs.error !== dslNode.id && dslNode.outputs.error !== "END") {
      edges.push({
        id: `${dslNode.id}-error-${dslNode.outputs.error}`,
        source: dslNode.id,
        target: dslNode.outputs.error,
        sourceHandle: "error",
        type: "animated",
        data: { edgeType: "error" },
      });
    }
  });

  return { nodes, edges };
}

function flowNodesToDSL(
  botId: string,
  botName: string,
  botDescription: string | undefined,
  nodes: FlowNode[],
  edges: FlowEdge[]
): BotDSL {
  const dslNodes = nodes.map((node) => {
    const successEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "success"
    );
    const errorEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "error"
    );

    return {
      id: node.id,
      type: node.data.nodeType,
      config: node.data.config,
      outputs: {
        success: successEdge?.target || "END",
        error: errorEdge?.target || "END",
      },
      label: node.data.label,
      position: node.position,  // Save visual position
    };
  });

  const triggerNodes = nodes.filter((node) => node.data.category === "trigger");
  const triggerIds = triggerNodes.map((node) => node.id);

  // Determinar start_node: preferir nodo trigger, sino el primer nodo
  let startNode: string | undefined;
  if (triggerNodes.length > 0) {
    startNode = triggerNodes[0].id;
  } else if (nodes.length > 0) {
    startNode = nodes[0].id;
  }

  return {
    version: "1.0",
    bot: {
      id: botId,
      name: botName,
      description: botDescription,
    },
    nodes: dslNodes,
    triggers: triggerIds.length > 0 ? triggerIds : undefined,
    start_node: startNode,
  };
}

// ============================================================
// Project Store
// ============================================================

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  // Initial state
  project: null,
  projectPath: null,
  structure: null,
  bots: new Map(),
  activeBotId: null,
  recentProjects: [],
  envConfig: null,
  isLoading: false,
  isSaving: false,

  // ============================================================
  // Project Actions
  // ============================================================

  createProject: async (path, name, description) => {
    const toast = useToastStore.getState();
    set({ isLoading: true });

    try {
      const manifest = await invoke<ProjectManifest>("create_project", {
        path,
        name,
        description,
      });

      const structure = createProjectStructure(path);

      set({
        project: manifest,
        projectPath: path,
        structure,
        bots: new Map(),
        activeBotId: null,
        isLoading: false,
      });

      toast.success("Project created", `${name} created successfully`);

      // Refresh recent projects
      get().loadRecentProjects();
    } catch (error) {
      console.error("Failed to create project:", error);
      toast.error("Error creating project", String(error));
      set({ isLoading: false });
    }
  },

  openProject: async (path) => {
    const toast = useToastStore.getState();
    set({ isLoading: true });

    try {
      const manifest = await invoke<ProjectManifest>("open_project", { path });
      const projectDir = path.endsWith(".skuld")
        ? path.substring(0, path.lastIndexOf("/"))
        : path;
      const structure = createProjectStructure(projectDir);

      // Load bots metadata (not full content yet)
      const botsMap = new Map<string, BotState>();
      for (const botRef of manifest.bots) {
        botsMap.set(botRef.id, {
          id: botRef.id,
          name: botRef.name,
          description: botRef.description,
          nodes: [],
          edges: [],
          path: `${projectDir}/${botRef.path}`,
          isDirty: false,
          historyIndex: -1,
          history: [],
        });
      }

      set({
        project: manifest,
        projectPath: projectDir,
        structure,
        bots: botsMap,
        activeBotId: null,
        isLoading: false,
      });

      toast.success("Project opened", manifest.project.name);

      // Refresh recent projects
      get().loadRecentProjects();
    } catch (error) {
      console.error("Failed to open project:", error);
      toast.error("Error opening project", String(error));
      set({ isLoading: false });
    }
  },

  closeProject: () => {
    // Check for unsaved changes
    const { hasUnsavedChanges } = get();
    if (hasUnsavedChanges()) {
      // TODO: Show confirmation dialog
      console.warn("Closing project with unsaved changes");
    }

    set({
      project: null,
      projectPath: null,
      structure: null,
      bots: new Map(),
      activeBotId: null,
      envConfig: null,
    });
  },

  saveProject: async () => {
    const { project, projectPath, structure } = get();
    const toast = useToastStore.getState();

    if (!project || !projectPath || !structure) {
      toast.warning("No project", "No project is currently open");
      return;
    }

    set({ isSaving: true });

    try {
      await invoke("save_project_manifest", {
        path: structure.manifestPath,
        manifest: project,
      });

      toast.success("Project saved", "All changes saved");
      set({ isSaving: false });
    } catch (error) {
      console.error("Failed to save project:", error);
      toast.error("Error saving project", String(error));
      set({ isSaving: false });
    }
  },

  // ============================================================
  // Bot Actions
  // ============================================================

  createBot: async (name, description) => {
    const { project, projectPath, structure } = get();
    const toast = useToastStore.getState();

    if (!project || !projectPath || !structure) {
      toast.warning("No project", "Open a project first");
      return null;
    }

    try {
      const botRef = await invoke<BotReference>("create_bot", {
        projectPath,
        name,
        description,
      });

      // Create bot state
      const botState: BotState = {
        id: botRef.id,
        name: botRef.name,
        description: botRef.description,
        nodes: [],
        edges: [],
        path: `${projectPath}/${botRef.path}`,
        isDirty: false,
        historyIndex: -1,
        history: [],
      };

      // Update bots map
      const newBots = new Map(get().bots);
      newBots.set(botRef.id, botState);

      // Update project manifest
      const updatedProject = {
        ...project,
        bots: [...project.bots, botRef],
      };

      set({
        bots: newBots,
        project: updatedProject,
      });

      // Save manifest
      await invoke("save_project_manifest", {
        path: structure.manifestPath,
        manifest: updatedProject,
      });

      toast.success("Bot created", name);
      return botRef.id;
    } catch (error) {
      console.error("Failed to create bot:", error);
      toast.error("Error creating bot", String(error));
      return null;
    }
  },

  openBot: async (botId) => {
    const { bots, structure, projectPath } = get();
    const toast = useToastStore.getState();

    const bot = bots.get(botId);
    if (!bot || !structure || !projectPath) {
      toast.error("Bot not found", `Bot ${botId} not found`);
      return;
    }

    try {
      // Load bot DSL from disk
      const dsl = await invoke<BotDSL>("load_bot", {
        botPath: bot.path,
      });

      // Convert DSL to flow nodes
      const { nodes, edges } = dslToFlowNodes(dsl);

      // Update bot state
      const updatedBot: BotState = {
        ...bot,
        nodes,
        edges,
        isDirty: false,
        lastSaved: new Date().toISOString(),
      };

      const newBots = new Map(bots);
      newBots.set(botId, updatedBot);

      set({
        bots: newBots,
        activeBotId: botId,
      });
    } catch (error) {
      console.error("Failed to open bot:", error);
      toast.error("Error opening bot", String(error));
    }
  },

  saveBot: async (botId, silent = false) => {
    const { bots } = get();
    const toast = useToastStore.getState();

    const bot = bots.get(botId);
    if (!bot || !bot.path) {
      if (!silent) {
        toast.error("Bot not found", `Bot ${botId} not found`);
      }
      return;
    }

    set({ isSaving: true });

    try {
      // Convert flow nodes to DSL
      const dsl = flowNodesToDSL(
        bot.id,
        bot.name,
        bot.description,
        bot.nodes,
        bot.edges
      );

      // Save to disk
      await invoke("save_bot", {
        botPath: bot.path,
        dsl: JSON.stringify(dsl, null, 2),
      });

      // Update bot state
      const updatedBot: BotState = {
        ...bot,
        isDirty: false,
        lastSaved: new Date().toISOString(),
      };

      const newBots = new Map(bots);
      newBots.set(botId, updatedBot);

      set({ bots: newBots, isSaving: false });

      if (!silent) {
        toast.success("Bot saved", bot.name);
      }
    } catch (error) {
      console.error("Failed to save bot:", error);
      if (!silent) {
        toast.error("Error saving bot", String(error));
      }
      set({ isSaving: false });
    }
  },

  saveBotDSL: async (botId, nodes, edges) => {
    const { bots } = get();
    const bot = bots.get(botId);

    if (!bot) return;

    // Update bot state with new nodes/edges
    const updatedBot: BotState = {
      ...bot,
      nodes,
      edges,
      isDirty: true,
    };

    const newBots = new Map(bots);
    newBots.set(botId, updatedBot);
    set({ bots: newBots });

    // Then trigger save
    await get().saveBot(botId);
  },

  deleteBot: async (botId) => {
    const { project, bots, structure, activeBotId } = get();
    const toast = useToastStore.getState();

    if (!project || !structure) return;

    const bot = bots.get(botId);
    if (!bot || !bot.path) {
      toast.error("Bot not found", `Bot ${botId} not found`);
      return;
    }

    try {
      // Delete from disk
      await invoke("delete_bot", { botPath: bot.path });

      // Update bots map
      const newBots = new Map(bots);
      newBots.delete(botId);

      // Update project manifest
      const updatedProject = {
        ...project,
        bots: project.bots.filter((b) => b.id !== botId),
      };

      // Clear active bot if it was deleted
      const newActiveBotId = activeBotId === botId ? null : activeBotId;

      set({
        bots: newBots,
        project: updatedProject,
        activeBotId: newActiveBotId,
      });

      // Save manifest
      await invoke("save_project_manifest", {
        path: structure.manifestPath,
        manifest: updatedProject,
      });

      toast.success("Bot deleted", bot.name);
    } catch (error) {
      console.error("Failed to delete bot:", error);
      toast.error("Error deleting bot", String(error));
    }
  },

  renameBot: async (botId, newName) => {
    const { project, bots, structure } = get();
    const toast = useToastStore.getState();

    if (!project || !structure) return;

    const bot = bots.get(botId);
    if (!bot) {
      toast.error("Bot not found", `Bot ${botId} not found`);
      return;
    }

    try {
      // Update bot state
      const updatedBot: BotState = {
        ...bot,
        name: newName,
        isDirty: true,
      };

      const newBots = new Map(bots);
      newBots.set(botId, updatedBot);

      // Update project manifest
      const updatedProject = {
        ...project,
        bots: project.bots.map((b) =>
          b.id === botId ? { ...b, name: newName } : b
        ),
      };

      set({
        bots: newBots,
        project: updatedProject,
      });

      // Save both bot and manifest
      await get().saveBot(botId);
      await invoke("save_project_manifest", {
        path: structure.manifestPath,
        manifest: updatedProject,
      });

      toast.success("Bot renamed", newName);
    } catch (error) {
      console.error("Failed to rename bot:", error);
      toast.error("Error renaming bot", String(error));
    }
  },

  // ============================================================
  // Active Bot Actions
  // ============================================================

  getActiveBot: () => {
    const { bots, activeBotId } = get();
    if (!activeBotId) return null;
    return bots.get(activeBotId) || null;
  },

  setActiveBot: (botId) => {
    set({ activeBotId: botId });
  },

  updateActiveBotNodes: (nodes) => {
    const { bots, activeBotId } = get();
    if (!activeBotId) return;

    const bot = bots.get(activeBotId);
    if (!bot) return;

    const updatedBot: BotState = {
      ...bot,
      nodes,
      isDirty: true,
    };

    const newBots = new Map(bots);
    newBots.set(activeBotId, updatedBot);
    set({ bots: newBots });
  },

  updateActiveBotEdges: (edges) => {
    const { bots, activeBotId } = get();
    if (!activeBotId) return;

    const bot = bots.get(activeBotId);
    if (!bot) return;

    const updatedBot: BotState = {
      ...bot,
      edges,
      isDirty: true,
    };

    const newBots = new Map(bots);
    newBots.set(activeBotId, updatedBot);
    set({ bots: newBots });
  },

  setActiveBotDirty: (isDirty) => {
    const { bots, activeBotId } = get();
    if (!activeBotId) return;

    const bot = bots.get(activeBotId);
    if (!bot) return;

    const updatedBot: BotState = {
      ...bot,
      isDirty,
    };

    const newBots = new Map(bots);
    newBots.set(activeBotId, updatedBot);
    set({ bots: newBots });
  },

  // ============================================================
  // Recent Projects
  // ============================================================

  loadRecentProjects: async () => {
    try {
      const recent = await invoke<RecentProject[]>("get_recent_projects");
      set({ recentProjects: recent });
    } catch (error) {
      console.error("Failed to load recent projects:", error);
    }
  },

  removeRecentProject: async (path) => {
    try {
      await invoke("remove_recent_project", { path });
      await get().loadRecentProjects();
    } catch (error) {
      console.error("Failed to remove recent project:", error);
    }
  },

  // ============================================================
  // Helpers
  // ============================================================

  getBotFullPath: (botId) => {
    const { bots } = get();
    const bot = bots.get(botId);
    return bot?.path || null;
  },

  hasUnsavedChanges: () => {
    const { bots } = get();
    for (const bot of bots.values()) {
      if (bot.isDirty) return true;
    }
    return false;
  },
}));
