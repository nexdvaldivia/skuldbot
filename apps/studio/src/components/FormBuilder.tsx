import { useState, useCallback } from "react";
import { FormFieldDefinition } from "../types/flow";
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
import { Switch } from "./ui/switch";

interface FormBuilderProps {
  value: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}

const FIELD_TYPES = [
  { value: "text", label: "Text", icon: "Type" },
  { value: "email", label: "Email", icon: "Mail" },
  { value: "number", label: "Number", icon: "Hash" },
  { value: "date", label: "Date", icon: "Calendar" },
  { value: "dropdown", label: "Dropdown", icon: "ChevronDown" },
  { value: "checkbox", label: "Checkbox", icon: "CheckSquare" },
  { value: "file", label: "File Upload", icon: "Upload" },
  { value: "textarea", label: "Text Area", icon: "AlignLeft" },
] as const;

// Generate a slug from a label (for readable field IDs)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '_')     // Replace spaces with underscores
    .replace(/-+/g, '_')      // Replace dashes with underscores
    .substring(0, 30);        // Limit length
}

// Generate unique ID from label
function generateFieldId(label: string, existingIds: string[]): string {
  const baseSlug = slugify(label) || 'field';
  let slug = baseSlug;
  let counter = 1;

  // Ensure uniqueness
  while (existingIds.includes(slug)) {
    slug = `${baseSlug}_${counter}`;
    counter++;
  }

  return slug;
}

// Stop keyboard events from propagating to React Flow (prevents Delete key from removing nodes)
const stopPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

export function FormBuilder({ value, onChange }: FormBuilderProps) {
  // Track expanded field by index to avoid re-renders when id changes
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addField = useCallback(() => {
    const fieldNumber = value.length + 1;
    const label = `Field ${fieldNumber}`;
    const existingIds = value.map(f => f.id);
    const newField: FormFieldDefinition = {
      id: generateFieldId(label, existingIds),
      type: "text",
      label,
      required: false,
    };
    onChange([...value, newField]);
    setExpandedIndex(value.length); // Expand the new field (will be at end)
  }, [value, onChange]);

  const updateField = useCallback(
    (id: string, updates: Partial<FormFieldDefinition>) => {
      const updatedFields = value.map((field) => {
        if (field.id !== id) return field;
        return { ...field, ...updates };
      });
      onChange(updatedFields);
    },
    [value, onChange]
  );

  const deleteField = useCallback(
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

  const moveField = useCallback(
    (id: string, direction: "up" | "down") => {
      const index = value.findIndex((f) => f.id === id);
      if (
        (direction === "up" && index === 0) ||
        (direction === "down" && index === value.length - 1)
      ) {
        return;
      }

      const newIndex = direction === "up" ? index - 1 : index + 1;
      const newFields = [...value];
      [newFields[index], newFields[newIndex]] = [
        newFields[newIndex],
        newFields[index],
      ];
      onChange(newFields);
    },
    [value, onChange]
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">
          Form Fields ({value.length})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addField}
          className="h-7 text-xs"
        >
          <Icon name="Plus" size={14} className="mr-1" />
          Add Field
        </Button>
      </div>

      {/* Fields List */}
      {value.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50">
          <Icon name="FileText" size={24} className="text-slate-400 mb-2" />
          <p className="text-sm text-slate-500 text-center">
            No fields yet. Click "Add Field" to create your form.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((field, index) => (
            <FieldItem
              key={index}
              field={field}
              index={index}
              total={value.length}
              isExpanded={expandedIndex === index}
              onToggle={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
              onUpdate={(updates) => updateField(field.id, updates)}
              onDelete={() => deleteField(index)}
              onMove={(dir) => moveField(field.id, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldItemProps {
  field: FormFieldDefinition;
  index: number;
  total: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<FormFieldDefinition>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}

function FieldItem({
  field,
  index,
  total,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onMove,
}: FieldItemProps) {
  const fieldType = FIELD_TYPES.find((t) => t.value === field.type);

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* Header - Always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Drag Handle / Index */}
        <div className="flex items-center gap-1 text-slate-400">
          <Icon name="GripVertical" size={14} />
          <span className="text-xs font-mono w-4">{index + 1}</span>
        </div>

        {/* Field Icon */}
        <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center text-emerald-500">
          <Icon name={fieldType?.icon || "Type"} size={14} />
        </div>

        {/* Field Label */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700 truncate block">
            {field.label || "Untitled Field"}
          </span>
          <span className="text-xs text-slate-400">
            {fieldType?.label || field.type}
            {field.required && (
              <span className="text-rose-500 ml-1">*</span>
            )}
          </span>
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
          {/* Label */}
          <div>
            <Label className="text-xs text-slate-500">Field Label</Label>
            <Input
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              onKeyDown={stopPropagation}
              placeholder="Enter field label"
              className="h-8 text-sm mt-1"
            />
          </div>

          {/* Field ID / Key */}
          <div>
            <Label className="text-xs text-slate-500">
              Field ID <span className="text-slate-400">(used in expressions)</span>
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs text-slate-400 bg-slate-100 px-1.5 py-1 rounded">formData.</code>
              <Input
                value={field.id}
                onChange={(e) => {
                  // Sanitize: only allow lowercase, numbers, underscores
                  const sanitized = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_')
                    .replace(/^[0-9]/, '_') // Can't start with number
                    .substring(0, 30);
                  onUpdate({ id: sanitized });
                }}
                onKeyDown={stopPropagation}
                placeholder="field_name"
                className="h-8 text-sm font-mono flex-1"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Expression: <code className="bg-slate-100 px-1 rounded">${`{NodeName.formData.${field.id}}`}</code>
            </p>
          </div>

          {/* Type */}
          <div>
            <Label className="text-xs text-slate-500">Field Type</Label>
            <Select
              value={field.type}
              onValueChange={(val) =>
                onUpdate({ type: val as FormFieldDefinition["type"] })
              }
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
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

          {/* Placeholder */}
          <div>
            <Label className="text-xs text-slate-500">Placeholder</Label>
            <Input
              value={field.placeholder || ""}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              onKeyDown={stopPropagation}
              placeholder="Enter placeholder text"
              className="h-8 text-sm mt-1"
            />
          </div>

          {/* Dropdown Options */}
          {field.type === "dropdown" && (
            <div>
              <Label className="text-xs text-slate-500">
                Options (one per line)
              </Label>
              <textarea
                value={field.options?.join("\n") || ""}
                onChange={(e) =>
                  onUpdate({
                    options: e.target.value.split("\n").filter(Boolean),
                  })
                }
                onKeyDown={stopPropagation}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                className="w-full h-20 px-3 py-2 text-sm border border-slate-200 rounded-md mt-1 resize-none"
              />
            </div>
          )}

          {/* Required Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-500">Required Field</Label>
            <Switch
              checked={field.required || false}
              onCheckedChange={(checked) => onUpdate({ required: checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FormBuilder;
