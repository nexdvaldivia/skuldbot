import { useState, useEffect } from "react";
import { useVaultStore } from "../store/vaultStore";
import { useProjectStore } from "../store/projectStore";
import { useToastStore } from "../store/toastStore";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/textarea";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  Eye,
  Copy,
  Key,
  Shield,
  AlertCircle,
  RefreshCw,
  KeyRound,
} from "lucide-react";

interface SecretFormData {
  name: string;
  value: string;
  description: string;
}

export default function VaultManager() {
  const { projectPath } = useProjectStore();

  const {
    isUnlocked,
    isLoading,
    secrets,
    error,
    initializeVault,
    setSecret,
    deleteSecret,
    checkVaultStatus,
    setVaultPath,
  } = useVaultStore();

  const toast = useToastStore();

  // Form states
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; secretName: string | null }>({
    open: false,
    secretName: null,
  });
  const [newSecret, setNewSecret] = useState<SecretFormData>({
    name: "",
    value: "",
    description: "",
  });

  // Update vault path when project changes
  useEffect(() => {
    if (projectPath) {
      const vaultDir = `${projectPath}/.skuldbot`;
      setVaultPath(vaultDir);
      checkVaultStatus();
    }
  }, [projectPath, setVaultPath, checkVaultStatus]);

  const handleInitialize = async () => {
    const success = await initializeVault();
    if (success) {
      toast.success("Vault ready", "Local vault initialized and ready to use");
    } else {
      const message = error || "Failed to initialize vault";
      toast.error("Error", message);
    }
  };

  const handleAddSecret = async () => {
    if (!newSecret.name || !newSecret.value) {
      toast.error("Error", "Name and value are required");
      return;
    }
    const success = await setSecret(newSecret.name, newSecret.value, newSecret.description);
    if (success) {
      toast.success("Secret added", `${newSecret.name} saved to vault`);
      setNewSecret({ name: "", value: "", description: "" });
      setShowAddSecret(false);
    } else {
      toast.error("Error", "Failed to save secret");
    }
  };

  const handleDeleteSecret = async (name: string) => {
    setDeleteConfirm({ open: true, secretName: name });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.secretName) {
      const success = await deleteSecret(deleteConfirm.secretName);
      if (success) {
        toast.success("Secret deleted", `${deleteConfirm.secretName} removed from vault`);
      } else {
        toast.error("Error", "Failed to delete secret");
      }
      setDeleteConfirm({ open: false, secretName: null });
    }
  };

  // SECURITY: Secret values are never returned to frontend
  const toggleSecretVisibility = () => {
    toast.info("Security", "Secret values are not exposed to the UI. Use ${vault.name} in your bot to access them at runtime.");
  };

  // SECURITY: Secret values cannot be copied - they're resolved at runtime
  const copyToClipboard = (name: string) => {
    const reference = `\${vault.${name}}`;
    navigator.clipboard.writeText(reference);
    toast.success("Copied", `Reference ${reference} copied. Use this in your bot config.`);
  };

  // Not initialized - show initialize button
  if (!isUnlocked) {
    return (
      <div className="flex-1 bg-slate-50 overflow-auto">
        <div className="max-w-xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Local Vault</h1>
              <p className="text-sm text-slate-500">
                Secure storage for credentials and secrets
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-emerald-600" />
                <h2 className="font-medium text-slate-800">Initialize Vault</h2>
              </div>

              <p className="text-sm text-slate-600">
                Click to initialize the local secrets vault. The vault is automatically
                encrypted using AES-256-GCM and managed by the Studio.
              </p>

              <Button
                onClick={handleInitialize}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                Initialize Vault
              </Button>
            </div>
          </div>

          {/* Info box */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800 mb-2">
              Using Secrets in Bots
            </h3>
            <p className="text-sm text-blue-700">
              Reference secrets in your bot nodes using the syntax:
            </p>
            <code className="block mt-2 p-2 bg-blue-100 rounded text-sm text-blue-900 font-mono">
              {"${vault.secret_name}"}
            </code>
            <p className="text-xs text-blue-600 mt-2">
              This local vault is for development and testing. In production, secrets are managed in the Orchestrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Unlocked state - show secrets management
  return (
    <div className="flex-1 bg-slate-50 overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Unlock className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Local Vault</h1>
              <p className="text-sm text-slate-500">
                {secrets.length} secret{secrets.length !== 1 ? "s" : ""} stored
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowAddSecret(true)}>
            <Plus className="w-4 h-4" />
            Add Secret
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Add Secret Form */}
        {showAddSecret && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
            <h2 className="font-medium text-slate-800 mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Add New Secret
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Name</Label>
                  <Input
                    value={newSecret.name}
                    onChange={(e) =>
                      setNewSecret({ ...newSecret, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })
                    }
                    placeholder="db_password"
                    className="h-10 font-mono"
                  />
                  <p className="text-xs text-slate-400">
                    Use as: {`\${vault.${newSecret.name || "name"}}`}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Value</Label>
                  <Input
                    type="password"
                    value={newSecret.value}
                    onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                    placeholder="Secret value"
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Description (optional)
                </Label>
                <Textarea
                  value={newSecret.description}
                  onChange={(e) => setNewSecret({ ...newSecret, description: e.target.value })}
                  placeholder="What is this secret used for?"
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSecret} disabled={isLoading || !newSecret.name || !newSecret.value}>
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save Secret
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddSecret(false);
                    setNewSecret({ name: "", value: "", description: "" });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Secrets List */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-medium text-slate-800">Stored Secrets</h2>
            <p className="text-sm text-slate-500 mt-1">
              Secret values are never exposed. Click copy to get the reference syntax.
            </p>
          </div>

          {secrets.length === 0 ? (
            <div className="p-8 text-center">
              <KeyRound className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No secrets stored yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowAddSecret(true)}
              >
                <Plus className="w-4 h-4" />
                Add First Secret
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {secrets.map((secret) => (
                <div
                  key={secret.name}
                  className="px-5 py-4 flex items-center justify-between hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" />
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {secret.name}
                      </span>
                    </div>
                    {secret.description && (
                      <p className="text-sm text-slate-500 mt-1 truncate">
                        {secret.description}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      {`\${vault.${secret.name}}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={() => toggleSecretVisibility()}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                      title="Secret values are not exposed (security)"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => copyToClipboard(secret.name)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                      title="Copy reference to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSecret(secret.name)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                      title="Delete secret"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-2">
            Using Secrets in Bots
          </h3>
          <p className="text-sm text-blue-700 mb-2">
            Reference secrets in your bot nodes using the syntax:
          </p>
          <code className="block p-2 bg-blue-100 rounded text-sm text-blue-900 font-mono">
            {"${vault.db_password}"}
          </code>
          <p className="text-xs text-blue-600 mt-2">
            This local vault is for development and testing. In production, secrets are managed in the Orchestrator.
          </p>
        </div>
      </div>
    </div>

    {/* Delete Confirmation Dialog */}
    <ConfirmDialog
      open={deleteConfirm.open}
      onOpenChange={(open) => !open && setDeleteConfirm({ open: false, secretName: null })}
      title="Delete Secret"
      description={`Are you sure you want to delete the secret "${deleteConfirm.secretName}"? This action cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={confirmDelete}
    />
  );
}
