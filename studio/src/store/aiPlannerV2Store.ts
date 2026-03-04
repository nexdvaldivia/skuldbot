/**
 * AI Planner V2 Store
 * State management for executable workflow generation
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import {
  ExecutablePlan,
  ExecutablePlanResponse,
  ConversationMessage,
  LLMConfig,
  PlannerComplexity,
  PlannerAgentMode,
} from "../types/ai-planner";
import { useToastStore } from "./toastStore";
import { useLicenseStore } from "./licenseStore";
import { useConnectionsStore } from "./connectionsStore";
import { useProjectStore } from "./projectStore";
import { useTabsStore } from "./tabsStore";
import { useNavigationStore } from "./navigationStore";
import {
  evaluatePlannerResponse,
  validateApplyContext,
} from "./aiPlannerV2Flow";

interface AIPlannerV2State {
  // Modes
  complexity: PlannerComplexity;
  agentMode: PlannerAgentMode;
  
  // Planning context
  planningContext: {
    userGoal: string;
    clarifications: Record<string, string>;
    proposedSteps: string[];
    needsApproval: boolean;
  };

  // Panel state
  isPanelOpen: boolean;

  // Conversation
  conversation: ConversationMessage[];
  userInput: string;

  // Current plan
  currentPlan: ExecutablePlan | null;
  confidence: number;
  suggestions: string[];

  // State
  isGenerating: boolean;
  isRefining: boolean;
  error: string | null;

  // LLM configuration
  llmConfig: LLMConfig;

  // Iterations
  iterations: number;
  maxIterations: number;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  setMode: (complexity: PlannerComplexity) => void;
  setAgentMode: (mode: PlannerAgentMode) => void;
  setUserInput: (input: string) => void;
  generateExecutablePlan: (description: string, options?: GeneratePlanOptions) => Promise<void>;
  refineWithFeedback: (feedback: string) => Promise<void>;
  askClarification: (question: string) => Promise<void>;
  validatePlan: () => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
  
  // Internal helpers
  addMessage: (role: "user" | "assistant", content: string, mode?: PlannerAgentMode) => void;
}

interface GeneratePlanOptions {
  forceMode?: PlannerAgentMode;
  displayMessage?: string;
  skipUserMessage?: boolean;
}

const CLOUD_ASK_PLAN_TIMEOUT_MS = 75_000;
const CLOUD_GENERATE_TIMEOUT_MS = 180_000;
const LOCAL_ASK_PLAN_TIMEOUT_MS = 180_000;
const LOCAL_GENERATE_TIMEOUT_MS = 600_000;

function toTimeoutMs(
  timeoutSec: number | undefined,
  fallbackMs: number,
  minSec = 15,
  maxSec = 3600
): number {
  if (typeof timeoutSec !== "number" || Number.isNaN(timeoutSec)) {
    return fallbackMs;
  }
  const boundedSec = Math.min(Math.max(Math.round(timeoutSec), minSec), maxSec);
  return boundedSec * 1000;
}

function isLikelyLocalEndpoint(baseUrl: string | null): boolean {
  if (!baseUrl) return false;
  const raw = baseUrl.trim().toLowerCase();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
  } catch {
    return raw.includes("localhost") || raw.includes("127.0.0.1") || raw.includes("0.0.0.0");
  }
}

// Helper to generate message ID
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// AI Planner V2 Store
// ============================================================

export const useAIPlannerV2Store = create<AIPlannerV2State>()(
  persist(
    (set, get) => ({
      // Initial state
      complexity: "advanced",
      agentMode: "ask", // Default to ask mode - converse first, generate later
      planningContext: {
        userGoal: "",
        clarifications: {},
        proposedSteps: [],
        needsApproval: false,
      },
      isPanelOpen: false,
      conversation: [],
      userInput: "",
      currentPlan: null,
      confidence: 0,
      suggestions: [],
      isGenerating: false,
      isRefining: false,
      error: null,
      llmConfig: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7,
      },
      iterations: 0,
      maxIterations: 5,

      // ============================================================
      // Panel Actions
      // ============================================================

      openPanel: () => {
        set({ isPanelOpen: true, error: null }); // Don't override agentMode
      },

      closePanel: () => {
        set({ isPanelOpen: false }); // Don't reset agentMode
      },

      setMode: (complexity) => {
        set({ complexity });
      },

      setAgentMode: (mode) => {
        set({ agentMode: mode });
      },

      setUserInput: (input) => {
        set({ userInput: input });
      },

      // ============================================================
      // Message Management
      // ============================================================

      addMessage: (role, content, mode) => {
        const message: ConversationMessage = {
          id: generateMessageId(),
          role,
          content,
          timestamp: new Date().toISOString(),
          mode,
        };
        set((state) => ({
          conversation: [...state.conversation, message],
        }));
      },

      // ============================================================
      // Plan Generation
      // ============================================================

      generateExecutablePlan: async (description: string, options?: GeneratePlanOptions) => {
        const { llmConfig, addMessage, iterations, maxIterations } = get();
        const effectiveMode = options?.forceMode || get().agentMode;
        const toast = useToastStore.getState();
        const license = useLicenseStore.getState();

        // Check license
        if (!license.hasFeature("aiPlanner")) {
          toast.error("License Required", "AI Planner requires a SkuldAI license");
          return;
        }

        if (!description.trim()) {
          toast.warning("Empty Description", "Please describe what you want to automate");
          return;
        }

        // Check max iterations for full workflow generation only.
        if (effectiveMode === "generate" && iterations >= maxIterations) {
          toast.error("Max Iterations", "Maximum refinement iterations reached. Please start a new plan.");
          return;
        }

        // Get active connection from connectionsStore
        const selectedConnection = useConnectionsStore.getState().getSelectedConnection();
        
        if (!selectedConnection) {
          toast.error("No LLM Connection", "Please select an LLM connection in the Connections tab");
          return;
        }

        // Extract provider info from connection
        let provider = selectedConnection.provider;
        let model = "";
        let baseUrl: string | null = null;
        let apiKey: string | null = null;

        // Map connection config to invoke parameters
        const config = selectedConnection.config;
        switch (config.type) {
          case "openai":
            provider = "openai";
            model = config.model;
            apiKey = config.apiKey;
            baseUrl = config.baseUrl || null;
            break;
          case "anthropic":
            provider = "anthropic";
            model = config.model;
            apiKey = config.apiKey;
            break;
          case "ollama":
          case "vllm":
          case "tgi":
          case "llamacpp":
          case "lmstudio":
          case "localai":
            provider = "openai"; // Use OpenAI-compatible API
            model = config.model;
            baseUrl = config.baseUrl;
            apiKey = null; // Local models don't need API key
            break;
          case "azure-foundry":
            provider = "openai"; // Azure uses OpenAI API format
            model = config.deployment;
            baseUrl = `${config.endpoint}/openai/deployments/${config.deployment}`;
            apiKey = config.apiKey;
            break;
          default:
            toast.error("Unsupported Provider", `Provider ${config.type} is not yet supported for AI Planner`);
            return;
        }

        set({ isGenerating: true, error: null });

        // Add user message (unless caller already injected it)
        if (!options?.skipUserMessage) {
          addMessage("user", options?.displayMessage || description, effectiveMode);
        }

        try {
          console.log("🤖 Calling ai_generate_executable_plan...");
          console.log(`   Connection: ${selectedConnection.name}`);
          console.log(`   Provider: ${provider}, Model: ${model}`);
          console.log(`   Base URL: ${baseUrl || "default"}`);
          
          // Build conversation history for LLM context
          const { conversation } = get();
          console.log(`   🎯 Agent Mode: ${effectiveMode}`);
          
          const conversationHistory = conversation
            .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
            .join("\n\n");

          const isLocalEndpoint = isLikelyLocalEndpoint(baseUrl);
          const timeoutMs = effectiveMode === "generate"
            ? (
                isLocalEndpoint
                  ? toTimeoutMs(llmConfig.localGenerateTimeoutSec, LOCAL_GENERATE_TIMEOUT_MS)
                  : CLOUD_GENERATE_TIMEOUT_MS
              )
            : (
                isLocalEndpoint
                  ? toTimeoutMs(llmConfig.localAskPlanTimeoutSec, LOCAL_ASK_PLAN_TIMEOUT_MS)
                  : CLOUD_ASK_PLAN_TIMEOUT_MS
              );
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          
          const response = await Promise.race([
            invoke<ExecutablePlanResponse>("ai_generate_executable_plan", {
              description,
              provider,
              model,
              temperature: llmConfig.temperature,
              baseUrl,
              apiKey,
              agentMode: effectiveMode === "idle" ? null : effectiveMode, // Pass effective mode
              conversationHistory: conversationHistory || null,
              requestTimeoutSecs: Math.max(15, Math.round(timeoutMs / 1000)),
            }),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(new Error(`Planner timeout after ${Math.round(timeoutMs / 1000)}s`));
              }, timeoutMs);
            }),
          ]).finally(() => {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          });

          console.log("📝 Response received:", response);

          const evaluation = evaluatePlannerResponse(effectiveMode, response);

          if (evaluation.kind === "plan") {
            addMessage("assistant", evaluation.message, effectiveMode);

            set({
              currentPlan: evaluation.plan,
              confidence: evaluation.confidence,
              suggestions: evaluation.suggestions,
              isGenerating: false,
              iterations: iterations + 1,
            });

            if (evaluation.requiresClarification) {
              toast.info("Clarification Needed", "Please answer the questions to continue");
            } else if (evaluation.plan.validation.valid && evaluation.plan.validation.compilable) {
              toast.success("Plan Generated", "Workflow is ready to apply to canvas");
            } else if (evaluation.plan.validation.errors.length > 0) {
              toast.warning("Plan Has Errors", "Check Validation tab for details");
            } else {
              toast.success("Plan Generated", "Review and refine as needed");
            }
            return;
          }

          if (evaluation.kind === "chat") {
            addMessage("assistant", evaluation.message, effectiveMode);
            set({ isGenerating: false });
            return;
          }

          throw new Error(evaluation.error);
        } catch (error) {
          console.error("❌ Failed to generate plan:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isTimeout = /planner timeout/i.test(errorMessage);
          const assistantMessage = isTimeout
            ? `The model did not respond in time (${selectedConnection.name}). Please verify that the LLM service is running and try again.`
            : `Sorry, I encountered an error: ${errorMessage}\n\nPlease try again or rephrase your request.`;
          
          addMessage(
            "assistant",
            assistantMessage,
            effectiveMode
          );
          
          set({
            error: errorMessage,
            isGenerating: false,
          });
          
          if (isTimeout) {
            toast.error("Planner Timeout", "The selected model did not respond in time");
          } else {
            toast.error("Generation Failed", errorMessage);
          }
        }
      },

      // ============================================================
      // Refinement
      // ============================================================

      refineWithFeedback: async (feedback: string) => {
        const { currentPlan } = get();
        const toast = useToastStore.getState();

        if (!currentPlan) {
          toast.error("No Plan", "Generate a plan first before refining");
          return;
        }

        set({ isRefining: true, error: null });

        try {
          console.log("🔄 Refining plan with feedback...");
          
          const currentTasksJson = JSON.stringify(currentPlan.tasks, null, 2);
          const combinedDescription = [
            "Refine the existing SkuldBot workflow based on user feedback.",
            `Current goal: ${currentPlan.goal}`,
            `Current workflow description: ${currentPlan.description}`,
            "Current tasks JSON:",
            currentTasksJson,
            `User feedback: ${feedback}`,
            "Return the full updated executable workflow and preserve unchanged behavior.",
          ].join("\n\n");
          
          await get().generateExecutablePlan(combinedDescription, {
            forceMode: "generate",
            displayMessage: feedback,
          });
        } catch (error) {
          console.error("❌ Failed to refine plan:", error);
          const errorMessage = String(error);
          
          get().addMessage(
            "assistant",
            `Sorry, I couldn't process your feedback: ${errorMessage}`
          );
          
          set({
            error: errorMessage,
          });
          
          toast.error("Refinement Failed", errorMessage);
        } finally {
          set({ isRefining: false });
        }
      },

      // ============================================================
      // Clarification
      // ============================================================

      askClarification: async (question: string) => {
        // Treat clarification questions as refinement
        return get().refineWithFeedback(question);
      },

      // ============================================================
      // Validation
      // ============================================================

      validatePlan: async () => {
        const { currentPlan } = get();
        const toast = useToastStore.getState();

        if (!currentPlan) {
          toast.error("No Plan", "Generate a plan first");
          return;
        }

        // Already validated during generation
        toast.info(
          "Already Validated",
          "Plan was validated during generation. Check Validation tab for details."
        );
      },

      // ============================================================
      // Apply to Canvas
      // ============================================================

      applyToCanvas: () => {
        const { currentPlan } = get();
        const toast = useToastStore.getState();
        const { currentView } = useNavigationStore.getState();
        const { activeBotId } = useProjectStore.getState();
        const { tabs, activeTabId } = useTabsStore.getState();

        if (!currentPlan) {
          toast.error("No Plan", "Generate a plan first");
          return;
        }

        const activeTab = tabs.find((t) => t.id === activeTabId);
        const applyError = validateApplyContext(currentPlan, {
          currentView,
          activeBotId,
          activeTabType: activeTab?.type || null,
        });
        if (applyError === "Invalid Context") {
          toast.error("Invalid Context", "AI Planner V2 can only apply plans in Project view");
          return;
        }
        if (applyError === "No Active Bot") {
          toast.error("No Active Bot", "Open a bot tab before applying the plan");
          return;
        }
        if (applyError === "Invalid Tab") {
          toast.error("Invalid Tab", "Switch to a bot tab before applying the plan");
          return;
        }
        if (applyError === "Invalid Plan") {
          toast.error(
            "Invalid Plan",
            "Fix validation errors before applying to canvas"
          );
          return;
        }

        try {
          const event = new CustomEvent("ai-planner-apply", {
            detail: {
              planSteps: currentPlan.tasks,
              dsl: currentPlan.dsl,
            },
          });
          window.dispatchEvent(event);

          toast.success("Applied to Canvas", `${currentPlan.tasks.length} nodes added to active bot`);

          // Close panel
          get().closePanel();
        } catch (error) {
          console.error("❌ Failed to apply to canvas:", error);
          toast.error("Apply Failed", String(error));
        }
      },

      // ============================================================
      // Configuration
      // ============================================================

      setLLMConfig: (config) => {
        set((state) => ({
          llmConfig: { ...state.llmConfig, ...config },
        }));
      },

      // ============================================================
      // Reset
      // ============================================================

      reset: () => {
        set({
          conversation: [],
          userInput: "",
          currentPlan: null,
          confidence: 0,
          suggestions: [],
          isGenerating: false,
          isRefining: false,
          error: null,
          iterations: 0,
        });
      },
    }),
    {
      name: "ai-planner-v2-storage",
      partialize: (state) => ({
        complexity: state.complexity,
        // agentMode NOT persisted - always start in "ask" mode
        planningContext: state.planningContext,
        llmConfig: state.llmConfig,
        conversation: state.conversation, // ← Guardar conversación
        currentPlan: state.currentPlan,   // ← Guardar plan actual
        confidence: state.confidence,
        suggestions: state.suggestions,
        iterations: state.iterations,
      }),
    }
  )
);
