import {
  ArrowRight,
  Globe,
  Sparkles,
  Table2,
  GitBranch,
  MousePointer,
  Zap,
  Mail,
} from "lucide-react";
import { SkuldLogo } from "./ui/SkuldLogo";

const quickStartItems = [
  {
    icon: Zap,
    label: "Triggers",
    description: "Schedule, webhook, email",
    color: "text-rose-600",
    bg: "bg-rose-100",
  },
  {
    icon: Globe,
    label: "Web Automation",
    description: "Browser, clicks, scraping",
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  {
    icon: Sparkles,
    label: "AI & Agents",
    description: "LLMs, Claude, GPT-4",
    color: "text-violet-600",
    bg: "bg-violet-100",
  },
  {
    icon: Table2,
    label: "Excel & Data",
    description: "CSV, spreadsheets",
    color: "text-green-600",
    bg: "bg-green-100",
  },
  {
    icon: Mail,
    label: "Email",
    description: "Send, read, automate",
    color: "text-pink-600",
    bg: "bg-pink-100",
  },
  {
    icon: GitBranch,
    label: "Control Flow",
    description: "If, loops, variables",
    color: "text-slate-600",
    bg: "bg-slate-100",
  },
];

export default function EmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="text-center max-w-2xl px-8">
        {/* Logo with glow effect - Jade Green (#00A36C) */}
        <div className="relative inline-flex items-center justify-center mb-8">
          <div className="absolute w-32 h-32 rounded-full blur-3xl" style={{ background: 'linear-gradient(to bottom right, rgba(0, 163, 108, 0.2), rgba(80, 200, 120, 0.2))' }} />
          <div className="absolute w-24 h-24 rounded-full blur-xl animate-pulse" style={{ backgroundColor: 'rgba(0, 163, 108, 0.1)' }} />
          <div className="relative">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(to bottom right, #00A36C, #50C878)',
                boxShadow: '0 10px 15px -3px rgba(0, 163, 108, 0.25)'
              }}
            >
              <SkuldLogo size={44} className="text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Build Your Automation
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-md mx-auto">
          Create powerful RPA workflows with AI-powered agents.
          Drag components from the library to get started.
        </p>

        {/* Quick start cards */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {quickStartItems.map((item) => (
            <div
              key={item.label}
              className="group p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-border/80 hover:shadow-lg transition-all duration-200 cursor-default text-left"
            >
              <div className={`w-9 h-9 rounded-lg ${item.bg} ${item.color} flex items-center justify-center mb-3`}>
                <item.icon size={18} strokeWidth={2} />
              </div>
              <h4 className="text-sm font-semibold text-foreground">{item.label}</h4>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-6">
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
            <MousePointer size={14} />
            <span>Click node in sidebar</span>
          </div>
          <ArrowRight size={16} className="text-muted-foreground/50" />
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
            <Zap size={14} style={{ color: '#00A36C' }} />
            <span>Click to place</span>
          </div>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="text-xs text-muted-foreground">
          <kbd className="px-2 py-1 bg-muted border rounded text-foreground font-mono text-[11px]">
            Cmd
          </kbd>
          <span className="mx-1.5">+</span>
          <kbd className="px-2 py-1 bg-muted border rounded text-foreground font-mono text-[11px]">
            K
          </kbd>
          <span className="ml-2">to search nodes</span>
        </div>
      </div>
    </div>
  );
}

