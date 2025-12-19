/**
 * AI Planner Panel
 * Main sliding panel for the AI-powered RPA planning assistant
 */

import { useEffect, useCallback } from "react";
import { X, Bot, Sparkles, Settings, Play, Loader2 } from "lucide-react";
import { Button } from "../ui/Button";
import { useAIPlannerStore } from "../../store/aiPlannerStore";
import { useLicenseStore, useCanUseAIPlanner } from "../../store/licenseStore";
import { PlannerInput } from "./PlannerInput";
import { PlanStepList } from "./PlanStepList";
import { RefinementInput } from "./RefinementInput";
import { LLMConfigDialog } from "./LLMConfigDialog";
import { generateFlowFromPlan } from "../../lib/ai-planner-generator";
import { useProjectStore } from "../../store/projectStore";
import { useState } from "react";

export function AIPlannerPanel() {
  const {
    isPanelOpen,
    closePanel,
    currentPhase,
    planSteps,
    isGenerating,
    generatePlan,
    reset,
  } = useAIPlannerStore();

  const canUseAI = useCanUseAIPlanner();
  const isStudioActivated = useLicenseStore((state) => state.isStudioActivated);
  const [showLLMConfig, setShowLLMConfig] = useState(false);

  const { getActiveBot, updateActiveBotNodes, updateActiveBotEdges } = useProjectStore();

  // Handle apply to canvas
  const handleApplyToCanvas = useCallback(() => {
    if (planSteps.length === 0) return;

    const activeBot = getActiveBot();
    if (!activeBot) {
      // TODO: Show toast - no active bot
      return;
    }

    // Generate flow nodes from plan
    const { nodes, edges, warnings } = generateFlowFromPlan(planSteps, {
      layout: "vertical",
      startPosition: { x: 250, y: 100 },
    });

    // Log warnings if any
    if (warnings.length > 0) {
      console.warn("Flow generation warnings:", warnings);
    }

    // Update the active bot with new nodes
    // This will merge with existing nodes if needed
    const existingNodes = activeBot.nodes || [];
    const existingEdges = activeBot.edges || [];

    // Calculate offset if there are existing nodes
    let offsetY = 0;
    if (existingNodes.length > 0) {
      const maxY = Math.max(...existingNodes.map((n) => n.position.y));
      offsetY = maxY + 150;
    }

    // Offset new nodes
    const offsetNodes = nodes.map((node) => ({
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + offsetY,
      },
    }));

    // Update store
    updateActiveBotNodes([...existingNodes, ...offsetNodes]);
    updateActiveBotEdges([...existingEdges, ...edges]);

    // Close panel
    closePanel();
  }, [planSteps, getActiveBot, updateActiveBotNodes, updateActiveBotEdges, closePanel]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape" && isPanelOpen) {
        closePanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, closePanel]);

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={closePanel}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[500px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">AI Planner</h2>
              <p className="text-xs text-slate-500">
                {currentPhase === "input" && "Describe your automation"}
                {currentPhase === "plan" && `${planSteps.length} steps generated`}
                {currentPhase === "refining" && "Refining plan..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLLMConfig(true)}
              title="LLM Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={closePanel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* License Check */}
          {!isStudioActivated() && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h3 className="font-medium text-amber-800 mb-2">License Required</h3>
              <p className="text-sm text-amber-700 mb-3">
                SkuldBot Studio requires a license to use. Please activate your license
                to continue.
              </p>
              <Button variant="outline" size="sm">
                Activate License
              </Button>
            </div>
          )}

          {/* AI License Check */}
          {isStudioActivated() && !canUseAI && (
            <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary-500 mt-0.5" />
                <div>
                  <h3 className="font-medium text-primary-800 mb-2">
                    Upgrade to SkuldAI
                  </h3>
                  <p className="text-sm text-primary-700 mb-3">
                    AI Planner is a premium feature that helps you design automations
                    using natural language. Upgrade to unlock this feature.
                  </p>
                  <Button variant="default" size="sm">
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          {(canUseAI || true) && ( // TODO: Remove || true for production
            <>
              {/* Input Phase */}
              {currentPhase === "input" && (
                <PlannerInput />
              )}

              {/* Plan Phase */}
              {(currentPhase === "plan" || currentPhase === "refining") && (
                <>
                  <PlanStepList />

                  {/* Refinement Section */}
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <RefinementInput />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          {currentPhase === "input" ? (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={reset}
                className="flex-1"
              >
                Clear
              </Button>
              <Button
                variant="default"
                onClick={generatePlan}
                disabled={isGenerating}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={reset}
                className="flex-1"
              >
                Start Over
              </Button>
              <Button
                variant="default"
                onClick={handleApplyToCanvas}
                disabled={planSteps.length === 0}
                className="flex-1"
              >
                <Play className="w-4 h-4 mr-2" />
                Apply to Canvas
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* LLM Config Dialog */}
      {showLLMConfig && (
        <LLMConfigDialog onClose={() => setShowLLMConfig(false)} />
      )}
    </>
  );
}

export default AIPlannerPanel;
