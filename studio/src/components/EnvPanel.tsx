import { useState } from "react";
import { Input } from "./ui/Input";
import { Switch } from "./ui/switch";
import { Button } from "./ui/Button";
import { ScrollArea } from "./ui/scroll-area";
import {
  KeyRound,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Info,
  Server,
  Code,
  Rocket,
} from "lucide-react";

interface EnvVariable {
  id: string;
  name: string;
  value: string;
  isSecret: boolean;
}

const defaultEnvs: Record<string, EnvVariable[]> = {
  development: [],
  staging: [],
  production: [],
};

const envConfig = {
  development: { icon: Code, color: "blue", label: "Development" },
  staging: { icon: Server, color: "amber", label: "Staging" },
  production: { icon: Rocket, color: "primary", label: "Production" },
};

export default function EnvPanel() {
  const [activeEnv, setActiveEnv] = useState<"development" | "staging" | "production">("development");
  const [envVariables, setEnvVariables] = useState<Record<string, EnvVariable[]>>(defaultEnvs);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const handleAddVariable = () => {
    const newVar: EnvVariable = {
      id: `var-${Date.now()}`,
      name: "",
      value: "",
      isSecret: false,
    };
    setEnvVariables((prev) => ({
      ...prev,
      [activeEnv]: [...prev[activeEnv], newVar],
    }));
  };

  const handleUpdateVariable = (
    id: string,
    field: keyof EnvVariable,
    value: any
  ) => {
    setEnvVariables((prev) => ({
      ...prev,
      [activeEnv]: prev[activeEnv].map((v) =>
        v.id === id ? { ...v, [field]: value } : v
      ),
    }));
  };

  const handleDeleteVariable = (id: string) => {
    setEnvVariables((prev) => ({
      ...prev,
      [activeEnv]: prev[activeEnv].filter((v) => v.id !== id),
    }));
  };

  const toggleSecretVisibility = (id: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  const currentVars = envVariables[activeEnv] || [];

  return (
    <div className="flex-1 bg-slate-50 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              Environment Variables
            </h1>
            <p className="text-sm text-slate-500">
              Manage secrets and configuration for different environments
            </p>
          </div>
        </div>

        {/* Environment Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 p-1 mb-4">
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(envConfig) as Array<keyof typeof envConfig>).map((env) => {
              const config = envConfig[env];
              const Icon = config.icon;
              const isActive = activeEnv === env;
              return (
                <button
                  key={env}
                  onClick={() => setActiveEnv(env)}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl border border-slate-200">
          {/* Card Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${
                activeEnv === "development" ? "bg-blue-500" :
                activeEnv === "staging" ? "bg-amber-500" : "bg-primary-500"
              }`} />
              <span className="font-medium text-slate-800 capitalize">{activeEnv}</span>
              <span className="px-2 py-0.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full">
                {currentVars.length} variables
              </span>
            </div>
            <Button onClick={handleAddVariable} size="sm">
              <Plus className="w-4 h-4" />
              Add Variable
            </Button>
          </div>

          {/* Card Description */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <p className="text-sm text-slate-500">
              Variables for {activeEnv} environment. Secret values are encrypted at rest.
            </p>
          </div>

          {/* Card Content */}
          <div className="p-5">
            {currentVars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <KeyRound className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="font-medium text-slate-700 mb-1">
                  No variables yet
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Add environment variables to use in your bots
                </p>
                <Button onClick={handleAddVariable} variant="outline">
                  <Plus className="w-4 h-4" />
                  Add Your First Variable
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {/* Header Row */}
                  <div className="grid grid-cols-12 gap-3 px-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <div className="col-span-4">Name</div>
                    <div className="col-span-5">Value</div>
                    <div className="col-span-2 text-center">Secret</div>
                    <div className="col-span-1"></div>
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* Variable Rows */}
                  {currentVars.map((variable) => (
                    <div
                      key={variable.id}
                      className="grid grid-cols-12 gap-3 items-center group py-1"
                    >
                      <div className="col-span-4">
                        <Input
                          value={variable.name}
                          onChange={(e) =>
                            handleUpdateVariable(
                              variable.id,
                              "name",
                              e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")
                            )
                          }
                          placeholder="VARIABLE_NAME"
                          className="font-mono text-sm h-9 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                        />
                      </div>
                      <div className="col-span-5">
                        <div className="relative">
                          <Input
                            type={
                              variable.isSecret &&
                              !visibleSecrets.has(variable.id)
                                ? "password"
                                : "text"
                            }
                            value={variable.value}
                            onChange={(e) =>
                              handleUpdateVariable(
                                variable.id,
                                "value",
                                e.target.value
                              )
                            }
                            placeholder="value"
                            className="font-mono text-sm h-9 pr-16 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                            {variable.isSecret && (
                              <button
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                onClick={() =>
                                  toggleSecretVisibility(variable.id)
                                }
                              >
                                {visibleSecrets.has(variable.id) ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              onClick={() => copyToClipboard(variable.value)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Switch
                          checked={variable.isSecret}
                          onCheckedChange={(checked) =>
                            handleUpdateVariable(
                              variable.id,
                              "isSecret",
                              checked
                            )
                          }
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button
                          className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => handleDeleteVariable(variable.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-4 bg-primary-50 rounded-xl border border-primary-100 p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-slate-800 mb-1">
                Using Environment Variables
              </p>
              <p className="text-slate-600">
                Reference variables in your bots using{" "}
                <code className="px-1.5 py-0.5 rounded bg-white border border-primary-200 font-mono text-xs text-primary-700">
                  {"${env.VARIABLE_NAME}"}
                </code>
                . Secret values are never exposed in logs or error messages.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
