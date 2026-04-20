import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, AlertCircle } from "lucide-react";

export interface CsvColumnDef {
  header: string;
  field: string;
  default?: string;
  type?: "string" | "number" | "boolean" | "date" | "datetime";
}

export interface CsvMappingSuggestion {
  label: string;
  value?: string;
  description?: string;
  insertText?: string;
  mode?: "path" | "expression";
}

interface CsvColumnBuilderProps {
  value: CsvColumnDef[] | string;
  onChange: (columns: CsvColumnDef[]) => void;
  suggestions?: CsvMappingSuggestion[];
  transformExpression?: (expression: string) => string;
}

const COLUMN_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Datetime" },
] as const;

// Stop keyboard events from propagating to React Flow (prevents Delete key from removing nodes)
const stopPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

function getDroppedExpression(e: React.DragEvent<HTMLElement>): string {
  return (
    e.dataTransfer.getData("application/x-skuld-expression") ||
    e.dataTransfer.getData("text/plain")
  );
}

/**
 * Parse legacy formats into CsvColumnDef[].
 * Supports:
 *  - JSON array of {header, field, default, type}
 *  - Comma-separated string of header names
 *  - JSON object map {header: field}
 *  - Already parsed array
 */
function parseLegacyValue(raw: CsvColumnDef[] | string): CsvColumnDef[] {
  if (!raw) return [];

  // Already an array of objects
  if (Array.isArray(raw)) {
    return raw.map((item) => ({
      header: item.header || "",
      field: item.field || "",
      default: item.default ?? "",
      type: item.type || "string",
    }));
  }

  if (typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON parse
  try {
    const parsed = JSON.parse(trimmed);

    // JSON array
    if (Array.isArray(parsed)) {
      const mapped = parsed
        .map((item: any): CsvColumnDef | null => {
          // Legacy JSON array of strings: ["Date","Amount"]
          if (typeof item === "string") {
            const header = item.trim();
            if (!header) return null;
            return {
              header,
              field: header,
              default: "",
              type: "string" as const,
            };
          }

          // JSON array of objects (supports aliases used by engine parser)
          const header = String(item?.header || item?.name || item?.column || item?.field || "").trim();
          const field = String(item?.field || item?.source || item?.path || item?.key || header).trim();
          if (!header) return null;
          return {
            header,
            field,
            default: item?.default != null ? String(item.default) : "",
            type: item?.type || "string",
          };
        })
        .filter((entry): entry is CsvColumnDef => entry !== null);
      return mapped;
    }

    // JSON object map: { "Header": "field_name" }
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed).map(([header, field]) => ({
        header,
        field: String(field),
        default: "",
        type: "string" as const,
      }));
    }
  } catch {
    // Not JSON — treat as comma-separated header names
  }

  // Comma-separated string
  return trimmed
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0)
    .map((header) => ({
      header,
      field: header.toLowerCase().replace(/\s+/g, "_"),
      default: "",
      type: "string" as const,
    }));
}

interface MappingExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions: CsvMappingSuggestion[];
  transformExpression?: (expression: string) => string;
}

function MappingExpressionInput({
  value,
  onChange,
  placeholder,
  suggestions,
  transformExpression,
}: MappingExpressionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState(suggestions);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const getExpressionContext = useCallback((text: string, cursor: number) => {
    const beforeCursor = text.slice(0, cursor);
    const lastOpen = beforeCursor.lastIndexOf("${");
    if (lastOpen === -1) return null;

    const afterOpen = beforeCursor.slice(lastOpen + 2);
    if (afterOpen.includes("}")) return null;

    return {
      start: lastOpen,
      query: afterOpen.toLowerCase(),
      prefix: text.slice(0, lastOpen),
      suffix: text.slice(cursor),
    };
  }, []);

  const insertSuggestion = useCallback(
    (suggestion: CsvMappingSuggestion) => {
      const rawInsert = suggestion.insertText || suggestion.value || suggestion.label;
      const context = getExpressionContext(value, cursorPosition);
      if (context) {
        const replacement =
          rawInsert.startsWith("${") && rawInsert.endsWith("}")
            ? rawInsert
            : `\${${rawInsert}}`;
        const nextValue = context.prefix + replacement + context.suffix;
        onChange(nextValue);
        setShowSuggestions(false);

        setTimeout(() => {
          const input = inputRef.current;
          if (!input) return;
          input.focus();
          const nextCursor = context.prefix.length + replacement.length;
          input.setSelectionRange(nextCursor, nextCursor);
        }, 0);
        return;
      }

      onChange(rawInsert);
      setShowSuggestions(false);
      setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        const nextCursor = rawInsert.length;
        input.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    },
    [cursorPosition, getExpressionContext, onChange, value]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = e.target.value;
      const cursor = e.target.selectionStart ?? 0;
      setCursorPosition(cursor);
      onChange(nextValue);

      const context = getExpressionContext(nextValue, cursor);
      const query = context ? context.query : nextValue.trim().toLowerCase();
      if (!query) {
        setShowSuggestions(false);
        return;
      }

      const filtered = suggestions
        .filter((item) => {
          const q = query;
          return (
            item.label.toLowerCase().includes(q) ||
            String(item.value || "").toLowerCase().includes(q) ||
            String(item.insertText || "").toLowerCase().includes(q)
          );
        })
        .slice(0, 10);

      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
    },
    [getExpressionContext, onChange, suggestions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      stopPropagation(e);
      if (!showSuggestions) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((idx) => Math.min(idx + 1, filteredSuggestions.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((idx) => Math.max(idx - 1, 0));
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        const selected = filteredSuggestions[selectedIndex];
        if (selected) {
          e.preventDefault();
          insertSuggestion(selected);
        }
        return;
      }

      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [filteredSuggestions, insertSuggestion, selectedIndex, showSuggestions]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLInputElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = getDroppedExpression(e);
      const expression = dropped
        ? transformExpression
          ? transformExpression(dropped)
          : dropped
        : "";
      if (!expression) return;

      const input = inputRef.current;
      if (!input) {
        onChange(value + expression);
        return;
      }
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const nextValue = value.slice(0, start) + expression + value.slice(end);
      onChange(nextValue);

      setTimeout(() => {
        input.focus();
        const cursor = start + expression.length;
        input.setSelectionRange(cursor, cursor);
      }, 0);
    },
    [onChange, transformExpression, value]
  );

  useEffect(() => {
    if (!showSuggestions || !suggestionsRef.current) return;
    const selected = suggestionsRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, showSuggestions]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
        placeholder={isDragOver ? "Drop variable here..." : placeholder}
        className={`h-7 text-xs font-mono ${isDragOver ? "bg-blue-50 border-blue-400 ring-2 ring-blue-300 ring-offset-1" : ""}`}
      />

      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, i) => (
            <div
              key={`${suggestion.value}-${i}`}
              className={`px-3 py-2 cursor-pointer text-xs flex items-center gap-2 ${
                i === selectedIndex ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSuggestion(suggestion)}
            >
              <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                {suggestion.label}
              </span>
              {suggestion.insertText && suggestion.insertText !== suggestion.label && (
                <span className="text-[10px] text-slate-500 font-mono truncate">
                  {suggestion.insertText}
                </span>
              )}
              {suggestion.description && (
                <span className="text-[10px] text-slate-400 truncate">{suggestion.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CsvColumnBuilder({
  value,
  onChange,
  suggestions = [],
  transformExpression,
}: CsvColumnBuilderProps) {
  const columns = useMemo(() => parseLegacyValue(value), [value]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const updateColumn = useCallback(
    (index: number, patch: Partial<CsvColumnDef>) => {
      const updated = columns.map((col, i) =>
        i === index ? { ...col, ...patch } : col
      );
      onChange(updated);
    },
    [columns, onChange]
  );

  const addColumn = useCallback(() => {
    const n = columns.length + 1;
    onChange([
      ...columns,
      { header: `Column ${n}`, field: `column_${n}`, default: "", type: "string" },
    ]);
  }, [columns, onChange]);

  const removeColumn = useCallback(
    (index: number) => {
      onChange(columns.filter((_, i) => i !== index));
    },
    [columns, onChange]
  );

  const moveColumn = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= columns.length) return;
      const updated = [...columns];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      onChange(updated);
    },
    [columns, onChange]
  );

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex !== null && dragIndex !== index) {
        moveColumn(dragIndex, index);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, moveColumn]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // Validation: check for empty/duplicate headers
  const headerErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Map<string, number>();
    columns.forEach((col, i) => {
      if (!col.header.trim()) {
        errors[i] = "Header is required";
      } else if (seen.has(col.header.trim().toLowerCase())) {
        errors[i] = "Duplicate header";
        const prevIdx = seen.get(col.header.trim().toLowerCase())!;
        if (!errors[prevIdx]) errors[prevIdx] = "Duplicate header";
      } else {
        seen.set(col.header.trim().toLowerCase(), i);
      }
    });
    return errors;
  }, [columns]);

  return (
    <div className="space-y-2">
      {/* Column rows */}
      {columns.length > 0 && (
        <div className="space-y-1.5">
          {/* Header labels */}
          <div className="grid grid-cols-[20px_1fr_1fr_90px_1fr_28px_28px] gap-1 px-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <span />
            <span>Header</span>
            <span>Mapping</span>
            <span>Type</span>
            <span>Default</span>
            <span />
            <span />
          </div>

          {columns.map((col, index) => {
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;
            const hasError = !!headerErrors[index];

            return (
              <div
                key={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={`grid grid-cols-[20px_1fr_1fr_90px_1fr_28px_28px] gap-1 items-center rounded-md px-0.5 py-0.5 transition-colors ${
                  isDragging
                    ? "opacity-40 bg-slate-100"
                    : isDragOver
                    ? "bg-blue-50 border border-blue-300 border-dashed"
                    : "hover:bg-slate-50"
                }`}
              >
                {/* Drag handle */}
                <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                {/* Header name */}
                <div className="relative">
                  <Input
                    value={col.header}
                    onChange={(e) => updateColumn(index, { header: e.target.value })}
                    onKeyDown={stopPropagation}
                    placeholder="Header"
                    className={`h-7 text-xs ${
                      hasError ? "border-red-400 focus-visible:ring-red-400" : ""
                    }`}
                  />
                  {hasError && (
                    <div className="absolute -bottom-3.5 left-0 flex items-center gap-0.5 text-[9px] text-red-500">
                      <AlertCircle className="w-2.5 h-2.5" />
                      {headerErrors[index]}
                    </div>
                  )}
                </div>

                {/* Mapping / field */}
                <MappingExpressionInput
                  value={col.field}
                  onChange={(nextValue) => updateColumn(index, { field: nextValue })}
                  placeholder="transactions[].fecha o ${...}"
                  suggestions={suggestions}
                  transformExpression={transformExpression}
                />

                {/* Type */}
                <Select
                  value={col.type || "string"}
                  onValueChange={(v) =>
                    updateColumn(index, {
                      type: v as CsvColumnDef["type"],
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Default value */}
                <Input
                  value={col.default ?? ""}
                  onChange={(e) => updateColumn(index, { default: e.target.value })}
                  onKeyDown={stopPropagation}
                  placeholder="(none)"
                  className="h-7 text-xs"
                />

                {/* Move buttons */}
                <div className="flex flex-col -space-y-0.5">
                  <button
                    type="button"
                    onClick={() => moveColumn(index, index - 1)}
                    disabled={index === 0}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0 leading-none"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, index + 1)}
                    disabled={index === columns.length - 1}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0 leading-none"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Remove */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeColumn(index)}
                  className="h-6 w-6 text-slate-400 hover:text-red-500"
                  title="Remove column"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Mapping help */}
      {columns.length > 0 && (
        <p className="text-[10px] text-slate-400 px-1 pb-0.5">
          Mapping: use the source field path, e.g. <code className="bg-slate-100 px-0.5 rounded">transactions[].fecha</code>
        </p>
      )}

      {/* Add column button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addColumn}
        className="w-full h-7 text-xs gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Column
      </Button>

      {/* Empty state */}
      {columns.length === 0 && (
        <p className="text-[10px] text-slate-400 text-center py-1">
          No columns defined. Records will use their original keys as headers.
        </p>
      )}
    </div>
  );
}
