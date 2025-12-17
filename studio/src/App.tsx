import { ReactFlowProvider } from "reactflow";
import FlowEditor from "./components/FlowEditor";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import LogsPanel from "./components/LogsPanel";
import NodeConfigPanel from "./components/NodeConfigPanel";
import { ToastContainer } from "./components/ui/ToastContainer";

function App() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <ToastContainer />

      <Toolbar />

      <div className="flex flex-1 overflow-hidden bg-background relative">
        <Sidebar />
        <ReactFlowProvider>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <FlowEditor />
            </div>
            <LogsPanel />
          </div>
        </ReactFlowProvider>
        <NodeConfigPanel />
      </div>
    </div>
  );
}

export default App;
