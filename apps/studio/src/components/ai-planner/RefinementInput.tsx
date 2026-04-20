/**
 * Refinement Input Component
 * Chat-like input for refining the automation plan with AI
 */

import { useState } from "react";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { useAIPlannerStore } from "../../store/aiPlannerStore";

export function RefinementInput() {
  const {
    refinementInput,
    setRefinementInput,
    refineWithAI,
    isGenerating,
    conversation,
  } = useAIPlannerStore();

  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = () => {
    if (refinementInput.trim() && !isGenerating) {
      refineWithAI(refinementInput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Suggested refinements
  const suggestions = [
    "Add error handling with email notification",
    "Add a logging step for each action",
    "Make this run on a daily schedule",
    "Add a condition to skip duplicates",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-medium text-slate-700">Refine with AI</h4>
      </div>

      {/* Conversation History (last 2 messages) */}
      {conversation.length > 0 && (
        <div className="space-y-2 mb-4">
          {conversation.slice(-4).map((msg) => (
            <div
              key={msg.id}
              className={`p-2 rounded-lg text-xs ${
                msg.role === "user"
                  ? "bg-primary-50 text-primary-800 ml-4"
                  : "bg-slate-100 text-slate-700 mr-4"
              }`}
            >
              <span className="font-medium text-[10px] uppercase tracking-wide block mb-1 opacity-60">
                {msg.role === "user" ? "You" : "AI"}
              </span>
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className={`relative border rounded-xl transition-all ${
          isFocused
            ? "border-primary-300 ring-2 ring-primary-100"
            : "border-slate-200"
        }`}
      >
        <textarea
          value={refinementInput}
          onChange={(e) => setRefinementInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="e.g., Add error notification via Slack..."
          rows={2}
          className="w-full px-4 py-3 pr-12 text-sm rounded-xl resize-none focus:outline-none"
          disabled={isGenerating}
        />
        <button
          onClick={handleSubmit}
          disabled={!refinementInput.trim() || isGenerating}
          className={`absolute right-2 bottom-2 p-2 rounded-lg transition-colors ${
            refinementInput.trim() && !isGenerating
              ? "bg-primary-500 text-white hover:bg-primary-600"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Quick Suggestions */}
      <div className="flex flex-wrap gap-2">
        {suggestions.slice(0, 3).map((suggestion, index) => (
          <button
            key={index}
            onClick={() => setRefinementInput(suggestion)}
            disabled={isGenerating}
            className="px-2 py-1 text-[11px] bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        Describe changes to your plan. Press Enter to refine.
      </p>
    </div>
  );
}

export default RefinementInput;
