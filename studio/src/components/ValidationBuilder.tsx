import { useState, useCallback } from "react";
import { ValidationRule, ValidationRuleType } from "../types/flow";
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

interface ValidationBuilderProps {
  value: ValidationRule[];
  onChange: (rules: ValidationRule[]) => void;
  availableFields?: string[]; // Fields from predecessor nodes
}

// Available validation types with their metadata
const VALIDATION_TYPES: {
  value: ValidationRuleType;
  label: string;
  icon: string;
  params?: { name: string; label: string; type: "text" | "number" | "values" }[];
}[] = [
  { value: "not_null", label: "Not Null", icon: "Ban" },
  { value: "unique", label: "Unique", icon: "Fingerprint" },
  { value: "email", label: "Email Format", icon: "Mail" },
  {
    value: "regex",
    label: "Regex Match",
    icon: "Regex",
    params: [{ name: "pattern", label: "Pattern", type: "text" }]
  },
  {
    value: "in_set",
    label: "In Set",
    icon: "ListChecks",
    params: [{ name: "values", label: "Allowed Values (comma-separated)", type: "values" }]
  },
  {
    value: "not_in_set",
    label: "Not In Set",
    icon: "ListX",
    params: [{ name: "values", label: "Blocked Values (comma-separated)", type: "values" }]
  },
  {
    value: "between",
    label: "Between",
    icon: "ArrowLeftRight",
    params: [
      { name: "min", label: "Min", type: "number" },
      { name: "max", label: "Max", type: "number" }
    ]
  },
  {
    value: "greater_than",
    label: "Greater Than",
    icon: "ChevronRight",
    params: [{ name: "value", label: "Value", type: "number" }]
  },
  {
    value: "less_than",
    label: "Less Than",
    icon: "ChevronLeft",
    params: [{ name: "value", label: "Value", type: "number" }]
  },
  {
    value: "length_between",
    label: "Length Between",
    icon: "Ruler",
    params: [
      { name: "min", label: "Min Length", type: "number" },
      { name: "max", label: "Max Length", type: "number" }
    ]
  },
  {
    value: "date_format",
    label: "Date Format",
    icon: "Calendar",
    params: [{ name: "format", label: "Format (e.g., %Y-%m-%d)", type: "text" }]
  },
  {
    value: "json_schema",
    label: "JSON Schema",
    icon: "Braces",
    params: [{ name: "schema", label: "JSON Schema", type: "text" }]
  },
];

// Generate unique ID
function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Stop keyboard events from propagating to React Flow
const stopPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

export function ValidationBuilder({ value, onChange, availableFields = [] }: ValidationBuilderProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addRule = useCallback(() => {
    const newRule: ValidationRule = {
      id: generateRuleId(),
      field: availableFields[0] || "",
      type: "not_null",
    };
    onChange([...value, newRule]);
    setExpandedIndex(value.length);
  }, [value, onChange, availableFields]);

  const updateRule = useCallback(
    (id: string, updates: Partial<ValidationRule>) => {
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">
          Validation Rules ({value.length})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRule}
          className="h-7 text-xs"
        >
          <Icon name="Plus" size={14} className="mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Rules List */}
      {value.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50">
          <Icon name="ShieldCheck" size={24} className="text-slate-400 mb-2" />
          <p className="text-sm text-slate-500 text-center">
            No validation rules yet. Click "Add Rule" to define validations.
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
  rule: ValidationRule;
  index: number;
  total: number;
  isExpanded: boolean;
  availableFields: string[];
  onToggle: () => void;
  onUpdate: (updates: Partial<ValidationRule>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}

function RuleItem({
  rule,
  index,
  total,
  isExpanded,
  availableFields,
  onToggle,
  onUpdate,
  onDelete,
  onMove,
}: RuleItemProps) {
  const validationType = VALIDATION_TYPES.find((t) => t.value === rule.type);

  const handleTypeChange = (newType: ValidationRuleType) => {
    // Reset params when changing type
    onUpdate({ type: newType, params: undefined });
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

        {/* Validation Icon */}
        <div className="w-6 h-6 rounded bg-sky-50 flex items-center justify-center text-sky-500">
          <Icon name={validationType?.icon || "ShieldCheck"} size={14} />
        </div>

        {/* Rule Summary */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700 truncate block">
            {rule.field || "(no field)"}
            <span className="text-slate-400 mx-1">-</span>
            {validationType?.label || rule.type}
          </span>
          {rule.params && Object.keys(rule.params).length > 0 && (
            <span className="text-xs text-slate-400">
              {Object.entries(rule.params)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                .join(", ")}
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
          <div>
            <Label className="text-xs text-slate-500">Field to Validate</Label>
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
                placeholder="Enter field name (e.g., patient_id)"
                className="h-8 text-sm mt-1"
              />
            )}
          </div>

          {/* Validation Type */}
          <div>
            <Label className="text-xs text-slate-500">Validation Type</Label>
            <Select
              value={rule.type}
              onValueChange={(val) => handleTypeChange(val as ValidationRuleType)}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALIDATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <Icon name={type.icon} size={14} />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Parameters based on validation type */}
          {validationType?.params && validationType.params.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <Label className="text-xs text-slate-500 font-medium">Parameters</Label>
              {validationType.params.map((param) => (
                <div key={param.name}>
                  <Label className="text-xs text-slate-400">{param.label}</Label>
                  {param.type === "values" ? (
                    <Input
                      value={
                        Array.isArray(rule.params?.[param.name])
                          ? (rule.params[param.name] as string[]).join(", ")
                          : rule.params?.[param.name] || ""
                      }
                      onChange={(e) => {
                        const values = e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean);
                        handleParamChange(param.name, values);
                      }}
                      onKeyDown={stopPropagation}
                      placeholder="value1, value2, value3"
                      className="h-8 text-sm mt-1"
                    />
                  ) : param.type === "number" ? (
                    <Input
                      type="number"
                      value={rule.params?.[param.name] ?? ""}
                      onChange={(e) =>
                        handleParamChange(
                          param.name,
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      onKeyDown={stopPropagation}
                      className="h-8 text-sm mt-1"
                    />
                  ) : (
                    <Input
                      value={rule.params?.[param.name] || ""}
                      onChange={(e) => handleParamChange(param.name, e.target.value)}
                      onKeyDown={stopPropagation}
                      placeholder={
                        param.name === "pattern"
                          ? "^[A-Z]{2}\\d{6}$"
                          : param.name === "format"
                          ? "%Y-%m-%d"
                          : ""
                      }
                      className="h-8 text-sm mt-1 font-mono"
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

export default ValidationBuilder;
