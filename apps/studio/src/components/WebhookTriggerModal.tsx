import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Play, Loader2, Code } from "lucide-react";
import { Button } from "./ui/Button";

interface WebhookTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { body: Record<string, any>; headers: Record<string, string>; query: Record<string, string> }) => void;
  isLoading?: boolean;
  webhookConfig: {
    path?: string;
    method?: string;
  };
}

export function WebhookTriggerModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  webhookConfig,
}: WebhookTriggerModalProps) {
  const [bodyJson, setBodyJson] = useState('{\n  "example": "data"\n}');
  const [headersJson, setHeadersJson] = useState('{}');
  const [queryJson, setQueryJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"body" | "headers" | "query">("body");

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const body = JSON.parse(bodyJson);
      const headers = JSON.parse(headersJson);
      const query = JSON.parse(queryJson);

      onSubmit({ body, headers, query });
    } catch (err) {
      setError("Invalid JSON format. Please check your input.");
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-2xl w-[560px] max-h-[90vh] m-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-medium text-slate-700">
              Simulate Webhook
            </span>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {webhookConfig.method || "POST"} {webhookConfig.path || "/webhook"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isLoading}
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {(["body", "headers", "query"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab === "body" ? "Body" : tab === "headers" ? "Headers" : "Query Params"}
                </button>
              ))}
            </div>

            {/* JSON Editor */}
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-slate-400">
                <Code className="w-3 h-3" />
                JSON
              </div>
              <textarea
                value={activeTab === "body" ? bodyJson : activeTab === "headers" ? headersJson : queryJson}
                onChange={(e) => {
                  if (activeTab === "body") setBodyJson(e.target.value);
                  else if (activeTab === "headers") setHeadersJson(e.target.value);
                  else setQueryJson(e.target.value);
                }}
                disabled={isLoading}
                className="w-full h-64 px-4 py-3 font-mono text-sm bg-slate-900 text-slate-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="{}"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Help text */}
            <p className="text-xs text-slate-400">
              Enter the JSON payload that would be received by the webhook.
              This simulates an incoming HTTP request.
            </p>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Bot...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Simulate Webhook & Run Bot
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Webhook data will be passed as variables to the bot</span>
            <span>Press Ctrl+Enter to submit</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default WebhookTriggerModal;
