import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { FlowNodeData, NodeCategory } from '../types/flow';
import { getNodeTemplate } from '../data/nodeTemplates';
import { useValidationStore } from '../store/validationStore';
import { useDebugStore, useNodeDebugState } from '../store/debugStore';
import { Icon } from './ui/Icon';
import {
  AlertCircle,
  AlertTriangle,
  Circle,
  Trash2,
  CheckCircle2,
  Play,
  Loader2,
  X,
  Pin,
} from 'lucide-react';

// Category color mapping - Light theme
const categoryStyles: Record<
  NodeCategory,
  { bg: string; border: string; icon: string; accent: string }
> = {
  web: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-600',
    accent: 'bg-blue-500',
  },
  desktop: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: 'text-indigo-600',
    accent: 'bg-indigo-500',
  },
  storage: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    accent: 'bg-gradient-to-r from-amber-500 to-orange-500',
  },
  files: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: 'text-orange-600',
    accent: 'bg-orange-500',
  },
  excel: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-600',
    accent: 'bg-green-500',
  },
  email: {
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    icon: 'text-pink-600',
    accent: 'bg-pink-500',
  },
  api: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-600',
    accent: 'bg-emerald-500',
  },
  database: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    icon: 'text-cyan-600',
    accent: 'bg-cyan-500',
  },
  document: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    accent: 'bg-red-500',
  },
  ai: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: 'text-violet-600',
    accent: 'bg-gradient-to-r from-violet-500 to-fuchsia-500',
  },
  vectordb: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: 'text-purple-600',
    accent: 'bg-gradient-to-r from-purple-500 to-indigo-500',
  },
  code: {
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    icon: 'text-slate-700',
    accent: 'bg-gradient-to-r from-orange-500 to-slate-600',
  },
  python: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    icon: 'text-yellow-600',
    accent: 'bg-gradient-to-r from-blue-500 to-yellow-500',
  },
  control: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: 'text-slate-600',
    accent: 'bg-slate-500',
  },
  logging: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'text-gray-600',
    accent: 'bg-gray-500',
  },
  security: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    accent: 'bg-amber-500',
  },
  human: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    icon: 'text-teal-600',
    accent: 'bg-teal-500',
  },
  compliance: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: 'text-rose-600',
    accent: 'bg-gradient-to-r from-rose-500 to-red-500',
  },
  dataquality: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: 'text-sky-600',
    accent: 'bg-gradient-to-r from-sky-500 to-blue-500',
  },
  data: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-300',
    icon: 'text-cyan-600',
    accent: 'bg-gradient-to-r from-cyan-500 to-teal-500',
  },
  trigger: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-600',
    accent: 'bg-emerald-500',
  },
  voice: {
    bg: 'bg-fuchsia-50',
    border: 'border-fuchsia-200',
    icon: 'text-fuchsia-600',
    accent: 'bg-fuchsia-500',
  },
  insurance: {
    bg: 'bg-lime-50',
    border: 'border-lime-200',
    icon: 'text-lime-600',
    accent: 'bg-lime-500',
  },
  ms365: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: 'text-sky-600',
    accent: 'bg-[#0078d4]',
  },
  bot: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: 'text-rose-600',
    accent: 'bg-rose-500',
  },
};

function CustomNode({ data, selected, id }: NodeProps<FlowNodeData>) {
  const template = getNodeTemplate(data.nodeType);
  const style = categoryStyles[data.category] || categoryStyles.control;
  const isAI = data.category === 'ai';
  const isPython = data.category === 'python';
  const isTrigger = data.category === 'trigger';
  const isVectorDB = data.category === 'vectordb';
  const isAIAgent = data.nodeType === 'ai.agent'; // Special handling for AI Agent with tools
  const isVectorMemory = data.nodeType === 'vectordb.memory'; // Special handling for Vector Memory node
  const isEmbeddings = data.nodeType === 'ai.embeddings'; // Special handling for Embeddings node
  const isAIModel = data.nodeType === 'ai.model'; // Special handling for AI Model node
  const isAIConfigNode = isEmbeddings || isAIModel; // Config nodes don't have success/error handles
  const needsEmbeddingsInput = isVectorMemory; // Only Vector Memory needs separate embeddings input (AI Agent has it in the bottom bar)

  // AI nodes that need a model connection (but are NOT ai.agent which has its own bottom bar)
  const AI_TASK_NODES = [
    'ai.extract_data',
    'ai.summarize',
    'ai.classify',
    'ai.translate',
    'ai.sentiment',
    'ai.vision',
    'ai.repair_data',
    'ai.suggest_repairs',
  ];
  const isAITaskNode = AI_TASK_NODES.includes(data.nodeType);

  // MS365 connection nodes
  const isMS365Connection = data.nodeType === 'ms365.connection';
  // MS365 consumer nodes require the connection input handle.
  const isMS365Trigger =
    (data.nodeType === 'trigger.ms365_email' || data.category === 'ms365') && !isMS365Connection;

  // Storage Provider connection — nodes that read/write files need a storage handle
  const STORAGE_CONSUMER_NODES = [
    // Excel
    'excel.open',
    'excel.save',
    'excel.create',
    'excel.csv_read',
    'excel.csv_write',
    'excel.export_pdf',
    // Document
    'document.pdf_read',
    'document.pdf_merge',
    'document.pdf_split',
    'document.pdf_to_image',
    'document.pdf_fill_form',
    'document.ocr',
    'document.word_read',
    'document.word_write',
    // Email attachments
    'email.download_attachment',
    'email.send_outlook',
    'ms365.email_download_attachment',
    'ms365.email_send',
    'ms365.email_reply',
    // Web
    'web.screenshot',
    'web.download_file',
    // Desktop
    'desktop.screenshot',
    'desktop.image_click',
    'desktop.wait_image',
    // Voice
    'voice.speak',
    'voice.listen',
    // AI
    'ai.vision',
    // Logging
    'logging.export',
    // VectorDB
    'vectordb.load_documents',
    // Trigger
    'trigger.storage_event',
  ];
  const needsStorageConnection =
    STORAGE_CONSUMER_NODES.includes(data.nodeType) ||
    data.nodeType.startsWith('files.') ||
    data.nodeType === 'storage.transfer' ||
    data.nodeType === 'storage.sync';
  const isStorageProvider = data.nodeType === 'storage.provider';
  const needsMS365Connection = isMS365Trigger;

  // Config nodes that only have connection output (no success/error)
  const isConnectionConfigNode = isMS365Connection || isStorageProvider;
  // Check if connection has been tested successfully
  const isConnectionTested = isConnectionConfigNode && data.config?.connectionTested === true;

  // Get validation issues for this node
  const { getNodeIssues } = useValidationStore();
  const nodeIssues = getNodeIssues(id);
  const hasErrors = nodeIssues.some((i) => i.severity === 'error');
  const hasWarnings = nodeIssues.some((i) => i.severity === 'warning') && !hasErrors;

  // Get debug state for this node
  const { toggleBreakpoint, runSingleNode, sessionState } = useDebugStore();
  const { isCurrentNode, hasBreakpoint, isDebugging, status, output, error, isPinned } =
    useNodeDebugState(id);

  // Get execution timing and item count for flow-style display
  const nodeExecution = sessionState?.nodeExecutions?.[id];
  const executionDuration =
    nodeExecution?.startTime && nodeExecution?.endTime
      ? ((nodeExecution.endTime - nodeExecution.startTime) / 1000).toFixed(1)
      : null;

  // Calculate item count from output data
  const itemCount = useMemo(() => {
    if (!output) return null;
    if (Array.isArray(output)) return output.length;
    if (typeof output === 'object' && output !== null) {
      // Check for common data properties that might be arrays
      if (Array.isArray(output.data)) return output.data.length;
      if (Array.isArray(output.rows)) return output.rows.length;
      if (Array.isArray(output.items)) return output.items.length;
      if (Array.isArray(output.records)) return output.records.length;
      // Count object keys as "fields"
      return Object.keys(output).length;
    }
    return null;
  }, [output]);

  // Local state for running single node
  const [isRunningNode, setIsRunningNode] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [outputPosition, setOutputPosition] = useState<{ top: number; left: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // React Flow instance for deletion
  const { deleteElements } = useReactFlow();

  // Handle breakpoint toggle on double-click on the left side
  const handleBreakpointClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBreakpoint(id);
  };

  // Handle node deletion
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ nodes: [{ id }] });
  };

  // Handle run single node
  const handleRunNode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunningNode || isDebugging) return;

    setIsRunningNode(true);
    setShowOutput(false);
    try {
      await runSingleNode(id);
      setShowOutput(true);
    } finally {
      setIsRunningNode(false);
    }
  };

  // Toggle output display
  const handleToggleOutput = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOutput(!showOutput);
  };

  // Check if node has output to show
  const hasOutput = output !== undefined || error !== undefined;

  // Update output panel position when showing output
  useEffect(() => {
    if (showOutput && hasOutput && nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      const toolbarOffset = isAIAgent || isAITaskNode || needsMS365Connection ? 54 : 36;
      setOutputPosition({
        top: rect.bottom + toolbarOffset,
        left: rect.left,
      });
    }
  }, [showOutput, hasOutput, isAIAgent, isAITaskNode, needsMS365Connection]);

  const nodeContent = (
    <div
      ref={nodeRef}
      className={`
        relative
        bg-white
        rounded-xl
        border
        shadow-sm
        transition-all duration-200
        ${isTrigger ? 'ring-2 ring-emerald-300' : ''}
        ${isConnectionTested ? 'ring-2 ring-emerald-400 border-emerald-400' : ''}
        ${hasErrors ? 'ring-2 ring-red-400 border-red-400' : ''}
        ${hasWarnings && !isConnectionTested ? 'ring-2 ring-yellow-400 border-yellow-400' : ''}
        ${isCurrentNode && isDebugging ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        ${status === 'running' ? 'ring-2 ring-blue-400 border-blue-400' : ''}
        ${status === 'success' ? 'ring-2 ring-green-400 border-green-400' : ''}
        ${status === 'error' ? 'ring-2 ring-red-500 border-red-500' : ''}
        ${
          selected
            ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]'
            : `${style.border} hover:shadow-lg hover:scale-[1.01]`
        }
      `}
      style={{ minWidth: 180 }}
    >
      {(status === 'running' || status === 'success') && (
        <div className="absolute top-2 right-2 z-20">
          {status === 'running' ? (
            <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shadow-sm">
              <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          )}
        </div>
      )}
      {/* Breakpoint indicator - top left, outside the node */}
      <button
        type="button"
        className="absolute -top-2 -left-2 z-20 w-5 h-5 rounded-full cursor-pointer flex items-center justify-center bg-white border border-slate-200 shadow-sm hover:border-red-300 hover:bg-red-50 transition-colors"
        onClick={handleBreakpointClick}
        onMouseDown={(e) => e.stopPropagation()}
        title={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
      >
        <Circle
          className={`w-3 h-3 ${hasBreakpoint ? 'fill-red-500 text-red-500' : 'text-slate-400'}`}
        />
      </button>

      {selected && (isAIConfigNode || isConnectionConfigNode) && (
        <button
          type="button"
          className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full cursor-pointer flex items-center justify-center bg-white border border-slate-200 shadow-sm hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-colors"
          onClick={handleDeleteClick}
          onMouseDown={(e) => e.stopPropagation()}
          title="Delete node"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* START Badge for Triggers */}
      {isTrigger && (
        <div className="absolute -top-2.5 left-3 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wide">
          Start
        </div>
      )}

      {/* Debug status indicator */}
      {isDebugging && status === 'running' && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
          Running
        </div>
      )}

      {/* Pinned Data indicator (flow-style) - top right corner */}
      {isPinned && (
        <div
          className="absolute -top-2 right-6 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-0.5 z-10"
          title="Output data is pinned - using frozen data instead of re-executing"
        >
          <Pin className="w-2.5 h-2.5" />
          <span>PIN</span>
        </div>
      )}

      {/* Connection Verified Badge - shown for connection nodes that have been tested */}
      {isConnectionTested && !hasErrors && !selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm z-10"
          title="Connection verified"
        >
          <CheckCircle2 className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Validation Error/Warning Badge - shown when NOT selected (delete button takes priority) */}
      {hasErrors && !isDebugging && !selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-sm z-10"
          title={nodeIssues
            .filter((i) => i.severity === 'error')
            .map((i) => i.message)
            .join('\n')}
        >
          <AlertCircle className="w-3 h-3 text-white" />
        </div>
      )}
      {hasWarnings && !isConnectionTested && !isDebugging && !selected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center shadow-sm z-10"
          title={nodeIssues
            .filter((i) => i.severity === 'warning')
            .map((i) => i.message)
            .join('\n')}
        >
          <AlertTriangle className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Input Handle - NOT shown for triggers or AI config nodes */}
      {!isTrigger && !isAIConfigNode && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3.5 !h-3.5 !-left-[7px] !bg-slate-400 !border-[3px] !border-white !shadow-sm hover:!bg-slate-600 !transition-all"
        />
      )}

      {/* Tool Output Handle - Shown on top of nodes that can be used as tools (not on triggers, AI agents, vector memory, or AI config nodes) */}
      {!isTrigger && !isAIAgent && !isVectorMemory && !isAIConfigNode && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <Handle
            type="source"
            position={Position.Top}
            id="tool-out"
            className="!w-3.5 !h-3.5 !-top-[7px] !bg-violet-400 !border-[3px] !border-white !shadow-sm hover:!bg-violet-500 !transition-all !rounded-md opacity-50 hover:opacity-100"
            title="Connect as tool to AI Agent"
          />
        </div>
      )}

      {/* Memory Output Handle - Only shown for Vector Memory node (on TOP) */}
      {isVectorMemory && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Top}
              id="memory-out"
              className="!w-4 !h-4 !-top-[8px] !bg-purple-500 !border-[3px] !border-white !shadow-sm hover:!bg-purple-600 !transition-all !rounded-md"
              title="Connect to AI Agent Memory input"
            />
            <span className="absolute -top-6 text-[9px] font-medium text-purple-500 whitespace-nowrap">
              To Agent
            </span>
          </div>
        </div>
      )}

      {/* Embeddings Output Handle - Only shown for Embeddings node (on TOP) */}
      {isEmbeddings && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Top}
              id="embeddings-out"
              className="!w-4 !h-4 !-top-[10px] !bg-amber-500 !border-[3px] !border-white !shadow-sm hover:!bg-amber-600 !transition-all !rounded-full"
              title="Connect to AI Agent or Vector Memory"
            />
            <span className="absolute -top-7 text-[9px] font-medium text-amber-600 whitespace-nowrap">
              To Agent/Memory
            </span>
          </div>
        </div>
      )}

      {/* AI Model Output Handle - Only shown for AI Model node (on TOP) */}
      {isAIModel && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Top}
              id="model-out"
              className="!w-4 !h-4 !-top-[10px] !bg-sky-500 !border-[3px] !border-white !shadow-sm hover:!bg-sky-600 !transition-all !rounded-full"
              title="Connect to AI Agent"
            />
            <span className="absolute -top-7 text-[9px] font-medium text-sky-600 whitespace-nowrap">
              To Agent
            </span>
          </div>
        </div>
      )}

      {/* Storage Provider Output Handle - Only shown for storage.provider node (on TOP) */}
      {isStorageProvider && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative">
            <Handle
              type="source"
              position={Position.Top}
              id="storage-out"
              className="!w-4 !h-4 !-top-[8px] !bg-orange-400 !border-[3px] !border-white !shadow-sm hover:!bg-orange-500 !transition-all !rounded-full"
              title="Connect to nodes that use files"
            />
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-medium text-orange-500 whitespace-nowrap">
              Storage
            </span>
          </div>
        </div>
      )}

      {/* MS365 Connection Output Handle - Only shown for ms365.connection node (on TOP) */}
      {isMS365Connection && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative">
            <Handle
              type="source"
              position={Position.Top}
              id="connection-out"
              className="!w-4 !h-4 !-top-[8px] !bg-[#0078d4] !border-[3px] !border-white !shadow-sm hover:!bg-[#106ebe] !transition-all !rounded-full"
              title="Connect to MS365 nodes"
            />
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-medium text-[#0078d4] whitespace-nowrap">
              To MS365
            </span>
          </div>
        </div>
      )}

      {/* MS365 Connection Input Handle - Shown for MS365 trigger and actions (on BOTTOM border) */}
      {needsMS365Connection && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <div className="relative">
            <Handle
              type="target"
              position={Position.Bottom}
              id="connection"
              className="!w-4 !h-4 !-bottom-[8px] !bg-[#0078d4] !border-[3px] !border-white !shadow-sm hover:!bg-[#106ebe] !transition-all !rounded-full"
              title="Connect MS365 Connection"
            />
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-medium text-[#0078d4] whitespace-nowrap">
              MS365 Connection
            </span>
          </div>
        </div>
      )}

      {/* Storage Provider Connection Output Handle - Only shown for storage.provider node (on TOP) */}
      {isStorageProvider && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="relative">
            <Handle
              type="source"
              position={Position.Top}
              id="connection-out"
              className="!w-4 !h-4 !-top-[8px] !bg-amber-500 !border-[3px] !border-white !shadow-sm hover:!bg-amber-600 !transition-all !rounded-full"
              title="Connect to Files nodes"
            />
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-medium text-amber-600 whitespace-nowrap">
              To Files
            </span>
          </div>
        </div>
      )}

      {/* Storage Provider Connection Input Handle - Shown for Files nodes (on BOTTOM border) */}
      {needsStorageConnection && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <div className="relative">
            <Handle
              type="target"
              position={Position.Bottom}
              id="connection"
              className="!w-4 !h-4 !-bottom-[8px] !bg-amber-500 !border-[3px] !border-white !shadow-sm hover:!bg-amber-600 !transition-all !rounded-full"
              title="Connect Storage Provider"
            />
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-medium text-amber-600 whitespace-nowrap">
              Storage
            </span>
          </div>
        </div>
      )}

      {/* Embeddings Input Handle - Shown for Vector Memory (on LEFT border) */}
      {needsEmbeddingsInput && (
        <div className="absolute left-0 top-0 bottom-0 flex items-center">
          <div className="relative flex flex-row items-center">
            <Handle
              type="target"
              position={Position.Left}
              id="embeddings"
              className="!w-4 !h-4 !-left-[8px] !bg-amber-500 !border-[3px] !border-white !shadow-sm hover:!bg-amber-600 !transition-all !rounded-full"
              title="Connect Embeddings model"
            />
            <span className="absolute -left-16 text-[9px] font-medium text-amber-600 whitespace-nowrap">
              Embed
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className={`flex items-center gap-3 px-3.5 py-3 ${isTrigger ? 'pt-4' : ''} ${isAIAgent ? 'pt-4' : ''}`}
      >
        {/* Icon container */}
        <div
          className={`
          relative flex-shrink-0 w-9 h-9 rounded-lg
          ${style.bg}
          flex items-center justify-center
          ${style.icon}
          ${isAI || isPython ? 'ring-1 ring-violet-200' : ''}
          ${isVectorDB ? 'ring-1 ring-purple-200' : ''}
          ${isTrigger ? 'ring-1 ring-emerald-200' : ''}
        `}
        >
          {template && <Icon name={template.icon} size={18} />}
          {(isAI || isPython) && (
            <div
              className={`absolute -top-1 -right-1 w-3 h-3 ${isAI ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-gradient-to-r from-blue-500 to-yellow-500'} rounded-full border-2 border-white`}
            />
          )}
          {isVectorDB && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full border-2 border-white" />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800 truncate block">{data.label}</span>
          {template && (
            <span className="text-[11px] text-slate-400 font-mono truncate block">
              {template.type}
            </span>
          )}
        </div>
      </div>

      {/* flow-style execution info badge - shows after execution */}
      {(status === 'success' || status === 'error') &&
        (itemCount !== null || executionDuration !== null) && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] border-t rounded-b-xl ${
              status === 'success'
                ? 'bg-green-50/80 border-green-200'
                : 'bg-red-50/80 border-red-200'
            }`}
          >
            {itemCount !== null && (
              <span
                className={`flex items-center gap-1 ${status === 'success' ? 'text-green-700' : 'text-red-700'}`}
              >
                <span className="font-semibold">{itemCount}</span>
                <span className="opacity-80">{itemCount === 1 ? 'item' : 'items'}</span>
              </span>
            )}
            {executionDuration !== null && (
              <span
                className={`flex items-center gap-1 ml-auto ${status === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                <span className="font-medium">{executionDuration}s</span>
              </span>
            )}
          </div>
        )}

      {/* Output Handles - NOT shown for config nodes (AI Model, Embeddings, MS365 Connection) */}
      {!isAIConfigNode && !isConnectionConfigNode && (
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-5">
          {/* Success Handle */}
          <div className="relative">
            <Handle
              type="source"
              position={Position.Right}
              id="success"
              className="!w-3.5 !h-3.5 !-right-[7px] !bg-emerald-500 !border-[3px] !border-white !shadow-sm hover:!bg-emerald-600 !transition-all"
            />
          </div>
          {/* Error Handle */}
          <div className="relative">
            <Handle
              type="source"
              position={Position.Right}
              id="error"
              className="!w-3.5 !h-3.5 !-right-[7px] !bg-orange-500 !border-[3px] !border-white !shadow-sm hover:!bg-orange-600 !transition-all"
            />
          </div>
        </div>
      )}

      {/* AI Agent Input Handles - Model, Embed, Memory, Tools in a row at the bottom */}
      {isAIAgent && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-8 pb-1">
          {/* Model Handle */}
          <div className="relative flex flex-col items-center">
            <Handle
              type="target"
              position={Position.Bottom}
              id="model"
              className="!w-4 !h-4 !-bottom-[10px] !bg-sky-500 !border-[3px] !border-white !shadow-sm hover:!bg-sky-600 !transition-all !rounded-full"
              title="Connect AI Model"
            />
            <span className="absolute -bottom-7 text-[8px] font-medium text-sky-600 whitespace-nowrap">
              Model
            </span>
          </div>
          {/* Embeddings Handle */}
          <div className="relative flex flex-col items-center">
            <Handle
              type="target"
              position={Position.Bottom}
              id="embeddings"
              className="!w-4 !h-4 !-bottom-[10px] !bg-amber-500 !border-[3px] !border-white !shadow-sm hover:!bg-amber-600 !transition-all !rounded-full"
              title="Connect Embeddings model"
            />
            <span className="absolute -bottom-7 text-[8px] font-medium text-amber-600 whitespace-nowrap">
              Embed
            </span>
          </div>
          {/* Memory Handle */}
          <div className="relative flex flex-col items-center">
            <Handle
              type="target"
              position={Position.Bottom}
              id="memory"
              className="!w-4 !h-4 !-bottom-[10px] !bg-purple-500 !border-[3px] !border-white !shadow-sm hover:!bg-purple-600 !transition-all !rounded-md"
              title="Connect Vector Memory"
            />
            <span className="absolute -bottom-7 text-[8px] font-medium text-purple-500 whitespace-nowrap">
              Memory
            </span>
          </div>
          {/* Tools Handle */}
          <div className="relative flex flex-col items-center">
            <Handle
              type="target"
              position={Position.Bottom}
              id="tools"
              className="!w-4 !h-4 !-bottom-[10px] !bg-violet-500 !border-[3px] !border-white !shadow-sm hover:!bg-violet-600 !transition-all !rounded-md"
              title="Connect nodes as tools"
            />
            <span className="absolute -bottom-7 text-[8px] font-medium text-violet-500 whitespace-nowrap">
              Tools
            </span>
          </div>
        </div>
      )}

      {/* AI Task Nodes - Single Model Handle at the bottom center */}
      {isAITaskNode && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-1">
          <div className="relative flex flex-col items-center">
            <Handle
              type="target"
              position={Position.Bottom}
              id="model"
              className="!w-4 !h-4 !-bottom-[10px] !bg-sky-500 !border-[3px] !border-white !shadow-sm hover:!bg-sky-600 !transition-all !rounded-full"
              title="Connect AI Model"
            />
            <span className="absolute -bottom-7 text-[8px] font-medium text-sky-600 whitespace-nowrap">
              Model
            </span>
          </div>
        </div>
      )}

      {/* Node Toolbar - appears below the node when selected or has run status */}
      {/* Extra margin for nodes with bottom handles (AI Agent, AI Task nodes, MS365 Trigger) */}
      {(selected || status === 'success' || status === 'error') &&
        !isAIConfigNode &&
        !isConnectionConfigNode && (
          <div
            className={`absolute left-0 right-0 top-full flex justify-end gap-1 z-20 ${
              isAIAgent || isAITaskNode || isMS365Trigger ? 'mt-6' : 'mt-1'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Run/Rerun Button - always available to run the node */}
            <button
              type="button"
              className={`w-6 h-6 rounded cursor-pointer flex items-center justify-center shadow-sm transition-all ${
                isRunningNode
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-slate-100 hover:bg-green-500 hover:text-white text-slate-600'
              }`}
              onClick={handleRunNode}
              disabled={isRunningNode || isDebugging}
              title={isRunningNode ? 'Running...' : 'Run this node'}
            >
              {isRunningNode ? (
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>

            {/* View Output Button - only when there's output */}
            {(status === 'success' || status === 'error') && (
              <button
                type="button"
                className={`w-6 h-6 rounded cursor-pointer flex items-center justify-center shadow-sm transition-all ${
                  status === 'success'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
                onClick={handleToggleOutput}
                title="View output"
              >
                {status === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            )}

            {/* Delete Button - only when selected */}
            {selected && (
              <button
                type="button"
                className="w-6 h-6 rounded cursor-pointer flex items-center justify-center bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-600 shadow-sm transition-all"
                onClick={handleDeleteClick}
                title="Delete node"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
    </div>
  );

  // Output Panel - rendered as a portal to appear above React Flow edges
  const outputPanel =
    showOutput &&
    hasOutput &&
    outputPosition &&
    createPortal(
      <div
        className="fixed bg-white border rounded-lg shadow-2xl overflow-hidden"
        style={{
          top: outputPosition.top,
          left: outputPosition.left,
          minWidth: 250,
          maxWidth: 400,
          zIndex: 10000,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-3 py-1.5 ${
            status === 'success'
              ? 'bg-emerald-50 border-b border-emerald-100'
              : 'bg-red-50 border-b border-red-100'
          }`}
        >
          <span
            className={`text-xs font-semibold ${
              status === 'success' ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {status === 'success' ? 'Output' : 'Error'}
          </span>
          <button onClick={handleToggleOutput} className="p-0.5 hover:bg-white/50 rounded">
            <X className="w-3 h-3 text-slate-500" />
          </button>
        </div>
        {/* Content */}
        <div className="p-3 max-h-48 overflow-auto">
          {error ? (
            <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{error}</pre>
          ) : output ? (
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
              {typeof output === 'object'
                ? JSON.stringify(
                    output,
                    (key, value) => {
                      // Redact sensitive fields
                      const sensitiveKeys = [
                        'password',
                        'secret',
                        'api_key',
                        'apiKey',
                        'token',
                        'client_secret',
                        'clientSecret',
                        'access_token',
                        'accessToken',
                        'private_key',
                        'privateKey',
                      ];
                      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
                        return '••••••••';
                      }
                      return value;
                    },
                    2,
                  )
                : String(output)}
            </pre>
          ) : (
            <span className="text-xs text-slate-400 italic">No output</span>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {nodeContent}
      {outputPanel}
    </>
  );
}

export default memo(CustomNode);
