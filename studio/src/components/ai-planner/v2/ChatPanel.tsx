/**
 * Chat Panel - Conversational AI Planning
 * User can describe automations and refine through natural conversation
 */

import { useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/textarea";
import { ScrollArea } from "../../ui/scroll-area";
import { Card } from "../../ui/card";
import { useAIPlannerV2Store } from "../../../store/aiPlannerV2Store";

export function ChatPanel() {
  const {
    conversation,
    userInput,
    setUserInput,
    isGenerating,
    isRefining,
    generateExecutablePlan,
    refineWithFeedback,
    currentPlan,
  } = useAIPlannerV2Store();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Show welcome message if no conversation
  const messages = conversation.length === 0
    ? [
        {
          id: "welcome",
          role: "assistant" as const,
          content: "Hi! I'm your AI Planner assistant. Describe what you want to automate, and I'll create a production-ready workflow with full validation.\n\nFor example:\n• \"Download invoices from Gmail and save to S3\"\n• \"Scrape product prices daily and update database\"\n• \"Create a RAG chatbot with PII detection\"",
          timestamp: new Date().toISOString(),
        },
      ]
    : conversation;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const handleSend = async () => {
    if (!userInput.trim() || isGenerating || isRefining) return;

    const input = userInput.trim();
    setUserInput("");

    // If we have a plan, this is refinement, otherwise it's generation
    if (currentPlan) {
      await refineWithFeedback(input);
    } else {
      await generateExecutablePlan(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        <div ref={scrollRef} className="space-y-4 max-w-3xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {/* Avatar */}
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Message Content */}
              <div
                className={`group relative max-w-[80%] ${
                  message.role === "user"
                    ? "order-1"
                    : "order-2"
                }`}
              >
                <Card
                  className={`p-4 ${
                    message.role === "user"
                      ? "bg-primary-500 text-white border-primary-600"
                      : "bg-white border-neutral-200"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                </Card>
                
                {/* Timestamp */}
                <div
                  className={`mt-1 px-3 text-[11px] text-neutral-400 font-medium ${
                    message.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {/* User Avatar */}
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center flex-shrink-0 order-2">
                  <User className="w-4 h-4 text-neutral-600" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isGenerating && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <Card className="p-4 bg-white border-neutral-200">
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Generating workflow...</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-neutral-200 bg-white p-4">
        <div className="max-w-3xl mx-auto">
          {/* Suggestions */}
          {messages.length === 1 && !currentPlan && (
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                "Email automation",
                "Web scraping",
                "Data pipeline",
                "RAG chatbot",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setUserInput(suggestion)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentPlan ? "Ask for changes or refinements..." : "Describe your automation in detail..."}
              className="min-h-[60px] max-h-[200px] pr-24 resize-none border-neutral-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              disabled={isGenerating || isRefining}
            />
            
            {/* Send Button */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {userInput.trim() && (
                <span className="text-[11px] text-neutral-400 font-medium">
                  ⌘↵
                </span>
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!userInput.trim() || isGenerating || isRefining}
                className="bg-primary-500 hover:bg-primary-600 text-white shadow-sm"
              >
                {isGenerating || isRefining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" />
                    {currentPlan ? "Refine" : "Send"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Helper text */}
          <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
            Be specific about inputs, outputs, and error handling for best results.
          </p>
        </div>
      </div>
    </div>
  );
}

