import { useState, useCallback } from "react";
import { ProtectionRule, ProtectionMethodType } from "../types/flow";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface ProtectionBuilderProps {
  value: ProtectionRule[];
  onChange: (rules: ProtectionRule[]) => void;
  availableFields?: string[]; // Fields from predecessor nodes
  dataType: "pii" | "phi"; // PII or PHI protection
}

// Available protection methods with their metadata
const PROTECTION_METHODS: {
  value: ProtectionMethodType;
  label: string;
  icon: string;
  description: string;
  params?: { name: string; label: string; type: "text" | "number" | "boolean" | "select"; options?: { value: string; label: string }[] }[];
}[] = [
  {
    value: "skip",
    label: "Skip (Pass Through)",
    icon: "ArrowRight",
    description: "Include field without transformation",
    params: []
  },
  {
    value: "mask",
    label: "Mask",
    icon: "EyeOff",
    description: "Replace with *** characters",
    params: [
      { name: "mask_char", label: "Mask Character", type: "text" },
      { name: "preserve_last", label: "Show Last N Chars", type: "number" },
    ]
  },
  {
    value: "redact",
    label: "Redact",
    icon: "Eraser",
    description: "Replace with [REDACTED]",
    params: [
      { name: "replacement", label: "Replacement Text", type: "text" },
    ]
  },
  {
    value: "pseudonymize",
    label: "Pseudonymize",
    icon: "UserX",
    description: "Replace with consistent fake values",
    params: [
      { name: "consistent", label: "Keep Consistent", type: "boolean" },
      { name: "prefix", label: "Prefix", type: "text" },
    ]
  },
  {
    value: "hash",
    label: "Hash",
    icon: "Hash",
    description: "Apply cryptographic hash",
    params: [
      {
        name: "algorithm",
        label: "Algorithm",
        type: "select",
        options: [
          { value: "sha256", label: "SHA-256" },
          { value: "sha512", label: "SHA-512" },
          { value: "md5", label: "MD5" },
        ]
      },
      { name: "truncate", label: "Truncate Length", type: "number" },
    ]
  },
  {
    value: "generalize",
    label: "Generalize",
    icon: "Minimize2",
    description: "Reduce precision (age -> range)",
    params: []
  },
  {
    value: "encrypt",
    label: "Encrypt",
    icon: "Lock",
    description: "Reversible encryption",
    params: [
      { name: "key_var", label: "Encryption Key Variable", type: "text" },
    ]
  },
  {
    value: "tokenize",
    label: "Tokenize",
    icon: "Key",
    description: "Replace with tokens (reversible)",
    params: [
      { name: "token_prefix", label: "Token Prefix", type: "text" },
    ]
  },
];

// Generate unique ID
function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Stop keyboard events from propagating to React Flow
const stopPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

export function ProtectionBuilder({ value, onChange, availableFields = [], dataType }: ProtectionBuilderProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Use only fields from predecessor nodes - no suggestions mixed in
  // Suggestions are only used for placeholder text when typing manually

  const addRule = useCallback(() => {
    const newRule: ProtectionRule = {
      id: generateRuleId(),
      field: availableFields[0] || "",
      method: "mask",
    };
    onChange([...value, newRule]);
    setExpandedIndex(value.length);
  }, [value, onChange, availableFields]);

  const updateRule = useCallback(
    (id: string, updates: Partial<ProtectionRule>) => {
      const updatedRules = value.map((rule) => {
        if (rule.id !== id) return rule;
        return { ...rule, ...updates };
      });
      onChange(updatedRules);
    },
    [value, onChange]
  );

  const deleteRule = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
      if (expandedIndex === index) {
        setExpandedIndex(null);
      } else if (expandedIndex !== null && expandedIndex > index) {
        setExpandedIndex(expandedIndex - 1);
      }
    },
    [value, onChange, expandedIndex]
  );

  const moveRule = useCallback(
    (index: number, direction: "up" | "down") => {
      if (
        (direction === "up" && index === 0) ||
        (direction === "down" && index === value.length - 1)
      ) {
        return;
      }

      const newIndex = direction === "up" ? index - 1 : index + 1;
      const newRules = [...value];
      [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
      onChange(newRules);
    },
    [value, onChange]
  );

  const typeLabel = dataType === "phi" ? "PHI" : "PII";
  const typeColor = dataType === "phi" ? "rose" : "amber";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">
          {typeLabel} Protection Rules ({value.length})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRule}
          className="h-7 text-xs"
        >
          <Icon name="Plus" size={14} className="mr-1" />
          Add Field
        </Button>
      </div>

      {/* Rules List */}
      {value.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-8 px-4 border border-dashed border-${typeColor}-200 rounded-lg bg-${typeColor}-50/50`}>
          <Icon name="ShieldCheck" size={24} className={`text-${typeColor}-400 mb-2`} />
          <p className="text-sm text-slate-500 text-center">
            No protection rules yet. Click "Add Field" to configure {typeLabel} protection.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((rule, index) => (
            <RuleItem
              key={rule.id}
              rule={rule}
              index={index}
              total={value.length}
              isExpanded={expandedIndex === index}
              availableFields={availableFields}
              typeColor={typeColor}
              onToggle={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
              onUpdate={(updates) => updateRule(rule.id, updates)}
              onDelete={() => deleteRule(index)}
              onMove={(dir) => moveRule(index, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RuleItemProps {
  rule: ProtectionRule;
  index: number;
  total: number;
  isExpanded: boolean;
  availableFields: string[];
  typeColor: string;
  onToggle: () => void;
  onUpdate: (updates: Partial<ProtectionRule>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}

function RuleItem({
  rule,
  index,
  total,
  isExpanded,
  availableFields,
  typeColor,
  onToggle,
  onUpdate,
  onDelete,
  onMove,
}: RuleItemProps) {
  const protectionMethod = PROTECTION_METHODS.find((m) => m.value === rule.method);

  const handleMethodChange = (newMethod: ProtectionMethodType) => {
    // Reset params when changing method
    onUpdate({ method: newMethod, params: undefined });
  };

  const handleParamChange = (paramName: string, paramValue: any) => {
    onUpdate({
      params: {
        ...rule.params,
        [paramName]: paramValue,
      },
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* Header - Always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Index */}
        <div className="flex items-center gap-1 text-slate-400">
          <Icon name="GripVertical" size={14} />
          <span className="text-xs font-mono w-4">{index + 1}</span>
        </div>

        {/* Protection Icon */}
        <div className={`w-6 h-6 rounded bg-${typeColor}-50 flex items-center justify-center text-${typeColor}-500`}>
          <Icon name={protectionMethod?.icon || "ShieldCheck"} size={14} />
        </div>

        {/* Rule Summary */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700 truncate block">
            {rule.field || "(no field)"}
            {rule.outputName && rule.outputName !== rule.field && (
              <span className="text-emerald-500 mx-1">→ {rule.outputName}</span>
            )}
            <span className="text-slate-400 mx-1">|</span>
            <span className="text-slate-500">{protectionMethod?.label || rule.method}</span>
          </span>
          {protectionMethod && (
            <span className="text-xs text-slate-400">
              {protectionMethod.description}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={index === 0}
            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
          >
            <Icon name="ChevronUp" size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
          >
            <Icon name="ChevronDown" size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-slate-400 hover:text-red-500"
          >
            <Icon name="Trash2" size={14} />
          </button>
          <Icon
            name={isExpanded ? "ChevronUp" : "ChevronDown"}
            size={16}
            className="text-slate-400 ml-1"
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
          {/* Field Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Field to Protect</Label>
              {availableFields.length > 0 ? (
                <Select
                  value={rule.field}
                  onValueChange={(val) => onUpdate({ field: val })}
                >
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        <div className="flex items-center gap-2">
                          <Icon name="Variable" size={14} className="text-slate-400" />
                          {field}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={rule.field}
                  onChange={(e) => onUpdate({ field: e.target.value })}
                  onKeyDown={stopPropagation}
                  placeholder="e.g., ssn, email"
                  className="h-8 text-sm mt-1"
                />
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Output Name (optional)</Label>
              <Input
                value={rule.outputName || ""}
                onChange={(e) => onUpdate({ outputName: e.target.value || undefined })}
                onKeyDown={stopPropagation}
                placeholder={rule.field || "Same as input"}
                className="h-8 text-sm mt-1"
              />
            </div>
          </div>

          {/* Protection Method */}
          <div>
            <Label className="text-xs text-slate-500">Protection Method</Label>
            <Select
              value={rule.method}
              onValueChange={(val) => handleMethodChange(val as ProtectionMethodType)}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROTECTION_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    <div className="flex items-center gap-2">
                      <Icon name={method.icon} size={14} />
                      <span>{method.label}</span>
                      <span className="text-xs text-slate-400">- {method.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Parameters based on protection method */}
          {protectionMethod?.params && protectionMethod.params.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <Label className="text-xs text-slate-500 font-medium">Method Options</Label>
              {protectionMethod.params.map((param) => (
                <div key={param.name}>
                  <Label className="text-xs text-slate-400">{param.label}</Label>
                  {param.type === "select" && param.options ? (
                    <Select
                      value={rule.params?.[param.name] || param.options[0]?.value}
                      onValueChange={(val) => handleParamChange(param.name, val)}
                    >
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {param.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : param.type === "boolean" ? (
                    <div className="flex items-center mt-1">
                      <input
                        type="checkbox"
                        checked={rule.params?.[param.name] ?? true}
                        onChange={(e) => handleParamChange(param.name, e.target.checked)}
                        className="h-4 w-4 text-primary-600 rounded border-slate-300"
                      />
                      <span className="ml-2 text-sm text-slate-600">{param.label}</span>
                    </div>
                  ) : param.type === "number" ? (
                    <Input
                      type="number"
                      value={rule.params?.[param.name] ?? ""}
                      onChange={(e) =>
                        handleParamChange(
                          param.name,
                          e.target.value ? parseInt(e.target.value) : undefined
                        )
                      }
                      onKeyDown={stopPropagation}
                      className="h-8 text-sm mt-1"
                      placeholder={param.name === "preserve_last" ? "4" : param.name === "truncate" ? "8" : ""}
                    />
                  ) : (
                    <Input
                      value={rule.params?.[param.name] || ""}
                      onChange={(e) => handleParamChange(param.name, e.target.value)}
                      onKeyDown={stopPropagation}
                      placeholder={
                        param.name === "mask_char" ? "*" :
                        param.name === "replacement" ? "[REDACTED]" :
                        param.name === "prefix" ? "PSEUDO_" :
                        param.name === "token_prefix" ? "TOK_" :
                        param.name === "key_var" ? "${vault.encryption_key}" :
                        ""
                      }
                      className="h-8 text-sm mt-1"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProtectionBuilder;
