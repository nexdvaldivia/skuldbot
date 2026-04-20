/**
 * Planner Input Component
 * Textarea for describing the automation in natural language
 */

import { Lightbulb } from "lucide-react";
import { useAIPlannerStore } from "../../store/aiPlannerStore";
import { EXAMPLE_PROMPTS } from "../../lib/ai-planner-prompts";

export function PlannerInput() {
  const { userDescription, setUserDescription, generatePlan, isGenerating } =
    useAIPlannerStore();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!isGenerating && userDescription.trim()) {
        generatePlan();
      }
    }
  };

  const handleExampleClick = (example: string) => {
    setUserDescription(example);
  };

  return (
    <div className="space-y-4">
      {/* Main Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Describe what you want to automate
        </label>
        <textarea
          value={userDescription}
          onChange={(e) => setUserDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Download all invoices from my email, extract the amounts and invoice numbers, and save them to an Excel file"
          rows={5}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm"
          disabled={isGenerating}
        />
        <p className="mt-1 text-xs text-slate-500">
          Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">
            {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter
          </kbd> to generate
        </p>
      </div>

      {/* Example Prompts */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-slate-700">
            Example prompts
          </span>
        </div>
        <div className="space-y-2">
          {EXAMPLE_PROMPTS.slice(0, 4).map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="w-full text-left px-3 py-2 text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
              disabled={isGenerating}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="p-4 bg-blue-50 rounded-xl">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Tips for better results</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Be specific about data sources (email, files, websites)</li>
          <li>• Mention what should happen with the extracted data</li>
          <li>• Include any conditions or filters needed</li>
          <li>• Specify notification or reporting requirements</li>
        </ul>
      </div>
    </div>
  );
}

export default PlannerInput;
