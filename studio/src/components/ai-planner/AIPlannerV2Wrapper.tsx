/**
 * AI Planner V2 Wrapper
 * Connects the V2 panel to the store
 */

import { useAIPlannerV2Store } from "../../store/aiPlannerV2Store";
import AIPlannerV2Panel from "./AIPlannerV2Panel";

export function AIPlannerV2Wrapper() {
  const isPanelOpen = useAIPlannerV2Store((state) => state.isPanelOpen);
  const closePanel = useAIPlannerV2Store((state) => state.closePanel);

  return <AIPlannerV2Panel isOpen={isPanelOpen} onClose={closePanel} />;
}

export default AIPlannerV2Wrapper;

