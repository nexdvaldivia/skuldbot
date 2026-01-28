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
import { FlowNode, FlowEdge, NodeCategory } from "../types/flow";
import { useFlowStore } from "./flowStore";

// ============================================================
// AI Planner V2 Store State
// ============================================================

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
  generateExecutablePlan: (description: string) => Promise<void>;
  refineWithFeedback: (feedback: string) => Promise<void>;
  askClarification: (question: string) => Promise<void>;
  validatePlan: () => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
  
  // Internal helpers
  addMessage: (role: "user" | "assistant", content: string, mode?: PlannerAgentMode) => void;
}

// Helper to generate message ID
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to convert ExecutablePlan tasks to FlowNodes
function tasksToFlowNodes(plan: ExecutablePlan): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  
  let yPosition = 100;
  const xPosition = 300;
  const verticalSpacing = 120;

  plan.tasks.forEach((task, index) => {
    const nodeId = task.id || `node-${index}`;
    
    // Create node
    const node: FlowNode = {
      id: nodeId,
      type: "custom",
      position: { x: xPosition, y: yPosition },
      data: {
        label: task.label,
        nodeType: task.nodeType,
        category: (task.nodeType.split('.')[0] || 'control') as NodeCategory,
        config: task.config as Record<string, any>,
        description: task.description,
      },
    };
    
    nodes.push(node);
    
    // Create edge to next node (if not last)
    if (index < plan.tasks.length - 1) {
      const nextNodeId = plan.tasks[index + 1].id || `node-${index + 1}`;
      edges.push({
        id: `edge-${nodeId}-${nextNodeId}`,
        source: nodeId,
        target: nextNodeId,
        type: "default",
        animated: false,
      });
    }
    
    yPosition += verticalSpacing;
  });

  return { nodes, edges };
}

// ============================================================
// AI Planner V2 Store
// ============================================================

export const useAIPlannerV2Store = create<AIPlannerV2State>()(
  persist(
    (set, get) => ({
      // Initial state
      complexity: "advanced",
      agentMode: "generate", // Default to generate mode
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
        set({ isPanelOpen: true, error: null, agentMode: "generate" });
      },

      closePanel: () => {
        set({ isPanelOpen: false, agentMode: "generate" });
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

      generateExecutablePlan: async (description: string) => {
        const { llmConfig, addMessage, iterations, maxIterations } = get();
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

        // Check max iterations
        if (iterations >= maxIterations) {
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

        // Add user message
        addMessage("user", description);

        try {
          console.log("🤖 Calling ai_generate_executable_plan...");
          console.log(`   Connection: ${selectedConnection.name}`);
          console.log(`   Provider: ${provider}, Model: ${model}`);
          console.log(`   Base URL: ${baseUrl || "default"}`);
          
          // Build conversation history for LLM context
          const { conversation, agentMode } = get();
          console.log(`   🎯 Agent Mode: ${agentMode}`);
          
          const conversationHistory = conversation
            .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
            .join("\n\n");
          
          // Call Tauri backend with conversation history and agent mode
          const response = await invoke<ExecutablePlanResponse>("ai_generate_executable_plan", {
            description,
            provider,
            model,
            temperature: llmConfig.temperature,
            baseUrl,
            apiKey,
            agentMode: agentMode === "idle" ? null : agentMode, // Pass current agent mode
            conversationHistory: conversationHistory || null,
          });

          console.log("📝 Response received:", response);

          if (!response.success || !response.plan) {
            throw new Error(response.error || "Failed to generate executable plan");
          }

          const { plan, confidence, suggestions } = response;

          // Build assistant response
          let responseText = "";
          
          if (plan.unknowns && plan.unknowns.length > 0) {
            responseText += "I need some clarification before I can create a complete workflow:\n\n";
            plan.unknowns.forEach((unknown, i) => {
              responseText += `${i + 1}. ${unknown.question}`;
              if (unknown.context) {
                responseText += ` (${unknown.context})`;
              }
              responseText += "\n";
            });
            responseText += "\nPlease provide these details so I can generate an accurate workflow.";
          } else {
            responseText = `I've created a ${plan.tasks.length}-step workflow for "${plan.goal}".\n\n`;
            responseText += `**Confidence:** ${(confidence * 100).toFixed(0)}% ${confidence >= 0.8 ? "(High)" : confidence >= 0.5 ? "(Medium)" : "(Low)"}\n`;
            responseText += `**Status:** ${plan.validation.valid && plan.validation.compilable ? "✓ Valid and compilable" : "⚠️ Has issues"}\n\n`;
            
            if (plan.assumptions.length > 0) {
              responseText += `**Assumptions:**\n`;
              plan.assumptions.forEach((assumption) => {
                responseText += `• ${assumption}\n`;
              });
              responseText += "\n";
            }

            if (plan.validation.errors.length > 0) {
              responseText += `**Errors:** ${plan.validation.errors.length}\n`;
            }
            if (plan.validation.warnings.length > 0) {
              responseText += `**Warnings:** ${plan.validation.warnings.length}\n`;
            }

            responseText += "\nCheck the Preview and Validation tabs for details. Would you like me to adjust anything?";
          }

          // Add assistant message
          addMessage("assistant", responseText);

          // Update state
          set({
            currentPlan: plan,
            confidence: confidence || 0,
            suggestions: suggestions || [],
            isGenerating: false,
            iterations: iterations + 1,
          });

          // Show toast based on result
          if (response.clarifyingQuestions && response.clarifyingQuestions.length > 0) {
            toast.info("Clarification Needed", "Please answer the questions to continue");
          } else if (plan.validation.valid && plan.validation.compilable) {
            toast.success("Plan Generated", "Workflow is ready to apply to canvas");
          } else if (plan.validation.errors.length > 0) {
            toast.warning("Plan Has Errors", "Check Validation tab for details");
          } else {
            toast.success("Plan Generated", "Review and refine as needed");
          }
        } catch (error) {
          console.error("❌ Failed to generate plan:", error);
          const errorMessage = String(error);
          
          addMessage(
            "assistant",
            `Sorry, I encountered an error: ${errorMessage}\n\nPlease try again or rephrase your request.`
          );
          
          set({
            error: errorMessage,
            isGenerating: false,
          });
          
          toast.error("Generation Failed", errorMessage);
        }
      },

      // ============================================================
      // Refinement
      // ============================================================

      refineWithFeedback: async (feedback: string) => {
        const { currentPlan, addMessage } = get();
        const toast = useToastStore.getState();

        if (!currentPlan) {
          toast.error("No Plan", "Generate a plan first before refining");
          return;
        }

        set({ isRefining: true, error: null });

        // Add user message
        addMessage("user", feedback);

        try {
          console.log("🔄 Refining plan with feedback...");
          
          // For now, just regenerate with combined context
          const combinedDescription = `${currentPlan.goal}\n\nUser feedback: ${feedback}`;
          
          // Re-use the generate function
          await get().generateExecutablePlan(combinedDescription);
          
          set({ isRefining: false });
        } catch (error) {
          console.error("❌ Failed to refine plan:", error);
          const errorMessage = String(error);
          
          addMessage(
            "assistant",
            `Sorry, I couldn't process your feedback: ${errorMessage}`
          );
          
          set({
            error: errorMessage,
            isRefining: false,
          });
          
          toast.error("Refinement Failed", errorMessage);
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
        const flowStore = useFlowStore.getState();

        if (!currentPlan) {
          toast.error("No Plan", "Generate a plan first");
          return;
        }

        if (!currentPlan.validation.valid || !currentPlan.validation.compilable) {
          toast.error(
            "Invalid Plan",
            "Fix validation errors before applying to canvas"
          );
          return;
        }

        try {
          // Convert tasks to flow nodes
          const { nodes, edges } = tasksToFlowNodes(currentPlan);

          // Add to canvas
          flowStore.setNodes([...flowStore.nodes, ...nodes]);
          flowStore.setEdges([...flowStore.edges, ...edges]);

          // Update bot info
          flowStore.setBotInfo({
            name: currentPlan.goal,
            description: `AI-generated workflow with ${currentPlan.tasks.length} steps`,
          });

          toast.success("Applied to Canvas", `Added ${nodes.length} nodes to workflow`);

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
        agentMode: state.agentMode,
        planningContext: state.planningContext,
        llmConfig: state.llmConfig,
      }),
    }
  )
);

