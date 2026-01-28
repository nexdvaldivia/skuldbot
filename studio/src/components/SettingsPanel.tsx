import { useState, useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { useVaultStore, VaultSecret } from "../store/vaultStore";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/textarea";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Settings,
  Globe,
  Eye,
  Save,
  Clock,
  FileText,
  Key,
  Plus,
  Trash2,
  Check,
  Copy,
  Lock,
  Unlock,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

// ============================================================
// Secret Row Component - Values are NEVER displayed
// ============================================================

interface SecretRowProps {
  secret: VaultSecret;
  onDelete: (name: string) => void;
  onVerify: (name: string) => Promise<boolean>;
}

function SecretRow({ secret, onDelete, onVerify }: SecretRowProps) {
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleCopy = () => {
    // Copy the variable reference, NEVER the value
    navigator.clipboard.writeText(`\${vault.${secret.name}}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    setVerifying(true);
    const exists = await onVerify(secret.name);
    setVerified(exists);
    setVerifying(false);
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <Key className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <div className="font-mono text-sm font-medium text-slate-800">
            {secret.name}
          </div>
          {secret.description && (
            <div className="text-xs text-slate-500">{secret.description}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Value display - ALWAYS masked, no reveal option */}
        <div className="px-3 py-1.5 bg-slate-100 rounded-md text-sm font-mono text-slate-400">
          ••••••••••••
        </div>

        {/* Verify button */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className={`p-2 rounded-lg transition-colors ${
            verified === true
              ? "bg-green-100 text-green-600"
              : verified === false
              ? "bg-red-100 text-red-600"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
          title={verified === true ? "Verified" : verified === false ? "Not found" : "Verify exists"}
        >
          {verifying ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : verified === true ? (
            <ShieldCheck className="w-4 h-4" />
          ) : verified === false ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
        </button>

        {/* Copy reference button */}
        <button
          type="button"
          onClick={handleCopy}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          title="Copy variable reference"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={() => onDelete(secret.name)}
          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
          title="Delete secret"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Add Secret Form - Value only visible during creation
// ============================================================

interface AddSecretFormProps {
  onAdd: (name: string, value: string, description?: string) => Promise<boolean>;
  onCancel: () => void;
}

function AddSecretForm({ onAdd, onCancel }: AddSecretFormProps) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) {
      setError("Name and value are required");
      return;
    }

    setSaving(true);
    setError(null);

    const success = await onAdd(
      name.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      value,
      description || undefined
    );

    if (success) {
      // Clear form - value is now safely in vault
      setName("");
      setValue("");
      setDescription("");
      onCancel();
    } else {
      setError("Failed to save secret");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">
            Secret Name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            placeholder="TWILIO_AUTH_TOKEN"
            className="h-9 font-mono border-slate-200"
          />
          <p className="text-xs text-slate-500">
            Use this name in configs: <code className="bg-slate-200 px-1 rounded">${"{vault." + (name || "NAME") + "}"}</code>
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">
            Secret Value
          </Label>
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter secret value..."
            className="h-9 font-mono border-slate-200"
          />
          <p className="text-xs text-amber-600">
            Value will be encrypted and NEVER shown again
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">
            Description (optional)
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this secret for?"
            className="h-9 border-slate-200"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim() || !value.trim()}>
            {saving ? "Saving..." : "Save Secret"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ============================================================
// Main Settings Panel
// ============================================================

export default function SettingsPanel() {
  const {
    project,
    projectPath,
    updateProjectSettings,
    isSaving,
  } = useProjectStore();

  const {
    isUnlocked,
    isLoading: vaultLoading,
    secrets,
    error: vaultError,
    initializeVault,
    listSecrets,
    setSecret,
    deleteSecret,
    verifySecret,
    checkVaultStatus,
    setVaultPath,
  } = useVaultStore();

  const [hasChanges, setHasChanges] = useState(false);
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; secretName: string | null }>({
    open: false,
    secretName: null,
  });

  const [formData, setFormData] = useState({
    name: project?.project.name || "",
    description: project?.project.description || "",
    defaultBrowser: project?.settings.defaultBrowser || "chromium",
    defaultHeadless: project?.settings.defaultHeadless ?? true,
    autoSaveEnabled: project?.settings.autoSave?.enabled ?? true,
    autoSaveInterval: project?.settings.autoSave?.intervalMs || 5000,
  });

  // Update vault path when project changes
  useEffect(() => {
    if (projectPath) {
      const vaultDir = `${projectPath}/.skuldbot`;
      setVaultPath(vaultDir);
      checkVaultStatus();
    }
  }, [projectPath, setVaultPath, checkVaultStatus]);

  useEffect(() => {
    if (isUnlocked) {
      listSecrets();
    }
  }, [isUnlocked, listSecrets]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateProjectSettings({
      name: formData.name,
      description: formData.description,
      defaultBrowser: formData.defaultBrowser as "chromium" | "firefox" | "webkit",
      defaultHeadless: formData.defaultHeadless,
      autoSaveEnabled: formData.autoSaveEnabled,
      autoSaveInterval: formData.autoSaveInterval,
    });
    setHasChanges(false);
  };

  const handleInitializeVault = async () => {
    await initializeVault();
  };

  const handleAddSecret = async (name: string, value: string, description?: string) => {
    return await setSecret(name, value, description);
  };

  const handleDeleteSecret = async (name: string) => {
    setDeleteConfirm({ open: true, secretName: name });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.secretName) {
      await deleteSecret(deleteConfirm.secretName);
      setDeleteConfirm({ open: false, secretName: null });
    }
  };

  return (
    <>
      <div className="flex-1 bg-slate-50 overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                Project Settings
              </h1>
              <p className="text-sm text-slate-500">
                Configure your project preferences
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="space-y-4">
          {/* General Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">General</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Basic project information and metadata
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Project Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="My Automation Project"
                  className="h-10 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium text-slate-700">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Describe what this project does..."
                  rows={3}
                  className="border-slate-200 focus:border-primary-300 focus:ring-primary-100 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Secrets Section */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-500" />
                    <h2 className="font-medium text-slate-800">Secrets</h2>
                    {isUnlocked ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        <Unlock className="w-3 h-3" />
                        Unlocked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Encrypted credentials for integrations. Values are NEVER exposed.
                  </p>
                </div>
                {isUnlocked && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddSecret(true)}
                    disabled={showAddSecret}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Secret
                  </Button>
                )}
              </div>
            </div>

            <div className="p-5">
              {!isUnlocked ? (
                // Initialize vault - automatic, no password needed
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-700">
                      Click to initialize the local secrets vault. The vault is automatically
                      encrypted and managed by the Studio.
                    </p>
                  </div>
                  <Button
                    onClick={handleInitializeVault}
                    disabled={vaultLoading}
                    className="w-full"
                  >
                    {vaultLoading ? "Initializing..." : "Initialize Vault"}
                  </Button>
                  {vaultError && (
                    <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {vaultError}
                    </div>
                  )}
                </div>
              ) : (
                // Secrets list
                <div className="space-y-4">
                  {showAddSecret && (
                    <AddSecretForm
                      onAdd={handleAddSecret}
                      onCancel={() => setShowAddSecret(false)}
                    />
                  )}

                  {secrets.length === 0 && !showAddSecret ? (
                    <div className="py-8 text-center">
                      <Key className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">
                        No secrets configured. Click "Add Secret" to create one.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {secrets.map((secret) => (
                        <SecretRow
                          key={secret.name}
                          secret={secret}
                          onDelete={handleDeleteSecret}
                          onVerify={verifySecret}
                        />
                      ))}
                    </div>
                  )}

                  {/* Usage info */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700">
                      <strong>Usage:</strong> Reference secrets in node configs using{" "}
                      <code className="bg-blue-100 px-1 rounded">${"{vault.SECRET_NAME}"}</code>.
                      Values are resolved at runtime, never stored in the DSL.
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      This local vault is for development. In production, secrets are managed in the Orchestrator.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Browser Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">Browser Defaults</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Configure the default browser settings for your bots
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="browser" className="text-sm font-medium text-slate-700">
                  Default Browser
                </Label>
                <Select
                  value={formData.defaultBrowser}
                  onValueChange={(value) => handleChange("defaultBrowser", value)}
                >
                  <SelectTrigger id="browser" className="h-10 border-slate-200">
                    <SelectValue placeholder="Select browser" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chromium">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        Chromium
                      </div>
                    </SelectItem>
                    <SelectItem value="firefox">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500" />
                        Firefox
                      </div>
                    </SelectItem>
                    <SelectItem value="webkit">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        WebKit (Safari)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <Label htmlFor="headless" className="text-sm font-medium text-slate-700">
                      Headless Mode
                    </Label>
                  </div>
                  <p className="text-sm text-slate-500">
                    Run browsers without a visible window by default
                  </p>
                </div>
                <Switch
                  id="headless"
                  checked={formData.defaultHeadless}
                  onCheckedChange={(checked) =>
                    handleChange("defaultHeadless", checked)
                  }
                />
              </div>
            </div>
          </div>

          {/* Auto-Save Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">Auto-Save</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Automatically save your work at regular intervals
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autosave" className="text-sm font-medium text-slate-700">
                    Enable Auto-Save
                  </Label>
                  <p className="text-sm text-slate-500">
                    Automatically save changes to your bots
                  </p>
                </div>
                <Switch
                  id="autosave"
                  checked={formData.autoSaveEnabled}
                  onCheckedChange={(checked) =>
                    handleChange("autoSaveEnabled", checked)
                  }
                />
              </div>

              {formData.autoSaveEnabled && (
                <>
                  <div className="h-px bg-slate-100" />
                  <div className="space-y-2">
                    <Label htmlFor="interval" className="text-sm font-medium text-slate-700">
                      Save Interval
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="interval"
                        type="number"
                        value={formData.autoSaveInterval / 1000}
                        onChange={(e) =>
                          handleChange(
                            "autoSaveInterval",
                            parseInt(e.target.value) * 1000
                          )
                        }
                        min={1}
                        className="w-24 h-10 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                      />
                      <span className="text-sm text-slate-500">
                        seconds
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Minimum recommended: 5 seconds
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
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
    </>
  );
}
