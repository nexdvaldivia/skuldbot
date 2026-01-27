/**
 * Chat Panel - Conversational AI Planning
 * User can describe automations and refine through natural conversation
 */

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/textarea";
import { ScrollArea } from "../../ui/scroll-area";
import { Card } from "../../ui/card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI Planner assistant. Describe what you want to automate, and I'll create a production-ready workflow with full validation.\n\nFor example:\n• \"Download invoices from Gmail and save to S3\"\n• \"Scrape product prices daily and update database\"\n• \"Create a RAG chatbot with PII detection\"",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsGenerating(true);

    // TODO: Call ai_generate_executable_plan
    // Simulate for now
    setTimeout(() => {
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: "I've created a workflow with 6 steps. Check the Preview tab to see the generated automation, and Validation tab for detailed checks.\n\n**Confidence:** 0.85 (High)\n**Status:** ✓ Valid and compilable\n\nWould you like me to adjust anything?",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsGenerating(false);
    }, 2000);
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
          {messages.length === 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                "Email automation",
                "Web scraping",
                "Data pipeline",
                "RAG chatbot",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your automation in detail..."
              className="min-h-[60px] max-h-[200px] pr-24 resize-none border-neutral-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              disabled={isGenerating}
            />
            
            {/* Send Button */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {input.trim() && (
                <span className="text-[11px] text-neutral-400 font-medium">
                  ⌘↵
                </span>
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className="bg-primary-500 hover:bg-primary-600 text-white shadow-sm"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" />
                    Send
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

