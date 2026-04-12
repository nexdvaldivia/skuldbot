/**
 * AI Planner V2 Panel - Executable Workflows
 * Conversational workflow generation with switchable workspace panels
 */

import { useEffect } from 'react';
import {
  X,
  Bot,
  Sparkles,
  Settings,
  MessageSquare,
  Eye,
  ShieldCheck,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useLicenseStore, useCanUseAIPlanner } from '../../store/licenseStore';
import { ChatPanel } from './v2/ChatPanel';
import { PreviewPanel } from './v2/PreviewPanel';
import { ValidationPanel } from './v2/ValidationPanel';
import { ConnectionsPanel } from './v2/ConnectionsPanel';
import { LLMConfigDialog } from './LLMConfigDialog';
import { LicenseDialog } from '../LicenseDialog';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';

interface AIPlannerV2PanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type PlannerPanelTab = 'chat' | 'preview' | 'validation' | 'connections';

const PANEL_OPTIONS: Array<{
  value: PlannerPanelTab;
  label: string;
  shortcut: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: 'chat',
    label: 'Chat',
    shortcut: '⌘1',
    description: 'Conversación y planificación',
    icon: MessageSquare,
  },
  {
    value: 'preview',
    label: 'Preview',
    shortcut: '⌘2',
    description: 'Vista del workflow generado',
    icon: Eye,
  },
  {
    value: 'validation',
    label: 'Validation',
    shortcut: '⌘3',
    description: 'Chequeos y problemas del plan',
    icon: ShieldCheck,
  },
  {
    value: 'connections',
    label: 'Connections',
    shortcut: '⌘4',
    description: 'Conexiones LLM y proveedores',
    icon: Link2,
  },
];

export function AIPlannerV2Panel({ isOpen, onClose }: AIPlannerV2PanelProps) {
  const canUseAI = useCanUseAIPlanner();
  const isStudioActivated = useLicenseStore((state) => state.isStudioActivated);
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [showLicenseDialog, setShowLicenseDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<PlannerPanelTab>('chat');
  const activePanel =
    PANEL_OPTIONS.find((option) => option.value === activeTab) || PANEL_OPTIONS[0];

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      // Don't auto-reset; let user decide
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }

      // Cmd/Ctrl + number to switch tabs
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        switch (e.key) {
          case '1':
            setActiveTab('chat');
            e.preventDefault();
            break;
          case '2':
            setActiveTab('preview');
            e.preventDefault();
            break;
          case '3':
            setActiveTab('validation');
            e.preventDefault();
            break;
          case '4':
            setActiveTab('connections');
            e.preventDefault();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[900px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            {/* Icon with gradient */}
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
              <Bot className="w-6 h-6 text-white" />
            </div>

            {/* Title and subtitle */}
            <div>
              <h2 className="font-semibold text-neutral-900 text-base">AI Planner</h2>
              <p className="text-xs text-neutral-500 font-medium">
                Intelligent workflow generation with validation
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLLMConfig(true)}
              title="LLM Settings"
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-900"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* License Check */}
        {!isStudioActivated() && (
          <div className="mx-6 mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-2 text-sm">License Required</h3>
            <p className="text-sm text-amber-700 mb-3 leading-relaxed">
              SkuldBot Studio requires a license to use. Please activate your license to continue.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-900 hover:bg-amber-100"
              onClick={() => setShowLicenseDialog(true)}
            >
              Activate License
            </Button>
          </div>
        )}

        {/* AI License Check */}
        {isStudioActivated() && !canUseAI && (
          <div className="mx-6 mt-6 p-5 bg-primary-50 border border-primary-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-primary-900 mb-2 text-sm">Upgrade to SkuldAI</h3>
                <p className="text-sm text-primary-700 mb-3 leading-relaxed">
                  AI Planner is a premium feature that creates production-ready automations with
                  intelligent validation. Upgrade to unlock this feature.
                </p>
                <Button variant="default" size="sm" className="bg-primary-600 hover:bg-primary-700">
                  Upgrade Now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {canUseAI && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* View Selector */}
            <div className="border-b border-neutral-200 bg-gradient-to-r from-neutral-50 via-white to-neutral-50 px-6 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="outline"
                  className="border-neutral-300 bg-white text-neutral-700 font-semibold uppercase tracking-wide"
                >
                  Workspace
                </Badge>

                <Select
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as PlannerPanelTab)}
                >
                  <SelectTrigger className="h-11 w-[320px] max-w-full border-neutral-300 bg-white shadow-sm hover:border-neutral-400 focus:ring-primary-200">
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <div className="w-7 h-7 rounded-md bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                        <activePanel.icon className="w-3.5 h-3.5 text-primary-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                          {activePanel.label}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {activePanel.description}
                        </div>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="w-[320px]">
                    {PANEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="py-2">
                        <div className="flex items-center justify-between gap-4 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <option.icon className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-neutral-900 truncate">
                                {option.label}
                              </div>
                              <div className="text-xs text-neutral-500 truncate">
                                {option.description}
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] border-neutral-300 text-neutral-500"
                          >
                            {option.shortcut}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-1.5">
                  {PANEL_OPTIONS.map((option) => (
                    <Badge
                      key={option.value}
                      variant="outline"
                      className={
                        option.value === activeTab
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : 'border-neutral-300 bg-white text-neutral-500'
                      }
                    >
                      {option.shortcut}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'chat' && <ChatPanel />}
              {activeTab === 'preview' && <PreviewPanel />}
              {activeTab === 'validation' && <ValidationPanel />}
              {activeTab === 'connections' && <ConnectionsPanel />}
            </div>
          </div>
        )}
      </div>

      {/* LLM Config Dialog */}
      <LLMConfigDialog isOpen={showLLMConfig} onClose={() => setShowLLMConfig(false)} />

      {/* License Dialog */}
      <LicenseDialog isOpen={showLicenseDialog} onClose={() => setShowLicenseDialog(false)} />
    </>
  );
}

export default AIPlannerV2Panel;
