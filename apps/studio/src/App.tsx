import { useCallback, useEffect } from "react";
import AppLayout from "./components/AppLayout";
import { useProjectStore } from "./store/projectStore";
import { useNavigationStore } from "./store/navigationStore";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

function App() {
  const { loadRecentProjects, closeProject } = useProjectStore();
  const { setView } = useNavigationStore();

  // Initialize app
  useEffect(() => {
    loadRecentProjects();
    setView("welcome");
  }, [loadRecentProjects, setView]);

  const handleRecoverToWelcome = useCallback(() => {
    closeProject();
    setView("welcome");
  }, [closeProject, setView]);

  return (
    <AppErrorBoundary onRecoverToWelcome={handleRecoverToWelcome}>
      <AppLayout />
    </AppErrorBoundary>
  );
}

export default App;
