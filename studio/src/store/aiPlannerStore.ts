import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import {
  PlanStep,
  ConversationMessage,
  LLMConfig,
  PlannerPhase,
  LLMPlanResponse,
} from "../types/ai-planner";
import { useToastStore } from "./toastStore";
import { useLicenseStore } from "./licenseStore";

// ============================================================
// AI Planner Store State
// ============================================================

interface AIPlannerStoreState {
  // Panel state
  isPanelOpen: boolean;
  currentPhase: PlannerPhase;

  // User input
  userDescription: string;

  // Generated plan
  planSteps: PlanStep[];
  isGenerating: boolean;
  error: string | null;

  // Conversation history for refinement
  conversation: ConversationMessage[];
  refinementInput: string;

  // LLM configuration
  llmConfig: LLMConfig;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  setUserDescription: (desc: string) => void;
  setRefinementInput: (input: string) => void;
  generatePlan: () => Promise<void>;
  addPlanStep: (step: Omit<PlanStep, "id">, afterId?: string) => void;
  updatePlanStep: (id: string, updates: Partial<PlanStep>) => void;
  removePlanStep: (id: string) => void;
  reorderPlanSteps: (fromIndex: number, toIndex: number) => void;
  refineWithAI: (userMessage: string) => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
}

// ============================================================
// Helper Functions
// ============================================================

function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// Default LLM Config
// ============================================================

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
};

// ============================================================
// AI Planner Store
// ============================================================

export const useAIPlannerStore = create<AIPlannerStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPanelOpen: false,
      currentPhase: "input",
      userDescription: "",
      planSteps: [],
      isGenerating: false,
      error: null,
      conversation: [],
      refinementInput: "",
      llmConfig: DEFAULT_LLM_CONFIG,

  // ============================================================
  // Panel Actions
  // ============================================================

  openPanel: () => {
    const license = useLicenseStore.getState();
    const toast = useToastStore.getState();

    // Check if AI Planner feature is available
    if (!license.hasFeature("aiPlanner")) {
      toast.warning(
        "License Required",
        "AI Planner requires a SkuldAI license. Please activate your license."
      );
      // Still open panel to show license prompt
    }

    set({ isPanelOpen: true });
  },

  closePanel: () => {
    set({ isPanelOpen: false });
  },

  // ============================================================
  // Input Actions
  // ============================================================

  setUserDescription: (desc: string) => {
    set({ userDescription: desc });
  },

  setRefinementInput: (input: string) => {
    set({ refinementInput: input });
  },

  // ============================================================
  // Plan Generation
  // ============================================================

  generatePlan: async () => {
    const { userDescription, llmConfig } = get();
    const toast = useToastStore.getState();
    const license = useLicenseStore.getState();

    // Check license
    if (!license.hasFeature("aiPlanner")) {
      toast.error("License Required", "AI Planner requires a SkuldAI license");
      return;
    }

    if (!userDescription.trim()) {
      toast.warning("Empty Description", "Please describe what you want to automate");
      return;
    }

    set({ isGenerating: true, error: null });

    try {
      // Call Tauri backend to generate plan
      const response = await invoke<LLMPlanResponse>("ai_generate_plan", {
        description: userDescription,
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        baseUrl: llmConfig.baseUrl || null,
        apiKey: llmConfig.apiKey || null,
      });

      if (!response.success || !response.plan) {
        throw new Error(response.error || "Failed to generate plan");
      }

      // Add IDs to plan steps if not present
      const stepsWithIds = response.plan.map((step) => ({
        ...step,
        id: step.id || generateStepId(),
      }));

      // Initialize conversation with the description
      const initialMessage: ConversationMessage = {
        id: generateMessageId(),
        role: "user",
        content: userDescription,
        timestamp: new Date().toISOString(),
      };

      const assistantMessage: ConversationMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: `I've created a ${stepsWithIds.length}-step automation plan based on your description. You can review, edit, or refine the steps below.`,
        timestamp: new Date().toISOString(),
      };

      set({
        planSteps: stepsWithIds,
        isGenerating: false,
        currentPhase: "plan",
        conversation: [initialMessage, assistantMessage],
      });

      toast.success("Plan Generated", `Created ${stepsWithIds.length} automation steps`);
    } catch (error) {
      console.error("Failed to generate plan:", error);
      set({
        isGenerating: false,
        error: String(error),
      });
      toast.error("Generation Failed", String(error));
    }
  },

  // ============================================================
  // Plan Step Manipulation
  // ============================================================

  addPlanStep: (step: Omit<PlanStep, "id">, afterId?: string) => {
    const { planSteps } = get();
    const newStep: PlanStep = {
      ...step,
      id: generateStepId(),
      isManual: true,
    };

    let newSteps: PlanStep[];

    if (afterId) {
      const afterIndex = planSteps.findIndex((s) => s.id === afterId);
      if (afterIndex >= 0) {
        newSteps = [
          ...planSteps.slice(0, afterIndex + 1),
          newStep,
          ...planSteps.slice(afterIndex + 1),
        ];
      } else {
        newSteps = [...planSteps, newStep];
      }
    } else {
      newSteps = [...planSteps, newStep];
    }

    set({ planSteps: newSteps });
  },

  updatePlanStep: (id: string, updates: Partial<PlanStep>) => {
    const { planSteps } = get();
    const newSteps = planSteps.map((step) =>
      step.id === id ? { ...step, ...updates } : step
    );
    set({ planSteps: newSteps });
  },

  removePlanStep: (id: string) => {
    const { planSteps } = get();
    const newSteps = planSteps.filter((step) => step.id !== id);
    set({ planSteps: newSteps });
  },

  reorderPlanSteps: (fromIndex: number, toIndex: number) => {
    const { planSteps } = get();

    if (fromIndex < 0 || fromIndex >= planSteps.length) return;
    if (toIndex < 0 || toIndex >= planSteps.length) return;

    const newSteps = [...planSteps];
    const [removed] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, removed);

    set({ planSteps: newSteps });
  },

  // ============================================================
  // AI Refinement
  // ============================================================

  refineWithAI: async (userMessage: string) => {
    const { planSteps, llmConfig, conversation } = get();
    const toast = useToastStore.getState();
    const license = useLicenseStore.getState();

    // Check license
    if (!license.hasFeature("aiRefinement")) {
      toast.error("License Required", "AI Refinement requires a SkuldAI license");
      return;
    }

    if (!userMessage.trim()) {
      return;
    }

    // Add user message to conversation
    const newUserMessage: ConversationMessage = {
      id: generateMessageId(),
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    set({
      isGenerating: true,
      currentPhase: "refining",
      conversation: [...conversation, newUserMessage],
      refinementInput: "",
    });

    try {
      // Call Tauri backend to refine plan
      const response = await invoke<LLMPlanResponse>("ai_refine_plan", {
        currentPlan: JSON.stringify(planSteps),
        userRequest: userMessage,
        conversationHistory: JSON.stringify(conversation),
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        baseUrl: llmConfig.baseUrl || null,
        apiKey: llmConfig.apiKey || null,
      });

      if (!response.success || !response.plan) {
        throw new Error(response.error || "Failed to refine plan");
      }

      // Add IDs to new steps if not present
      const refinedSteps = response.plan.map((step) => ({
        ...step,
        id: step.id || generateStepId(),
      }));

      // Add assistant response
      const assistantMessage: ConversationMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: `I've updated the plan based on your request. The plan now has ${refinedSteps.length} steps.`,
        timestamp: new Date().toISOString(),
      };

      set({
        planSteps: refinedSteps,
        isGenerating: false,
        currentPhase: "plan",
        conversation: [...get().conversation, assistantMessage],
      });

      toast.success("Plan Refined", "Your automation plan has been updated");
    } catch (error) {
      console.error("Failed to refine plan:", error);

      // Add error message to conversation
      const errorMessage: ConversationMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: `Sorry, I encountered an error while refining the plan: ${String(error)}`,
        timestamp: new Date().toISOString(),
      };

      set({
        isGenerating: false,
        currentPhase: "plan",
        error: String(error),
        conversation: [...get().conversation, errorMessage],
      });

      toast.error("Refinement Failed", String(error));
    }
  },

  // ============================================================
  // Apply to Canvas
  // ============================================================

  applyToCanvas: () => {
    const { planSteps } = get();
    const toast = useToastStore.getState();

    if (planSteps.length === 0) {
      toast.warning("No Steps", "Generate or add steps before applying to canvas");
      return;
    }

    // This will be implemented to interact with projectStore/flowStore
    // For now, we emit a custom event that BotEditor can listen to
    const event = new CustomEvent("ai-planner-apply", {
      detail: { planSteps },
    });
    window.dispatchEvent(event);

    toast.success("Applied to Canvas", `${planSteps.length} nodes added to canvas`);

    // Close panel after applying
    set({ isPanelOpen: false });
  },

  // ============================================================
  // Configuration
  // ============================================================

  setLLMConfig: (config: Partial<LLMConfig>) => {
    const { llmConfig } = get();
    set({
      llmConfig: {
        ...llmConfig,
        ...config,
      },
    });
  },

  // ============================================================
  // Reset
  // ============================================================

  reset: () => {
    set({
      currentPhase: "input",
      userDescription: "",
      planSteps: [],
      isGenerating: false,
      error: null,
      conversation: [],
      refinementInput: "",
    });
  },
}),
    {
      name: "skuldbot-ai-planner",
      // Only persist LLM config, not panel state or current work
      partialize: (state) => ({
        llmConfig: state.llmConfig,
      }),
    }
  )
);

// ============================================================
// Helper Hooks
// ============================================================

/**
 * Hook to get current plan step count
 */
export const usePlanStepCount = () => {
  return useAIPlannerStore((state) => state.planSteps.length);
};

/**
 * Hook to check if panel is open
 */
export const useAIPlannerPanelOpen = () => {
  return useAIPlannerStore((state) => state.isPanelOpen);
};

/**
 * Hook to check if generation is in progress
 */
export const useIsGenerating = () => {
  return useAIPlannerStore((state) => state.isGenerating);
};
