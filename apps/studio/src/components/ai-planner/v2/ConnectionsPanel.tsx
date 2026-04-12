/**
 * Connections Panel - LLM Provider Management
 * Enterprise-grade UI for managing AI Planner LLM connections
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Clock,
  Star,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { useConnectionsStore } from '../../../store/connectionsStore';
import { ConnectionDialog } from '../ConnectionDialog';
import { LLMConnection } from '../../../types/ai-planner';

export function ConnectionsPanel() {
  const {
    connections,
    selectedConnectionId,
    selectConnection,
    setDefaultConnection,
    deleteConnection,
    loadConnections,
    testConnectionById,
    checkHealth,
  } = useConnectionsStore();

  const [showDialog, setShowDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<LLMConnection | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Background health checks every 5 minutes
  useEffect(() => {
    if (connections.length === 0) return;

    // Initial health check for all connections
    connections.forEach((conn) => {
      checkHealth(conn.id);
    });

    // Set up interval for periodic checks
    const interval = setInterval(
      () => {
        connections.forEach((conn) => {
          checkHealth(conn.id);
        });
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(interval);
  }, [connections, checkHealth]);

  // Handle test connection
  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testConnectionById(id);
      if (result.success) {
        // Show success feedback
        console.log('Connection test successful:', result);
      }
    } finally {
      setTestingId(null);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (deleteConfirmId === id) {
      await deleteConnection(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  // Handle new connection
  const handleNewConnection = () => {
    setEditingConnection(null);
    setShowDialog(true);
  };

  // Handle edit connection
  const handleEdit = (connection: LLMConnection) => {
    setEditingConnection(connection);
    setShowDialog(true);
  };

  // Get provider display name
  const getProviderLabel = (provider: string): string => {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      'azure-foundry': 'Azure AI Foundry',
      'aws-bedrock': 'AWS Bedrock',
      'vertex-ai': 'Google Vertex AI',
      ollama: 'Ollama',
      vllm: 'vLLM',
      tgi: 'Text Generation Inference',
      llamacpp: 'llama.cpp',
      lmstudio: 'LM Studio',
      localai: 'LocalAI',
      custom: 'Custom',
    };
    return labels[provider] || provider;
  };

  // Get provider color
  const getProviderColor = (provider: string): string => {
    const colors: Record<string, string> = {
      openai: 'bg-primary-100 text-primary-700 border-primary-200',
      anthropic: 'bg-purple-100 text-purple-700 border-purple-200',
      'azure-foundry': 'bg-blue-100 text-blue-700 border-blue-200',
      'aws-bedrock': 'bg-orange-100 text-orange-700 border-orange-200',
      'vertex-ai': 'bg-red-100 text-red-700 border-red-200',
      ollama: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      vllm: 'bg-pink-100 text-pink-700 border-pink-200',
      tgi: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      llamacpp: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      lmstudio: 'bg-teal-100 text-teal-700 border-teal-200',
      localai: 'bg-lime-100 text-lime-700 border-lime-200',
      custom: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return colors[provider] || colors.custom;
  };

  // Get health status icon
  const getHealthIcon = (connection: LLMConnection) => {
    if (!connection.healthStatus) {
      return <AlertCircle className="w-4 h-4 text-neutral-400" />;
    }

    switch (connection.healthStatus.status) {
      case 'healthy':
        return <CheckCircle2 className="w-4 h-4 text-primary-600" />;
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-amber-600" />;
      case 'down':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  // Format last used time
  const formatLastUsed = (timestamp?: string): string => {
    if (!timestamp) return 'Never used';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">LLM Connections</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manage AI providers for plan generation
            </p>
          </div>
          <Button
            onClick={handleNewConnection}
            size="sm"
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Connection
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {connections.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-base font-semibold text-neutral-900 mb-2">No connections yet</h3>
            <p className="text-sm text-neutral-600 mb-6 max-w-sm leading-relaxed">
              Add your first LLM provider to start generating intelligent automation workflows.
              Supports 12+ providers including OpenAI, Azure, AWS, and self-hosted options.
            </p>
            <Button
              onClick={handleNewConnection}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Connection
            </Button>
          </div>
        ) : (
          // Connections Grid
          <div className="grid grid-cols-1 gap-4">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className={`
                  bg-white rounded-xl border-2 p-5 transition-all cursor-pointer
                  ${
                    selectedConnectionId === connection.id
                      ? 'border-primary-400 shadow-md'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }
                `}
                onClick={() => selectConnection(connection.id)}
              >
                <div className="flex items-start justify-between">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {/* Provider Badge */}
                      <span
                        className={`
                          inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border
                          ${getProviderColor(connection.provider)}
                        `}
                      >
                        {getProviderLabel(connection.provider)}
                      </span>

                      {/* Default Badge */}
                      {connection.isDefault && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 text-primary-700 border border-primary-200">
                          <Star className="w-3 h-3 mr-1 fill-current" />
                          Default
                        </span>
                      )}

                      {/* Health Status */}
                      <div className="flex items-center gap-1">{getHealthIcon(connection)}</div>
                    </div>

                    {/* Connection Name */}
                    <h4 className="text-sm font-semibold text-neutral-900 mb-1 truncate">
                      {connection.name}
                    </h4>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastUsed(connection.lastUsedAt)}
                      </div>
                      {connection.healthStatus?.latencyMs && (
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {connection.healthStatus.latencyMs}ms
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {/* Test */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTest(connection.id);
                      }}
                      disabled={testingId === connection.id}
                      className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors disabled:opacity-50"
                      title="Test connection"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${testingId === connection.id ? 'animate-spin' : ''}`}
                      />
                    </button>

                    {/* Set Default */}
                    {!connection.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDefaultConnection(connection.id);
                        }}
                        className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors"
                        title="Set as default"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(connection);
                      }}
                      className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors"
                      title="Edit connection"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(connection.id);
                      }}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${
                          deleteConfirmId === connection.id
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'hover:bg-neutral-100 text-neutral-600 hover:text-red-600'
                        }
                      `}
                      title={
                        deleteConfirmId === connection.id
                          ? 'Click again to confirm'
                          : 'Delete connection'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {connection.healthStatus?.errorMessage && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">{connection.healthStatus.errorMessage}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={showDialog}
        onClose={() => {
          setShowDialog(false);
          setEditingConnection(null);
        }}
        editingConnection={editingConnection}
      />
    </div>
  );
}
