/**
 * AI Planner V2 Panel - Executable Workflows
 * Interactive 3-panel layout for intelligent automation generation
 */

import { useEffect } from "react";
import { X, Bot, Sparkles, Settings } from "lucide-react";
import { Button } from "../ui/Button";
import { useLicenseStore, useCanUseAIPlanner } from "../../store/licenseStore";
import { useAIPlannerV2Store } from "../../store/aiPlannerV2Store";
import { ChatPanel } from "./v2/ChatPanel";
import { PreviewPanel } from "./v2/PreviewPanel";
import { ValidationPanel } from "./v2/ValidationPanel";
import { LLMConfigDialog } from "./LLMConfigDialog";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface AIPlannerV2PanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIPlannerV2Panel({ isOpen, onClose }: AIPlannerV2PanelProps) {
  const canUseAI = useCanUseAIPlanner();
  const isStudioActivated = useLicenseStore((state) => state.isStudioActivated);
  const { reset } = useAIPlannerV2Store();
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "preview" | "validation">("chat");

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      // Don't auto-reset; let user decide
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Escape to close
      if (e.key === "Escape") {
        onClose();
      }
      
      // Cmd/Ctrl + number to switch tabs
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        switch(e.key) {
          case "1":
            setActiveTab("chat");
            e.preventDefault();
            break;
          case "2":
            setActiveTab("preview");
            e.preventDefault();
            break;
          case "3":
            setActiveTab("validation");
            e.preventDefault();
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel - Wider for 3-panel layout */}
      <div className="fixed right-0 top-0 h-full w-[900px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            {/* Icon with gradient */}
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
              <Bot className="w-6 h-6 text-white" />
            </div>
            
            {/* Title and subtitle */}
            <div>
              <h2 className="font-semibold text-neutral-900 text-base">
                AI Planner V2
              </h2>
              <p className="text-xs text-neutral-500 font-medium">
                Intelligent workflow generation with validation
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLLMConfig(true)}
              title="LLM Settings"
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-900"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* License Check */}
        {!isStudioActivated() && (
          <div className="mx-6 mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-2 text-sm">
              License Required
            </h3>
            <p className="text-sm text-amber-700 mb-3 leading-relaxed">
              SkuldBot Studio requires a license to use. Please activate your license
              to continue.
            </p>
            <Button variant="outline" size="sm" className="border-amber-300 text-amber-900 hover:bg-amber-100">
              Activate License
            </Button>
          </div>
        )}

        {/* AI License Check */}
        {isStudioActivated() && !canUseAI && (
          <div className="mx-6 mt-6 p-5 bg-primary-50 border border-primary-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-primary-900 mb-2 text-sm">
                  Upgrade to SkuldAI
                </h3>
                <p className="text-sm text-primary-700 mb-3 leading-relaxed">
                  AI Planner V2 is a premium feature that creates production-ready
                  automations with intelligent validation. Upgrade to unlock this feature.
                </p>
                <Button variant="default" size="sm" className="bg-primary-600 hover:bg-primary-700">
                  Upgrade Now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content - 3 Panel Layout */}
        {(canUseAI || true) && ( // TODO: Remove || true for production
          <div className="flex-1 overflow-hidden">
            <Tabs 
              value={activeTab} 
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              className="flex flex-col h-full"
            >
              {/* Tab Navigation */}
              <div className="border-b border-neutral-200 px-6">
                <TabsList className="h-12 w-full justify-start bg-transparent p-0">
                  <TabsTrigger 
                    value="chat" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary-500 rounded-none px-4 h-12 text-sm font-medium"
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Chat
                    <kbd className="ml-2 hidden sm:inline-flex h-5 px-1.5 rounded bg-neutral-100 text-[11px] font-medium text-neutral-600 border border-neutral-200">
                      ⌘1
                    </kbd>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="preview" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary-500 rounded-none px-4 h-12 text-sm font-medium"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Preview
                    <kbd className="ml-2 hidden sm:inline-flex h-5 px-1.5 rounded bg-neutral-100 text-[11px] font-medium text-neutral-600 border border-neutral-200">
                      ⌘2
                    </kbd>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="validation" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary-500 rounded-none px-4 h-12 text-sm font-medium"
                  >
                    Validation
                    <kbd className="ml-2 hidden sm:inline-flex h-5 px-1.5 rounded bg-neutral-100 text-[11px] font-medium text-neutral-600 border border-neutral-200">
                      ⌘3
                    </kbd>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                <TabsContent value="chat" className="h-full m-0 p-0">
                  <ChatPanel />
                </TabsContent>
                <TabsContent value="preview" className="h-full m-0 p-0">
                  <PreviewPanel />
                </TabsContent>
                <TabsContent value="validation" className="h-full m-0 p-0">
                  <ValidationPanel />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </div>

      {/* LLM Config Dialog */}
      <LLMConfigDialog
        isOpen={showLLMConfig}
        onClose={() => setShowLLMConfig(false)}
      />
    </>
  );
}

export default AIPlannerV2Panel;

