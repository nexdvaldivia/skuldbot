/**
 * License Dialog
 * Modal for activating and managing licenses
 */

import { useState } from "react";
import { X, Key, CheckCircle, AlertCircle, Loader2, Shield, Sparkles, BarChart3 } from "lucide-react";
import { Button } from "./ui/Button";
import { useLicenseStore, useLicenseStatus } from "../store/licenseStore";
import { LicenseModule } from "../types/ai-planner";

interface LicenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Module information for display
const MODULE_INFO: Record<LicenseModule, {
  name: string;
  description: string;
  icon: typeof Key;
  color: string;
}> = {
  studio: {
    name: "SkuldBot Studio",
    description: "Visual flow editor, 170+ nodes, local execution",
    icon: Key,
    color: "#3b82f6",
  },
  skuldai: {
    name: "SkuldAI",
    description: "AI Planner, LLM nodes, AI-powered automation",
    icon: Sparkles,
    color: "#a855f7",
  },
  skuldcompliance: {
    name: "SkuldCompliance",
    description: "PII/PHI protection, HIPAA Safe Harbor, audit logs",
    icon: Shield,
    color: "#059669",
  },
  skulddataquality: {
    name: "SkuldDataQuality",
    description: "Data validation, profiling, AI repair",
    icon: BarChart3,
    color: "#0891b2",
  },
};

export function LicenseDialog({ isOpen, onClose }: LicenseDialogProps) {
  const { activateLicense, deactivateLicense, isValidating } = useLicenseStore();
  const { licenses, isActivated, hasAI, hasCompliance, hasDataQuality } = useLicenseStatus();

  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError("Please enter a license key");
      return;
    }

    setError(null);
    setSuccess(null);

    const result = await activateLicense(licenseKey);

    if (result.success) {
      setSuccess(`Successfully activated ${result.module} module`);
      setLicenseKey("");
    } else {
      setError(result.error || "Failed to activate license");
    }
  };

  const handleDeactivate = (module: LicenseModule) => {
    if (confirm(`Are you sure you want to deactivate the ${MODULE_INFO[module].name} license?`)) {
      deactivateLicense(module);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Key className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">License Management</h2>
              <p className="text-xs text-slate-500">Activate and manage your licenses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* License Key Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Activate New License
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm uppercase"
                maxLength={19}
              />
              <Button
                variant="default"
                onClick={handleActivate}
                disabled={isValidating || !licenseKey.trim()}
              >
                {isValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Activate"
                )}
              </Button>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                {success}
              </div>
            )}
          </div>

          {/* Active Licenses */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              Active Licenses ({licenses.length})
            </h3>

            {licenses.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-sm text-slate-500">No active licenses</p>
                <p className="text-xs text-slate-400 mt-1">
                  Enter a license key above to activate
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {licenses.map((license) => {
                  const info = MODULE_INFO[license.module];
                  const Icon = info.icon;
                  const isExpired = new Date(license.expiresAt) < new Date();

                  return (
                    <div
                      key={license.module}
                      className={`p-4 border rounded-xl ${
                        isExpired
                          ? "border-red-200 bg-red-50"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{
                              backgroundColor: `${info.color}15`,
                              color: info.color,
                            }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-800">
                              {info.name}
                            </h4>
                            <p className="text-xs text-slate-500">
                              {info.description}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              <span
                                className={`inline-flex items-center gap-1 text-xs ${
                                  isExpired
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {isExpired ? (
                                  <AlertCircle className="w-3 h-3" />
                                ) : (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                {isExpired ? "Expired" : "Active"}
                              </span>
                              <span className="text-xs text-slate-400">
                                Expires: {formatDate(license.expiresAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeactivate(license.module)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available Modules */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              Available Modules
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(MODULE_INFO).map(([module, info]) => {
                const Icon = info.icon;
                const isActive =
                  (module === "studio" && isActivated) ||
                  (module === "skuldai" && hasAI) ||
                  (module === "skuldcompliance" && hasCompliance) ||
                  (module === "skulddataquality" && hasDataQuality);

                return (
                  <div
                    key={module}
                    className={`p-3 border rounded-lg ${
                      isActive
                        ? "border-green-200 bg-green-50"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        className="w-4 h-4"
                        style={{ color: info.color }}
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {info.name.replace("Skuld", "")}
                      </span>
                      {isActive && (
                        <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-2">
                      {info.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Help Text */}
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-xs text-blue-700">
              <strong>Need a license?</strong> Visit{" "}
              <a
                href="https://skuldbot.com/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                skuldbot.com/pricing
              </a>{" "}
              to purchase licenses or contact sales@skuldbot.com for enterprise options.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LicenseDialog;
