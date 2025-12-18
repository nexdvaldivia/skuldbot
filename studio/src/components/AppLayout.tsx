import { ReactFlowProvider } from "reactflow";
import { useNavigationStore } from "../store/navigationStore";
import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import WelcomeScreen from "./WelcomeScreen";
import UnifiedSidebar from "./UnifiedSidebar";
import TabBar from "./TabBar";
import BotEditor from "./BotEditor";
import FlowEditor from "./FlowEditor";
import Sidebar from "./Sidebar";
import LogsPanel from "./LogsPanel";
import NodeConfigPanel from "./NodeConfigPanel";
import ProjectToolbar from "./ProjectToolbar";
import Toolbar from "./Toolbar";
import SettingsPanel from "./SettingsPanel";
import EnvPanel from "./EnvPanel";
import ProblemsPanel from "./ProblemsPanel";
import DebugPanel from "./DebugPanel";
import { AutoSaveManager } from "./AutoSaveManager";
import { ToastContainer } from "./ui/ToastContainer";
import { useDebugStore } from "../store/debugStore";
import { Bot, Bug, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

function EmptyWorkspace() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Bot className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-600">No bot selected</h3>
        <p className="text-sm text-slate-400 mt-1">
          Select a bot from the explorer or create a new one
        </p>
      </div>
    </div>
  );
}

// Quick Start mode - single bot without project (original mode)
function QuickStartWorkspace() {
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100">
      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Node Palette / Sidebar */}
        <Sidebar />

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <ReactFlowProvider>
            <FlowEditor />
          </ReactFlowProvider>
        </div>

        {/* Properties Panel */}
        <NodeConfigPanel />
      </div>

      {/* Problems Panel */}
      <ProblemsPanel />

      {/* Logs Panel */}
      <LogsPanel />
    </div>
  );
}

function ProjectWorkspace() {
  const { tabs, activeTabId } = useTabsStore();
  const { activeBotId, project } = useProjectStore();
  const { state: debugState, breakpoints } = useDebugStore();
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isDebugging = debugState !== "idle";
  const hasBreakpoints = breakpoints.size > 0;

  return (
    <div className="h-screen w-screen flex bg-slate-100">
      {/* Unified Sidebar - Explorer + Nodes with tabs */}
      <UnifiedSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Toolbar */}
        <ProjectToolbar />

        {/* Tab Bar */}
        <TabBar />

        {/* Debug Panel Toggle & Panel */}
        {activeTab?.type === "bot" && (
          <div className="bg-white border-b">
            {/* Debug toggle header */}
            <button
              onClick={() => setIsDebugPanelOpen(!isDebugPanelOpen)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
            >
              {isDebugPanelOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
              <Bug className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-600">Debugger</span>
              {(isDebugging || hasBreakpoints) && (
                <span className={`ml-2 w-2 h-2 rounded-full ${isDebugging ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              )}
              {hasBreakpoints && !isDebugging && (
                <span className="text-xs text-slate-400 ml-auto">
                  {breakpoints.size} breakpoint{breakpoints.size > 1 ? "s" : ""}
                </span>
              )}
            </button>

            {/* Debug panel content */}
            {isDebugPanelOpen && <DebugPanel />}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex min-h-0">
          {/* Editor Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab?.type === "bot" && activeBotId ? (
              <ReactFlowProvider>
                <BotEditor />
              </ReactFlowProvider>
            ) : activeTab?.type === "settings" ? (
              <SettingsPanel />
            ) : activeTab?.type === "env" ? (
              <EnvPanel />
            ) : (
              <EmptyWorkspace />
            )}
          </div>

          {/* Properties Panel */}
          {activeTab?.type === "bot" && <NodeConfigPanel />}
        </div>

        {/* Problems Panel */}
        <ProblemsPanel />

        {/* Logs Panel */}
        <LogsPanel />

        {/* Auto-save Manager */}
        <AutoSaveManager
          enabled={project?.settings.autoSave?.enabled}
          intervalMs={project?.settings.autoSave?.intervalMs}
        />
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { currentView } = useNavigationStore();
  const { project } = useProjectStore();

  // Show welcome screen if explicitly set to welcome
  if (currentView === "welcome") {
    return (
      <>
        <WelcomeScreen />
        <ToastContainer />
      </>
    );
  }

  // Quick Start mode - single bot without project (original mode)
  if (currentView === "quickstart") {
    return (
      <>
        <QuickStartWorkspace />
        <ToastContainer />
      </>
    );
  }

  // Project view - only if we have a project
  if (currentView === "project" && project) {
    return (
      <>
        <ProjectWorkspace />
        <ToastContainer />
      </>
    );
  }

  // Default to welcome screen
  return (
    <>
      <WelcomeScreen />
      <ToastContainer />
    </>
  );
}
