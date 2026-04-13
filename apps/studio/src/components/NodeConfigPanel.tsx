import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { useFlowStore } from '../store/flowStore';
import { useProjectStore } from '../store/projectStore';
import { useVaultStore } from '../store/vaultStore';
import { useNavigationStore } from '../store/navigationStore';
import { useTabsStore } from '../store/tabsStore';
import { useDebugStore } from '../store/debugStore';
import { getNodeTemplate } from '../data/nodeTemplates';
import {
  X,
  Info,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Pin,
  PinOff,
  Table,
  Braces,
  GripVertical,
  Package,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { maskObject, DEFAULT_MASKING_POLICY, type MaskingPolicy } from '../lib/dataMasking';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
// Textarea replaced by ExpressionInput with multiline support
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FormBuilder } from './FormBuilder';
import { FormPreview } from './FormPreview';
import { ValidationBuilder } from './ValidationBuilder';
import { ProtectionBuilder } from './ProtectionBuilder';
import {
  FormFieldDefinition,
  OutputField,
  FlowEdge,
  FlowNode,
  ValidationRule,
  ProtectionRule,
} from '../types/flow';

interface AvailableVariable {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  field: OutputField;
  expression: string;
  displayExpression?: string;
}

const EMPTY_NODES: FlowNode[] = [];
const EMPTY_EDGES: FlowEdge[] = [];
const UI_DATA_MASKING_CONFIG_KEY = '__ui_data_masking_enabled';
const DEFAULT_DATA_MASKING_ENABLED = true;

function buildNodeExpression(nodeId: string, path: string): string {
  const normalizedPath = path.startsWith('.') ? path.slice(1) : path;
  return `\${node:${nodeId}|${normalizedPath}}`;
}

function buildLabelExpression(nodeLabel: string, path: string): string {
  return path.startsWith('[') ? `\${${nodeLabel}${path}}` : `\${${nodeLabel}.${path}}`;
}

interface AuthoringExpressionOptions {
  nodeLabelById?: Map<string, string>;
  nodeIdHint?: string;
  nodeLabelHint?: string;
  currentNodeId?: string;
}

function escapeNodeRef(nodeRef: string): string {
  return nodeRef.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function canonicalToAuthoringExpression(
  expression: string,
  options: AuthoringExpressionOptions = {},
): string {
  const envMatch = expression.match(/^\$\{env\.([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (envMatch) {
    return `{{$env.${envMatch[1]}}}`;
  }

  const vaultMatch = expression.match(/^\$\{vault\.([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (vaultMatch) {
    return `{{$vault.${vaultMatch[1]}}}`;
  }

  const nodeMatch = expression.match(/^\$\{node:([^|}]+)\|(.+)\}$/);
  if (!nodeMatch) {
    return expression;
  }

  const [, nodeId, rawPath] = nodeMatch;
  const path = rawPath.trim();
  if (!path) {
    return expression;
  }

  const currentNodeId = options.currentNodeId?.trim();
  if (currentNodeId && nodeId === currentNodeId) {
    if (path === 'input') return '{{$json}}';
    if (path.startsWith('input.')) {
      return `{{$json.${path.slice('input.'.length)}}}`;
    }
    if (path === 'inputBinary') return '{{$binary}}';
    if (path.startsWith('inputBinary.')) {
      return `{{$binary.${path.slice('inputBinary.'.length)}}}`;
    }
  }

  let nodeRef: string | undefined;
  if (options.nodeIdHint === nodeId && options.nodeLabelHint?.trim()) {
    nodeRef = options.nodeLabelHint.trim();
  }
  if (!nodeRef && options.nodeLabelById) {
    const mapped = options.nodeLabelById.get(nodeId)?.trim();
    if (mapped) {
      nodeRef = mapped;
    }
  }
  if (!nodeRef) {
    nodeRef = nodeId;
  }

  const escapedNodeRef = escapeNodeRef(nodeRef);
  const pathSuffix = path.startsWith('[') ? path : `.${path}`;
  return `{{$node["${escapedNodeRef}"]${pathSuffix}}}`;
}

function getDroppedExpression(e: React.DragEvent<HTMLElement>): string {
  return (
    e.dataTransfer.getData('application/x-skuld-expression') || e.dataTransfer.getData('text/plain')
  );
}

// Expression input with autocomplete
interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions: { label: string; value: string; description?: string }[];
  className?: string;
  multiline?: boolean;
  transformExpression?: (expression: string) => string;
}

function ExpressionInput({
  value,
  onChange,
  placeholder,
  suggestions,
  className = '',
  multiline = false,
  transformExpression,
}: ExpressionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState(suggestions);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Find expression being typed (text between ${ and cursor or })
  const getExpressionContext = useCallback((text: string, cursor: number) => {
    const beforeCursor = text.slice(0, cursor);
    const lastOpen = beforeCursor.lastIndexOf('${');
    if (lastOpen === -1) return null;

    const afterOpen = beforeCursor.slice(lastOpen + 2);
    if (afterOpen.includes('}')) return null; // Already closed

    return {
      start: lastOpen,
      query: afterOpen.toLowerCase(),
      prefix: text.slice(0, lastOpen),
      suffix: text.slice(cursor),
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursor = e.target.selectionStart || 0;
      setCursorPosition(cursor);
      onChange(newValue);

      const context = getExpressionContext(newValue, cursor);
      if (context) {
        const filtered = suggestions
          .filter(
            (s) =>
              s.label.toLowerCase().includes(context.query) ||
              s.value.toLowerCase().includes(context.query),
          )
          .slice(0, 10);
        setFilteredSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    },
    [suggestions, onChange, getExpressionContext],
  );

  const insertSuggestion = useCallback(
    (suggestion: { value: string }) => {
      const context = getExpressionContext(value, cursorPosition);
      if (context) {
        // Extract just the expression path without ${ }
        const exprPath = suggestion.value.slice(2, -1); // Remove ${ and }
        const newValue = context.prefix + '${' + exprPath + '}' + context.suffix;
        onChange(newValue);
        setShowSuggestions(false);

        // Focus back to input
        setTimeout(() => {
          inputRef.current?.focus();
          const newCursor = context.prefix.length + suggestion.value.length;
          inputRef.current?.setSelectionRange(newCursor, newCursor);
        }, 0);
      }
    },
    [value, cursorPosition, onChange, getExpressionContext],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          if (filteredSuggestions[selectedIndex]) {
            e.preventDefault();
            insertSuggestion(filteredSuggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, filteredSuggestions, selectedIndex, insertSuggestion],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selected = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showSuggestions]);

  const [isDragOver, setIsDragOver] = useState(false);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedExpression =
        e.dataTransfer.getData('application/x-skuld-expression') ||
        e.dataTransfer.getData('text/plain');
      const expression = droppedExpression
        ? transformExpression
          ? transformExpression(droppedExpression)
          : droppedExpression
        : '';

      if (expression) {
        // Insert at cursor position or append
        const input = inputRef.current;
        if (input) {
          const start = input.selectionStart || value.length;
          const end = input.selectionEnd || value.length;
          const newValue = value.slice(0, start) + expression + value.slice(end);
          onChange(newValue);

          // Set cursor after inserted expression
          setTimeout(() => {
            input.focus();
            const newPos = start + expression.length;
            input.setSelectionRange(newPos, newPos);
          }, 0);
        } else {
          onChange(value + expression);
        }
      }
    },
    [value, onChange, transformExpression],
  );

  const InputComponent = multiline ? 'textarea' : 'input';
  const baseClassName = multiline
    ? 'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none'
    : 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className={`relative ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-1 rounded-md' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <InputComponent
        ref={inputRef as any}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={isDragOver ? 'Drop variable here...' : placeholder}
        className={`${baseClassName} ${className} ${value.includes('${') ? 'font-mono text-xs' : ''} ${isDragOver ? 'bg-blue-50 border-blue-400' : ''}`}
        rows={multiline ? 3 : undefined}
      />

      {/* Expression hint */}
      {!showSuggestions && !value.includes('${') && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 pointer-events-none">
          Type <span className="font-mono bg-slate-100 px-1 rounded">${'${'}</span> for variables
        </div>
      )}

      {/* Autocomplete dropdown */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, i) => (
            <div
              key={suggestion.value}
              className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 ${
                i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'
              }`}
              onClick={() => insertSuggestion(suggestion)}
            >
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                {suggestion.label}
              </span>
              {suggestion.label !== suggestion.value && (
                <span className="font-mono text-[10px] text-slate-400 truncate">
                  {suggestion.value}
                </span>
              )}
              {suggestion.description && (
                <span className="text-xs text-slate-400 truncate">{suggestion.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tree node component for nested output display
interface OutputTreeNodeProps {
  label: string;
  type: 'object' | 'array';
  nodeId: string;
  nodeLabel: string;
  fields: FormFieldDefinition[];
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
  isLast: boolean;
}

function OutputTreeNode({
  label,
  nodeId,
  nodeLabel,
  fields,
  copyExpression,
  copiedExpression,
  isLast,
}: OutputTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="pl-4">
      {/* Object key line with toggle */}
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        )}
        <span className="text-orange-600">&quot;{label}&quot;</span>
        <span className="text-slate-400">:</span>
        <span className="text-slate-500 ml-1">{isExpanded ? '{' : '{...}'}</span>
        {!isExpanded && !isLast && <span className="text-slate-400">,</span>}
      </div>

      {/* Nested fields */}
      {isExpanded && (
        <>
          {fields.map((field, i) => {
            const expression = buildNodeExpression(nodeId, `formData.${field.id}`);
            const displayExpression = buildLabelExpression(nodeLabel, `formData.${field.id}`);
            const fieldIsLast = i === fields.length - 1;
            const fieldType =
              field.type === 'number' ? 'number' : field.type === 'checkbox' ? 'boolean' : 'string';

            return (
              <div
                key={field.id}
                className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                onClick={() => copyExpression(expression)}
                title={
                  field.label
                    ? `${field.label}\nClick to copy: ${displayExpression}`
                    : `Click to copy: ${displayExpression}`
                }
              >
                <span className="text-emerald-600">&quot;{field.id}&quot;</span>
                <span className="text-slate-400">:</span>
                <span
                  className={`ml-1 ${
                    fieldType === 'string'
                      ? 'text-green-600'
                      : fieldType === 'number'
                        ? 'text-blue-600'
                        : fieldType === 'boolean'
                          ? 'text-purple-600'
                          : 'text-slate-600'
                  }`}
                >
                  {fieldType === 'string'
                    ? `"${field.placeholder || '...'}"`
                    : fieldType === 'number'
                      ? '0'
                      : fieldType === 'boolean'
                        ? 'false'
                        : '...'}
                </span>
                {!fieldIsLast && <span className="text-slate-400">,</span>}
                {copiedExpression === expression ? (
                  <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                )}
              </div>
            );
          })}
          <div className="text-slate-500 pl-0">
            {'}'}
            {!isLast && ','}
          </div>
        </>
      )}
    </div>
  );
}

// Discovered schema field type (from debugStore)
interface DiscoveredField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  items?: DiscoveredField[];
  fields?: DiscoveredField[];
}

// Input tree node component for grouping variables by source node
interface InputNodeTreeProps {
  nodeId: string;
  nodeLabel: string;
  regularFields: AvailableVariable[];
  formDataFields: AvailableVariable[];
  discoveredFields?: DiscoveredField[];
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
}

// Schema array/object field component for showing nested structure
interface SchemaArrayFieldProps {
  fieldName: string;
  items: { name: string; type: string; description?: string; items?: any }[];
  nodeId: string;
  nodeLabel: string;
  description?: string;
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
  isLast: boolean;
  fieldType?: 'array' | 'object' | string;
}

function SchemaArrayField({
  fieldName,
  items,
  nodeId,
  nodeLabel,
  copyExpression,
  copiedExpression,
  isLast,
  fieldType = 'array',
}: SchemaArrayFieldProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItemExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isArray = fieldType === 'array';
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const collapsedPreview = isArray ? `[${items.length} fields]` : `{${items.length} fields}`;

  return (
    <div className="pl-4">
      {/* Field header with toggle */}
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        )}
        <span className="text-pink-600">&quot;{fieldName}&quot;</span>
        <span className="text-slate-400">:</span>
        <span className="text-slate-500 ml-1">{isExpanded ? openBracket : collapsedPreview}</span>
        {!isExpanded && !isLast && <span className="text-slate-400">,</span>}
        <span className="text-[9px] text-slate-400 ml-auto">{items.length}</span>
      </div>

      {isExpanded && (
        <>
          {/* For arrays, show item structure hint */}
          {isArray && (
            <div className="pl-4 text-[9px] text-slate-400 py-0.5">
              {'{'} <span className="italic">each item has:</span>
            </div>
          )}

          {/* Nested fields */}
          {items.map((item, i) => {
            const basePath = isArray ? `${fieldName}[i]` : fieldName;
            const itemPath = `${basePath}.${item.name}`;
            const itemExpression = buildNodeExpression(nodeId, itemPath);
            const itemDisplayExpression = buildLabelExpression(nodeLabel, itemPath);
            const itemIsLast = i === items.length - 1;
            const itemKey = `${fieldName}-${item.name}`;

            // Check if this item has nested fields
            const nestedFields =
              item.items?.fields || (Array.isArray(item.items) ? item.items : null);
            const hasNestedFields =
              (item.type === 'array' || item.type === 'object') &&
              nestedFields &&
              nestedFields.length > 0;
            const isItemExpanded = expandedItems.has(itemKey);

            if (hasNestedFields) {
              return (
                <div key={item.name} className="pl-8">
                  <div
                    className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-pink-50 rounded -ml-3 pl-1"
                    onClick={(e) => toggleItemExpand(itemKey, e)}
                  >
                    {isItemExpanded ? (
                      <ChevronDown className="w-3 h-3 text-pink-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-pink-400" />
                    )}
                    <span className="text-pink-600">&quot;{item.name}&quot;</span>
                    <span className="text-slate-400">:</span>
                    <span className="text-slate-500 ml-1">
                      {isItemExpanded
                        ? item.type === 'array'
                          ? '['
                          : '{'
                        : item.type === 'array'
                          ? `[${nestedFields.length}]`
                          : `{${nestedFields.length}}`}
                    </span>
                    {!isItemExpanded && !itemIsLast && <span className="text-slate-400">,</span>}
                  </div>

                  {isItemExpanded && (
                    <>
                      {nestedFields.map((nested: any, ni: number) => {
                        const nestedPath =
                          item.type === 'array'
                            ? `${basePath}.${item.name}[j]`
                            : `${basePath}.${item.name}`;
                        const nestedFieldPath = `${nestedPath}.${nested.name}`;
                        const nestedExpr = buildNodeExpression(nodeId, nestedFieldPath);
                        const nestedDisplayExpr = buildLabelExpression(nodeLabel, nestedFieldPath);
                        const nestedIsLast = ni === nestedFields.length - 1;

                        return (
                          <div
                            key={nested.name}
                            className="group pl-4 py-0.5 hover:bg-pink-50 rounded cursor-pointer flex items-center gap-1"
                            onClick={() => copyExpression(nestedExpr)}
                            title={
                              nested.description
                                ? `${nested.description}\nClick to copy: ${nestedDisplayExpr}`
                                : `Click to copy: ${nestedDisplayExpr}`
                            }
                          >
                            <span className="text-pink-500">&quot;{nested.name}&quot;</span>
                            <span className="text-slate-400">:</span>
                            <span
                              className={`ml-1 ${
                                nested.type === 'string'
                                  ? 'text-green-600'
                                  : nested.type === 'number'
                                    ? 'text-blue-600'
                                    : nested.type === 'boolean'
                                      ? 'text-purple-600'
                                      : 'text-slate-600'
                              }`}
                            >
                              {nested.type === 'string'
                                ? '"..."'
                                : nested.type === 'number'
                                  ? '0'
                                  : nested.type === 'boolean'
                                    ? 'true'
                                    : '...'}
                            </span>
                            {!nestedIsLast && <span className="text-slate-400">,</span>}
                            {copiedExpression === nestedExpr ? (
                              <Check className="w-3 h-3 text-green-500 ml-auto" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                            )}
                          </div>
                        );
                      })}
                      <div className="text-slate-500">
                        {item.type === 'array' ? ']' : '}'}
                        {!itemIsLast && ','}
                      </div>
                    </>
                  )}
                </div>
              );
            }

            return (
              <div
                key={item.name}
                className="group pl-8 py-0.5 hover:bg-pink-50 rounded cursor-pointer flex items-center gap-1"
                onClick={() => copyExpression(itemExpression)}
                title={
                  item.description
                    ? `${item.description}\nClick to copy: ${itemDisplayExpression}`
                    : `Click to copy: ${itemDisplayExpression}`
                }
              >
                <span className="text-pink-600">&quot;{item.name}&quot;</span>
                <span className="text-slate-400">:</span>
                <span
                  className={`ml-1 ${
                    item.type === 'string'
                      ? 'text-green-600'
                      : item.type === 'number'
                        ? 'text-blue-600'
                        : item.type === 'boolean'
                          ? 'text-purple-600'
                          : item.type === 'object'
                            ? 'text-orange-600'
                            : item.type === 'array'
                              ? 'text-pink-600'
                              : 'text-slate-600'
                  }`}
                >
                  {item.type === 'string'
                    ? '"..."'
                    : item.type === 'number'
                      ? '0'
                      : item.type === 'boolean'
                        ? 'true'
                        : item.type === 'object'
                          ? '{...}'
                          : item.type === 'array'
                            ? '[...]'
                            : '...'}
                </span>
                {!itemIsLast && <span className="text-slate-400">,</span>}
                {copiedExpression === itemExpression ? (
                  <Check className="w-3 h-3 text-green-500 ml-auto" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                )}
              </div>
            );
          })}

          {isArray && <div className="pl-4 text-slate-500">{'}'}</div>}
          <div className="text-slate-500 pl-0">
            {closeBracket}
            {!isLast && ','}
          </div>
        </>
      )}
    </div>
  );
}

// Global input tree for Environment and Vault variables (same style as node trees)
interface GlobalInputTreeProps {
  label: string;
  icon: 'env' | 'vault';
  variables: { label: string; value: string; description?: string }[];
  emptyMessage: string;
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
  isMasked?: boolean;
}

function GlobalInputTree({
  label,
  icon,
  variables,
  emptyMessage,
  copyExpression,
  copiedExpression,
  isMasked = false,
}: GlobalInputTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const iconColor = icon === 'env' ? 'text-emerald-600' : 'text-amber-600';
  const hoverBg = icon === 'env' ? 'hover:bg-emerald-50' : 'hover:bg-amber-50';

  return (
    <div className="mb-3 font-mono text-xs bg-white rounded-lg border border-slate-200 p-2">
      {/* Header with toggle */}
      <div
        className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 rounded p-1 -m-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span className={`${iconColor} font-semibold`}>{label}</span>
        <span className="text-slate-400 text-[10px] ml-auto">{variables.length}</span>
      </div>

      {isExpanded && (
        <div className="mt-1 pl-2 border-l-2 border-slate-100 ml-1.5">
          {variables.length === 0 ? (
            <div className="text-[10px] text-slate-400 py-1">{emptyMessage}</div>
          ) : (
            variables.map((variable) =>
              (() => {
                const authoringExpression = canonicalToAuthoringExpression(variable.value);
                return (
                  <div
                    key={variable.value}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', authoringExpression);
                      e.dataTransfer.setData('application/x-skuld-expression', authoringExpression);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className={`group py-0.5 ${hoverBg} rounded cursor-grab active:cursor-grabbing flex items-center gap-1 px-1`}
                    onClick={() => copyExpression(variable.value)}
                    title={
                      variable.description
                        ? `${variable.description}\nDrag to field or click to copy: ${authoringExpression}`
                        : `Drag to field or click to copy: ${authoringExpression}`
                    }
                  >
                    <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                    <span className={iconColor}>&quot;{variable.label}&quot;</span>
                    <span className="text-slate-400">:</span>
                    <span className="text-green-600 ml-1">{isMasked ? '"••••••"' : '"..."'}</span>
                    {copiedExpression === variable.value ? (
                      <Check className="w-3 h-3 text-green-500 ml-auto" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                );
              })(),
            )
          )}
        </div>
      )}
    </div>
  );
}

// Expandable JSON node for recursive rendering
interface ExpandableJsonNodeProps {
  keyName: string | number;
  value: any;
  path: string;
  nodeId: string;
  nodeLabel: string;
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
  isLast: boolean;
  defaultExpanded?: boolean;
}

function ExpandableJsonNode({
  keyName,
  value,
  path,
  nodeId,
  nodeLabel,
  copyExpression,
  copiedExpression,
  isLast,
  defaultExpanded = false,
}: ExpandableJsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && value !== null && !isArray;
  const isExpandable = isArray || isObject;
  const expression = buildNodeExpression(nodeId, path);
  const displayExpression = buildLabelExpression(nodeLabel, path);

  // Format the key display
  const displayKey = typeof keyName === 'number' ? `item ${keyName + 1}` : keyName;
  const keyColor = typeof keyName === 'number' ? 'text-pink-600' : 'text-emerald-600';

  if (!isExpandable) {
    // Primitive value - render inline or block for long strings
    let valueDisplay: React.ReactNode;
    let valueColor = 'text-slate-600';
    let isLongString = false;

    if (value === null) {
      valueDisplay = 'null';
      valueColor = 'text-slate-400';
    } else if (value === undefined) {
      valueDisplay = 'undefined';
      valueColor = 'text-slate-400';
    } else if (typeof value === 'string') {
      isLongString = value.length > 50;
      valueDisplay = `"${value}"`;
      valueColor = 'text-amber-600';
    } else if (typeof value === 'number') {
      valueDisplay = String(value);
      valueColor = 'text-blue-600';
    } else if (typeof value === 'boolean') {
      valueDisplay = String(value);
      valueColor = 'text-purple-600';
    } else {
      valueDisplay = String(value);
    }

    // For long strings, use block layout
    if (isLongString) {
      return (
        <div
          className="group py-1 hover:bg-emerald-50 rounded cursor-pointer pl-4"
          onClick={() => copyExpression(expression)}
          title={`Click to copy: ${displayExpression}`}
        >
          <div className="flex items-center gap-1">
            <span className={keyColor}>&quot;{displayKey}&quot;</span>
            <span className="text-slate-400">:</span>
            {copiedExpression === expression ? (
              <Check className="w-3 h-3 text-green-500 ml-auto" />
            ) : (
              <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
            )}
          </div>
          <div className={`mt-0.5 pl-2 text-[10px] ${valueColor} break-all leading-relaxed`}>
            {valueDisplay}
          </div>
          {!isLast && <span className="text-slate-400">,</span>}
        </div>
      );
    }

    return (
      <div
        className="group py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1 pl-4"
        onClick={() => copyExpression(expression)}
        title={`Click to copy: ${displayExpression}`}
      >
        <span className={keyColor}>&quot;{displayKey}&quot;</span>
        <span className="text-slate-400">:</span>
        <span className={`ml-1 ${valueColor} truncate max-w-[200px]`} title={String(value)}>
          {valueDisplay}
        </span>
        {!isLast && <span className="text-slate-400">,</span>}
        {copiedExpression === expression ? (
          <Check className="w-3 h-3 text-green-500 ml-auto" />
        ) : (
          <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
        )}
      </div>
    );
  }

  // Expandable value (array or object)
  const entries = isArray ? value : Object.entries(value);
  const count = isArray ? value.length : Object.keys(value).length;
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <div className="pl-4">
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        )}
        <span className={keyColor}>&quot;{displayKey}&quot;</span>
        <span className="text-slate-400">:</span>
        <span className="text-slate-500 ml-1">
          {isExpanded
            ? bracket[0]
            : `${bracket[0]}${count} ${isArray ? 'items' : 'fields'}${bracket[1]}`}
        </span>
        {!isExpanded && !isLast && <span className="text-slate-400">,</span>}
        <span className="text-[9px] text-slate-400 ml-auto">{count}</span>
      </div>

      {isExpanded && (
        <>
          {isArray
            ? value.map((item: any, i: number) => (
                <ExpandableJsonNode
                  key={i}
                  keyName={i}
                  value={item}
                  path={`${path}[${i}]`}
                  nodeId={nodeId}
                  nodeLabel={nodeLabel}
                  copyExpression={copyExpression}
                  copiedExpression={copiedExpression}
                  isLast={i === value.length - 1}
                />
              ))
            : entries.map(([k, v]: [string, any], i: number) => (
                <ExpandableJsonNode
                  key={k}
                  keyName={k}
                  value={v}
                  path={path ? `${path}.${k}` : k}
                  nodeId={nodeId}
                  nodeLabel={nodeLabel}
                  copyExpression={copyExpression}
                  copiedExpression={copiedExpression}
                  isLast={i === entries.length - 1}
                />
              ))}
          <div className="text-slate-500 pl-0">
            {bracket[1]}
            {!isLast && ','}
          </div>
        </>
      )}
    </div>
  );
}

// Live data tree component for showing real execution data (flow-style)
interface LiveDataTreeProps {
  nodeId: string;
  nodeLabel: string;
  data: any;
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
}

function LiveDataTree({
  nodeId,
  nodeLabel,
  data,
  copyExpression,
  copiedExpression,
}: LiveDataTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'json' | 'table'>('json');

  // Count items if data is an array
  const itemCount = Array.isArray(data) ? data.length : null;
  const isArray = Array.isArray(data);
  const isObject = typeof data === 'object' && data !== null && !isArray;

  // Check if data is array of objects (suitable for table view)
  const isArrayOfObjects =
    isArray && data.length > 0 && typeof data[0] === 'object' && data[0] !== null;

  // Get table columns from first object
  const tableColumns = isArrayOfObjects ? Object.keys(data[0]).slice(0, 6) : []; // Max 6 columns

  return (
    <div className="mb-3 font-mono text-xs bg-green-50 rounded-lg border border-green-200 p-2">
      {/* Node header with LIVE badge and view toggle */}
      <div className="flex items-center gap-1.5 p-1 -m-1">
        <div
          className="flex items-center gap-1.5 cursor-pointer hover:bg-green-100 rounded flex-1"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-green-500" />
          )}
          <span className="text-green-700 font-semibold">{nodeLabel}</span>
          <span className="text-[9px] text-green-600 bg-green-200 px-1.5 py-0.5 rounded-full font-semibold">
            LIVE
          </span>
        </div>

        {/* View toggle for arrays of objects */}
        {isArrayOfObjects && isExpanded && (
          <div className="flex items-center gap-0.5 bg-green-200/50 rounded p-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('json');
              }}
              className={`p-1 rounded ${viewMode === 'json' ? 'bg-white shadow-sm' : 'hover:bg-green-100'}`}
              title="JSON view"
            >
              <Braces className="w-3 h-3 text-green-600" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('table');
              }}
              className={`p-1 rounded ${viewMode === 'table' ? 'bg-white shadow-sm' : 'hover:bg-green-100'}`}
              title="Table view"
            >
              <Table className="w-3 h-3 text-green-600" />
            </button>
          </div>
        )}

        {itemCount !== null && <span className="text-[9px] text-green-500">{itemCount} items</span>}
      </div>

      {isExpanded && (
        <div className="mt-1">
          {/* Table View */}
          {viewMode === 'table' && isArrayOfObjects ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-green-100">
                    <th className="px-2 py-1 text-left text-green-700 font-semibold border-b border-green-200">
                      #
                    </th>
                    {tableColumns.map((col) => (
                      <th
                        key={col}
                        className="px-2 py-1 text-left text-green-700 font-semibold border-b border-green-200 max-w-[120px] truncate"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map((row: any, i: number) => (
                    <tr
                      key={i}
                      className="hover:bg-green-100 cursor-pointer group"
                      onClick={() => copyExpression(buildNodeExpression(nodeId, `[${i}]`))}
                      title={`Click to copy: ${buildLabelExpression(nodeLabel, `[${i}]`)}`}
                    >
                      <td className="px-2 py-1 text-green-500 border-b border-green-100">{i}</td>
                      {tableColumns.map((col) => (
                        <td
                          key={col}
                          className="px-2 py-1 border-b border-green-100 max-w-[120px] truncate"
                        >
                          <span
                            className={
                              typeof row[col] === 'string'
                                ? 'text-green-700'
                                : typeof row[col] === 'number'
                                  ? 'text-blue-600'
                                  : typeof row[col] === 'boolean'
                                    ? 'text-purple-600'
                                    : row[col] === null
                                      ? 'text-slate-400 italic'
                                      : 'text-orange-600'
                            }
                          >
                            {row[col] === null
                              ? 'null'
                              : typeof row[col] === 'object'
                                ? '{...}'
                                : typeof row[col] === 'boolean'
                                  ? String(row[col])
                                  : String(row[col]).slice(0, 30) +
                                    (String(row[col]).length > 30 ? '...' : '')}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 50 && (
                <div className="text-[9px] text-green-500 text-center py-1">
                  Showing 50 of {data.length} items
                </div>
              )}
            </div>
          ) : (
            /* JSON View */
            <div className="pl-1 border-l-2 border-green-200 ml-1.5">
              {isArray ? (
                data.map((item: any, i: number) => (
                  <ExpandableJsonNode
                    key={i}
                    keyName={i}
                    value={item}
                    path={`[${i}]`}
                    nodeId={nodeId}
                    nodeLabel={nodeLabel}
                    copyExpression={copyExpression}
                    copiedExpression={copiedExpression}
                    isLast={i === data.length - 1}
                    defaultExpanded={i === 0}
                  />
                ))
              ) : isObject ? (
                Object.entries(data).map(([key, value], i, arr) => (
                  <ExpandableJsonNode
                    key={key}
                    keyName={key}
                    value={value}
                    path={key}
                    nodeId={nodeId}
                    nodeLabel={nodeLabel}
                    copyExpression={copyExpression}
                    copiedExpression={copiedExpression}
                    isLast={i === arr.length - 1}
                    defaultExpanded={true}
                  />
                ))
              ) : (
                <div className="pl-3 py-0.5 text-slate-600">{String(data)}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InputNodeTree({
  nodeId,
  nodeLabel,
  regularFields,
  formDataFields,
  discoveredFields,
  copyExpression,
  copiedExpression,
}: InputNodeTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFormDataExpanded, setIsFormDataExpanded] = useState(true);
  const [expandedArrays, setExpandedArrays] = useState<Set<string>>(new Set());

  const toggleArrayExpand = (fieldName: string) => {
    setExpandedArrays((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  };

  // Merge regular fields with discovered fields for richer display
  const getDiscoveredField = (fieldName: string): DiscoveredField | undefined => {
    return discoveredFields?.find((f) => f.name === fieldName);
  };

  const totalFields = regularFields.length + formDataFields.length;
  const hasDiscovery = discoveredFields && discoveredFields.length > 0;

  // Recursive component for nested fields
  const renderNestedField = (field: DiscoveredField, basePath: string, depth: number = 0) => {
    const expression = buildNodeExpression(nodeId, basePath);
    const displayExpression = buildLabelExpression(nodeLabel, basePath);
    const hasChildren =
      (field.type === 'array' && field.items && field.items.length > 0) ||
      (field.type === 'object' && field.fields && field.fields.length > 0);
    const isArrayExpanded = expandedArrays.has(basePath);

    if (!hasChildren) {
      const authoringExpression = canonicalToAuthoringExpression(expression, {
        nodeIdHint: nodeId,
        nodeLabelHint: nodeLabel,
      });
      return (
        <div
          key={basePath}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', authoringExpression);
            e.dataTransfer.setData('application/x-skuld-expression', authoringExpression);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="group py-0.5 hover:bg-blue-50 rounded cursor-grab active:cursor-grabbing flex items-center gap-1 px-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => copyExpression(expression)}
          title={`Drag to field or click to copy: ${displayExpression}`}
        >
          <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
          <span className="text-blue-600">&quot;{field.name}&quot;</span>
          <span className="text-slate-400">:</span>
          <span
            className={`ml-1 ${
              field.type === 'string'
                ? 'text-green-600'
                : field.type === 'number'
                  ? 'text-blue-600'
                  : field.type === 'boolean'
                    ? 'text-purple-600'
                    : 'text-slate-600'
            }`}
          >
            {field.type === 'string'
              ? '"..."'
              : field.type === 'number'
                ? '0'
                : field.type === 'boolean'
                  ? 'true'
                  : '...'}
          </span>
          {copiedExpression === expression ? (
            <Check className="w-3 h-3 text-green-500 ml-auto" />
          ) : (
            <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
          )}
        </div>
      );
    }

    const childFields = field.type === 'array' ? field.items : field.fields;
    const bracket = field.type === 'array' ? ['[', ']'] : ['{', '}'];

    return (
      <div key={basePath}>
        <div
          className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-blue-50 rounded px-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => toggleArrayExpand(basePath)}
        >
          {isArrayExpanded ? (
            <ChevronDown className="w-3 h-3 text-blue-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-blue-400" />
          )}
          <span className="text-blue-600">&quot;{field.name}&quot;</span>
          <span className="text-slate-400">:</span>
          <span className={`ml-1 ${field.type === 'array' ? 'text-pink-600' : 'text-orange-600'}`}>
            {isArrayExpanded ? bracket[0] : `${bracket[0]}${childFields?.length || 0}${bracket[1]}`}
          </span>
          <span className="text-[9px] text-slate-400 ml-auto">{childFields?.length || 0}</span>
        </div>

        {isArrayExpanded && childFields && (
          <>
            {field.type === 'array' && (
              <div
                className="text-[9px] text-slate-400 py-0.5"
                style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
              >
                {'{'} <span className="italic">each item:</span>
              </div>
            )}
            {childFields.map((child) => {
              const childPath =
                field.type === 'array'
                  ? `${basePath}[i].${child.name}`
                  : `${basePath}.${child.name}`;
              return renderNestedField(child, childPath, depth + 1);
            })}
            <div className="text-slate-500" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
              {field.type === 'array' && '}'}
              {bracket[1]}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="mb-3 font-mono text-xs bg-white rounded-lg border border-slate-200 p-2">
      {/* Node header with toggle */}
      <div
        className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 rounded p-1 -m-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span className="text-blue-600 font-semibold">{nodeLabel}</span>
        {hasDiscovery && (
          <span title="Schema discovered from execution">
            <Sparkles className="w-3 h-3 text-purple-500" />
          </span>
        )}
        <span className="text-slate-400 text-[10px] ml-auto">{totalFields}</span>
      </div>

      {isExpanded && (
        <div className="mt-1 pl-2 border-l-2 border-slate-100 ml-1.5">
          {/* Regular fields - use discovered schema if available */}
          {regularFields.map((v, i) => {
            const displayName = v.field.name;
            const discovered = getDiscoveredField(displayName);

            // If discovered and has nested structure, render expandable
            if (
              discovered &&
              ((discovered.type === 'array' && discovered.items) ||
                (discovered.type === 'object' && discovered.fields))
            ) {
              return renderNestedField(discovered, displayName, 0);
            }

            // Otherwise render flat - draggable
            return (
              <div
                key={i}
                draggable
                onDragStart={(e) => {
                  const authoringExpression = canonicalToAuthoringExpression(v.expression, {
                    nodeIdHint: v.nodeId,
                    nodeLabelHint: v.nodeLabel,
                  });
                  e.dataTransfer.setData('text/plain', authoringExpression);
                  e.dataTransfer.setData('application/x-skuld-expression', authoringExpression);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="group py-0.5 hover:bg-blue-50 rounded cursor-grab active:cursor-grabbing flex items-center gap-1 px-1"
                onClick={() => copyExpression(v.expression)}
                title={
                  v.field.description
                    ? `${v.field.description}\nDrag to field or click to copy: ${v.displayExpression || v.expression}`
                    : `Drag to field or click to copy: ${v.displayExpression || v.expression}`
                }
              >
                <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                <span className="text-blue-600">&quot;{displayName}&quot;</span>
                <span className="text-slate-400">:</span>
                <span
                  className={`ml-1 ${
                    v.field.type === 'string'
                      ? 'text-green-600'
                      : v.field.type === 'number'
                        ? 'text-blue-600'
                        : v.field.type === 'boolean'
                          ? 'text-purple-600'
                          : v.field.type === 'object'
                            ? 'text-orange-600'
                            : v.field.type === 'array'
                              ? 'text-pink-600'
                              : 'text-slate-600'
                  }`}
                >
                  {v.field.type === 'string'
                    ? '"..."'
                    : v.field.type === 'number'
                      ? '0'
                      : v.field.type === 'boolean'
                        ? 'true'
                        : v.field.type === 'object'
                          ? '{...}'
                          : v.field.type === 'array'
                            ? '[...]'
                            : '...'}
                </span>
                {copiedExpression === v.expression ? (
                  <Check className="w-3 h-3 text-green-500 ml-auto" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                )}
              </div>
            );
          })}

          {/* Form data fields (nested) */}
          {formDataFields.length > 0 && (
            <div className="mt-1">
              <div
                className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded px-1"
                onClick={() => setIsFormDataExpanded(!isFormDataExpanded)}
              >
                {isFormDataExpanded ? (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                )}
                <span className="text-orange-600">&quot;formData&quot;</span>
                <span className="text-slate-400">:</span>
                <span className="text-slate-500 ml-1">{isFormDataExpanded ? '{' : '{...}'}</span>
              </div>

              {isFormDataExpanded && (
                <div className="pl-4">
                  {formDataFields.map((v, i) => {
                    // Show the field ID (from name) so users know the actual variable name
                    // field.name is "formData.fieldId", so extract just the fieldId
                    const fieldId = v.field.name.replace('formData.', '');
                    return (
                      <div
                        key={i}
                        className="group py-0.5 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-1 px-1"
                        onClick={() => copyExpression(v.expression)}
                        title={
                          v.field.description
                            ? `${v.field.description}\nClick to copy: ${v.displayExpression || v.expression}`
                            : `Click to copy: ${v.displayExpression || v.expression}`
                        }
                      >
                        <span className="text-blue-600">&quot;{fieldId}&quot;</span>
                        <span className="text-slate-400">:</span>
                        <span
                          className={`ml-1 ${
                            v.field.type === 'string'
                              ? 'text-green-600'
                              : v.field.type === 'number'
                                ? 'text-blue-600'
                                : v.field.type === 'boolean'
                                  ? 'text-purple-600'
                                  : 'text-slate-600'
                          }`}
                        >
                          {v.field.type === 'string'
                            ? '"..."'
                            : v.field.type === 'number'
                              ? '0'
                              : v.field.type === 'boolean'
                                ? 'false'
                                : '...'}
                        </span>
                        {copiedExpression === v.expression ? (
                          <Check className="w-3 h-3 text-green-500 ml-auto" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                    );
                  })}
                  <div className="text-slate-500">{'}'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NodeConfigPanel() {
  const { currentView } = useNavigationStore();
  const flowStore = useFlowStore();
  const projectStore = useProjectStore();
  const vaultSecrets = useVaultStore((state) => state.secrets);
  const vaultExists = useVaultStore((state) => state.vaultExists);
  const isVaultUnlocked = useVaultStore((state) => state.isUnlocked);
  const checkVaultStatus = useVaultStore((state) => state.checkVaultStatus);
  const { setTabDirty } = useTabsStore();
  // Use individual selectors for proper Zustand reactivity
  const sessionState = useDebugStore((state) => state.sessionState);
  const pinnedData = useDebugStore((state) => state.pinnedData);
  const pinNodeData = useDebugStore((state) => state.pinNodeData);
  const unpinNodeData = useDebugStore((state) => state.unpinNodeData);
  const getDiscoveredSchema = useDebugStore((state) => state.getDiscoveredSchema);
  const executionHistory = useDebugStore((state) => state.executionHistory);
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [copiedExpression, setCopiedExpression] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [activeDropField, setActiveDropField] = useState<string | null>(null);

  // Data masking for regulated industries (HIPAA, PCI-DSS)
  const [dataMaskingEnabled, setDataMaskingEnabled] = useState(DEFAULT_DATA_MASKING_ENABLED);
  const maskingPolicy: MaskingPolicy = {
    ...DEFAULT_MASKING_POLICY,
    enabled: dataMaskingEnabled,
    mode: dataMaskingEnabled ? 'enforced' : 'disabled',
  };

  // Determine which store to use based on current view
  const isProjectMode = currentView === 'project';

  // Get selectedNode from flowStore (shared between modes)
  const selectedNode = flowStore.selectedNode;
  const setSelectedNode = flowStore.setSelectedNode;

  // Get nodes and edges from appropriate store
  const activeBot = isProjectMode ? projectStore.bots.get(projectStore.activeBotId || '') : null;
  const activeBotId = projectStore.activeBotId;
  const nodes = isProjectMode ? (activeBot?.nodes ?? EMPTY_NODES) : flowStore.nodes;
  const edges = isProjectMode ? (activeBot?.edges ?? EMPTY_EDGES) : flowStore.edges;
  const nodeLabelById = useMemo(() => {
    const out = new Map<string, string>();
    nodes.forEach((n) => {
      const label = n.data?.label?.trim();
      if (label) {
        out.set(n.id, label);
      }
    });
    return out;
  }, [nodes]);

  // Update function depends on mode
  const updateNode = (id: string, data: Partial<FlowNode['data']>) => {
    console.log('updateNode called', {
      id,
      data,
      isProjectMode,
      hasActiveBot: !!activeBot,
      activeBotId,
    });
    if (isProjectMode && activeBot) {
      const updatedNodes = activeBot.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
      );
      projectStore.updateActiveBotNodes(updatedNodes);

      // Mark tab as dirty
      if (activeBotId) {
        console.log('Setting tab dirty:', `bot-${activeBotId}`);
        setTabDirty(`bot-${activeBotId}`, true);
      }

      // Also update selectedNode in flowStore
      if (selectedNode?.id === id) {
        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...data } });
      }
    } else {
      flowStore.updateNode(id, data);
    }
  };

  const node = selectedNode ? (nodes.find((n) => n.id === selectedNode.id) ?? null) : null;

  useEffect(() => {
    if (!node) return;

    const persistedValue = node.data.config?.[UI_DATA_MASKING_CONFIG_KEY];
    const resolvedValue =
      typeof persistedValue === 'boolean' ? persistedValue : DEFAULT_DATA_MASKING_ENABLED;

    setDataMaskingEnabled(resolvedValue);

    if (typeof persistedValue !== 'boolean') {
      updateNode(node.id, {
        config: {
          ...node.data.config,
          [UI_DATA_MASKING_CONFIG_KEY]: resolvedValue,
        },
      });
    }
    // Intentionally scoped to node identity/config value to avoid update loops from updateNode closure recreation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.data.config?.[UI_DATA_MASKING_CONFIG_KEY]]);

  useEffect(() => {
    setActiveDropField(null);
  }, [node?.id]);

  // Get all predecessor nodes (nodes that come before this one in the flow)
  const predecessorNodes = useMemo(() => {
    if (!node) return [];

    const predecessors: FlowNode[] = [];
    const visited = new Set<string>();

    function findPredecessors(nodeId: string) {
      const incomingEdges = edges.filter((e) => e.target === nodeId);

      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          const sourceNode = nodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            predecessors.push(sourceNode);
            findPredecessors(edge.source);
          }
        }
      }
    }

    findPredecessors(node.id);
    return predecessors;
  }, [node, nodes, edges]);

  // Check if this node is connected via an error (orange) edge
  const hasErrorConnection = useMemo(() => {
    if (!node) return false;
    return edges.some((e) => e.target === node.id && e.sourceHandle === 'error');
  }, [node, edges]);

  // Get available variables from predecessor nodes
  const availableVariables = useMemo((): AvailableVariable[] => {
    const variables: AvailableVariable[] = [];

    // If connected via error edge, add error variables (global Robot Framework vars)
    if (hasErrorConnection) {
      variables.push({
        nodeId: '_system',
        nodeLabel: 'Error Info',
        nodeType: 'system.error',
        field: {
          name: 'LAST_ERROR',
          type: 'string',
          description: 'The error message from the failed node',
        },
        expression: '${LAST_ERROR}',
      });
      variables.push({
        nodeId: '_system',
        nodeLabel: 'Error Info',
        nodeType: 'system.error',
        field: {
          name: 'LAST_ERROR_NODE',
          type: 'string',
          description: 'The ID of the node that failed',
        },
        expression: '${LAST_ERROR_NODE}',
      });
      variables.push({
        nodeId: '_system',
        nodeLabel: 'Error Info',
        nodeType: 'system.error',
        field: {
          name: 'LAST_ERROR_TYPE',
          type: 'string',
          description: 'The type of node that failed (e.g., excel.read_range)',
        },
        expression: '${LAST_ERROR_TYPE}',
      });
    }

    // Current node runtime input context (flow-style)
    if (node) {
      const currentInputFields: Array<{
        name: string;
        type: OutputField['type'];
        description: string;
      }> = [
        { name: 'input', type: 'object', description: 'Current node primary input payload' },
        { name: 'inputItems', type: 'array', description: 'Current node input items collection' },
        { name: 'inputBinary', type: 'object', description: 'Current node binary input payload' },
        { name: 'inputMeta', type: 'object', description: 'Current node input metadata' },
        { name: 'inputErrors', type: 'array', description: 'Current node upstream errors list' },
      ];
      currentInputFields.forEach((f) => {
        variables.push({
          nodeId: node.id,
          nodeLabel: `${node.data.label} (current)`,
          nodeType: node.data.nodeType,
          field: {
            name: f.name,
            type: f.type,
            description: f.description,
          },
          expression: buildNodeExpression(node.id, f.name),
          displayExpression: buildLabelExpression(node.data.label, f.name),
        });
      });
    }

    for (const predNode of predecessorNodes) {
      const template = getNodeTemplate(predNode.data.nodeType);

      // Add per-node state variables (output, error, status) for all nodes
      // These are stored in Robot Framework as &{NODE_<node_id>} dictionaries
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'output',
          type: 'string',
          description: 'Main output/result from this node',
        },
        expression: buildNodeExpression(predNode.id, 'output'),
        displayExpression: buildLabelExpression(predNode.data.label, 'output'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'error',
          type: 'string',
          description: 'Error message if node failed',
        },
        expression: buildNodeExpression(predNode.id, 'error'),
        displayExpression: buildLabelExpression(predNode.data.label, 'error'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'status',
          type: 'string',
          description: 'Node execution status (pending, success, error)',
        },
        expression: buildNodeExpression(predNode.id, 'status'),
        displayExpression: buildLabelExpression(predNode.data.label, 'status'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'json',
          type: 'object',
          description: 'Canonical primary payload for this node (flow-style)',
        },
        expression: buildNodeExpression(predNode.id, 'json'),
        displayExpression: buildLabelExpression(predNode.data.label, 'json'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'items',
          type: 'array',
          description: 'Canonical item collection for this node',
        },
        expression: buildNodeExpression(predNode.id, 'items'),
        displayExpression: buildLabelExpression(predNode.data.label, 'items'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'binary',
          type: 'object',
          description: 'Binary payload of the first item',
        },
        expression: buildNodeExpression(predNode.id, 'binary'),
        displayExpression: buildLabelExpression(predNode.data.label, 'binary'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'meta',
          type: 'object',
          description: 'Execution metadata (node, status, itemCount, timestamp)',
        },
        expression: buildNodeExpression(predNode.id, 'meta'),
        displayExpression: buildLabelExpression(predNode.data.label, 'meta'),
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: 'errors',
          type: 'array',
          description: 'Structured node errors list',
        },
        expression: buildNodeExpression(predNode.id, 'errors'),
        displayExpression: buildLabelExpression(predNode.data.label, 'errors'),
      });

      // Add template-defined output schema fields
      if (template?.outputSchema) {
        for (const field of template.outputSchema) {
          variables.push({
            nodeId: predNode.id,
            nodeLabel: predNode.data.label,
            nodeType: predNode.data.nodeType,
            field,
            expression: buildNodeExpression(predNode.id, field.name),
            displayExpression: buildLabelExpression(predNode.data.label, field.name),
          });
        }
      }

      // For Form Trigger, also add dynamic fields
      if (predNode.data.nodeType === 'trigger.form' && predNode.data.config.fields) {
        const formFields = predNode.data.config.fields as FormFieldDefinition[];
        for (const formField of formFields) {
          variables.push({
            nodeId: predNode.id,
            nodeLabel: predNode.data.label,
            nodeType: predNode.data.nodeType,
            field: {
              name: `formData.${formField.id}`,
              type:
                formField.type === 'number'
                  ? 'number'
                  : formField.type === 'checkbox'
                    ? 'boolean'
                    : 'string',
              description: formField.label,
            },
            expression: buildNodeExpression(predNode.id, `formData.${formField.id}`),
            displayExpression: buildLabelExpression(
              predNode.data.label,
              `formData.${formField.id}`,
            ),
          });
        }
      }

      // For Excel Read nodes, add dynamic column fields from column_names config
      const isExcelReadType =
        predNode.data.nodeType === 'excel.read_range' ||
        predNode.data.nodeType === 'excel.read_csv';
      if (isExcelReadType && predNode.data.config?.column_names) {
        const columnNames = predNode.data.config.column_names as string;
        if (typeof columnNames === 'string' && columnNames.trim()) {
          const columns = columnNames
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
          for (const colName of columns) {
            variables.push({
              nodeId: predNode.id,
              nodeLabel: predNode.data.label,
              nodeType: predNode.data.nodeType,
              field: {
                name: `row.${colName}`,
                type: 'string',
                description: `Column: ${colName}`,
              },
              expression: buildNodeExpression(predNode.id, `row.${colName}`),
              displayExpression: buildLabelExpression(predNode.data.label, `row.${colName}`),
            });
          }
        }
      }

      // For Secrets/Vault nodes, add dynamic vault variables from secrets config
      const isSecretsNode = predNode.data.nodeType.startsWith('secrets.');
      if (isSecretsNode && predNode.data.config?.secrets) {
        const secretsConfig = predNode.data.config.secrets as string;
        if (typeof secretsConfig === 'string' && secretsConfig.trim()) {
          const secretNames = secretsConfig
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          for (const secretName of secretNames) {
            // Extract just the secret name (last part after any slashes for AWS ARN-style paths)
            const displayName = secretName.includes('/')
              ? secretName.split('/').pop() || secretName
              : secretName;
            variables.push({
              nodeId: predNode.id,
              nodeLabel: predNode.data.label,
              nodeType: predNode.data.nodeType,
              field: {
                name: `vault.${displayName}`,
                type: 'string',
                description: `Secret: ${secretName}`,
              },
              expression: `\${vault.${displayName}}`,
            });
          }
        }
      }
    }

    return variables;
  }, [node, predecessorNodes, hasErrorConnection]);

  // Check if this is an Excel node and load sheets when file path changes
  const isExcelNode = node?.data.nodeType?.startsWith('excel.');

  // Get Excel file path - either from this node or from a predecessor excel.open node
  const excelFilePath = useMemo(() => {
    if (!node) return null;

    // First check if this node has its own path configured
    const ownPath = node.data.config?.path || node.data.config?.file_path;
    if (ownPath) return ownPath;

    // If not, look for a predecessor excel.open node
    const excelOpenNode = predecessorNodes.find((n) => n.data.nodeType === 'excel.open');
    if (excelOpenNode) {
      return excelOpenNode.data.config?.path || excelOpenNode.data.config?.file_path;
    }

    return null;
  }, [node, predecessorNodes]);

  useEffect(() => {
    if (!isExcelNode || !excelFilePath) {
      setExcelSheets([]);
      return;
    }

    // Check if it's an Excel file
    const isExcelFile = /\.(xlsx?|xlsm|xlsb)$/i.test(excelFilePath);
    if (!isExcelFile) {
      setExcelSheets([]);
      return;
    }

    const loadSheets = async () => {
      setLoadingSheets(true);
      try {
        const sheets = await invoke<string[]>('get_excel_sheets', { filePath: excelFilePath });
        setExcelSheets(sheets);
      } catch (err) {
        console.error('Failed to load Excel sheets:', err);
        setExcelSheets([]);
      } finally {
        setLoadingSheets(false);
      }
    };

    loadSheets();
  }, [isExcelNode, excelFilePath]);

  // Get dynamic Excel column fields for output (from column_names config)
  // This must be before any early returns to follow Rules of Hooks
  const isExcelReadNode =
    node?.data.nodeType === 'excel.read_range' || node?.data.nodeType === 'excel.read_csv';
  const columnNamesConfig = node?.data.config?.column_names;
  const dynamicExcelColumns: { id: string; label: string }[] = useMemo(() => {
    if (!isExcelReadNode) return [];
    if (!columnNamesConfig || typeof columnNamesConfig !== 'string') return [];

    return columnNamesConfig
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .map((name) => ({
        id: name,
        label: name,
      }));
  }, [isExcelReadNode, columnNamesConfig]);

  // Get dynamic secrets fields for output (from secrets config in vault nodes)
  const isSecretsNode = node?.data.nodeType?.startsWith('secrets.');
  const secretsConfig = node?.data.config?.secrets;
  const dynamicSecrets: { id: string; label: string; fullPath: string }[] = useMemo(() => {
    if (!isSecretsNode) return [];
    if (!secretsConfig || typeof secretsConfig !== 'string') return [];

    return secretsConfig
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .map((name) => {
        // Extract just the secret name (last part after any slashes for AWS ARN-style paths)
        const displayName = name.includes('/') ? name.split('/').pop() || name : name;
        return {
          id: displayName,
          label: displayName,
          fullPath: name,
        };
      });
  }, [isSecretsNode, secretsConfig]);

  // === HOOKS THAT MUST BE CALLED UNCONDITIONALLY (before any return) ===
  const envConfig = projectStore.envConfig;
  const loadEnvConfig = projectStore.loadEnvConfig;
  const projectStructure = projectStore.structure;
  const activeEnvScope = envConfig?.activeScope;

  useEffect(() => {
    if (projectStructure && !envConfig) {
      loadEnvConfig();
    }
  }, [projectStructure, envConfig, loadEnvConfig]);

  useEffect(() => {
    checkVaultStatus();
  }, [checkVaultStatus]);

  const envVariableOptions = useMemo(() => {
    if (!envConfig) return [];
    return envConfig.variables
      .filter((v) => !activeEnvScope || v.scope.includes(activeEnvScope))
      .map((v) => ({
        label: `env.${v.name}`,
        value: `\${env.${v.name}}`,
        description: v.description,
      }));
  }, [envConfig, activeEnvScope]);

  const vaultVariableOptions = useMemo(() => {
    return vaultSecrets.map((secret) => ({
      label: `vault.${secret.name}`,
      value: `\${vault.${secret.name}}`,
      description: secret.description,
    }));
  }, [vaultSecrets]);

  // Combined suggestions for expression autocomplete
  const allExpressionSuggestions = useMemo(() => {
    const suggestions: { label: string; value: string; description?: string }[] = [];

    suggestions.push(
      {
        label: '{{$json}}',
        value: '{{$json}}',
        description: 'flow-style: current node input payload',
      },
      {
        label: '{{$json.customer[0].email}}',
        value: '{{$json.customer[0].email}}',
        description: 'flow-style: input path with array index',
      },
      {
        label: '{{$env.MY_VAR}}',
        value: '{{$env.MY_VAR}}',
        description: 'flow-style env variable reference',
      },
      {
        label: '{{$vault.my_secret}}',
        value: '{{$vault.my_secret}}',
        description: 'flow-style vault secret reference',
      },
    );

    const firstUpstream = predecessorNodes[0];
    if (firstUpstream) {
      suggestions.push({
        label: `{{$node["${firstUpstream.data.label}"].json}}`,
        value: `{{$node["${firstUpstream.data.label}"].json}}`,
        description: 'flow-style: reference upstream node output',
      });
    }

    // Add node output variables
    availableVariables.forEach((v) => {
      suggestions.push({
        label: v.displayExpression || v.expression,
        value: v.expression,
        description: `${v.nodeLabel}: ${v.field.description || v.field.name}`,
      });
    });

    // Add environment variables
    envVariableOptions.forEach((v) => {
      suggestions.push(v);
    });

    // Add vault variables
    vaultVariableOptions.forEach((v) => {
      suggestions.push(v);
    });

    return suggestions;
  }, [availableVariables, envVariableOptions, vaultVariableOptions, predecessorNodes]);

  // Get discovered schema if available (from runtime) - MUST be before early returns
  // Passes nodeType to also check global type-based schemas
  const discoveredSchema = node ? getDiscoveredSchema(node.id, node.data.nodeType) : undefined;

  // Convert discovered schema to OutputField format - MUST be before early returns
  const discoveredOutputFields = useMemo(() => {
    if (!discoveredSchema) return null;

    const convertField = (field: any): OutputField => {
      const converted: OutputField = {
        name: field.name,
        type: field.type === 'null' ? 'any' : field.type,
      };

      if (field.type === 'array' && field.items && field.items.length > 0) {
        // For arrays, use the items schema
        converted.items = {
          type: 'object',
          fields: field.items.map(convertField),
        };
      } else if (field.type === 'object' && field.fields && field.fields.length > 0) {
        converted.items = {
          type: 'object',
          fields: field.fields.map(convertField),
        };
      }

      return converted;
    };

    return discoveredSchema.fields.map(convertField);
  }, [discoveredSchema]);
  // === END UNCONDITIONAL HOOKS ===

  if (!node) return null;

  const template = getNodeTemplate(node.data.nodeType);
  if (!template) return null;

  const isFormTrigger = node.data.nodeType === 'trigger.form';
  const isTrigger = node.data.category === 'trigger';

  // Config nodes that don't process data flow - they provide configuration only
  const isConfigNode = [
    'ai.model',
    'ai.embeddings',
    'vectordb.memory',
    'ms365.connection',
  ].includes(node.data.nodeType);

  const totalInputCount =
    availableVariables.length + envVariableOptions.length + vaultVariableOptions.length;
  const hasInputPanel = !isConfigNode && totalInputCount > 0;

  // Use discovered schema if available, otherwise fall back to template
  const effectiveOutputSchema = discoveredOutputFields || template.outputSchema || [];
  const hasOutputPanel = effectiveOutputSchema.length > 0;

  // Get real output data from debug execution if available
  // Try sessionState first (interactive debug), then fall back to executionHistory (normal run)
  const nodeExecution =
    sessionState?.nodeExecutions?.[node.id] || executionHistory.find((e) => e.nodeId === node.id);
  const rawOutputData = nodeExecution?.output;
  const nodeError = nodeExecution?.error;
  const nodeStatus = nodeExecution?.status;

  // Debug logging
  console.log('[NodeConfigPanel] node.id:', node.id);
  console.log('[NodeConfigPanel] executionHistory length:', executionHistory.length);
  console.log('[NodeConfigPanel] nodeExecution:', nodeExecution);
  console.log('[NodeConfigPanel] rawOutputData:', rawOutputData);

  // Parse output if it's a JSON string and unwrap 'result' if present
  const realOutputData = (() => {
    if (!rawOutputData) return undefined;

    let parsed = rawOutputData;
    if (typeof rawOutputData === 'string') {
      try {
        parsed = JSON.parse(rawOutputData);
      } catch {
        return rawOutputData;
      }
    }

    // Unwrap 'result' wrapper if it exists (NODE_OUTPUT format is {"result": actualData})
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'result' in parsed &&
      Object.keys(parsed).length === 1
    ) {
      return parsed.result;
    }

    return parsed;
  })();

  const handleConfigChange = (field: string, value: any) => {
    updateNode(node.id, {
      config: {
        ...node.data.config,
        [field]: value,
      },
    });
  };

  const handleDataMaskingToggle = () => {
    const nextValue = !dataMaskingEnabled;
    setDataMaskingEnabled(nextValue);
    updateNode(node.id, {
      config: {
        ...node.data.config,
        [UI_DATA_MASKING_CONFIG_KEY]: nextValue,
      },
    });
  };

  const handleLabelChange = (label: string) => {
    updateNode(node.id, { label });
  };

  const toAuthoringExpression = (expression: string) =>
    canonicalToAuthoringExpression(expression, {
      currentNodeId: node.id,
      nodeLabelById,
    });

  const copyExpression = (expression: string) => {
    const authoringExpression = toAuthoringExpression(expression);
    navigator.clipboard.writeText(authoringExpression);
    setCopiedExpression(expression);
    setTimeout(() => setCopiedExpression(null), 2000);
  };

  // Test connection for connection nodes (MS365, etc.)
  const isConnectionNode = node.data.nodeType === 'ms365.connection';
  const canTestConnection =
    isConnectionNode &&
    node.data.config.tenant_id &&
    node.data.config.client_id &&
    node.data.config.client_secret;

  const handleTestConnection = async () => {
    if (!canTestConnection) return;

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const result = await invoke<{ success: boolean; message: string }>('test_ms365_connection', {
        tenantId: node.data.config.tenant_id,
        clientId: node.data.config.client_id,
        clientSecret: node.data.config.client_secret,
      });

      setConnectionTestResult(result);

      // Update both values in a single call to avoid race condition
      updateNode(node.id, {
        config: {
          ...node.data.config,
          connectionTested: result.success,
          connectionTestedAt: result.success
            ? new Date().toISOString()
            : node.data.config.connectionTestedAt,
        },
      });
    } catch (err) {
      setConnectionTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
      updateNode(node.id, {
        config: {
          ...node.data.config,
          connectionTested: false,
        },
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Get dynamic form fields for output
  const dynamicFormFields =
    isFormTrigger && node.data.config.fields
      ? (node.data.config.fields as FormFieldDefinition[])
      : [];

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998]"
        onClick={() => setSelectedNode(null)}
      />

      {/* Modal Container - Centered with margins */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 pointer-events-none">
        <div
          data-properties-panel="true"
          id="node-config-panel"
          className="bg-card border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex w-full max-w-6xl"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* INPUT PANEL - Variables from previous nodes (Tree View) */}
          {hasInputPanel &&
            (() => {
              const currentNodeExecution =
                sessionState?.nodeExecutions?.[node.id] ||
                executionHistory.find((e) => e.nodeId === node.id);
              const currentNodeInput = currentNodeExecution?.input;

              // Check if any predecessor has live data
              const hasLiveInputData =
                currentNodeInput !== undefined ||
                predecessorNodes.some((predNode) => {
                  const predExecution =
                    sessionState?.nodeExecutions?.[predNode.id] ||
                    executionHistory.find((e) => e.nodeId === predNode.id);
                  return predExecution?.output !== undefined;
                });

              return (
                <div className="w-80 border-r bg-slate-50/80 flex flex-col flex-shrink-0">
                  <div className="px-4 py-3 border-b flex items-center gap-2 bg-blue-50/80">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${hasLiveInputData ? 'bg-blue-500 animate-pulse' : 'bg-blue-400'}`}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Input
                    </span>
                    {hasLiveInputData && (
                      <span className="text-[9px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                        LIVE
                      </span>
                    )}
                    <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded-full text-blue-500 bg-blue-100">
                      {totalInputCount}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3">
                    {/* Current node real incoming payload (highest fidelity) */}
                    {currentNodeInput !== undefined &&
                      (() => {
                        let parsedInput = currentNodeInput;
                        if (typeof parsedInput === 'string') {
                          try {
                            parsedInput = JSON.parse(parsedInput);
                          } catch {
                            // keep raw string if not valid json
                          }
                        }
                        return (
                          <LiveDataTree
                            key={`${node.id}-input-live`}
                            nodeId={node.id}
                            nodeLabel={`${node.data.label} (incoming)`}
                            data={parsedInput}
                            copyExpression={copyExpression}
                            copiedExpression={copiedExpression}
                          />
                        );
                      })()}

                    {/* Current node input context expressions (when no live payload yet) */}
                    {currentNodeInput === undefined &&
                      (() => {
                        const currentNodeVars = availableVariables.filter(
                          (v) => v.nodeId === node.id,
                        );
                        if (currentNodeVars.length === 0) return null;
                        return (
                          <InputNodeTree
                            key={`${node.id}-input-context`}
                            nodeId={node.id}
                            nodeLabel={`${node.data.label} (current input)`}
                            regularFields={currentNodeVars}
                            formDataFields={[]}
                            copyExpression={copyExpression}
                            copiedExpression={copiedExpression}
                          />
                        );
                      })()}

                    {/* Group variables by node - show LIVE data if available */}
                    {predecessorNodes.map((predNode) => {
                      const nodeVars = availableVariables.filter((v) => v.nodeId === predNode.id);
                      const predExecution =
                        sessionState?.nodeExecutions?.[predNode.id] ||
                        executionHistory.find((e) => e.nodeId === predNode.id);
                      const hasLiveData = predExecution?.output !== undefined;

                      if (nodeVars.length === 0 && !hasLiveData) return null;

                      // Show LIVE data if available (flow-style)
                      if (hasLiveData) {
                        // Parse JSON string if needed
                        let parsedData = predExecution.output;
                        if (typeof parsedData === 'string') {
                          try {
                            parsedData = JSON.parse(parsedData);
                          } catch {
                            // Keep original string when output is not valid JSON.
                          }
                        }
                        return (
                          <LiveDataTree
                            key={predNode.id}
                            nodeId={predNode.id}
                            nodeLabel={predNode.data.label}
                            data={parsedData}
                            copyExpression={copyExpression}
                            copiedExpression={copiedExpression}
                          />
                        );
                      }

                      // Otherwise show schema
                      const regularFields = nodeVars.filter(
                        (v) => !v.field.name.startsWith('formData.'),
                      );
                      const formDataFields = nodeVars.filter((v) =>
                        v.field.name.startsWith('formData.'),
                      );

                      // Get discovered schema for this predecessor node (checks both nodeId and nodeType)
                      const predDiscoveredSchema = getDiscoveredSchema(
                        predNode.id,
                        predNode.data.nodeType,
                      );

                      // Convert static outputSchema to DiscoveredField format if no discovered schema
                      const predTemplate = getNodeTemplate(predNode.data.nodeType);
                      const staticFields = predTemplate?.outputSchema?.map(
                        (field): DiscoveredField => {
                          const converted: DiscoveredField = {
                            name: field.name,
                            type:
                              field.type === 'any'
                                ? 'string'
                                : (field.type as DiscoveredField['type']),
                          };
                          // Convert items.fields to items array format for discovered fields
                          if (field.items?.fields) {
                            converted.items = field.items.fields.map((f) => ({
                              name: f.name,
                              type:
                                f.type === 'any' ? 'string' : (f.type as DiscoveredField['type']),
                            }));
                          }
                          return converted;
                        },
                      );

                      // Use discovered schema if available, otherwise use static
                      const effectiveFields = predDiscoveredSchema?.fields || staticFields;

                      return (
                        <InputNodeTree
                          key={predNode.id}
                          nodeId={predNode.id}
                          nodeLabel={predNode.data.label}
                          regularFields={regularFields}
                          formDataFields={formDataFields}
                          discoveredFields={effectiveFields}
                          copyExpression={copyExpression}
                          copiedExpression={copiedExpression}
                        />
                      );
                    })}

                    {/* Global inputs: Environment + Vault - styled like node trees */}
                    {envConfig && (
                      <GlobalInputTree
                        label="Environment"
                        icon="env"
                        variables={envVariableOptions}
                        emptyMessage="No environment variables configured"
                        copyExpression={copyExpression}
                        copiedExpression={copiedExpression}
                      />
                    )}

                    <GlobalInputTree
                      label="Vault"
                      icon="vault"
                      variables={isVaultUnlocked ? vaultVariableOptions : []}
                      emptyMessage={
                        !vaultExists
                          ? 'Vault not initialized'
                          : !isVaultUnlocked
                            ? 'Vault locked'
                            : 'No secrets configured'
                      }
                      copyExpression={copyExpression}
                      copiedExpression={copiedExpression}
                      isMasked={true}
                    />

                    {/* Legend */}
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-[10px] text-slate-400">
                        {hasLiveInputData
                          ? 'Showing real execution data'
                          : 'Click any field to copy expression'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Empty Input Panel placeholder for triggers */}
          {!hasInputPanel && !isTrigger && (
            <div className="w-48 border-r bg-slate-50/50 flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b bg-blue-50/50 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                  Input
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-slate-400">
                  <Icon name="GitBranch" size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No variables</p>
                  <p className="text-[10px] mt-1 opacity-70">Connect previous nodes</p>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONFIG PANEL */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Header */}
            <div className="px-5 py-4 border-b bg-white flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isTrigger ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon name={template.icon} size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{template.label}</h3>
                    <p className="text-xs text-slate-400 font-mono">{template.type}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isFormTrigger && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowFormPreview(true)}
                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedNode(null)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Config Form - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Node Label */}
              <div className="space-y-2">
                <Label htmlFor="node-name" className="text-sm font-medium">
                  Node Name
                </Label>
                <Input
                  id="node-name"
                  type="text"
                  value={node.data.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Divider */}
              {template.configSchema.length > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Configuration
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              {/* Config Fields */}
              {template.configSchema.map((field) => {
                // Hide column_names field if header is true (only show when header is false)
                if (field.name === 'column_names' && node.data.config.header !== false) {
                  return null;
                }

                // Handle visibleWhen conditional visibility
                if (field.visibleWhen) {
                  const dependentFieldValue = node.data.config[field.visibleWhen.field];
                  const expectedValue = field.visibleWhen.value;

                  // Check if the dependent field matches the expected value
                  if (Array.isArray(expectedValue)) {
                    // If expectedValue is an array, check if current value is in the array
                    if (!expectedValue.includes(dependentFieldValue)) {
                      return null;
                    }
                  } else {
                    // Single value comparison
                    if (dependentFieldValue !== expectedValue) {
                      return null;
                    }
                  }
                }

                // Generate unique key for fields with same name but different visibleWhen
                const fieldKey = field.visibleWhen
                  ? `${field.name}-${Array.isArray(field.visibleWhen.value) ? field.visibleWhen.value.join('-') : field.visibleWhen.value}`
                  : field.name;

                return (
                  <div key={fieldKey} className="space-y-2">
                    <Label htmlFor={field.name} className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>

                    {field.type === 'text' &&
                      (() => {
                        const isPathField =
                          /path|file|directory|folder/i.test(field.name) ||
                          /path|file|directory|folder/i.test(field.label);
                        const isSheetField = isExcelNode && /^sheet$/i.test(field.name);
                        const supportsDrop = field.supportsExpressions !== false;
                        const isDropActive = activeDropField === field.name;

                        const handleBrowse = async () => {
                          try {
                            const selected = await open({
                              multiple: false,
                              directory:
                                /directory|folder/i.test(field.name) ||
                                /directory|folder/i.test(field.label),
                              filters: isExcelNode
                                ? [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb'] }]
                                : undefined,
                            });
                            if (selected && typeof selected === 'string') {
                              handleConfigChange(field.name, selected);
                            }
                          } catch (err) {
                            console.error('Failed to open file dialog:', err);
                          }
                        };

                        const handleTextInputDragOver = (e: React.DragEvent<HTMLInputElement>) => {
                          if (!supportsDrop) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setActiveDropField(field.name);
                        };

                        const handleTextInputDragEnter = (e: React.DragEvent<HTMLInputElement>) => {
                          if (!supportsDrop) return;
                          e.preventDefault();
                          setActiveDropField(field.name);
                        };

                        const handleTextInputDragLeave = (e: React.DragEvent<HTMLInputElement>) => {
                          if (!supportsDrop) return;
                          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                          setActiveDropField((prev) => (prev === field.name ? null : prev));
                        };

                        const handleTextInputDrop = (e: React.DragEvent<HTMLInputElement>) => {
                          if (!supportsDrop) return;
                          e.preventDefault();
                          setActiveDropField((prev) => (prev === field.name ? null : prev));
                          const droppedExpression = getDroppedExpression(e);
                          const expression = droppedExpression
                            ? toAuthoringExpression(droppedExpression)
                            : '';
                          if (!expression) return;

                          const currentValue = String(node.data.config[field.name] || '');
                          const start = e.currentTarget.selectionStart ?? currentValue.length;
                          const end = e.currentTarget.selectionEnd ?? currentValue.length;
                          const nextValue =
                            currentValue.slice(0, start) + expression + currentValue.slice(end);
                          handleConfigChange(field.name, nextValue);

                          requestAnimationFrame(() => {
                            e.currentTarget.focus();
                            const cursorPos = start + expression.length;
                            e.currentTarget.setSelectionRange(cursorPos, cursorPos);
                          });
                        };

                        // Sheet field with dynamic sheets from Excel file
                        if (isSheetField && excelSheets.length > 0) {
                          return (
                            <Select
                              value={node.data.config[field.name] || ''}
                              onValueChange={(value) => handleConfigChange(field.name, value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue
                                  placeholder={
                                    loadingSheets ? 'Loading sheets...' : 'Select sheet...'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {excelSheets.map((sheet) => (
                                  <SelectItem key={sheet} value={sheet}>
                                    {sheet}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }

                        // Sheet field but no sheets loaded yet - show input with hint
                        if (isSheetField) {
                          return (
                            <Input
                              id={field.name}
                              type="text"
                              value={node.data.config[field.name] || ''}
                              onChange={(e) => handleConfigChange(field.name, e.target.value)}
                              onDragEnter={handleTextInputDragEnter}
                              onDragOver={handleTextInputDragOver}
                              onDragLeave={handleTextInputDragLeave}
                              onDrop={handleTextInputDrop}
                              placeholder={
                                isDropActive
                                  ? 'Drop variable here...'
                                  : loadingSheets
                                    ? 'Loading sheets...'
                                    : 'Select a file first or type sheet name'
                              }
                              className={`h-9 ${
                                isDropActive
                                  ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300 ring-offset-1'
                                  : ''
                              }`}
                              disabled={loadingSheets}
                            />
                          );
                        }

                        return isPathField ? (
                          <div
                            className={`flex gap-2 rounded-md ${
                              isDropActive
                                ? 'bg-blue-50/60 ring-2 ring-blue-300 ring-offset-1 px-1 py-1'
                                : ''
                            }`}
                          >
                            <Input
                              id={field.name}
                              type="text"
                              value={node.data.config[field.name] || ''}
                              onChange={(e) => handleConfigChange(field.name, e.target.value)}
                              onDragEnter={handleTextInputDragEnter}
                              onDragOver={handleTextInputDragOver}
                              onDragLeave={handleTextInputDragLeave}
                              onDrop={handleTextInputDrop}
                              placeholder={
                                isDropActive ? 'Drop variable here...' : field.placeholder
                              }
                              className={`h-9 flex-1 ${
                                isDropActive ? 'border-blue-400 bg-blue-50' : ''
                              }`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleBrowse}
                              className="h-9 w-9 flex-shrink-0"
                              title="Browse..."
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <ExpressionInput
                            value={node.data.config[field.name] || ''}
                            onChange={(value) => handleConfigChange(field.name, value)}
                            placeholder={field.placeholder}
                            suggestions={allExpressionSuggestions}
                            transformExpression={toAuthoringExpression}
                          />
                        );
                      })()}

                    {field.type === 'textarea' && (
                      <ExpressionInput
                        value={node.data.config[field.name] || ''}
                        onChange={(value) => handleConfigChange(field.name, value)}
                        placeholder={field.placeholder}
                        suggestions={allExpressionSuggestions}
                        multiline={true}
                        transformExpression={toAuthoringExpression}
                      />
                    )}

                    {field.type === 'number' && (
                      <Input
                        id={field.name}
                        type="number"
                        value={node.data.config[field.name] ?? 0}
                        onChange={(e) =>
                          handleConfigChange(field.name, parseFloat(e.target.value) || 0)
                        }
                        placeholder={field.placeholder}
                        className="h-9"
                      />
                    )}

                    {field.type === 'boolean' && (
                      <div className="flex items-center gap-3">
                        <Switch
                          id={field.name}
                          checked={node.data.config[field.name] ?? field.default ?? false}
                          onCheckedChange={(checked) => handleConfigChange(field.name, checked)}
                        />
                        <Label htmlFor={field.name} className="text-sm font-normal text-slate-500">
                          {(node.data.config[field.name] ?? field.default ?? false)
                            ? 'Enabled'
                            : 'Disabled'}
                        </Label>
                      </div>
                    )}

                    {field.type === 'select' && field.options && (
                      <Select
                        value={node.data.config[field.name] ?? field.default}
                        onValueChange={(value) => handleConfigChange(field.name, value)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {field.type === 'node-select' &&
                      (() => {
                        // Get nodes of the specified type from the current flow
                        const targetNodeType = (field as { nodeType?: string }).nodeType;
                        const flowNodes = flowStore.nodes.filter(
                          (n) => n.data?.nodeType === targetNodeType && n.id !== node.id,
                        );
                        return (
                          <Select
                            value={node.data.config[field.name] || ''}
                            onValueChange={(value) =>
                              handleConfigChange(field.name, value === '__none__' ? '' : value)
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select provider (or use local)..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">Local Filesystem</span>
                              </SelectItem>
                              {flowNodes.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{n.data?.label || n.data?.nodeType}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({n.data?.config?.provider || 'local'})
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                              {flowNodes.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                  Add a Storage Provider node to use cloud storage
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        );
                      })()}

                    {field.type === 'bot-select' &&
                      (() => {
                        // Get bots from the project store
                        const projectBots = Array.from(projectStore.bots.values()).filter(
                          (bot) => bot.id !== activeBotId, // Don't allow calling self
                        );
                        return (
                          <Select
                            value={node.data.config[field.name] || ''}
                            onValueChange={(value) =>
                              handleConfigChange(field.name, value === '__none__' ? '' : value)
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select a bot to call..." />
                            </SelectTrigger>
                            <SelectContent>
                              {projectBots.map((bot) => (
                                <SelectItem key={bot.id} value={bot.id}>
                                  <div className="flex items-center gap-2">
                                    <Package className="h-3.5 w-3.5 text-rose-500" />
                                    <span>{bot.name}</span>
                                    {bot.description && (
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                        - {bot.description}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                              {projectBots.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                  No other bots in this project. Create a bot to call as subprocess.
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        );
                      })()}

                    {field.type === 'password' && (
                      <Input
                        id={field.name}
                        type="password"
                        value={node.data.config[field.name] || ''}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                        onDragEnter={(e) => {
                          if (!field.supportsExpressions) return;
                          e.preventDefault();
                          setActiveDropField(field.name);
                        }}
                        onDragOver={(e) => {
                          if (!field.supportsExpressions) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setActiveDropField(field.name);
                        }}
                        onDragLeave={(e) => {
                          if (!field.supportsExpressions) return;
                          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                          setActiveDropField((prev) => (prev === field.name ? null : prev));
                        }}
                        onDrop={(e) => {
                          if (!field.supportsExpressions) return;
                          e.preventDefault();
                          setActiveDropField((prev) => (prev === field.name ? null : prev));
                          const expression = getDroppedExpression(e);
                          if (!expression) return;

                          const currentValue = String(node.data.config[field.name] || '');
                          const start = e.currentTarget.selectionStart ?? currentValue.length;
                          const end = e.currentTarget.selectionEnd ?? currentValue.length;
                          const nextValue =
                            currentValue.slice(0, start) + expression + currentValue.slice(end);
                          handleConfigChange(field.name, nextValue);

                          requestAnimationFrame(() => {
                            e.currentTarget.focus();
                            const cursorPos = start + expression.length;
                            e.currentTarget.setSelectionRange(cursorPos, cursorPos);
                          });
                        }}
                        placeholder={
                          activeDropField === field.name
                            ? 'Drop variable here...'
                            : field.placeholder
                        }
                        className={`h-9 ${
                          activeDropField === field.name
                            ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300 ring-offset-1'
                            : ''
                        }`}
                      />
                    )}

                    {field.type === 'form-builder' && (
                      <FormBuilder
                        value={(node.data.config[field.name] as FormFieldDefinition[]) || []}
                        onChange={(fields) => handleConfigChange(field.name, fields)}
                      />
                    )}

                    {field.type === 'validation-builder' && (
                      <ValidationBuilder
                        value={(node.data.config[field.name] as ValidationRule[]) || []}
                        onChange={(rules) => handleConfigChange(field.name, rules)}
                        availableFields={availableVariables
                          .filter(
                            (v) =>
                              ![
                                'output',
                                'error',
                                'status',
                                'LAST_ERROR',
                                'LAST_ERROR_NODE',
                                'LAST_ERROR_TYPE',
                              ].includes(v.field.name),
                          )
                          .map((v) => v.field.name)}
                      />
                    )}

                    {field.type === 'protection-builder' && (
                      <ProtectionBuilder
                        value={(node.data.config[field.name] as ProtectionRule[]) || []}
                        onChange={(rules) => handleConfigChange(field.name, rules)}
                        availableFields={availableVariables
                          .filter(
                            (v) =>
                              ![
                                'output',
                                'error',
                                'status',
                                'LAST_ERROR',
                                'LAST_ERROR_NODE',
                                'LAST_ERROR_TYPE',
                              ].includes(v.field.name),
                          )
                          .map((v) => v.field.name)}
                        dataType={node.data.nodeType.includes('phi') ? 'phi' : 'pii'}
                      />
                    )}
                  </div>
                );
              })}

              {/* Test Connection Button for connection nodes */}
              {isConnectionNode && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <Button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={!canTestConnection || testingConnection}
                    className={`w-full ${
                      connectionTestResult?.success
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : node.data.config.connectionTested
                          ? 'bg-emerald-500 hover:bg-emerald-600'
                          : ''
                    }`}
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing Connection...
                      </>
                    ) : connectionTestResult?.success || node.data.config.connectionTested ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Connection Verified
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </Button>

                  {/* Connection test result message */}
                  {connectionTestResult && (
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        connectionTestResult.success
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {connectionTestResult.success ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{connectionTestResult.message}</span>
                      </div>
                    </div>
                  )}

                  {/* Show when last tested */}
                  {node.data.config.connectionTested &&
                    node.data.config.connectionTestedAt &&
                    !connectionTestResult && (
                      <p className="text-xs text-slate-500 text-center">
                        Last verified:{' '}
                        {new Date(node.data.config.connectionTestedAt).toLocaleString()}
                      </p>
                    )}

                  {!canTestConnection && (
                    <p className="text-xs text-slate-400 text-center">
                      Fill in all required fields to test the connection
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t flex-shrink-0">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">{template.description}</p>
              </div>
            </div>
          </div>

          {/* OUTPUT PANEL - What this node produces (Tree View) */}
          {hasOutputPanel &&
            (() => {
              const nodePinnedData = pinnedData.get(node.id);
              const isPinned = !!nodePinnedData;
              const rawDisplayData = isPinned ? nodePinnedData.data : realOutputData;
              // Apply masking if enabled
              const displayData =
                dataMaskingEnabled && rawDisplayData
                  ? maskObject(rawDisplayData, maskingPolicy)
                  : rawDisplayData;
              const hasData = displayData !== undefined;
              const hasError = nodeStatus === 'error' && nodeError;
              const envelopeData =
                displayData &&
                typeof displayData === 'object' &&
                !Array.isArray(displayData) &&
                'items' in (displayData as Record<string, unknown>) &&
                'json' in (displayData as Record<string, unknown>) &&
                'meta' in (displayData as Record<string, unknown>)
                  ? (displayData as Record<string, unknown>)
                  : null;
              const livePayloadData =
                envelopeData && envelopeData.json !== undefined ? envelopeData.json : displayData;
              const hasPayloadData = livePayloadData !== undefined;
              const envelopeMeta =
                envelopeData &&
                envelopeData.meta &&
                typeof envelopeData.meta === 'object' &&
                !Array.isArray(envelopeData.meta)
                  ? (envelopeData.meta as Record<string, unknown>)
                  : null;
              const envelopeItemCount =
                envelopeMeta && typeof envelopeMeta.itemCount === 'number'
                  ? envelopeMeta.itemCount
                  : envelopeData && Array.isArray(envelopeData.items)
                    ? envelopeData.items.length
                    : undefined;

              // Determine header style based on state
              const getHeaderStyle = () => {
                if (hasError) return 'bg-red-50/80';
                if (isPinned) return 'bg-amber-50/80';
                if (hasData) return 'bg-green-50/80';
                return 'bg-emerald-50/80';
              };

              const getDotStyle = () => {
                if (hasError) return 'bg-red-500';
                if (isPinned) return 'bg-amber-500';
                if (hasData) return 'bg-green-500 animate-pulse';
                return 'bg-emerald-500';
              };

              return (
                <div className="w-80 border-l bg-slate-50/80 flex flex-col flex-shrink-0">
                  <div className={`px-4 py-3 border-b flex items-center gap-2 ${getHeaderStyle()}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${getDotStyle()}`} />
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${hasError ? 'text-red-700' : isPinned ? 'text-amber-700' : 'text-emerald-700'}`}
                    >
                      Output
                    </span>
                    {hasError && (
                      <span className="text-[9px] text-red-600 bg-red-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5" />
                        ERROR
                      </span>
                    )}
                    {!hasError && isPinned && (
                      <span className="text-[9px] text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                        <Pin className="w-2.5 h-2.5" />
                        PINNED
                      </span>
                    )}
                    {!hasError && !isPinned && hasData && (
                      <span className="text-[9px] text-green-600 bg-green-200 px-1.5 py-0.5 rounded-full font-semibold">
                        LIVE
                      </span>
                    )}
                    {envelopeData && (
                      <span className="text-[9px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                        ENVELOPE
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1 min-w-0">
                      {/* Data Masking toggle (HIPAA/PCI compliance) */}
                      <button
                        onClick={handleDataMaskingToggle}
                        className={`p-1 rounded transition-colors ${
                          dataMaskingEnabled
                            ? 'text-green-600 bg-green-100 hover:bg-green-200'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                        title={
                          dataMaskingEnabled
                            ? 'PII Masking ON - Click to show real data'
                            : 'PII Masking OFF - Click to mask sensitive data (HIPAA/PCI)'
                        }
                      >
                        {dataMaskingEnabled ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {/* Pin/Unpin button */}
                      {hasData && (
                        <button
                          onClick={() => {
                            if (isPinned) {
                              unpinNodeData(node.id);
                            } else {
                              pinNodeData(node.id, realOutputData, node.data.label);
                            }
                          }}
                          className={`p-1 rounded transition-colors ${
                            isPinned
                              ? 'text-amber-600 hover:bg-amber-100'
                              : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          }`}
                          title={
                            isPinned
                              ? 'Unpin data (use live data)'
                              : 'Pin data (freeze for testing)'
                          }
                        >
                          {isPinned ? (
                            <PinOff className="w-3.5 h-3.5" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${isPinned ? 'text-amber-500 bg-amber-100' : 'text-emerald-500 bg-emerald-100'}`}
                      >
                        {effectiveOutputSchema.length +
                          dynamicFormFields.length +
                          dynamicExcelColumns.length +
                          dynamicSecrets.length}
                      </span>
                      {discoveredSchema && (
                        <span
                          className="text-[9px] text-purple-600 ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 min-w-0 max-w-[86px]"
                          title={`Discovered from execution at ${new Date(discoveredSchema.discoveredAt).toLocaleString()}`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span className="truncate uppercase">schema</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3">
                    {/* Show error details if node failed */}
                    {hasError ? (
                      <div className="space-y-3">
                        {/* Error message */}
                        <div className="font-mono text-xs bg-red-50 rounded-lg border border-red-200 p-3">
                          <div className="font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Error Details
                          </div>
                          <pre className="whitespace-pre-wrap break-all text-[10px] text-red-800 max-h-32 overflow-y-auto">
                            {nodeError}
                          </pre>
                        </div>

                        {/* Error suggestions based on common patterns */}
                        {(() => {
                          const suggestions: string[] = [];
                          const errorLower = nodeError?.toLowerCase() || '';

                          if (
                            errorLower.includes('file not found') ||
                            errorLower.includes('no such file')
                          ) {
                            suggestions.push(
                              'Check that the file path is correct and the file exists',
                            );
                            suggestions.push('Verify you have read permissions for the file');
                          }
                          if (
                            errorLower.includes('permission') ||
                            errorLower.includes('access denied')
                          ) {
                            suggestions.push(
                              'Run with elevated permissions or check file/folder permissions',
                            );
                          }
                          if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
                            suggestions.push(
                              'The operation took too long - try increasing the timeout',
                            );
                            suggestions.push(
                              'Check network connectivity if accessing remote resources',
                            );
                          }
                          if (errorLower.includes('connection') || errorLower.includes('network')) {
                            suggestions.push('Check your network connection');
                            suggestions.push('Verify the server/service is running and accessible');
                          }
                          if (
                            errorLower.includes('authentication') ||
                            errorLower.includes('unauthorized') ||
                            errorLower.includes('401')
                          ) {
                            suggestions.push('Verify your credentials are correct');
                            suggestions.push('Check if your token/API key has expired');
                          }
                          if (errorLower.includes('not found') || errorLower.includes('404')) {
                            suggestions.push('The requested resource does not exist');
                            suggestions.push('Check the URL or path is correct');
                          }
                          if (errorLower.includes('selector') || errorLower.includes('element')) {
                            suggestions.push(
                              "The element selector may be incorrect or the element doesn't exist",
                            );
                            suggestions.push(
                              'The page may not have loaded completely - add a wait',
                            );
                          }
                          if (errorLower.includes('json') || errorLower.includes('parse')) {
                            suggestions.push('The data format may be invalid - check the input');
                          }

                          if (suggestions.length === 0) {
                            suggestions.push('Review the error message for specific details');
                            suggestions.push('Check the node configuration');
                          }

                          return (
                            <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                              <div className="font-semibold mb-2 text-[10px] uppercase text-amber-700">
                                Suggestions
                              </div>
                              <ul className="space-y-1">
                                {suggestions.map((suggestion, idx) => (
                                  <li
                                    key={idx}
                                    className="text-[10px] text-amber-800 flex items-start gap-1.5"
                                  >
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    {suggestion}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}

                        {/* Execution timing if available */}
                        {nodeExecution?.startTime && nodeExecution?.endTime && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-2">
                            <span>
                              Failed after{' '}
                              {((nodeExecution.endTime - nodeExecution.startTime) / 1000).toFixed(
                                2,
                              )}
                              s
                            </span>
                          </div>
                        )}
                      </div>
                    ) : hasPayloadData && livePayloadData && typeof livePayloadData === 'object' ? (
                      <div
                        className={`font-mono text-xs rounded-lg border p-3 ${isPinned ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}
                      >
                        <div
                          className={`font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 ${isPinned ? 'text-amber-700' : 'text-green-700'}`}
                        >
                          {isPinned && <Pin className="w-3 h-3" />}
                          {isPinned ? 'Pinned Data' : 'Live Data'}
                          {isPinned && nodePinnedData && (
                            <span className="text-[9px] font-normal text-amber-500 ml-1">
                              (pinned {new Date(nodePinnedData.pinnedAt).toLocaleTimeString()})
                            </span>
                          )}
                        </div>
                        {envelopeData && (
                          <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700 flex items-center gap-2">
                            <span className="font-semibold">Runtime envelope</span>
                            {envelopeItemCount !== undefined && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                items: {envelopeItemCount}
                              </span>
                            )}
                            {envelopeMeta?.status !== undefined &&
                              envelopeMeta?.status !== null && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                  status: {String(envelopeMeta.status)}
                                </span>
                              )}
                          </div>
                        )}
                        {/* Expandable JSON tree */}
                        <div className="max-h-80 overflow-y-auto">
                          {Array.isArray(livePayloadData)
                            ? livePayloadData.map((item: any, i: number) => (
                                <ExpandableJsonNode
                                  key={i}
                                  keyName={i}
                                  value={item}
                                  path={`[${i}]`}
                                  nodeId={node.id}
                                  nodeLabel={node.data.label}
                                  copyExpression={copyExpression}
                                  copiedExpression={copiedExpression}
                                  isLast={i === displayData.length - 1}
                                  defaultExpanded={i === 0}
                                />
                              ))
                            : Object.entries(livePayloadData as Record<string, unknown>).map(
                                ([key, value], i, arr) => (
                                  <ExpandableJsonNode
                                    key={key}
                                    keyName={key}
                                    value={value}
                                    path={key}
                                    nodeId={node.id}
                                    nodeLabel={node.data.label}
                                    copyExpression={copyExpression}
                                    copiedExpression={copiedExpression}
                                    isLast={i === arr.length - 1}
                                    defaultExpanded={true}
                                  />
                                ),
                              )}
                        </div>
                      </div>
                    ) : hasPayloadData ? (
                      <div
                        className={`font-mono text-xs rounded-lg border p-3 ${isPinned ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}
                      >
                        <div
                          className={`font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 ${isPinned ? 'text-amber-700' : 'text-green-700'}`}
                        >
                          {isPinned && <Pin className="w-3 h-3" />}
                          {isPinned ? 'Pinned Data' : 'Live Data'}
                        </div>
                        <pre
                          className={`whitespace-pre-wrap break-all text-[10px] ${isPinned ? 'text-amber-800' : 'text-green-800'}`}
                        >
                          {String(livePayloadData)}
                        </pre>
                      </div>
                    ) : (
                      /* JSON Tree View - Schema only (no live data) */
                      <>
                        <div className="font-mono text-xs bg-white rounded-lg border border-slate-200 p-3">
                          {/* Root object */}
                          <div className="text-slate-500">{'{'}</div>

                          {/* Standard output fields (from discovered or static schema) */}
                          {effectiveOutputSchema.map((field: any, i: number) => {
                            const expression = buildNodeExpression(node.id, field.name);
                            const displayExpression = buildLabelExpression(
                              node.data.label,
                              field.name,
                            );
                            const isLast =
                              i === effectiveOutputSchema.length - 1 &&
                              dynamicFormFields.length === 0 &&
                              dynamicExcelColumns.length === 0 &&
                              dynamicSecrets.length === 0;

                            // Check if this is an array or object with nested fields
                            // items.fields for discovered schema, or items as array for legacy
                            const nestedFields =
                              field.items?.fields ||
                              (Array.isArray(field.items) ? field.items : null);
                            const hasNestedFields =
                              (field.type === 'array' || field.type === 'object') &&
                              nestedFields &&
                              nestedFields.length > 0;

                            if (hasNestedFields) {
                              return (
                                <SchemaArrayField
                                  key={i}
                                  fieldName={field.name}
                                  items={nestedFields}
                                  nodeId={node.id}
                                  nodeLabel={node.data.label}
                                  description={field.description}
                                  copyExpression={copyExpression}
                                  copiedExpression={copiedExpression}
                                  isLast={isLast}
                                  fieldType={field.type}
                                />
                              );
                            }

                            return (
                              <div
                                key={i}
                                className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                                onClick={() => copyExpression(expression)}
                                title={
                                  field.description
                                    ? `${field.description}\nClick to copy: ${displayExpression}`
                                    : `Click to copy: ${displayExpression}`
                                }
                              >
                                <span className="text-emerald-600">&quot;{field.name}&quot;</span>
                                <span className="text-slate-400">:</span>
                                <span
                                  className={`ml-1 ${
                                    field.type === 'string'
                                      ? 'text-green-600'
                                      : field.type === 'number'
                                        ? 'text-blue-600'
                                        : field.type === 'boolean'
                                          ? 'text-purple-600'
                                          : field.type === 'object'
                                            ? 'text-orange-600'
                                            : field.type === 'array'
                                              ? 'text-pink-600'
                                              : 'text-slate-600'
                                  }`}
                                >
                                  {field.type === 'string'
                                    ? `"${field.example || '...'}"`
                                    : field.type === 'number'
                                      ? field.example || '0'
                                      : field.type === 'boolean'
                                        ? 'true'
                                        : field.type === 'object'
                                          ? '{...}'
                                          : field.type === 'array'
                                            ? '[...]'
                                            : '...'}
                                </span>
                                {!isLast && <span className="text-slate-400">,</span>}
                                {copiedExpression === expression ? (
                                  <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                                )}
                              </div>
                            );
                          })}

                          {/* Form Data (nested object for Form Trigger) */}
                          {dynamicFormFields.length > 0 && (
                            <OutputTreeNode
                              label="formData"
                              type="object"
                              nodeId={node.id}
                              nodeLabel={node.data.label}
                              fields={dynamicFormFields}
                              copyExpression={copyExpression}
                              copiedExpression={copiedExpression}
                              isLast={
                                dynamicExcelColumns.length === 0 && dynamicSecrets.length === 0
                              }
                            />
                          )}

                          {/* Excel Row Fields (nested object for Excel Read nodes) */}
                          {dynamicExcelColumns.length > 0 && (
                            <div className="pl-4">
                              {/* row object header */}
                              <div className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1">
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                                <span className="text-orange-600">&quot;row&quot;</span>
                                <span className="text-slate-400">:</span>
                                <span className="text-slate-500 ml-1">{'{'}</span>
                              </div>
                              {/* Column fields */}
                              {dynamicExcelColumns.map((col, i) => {
                                const expression = buildNodeExpression(node.id, `row.${col.id}`);
                                const displayExpression = buildLabelExpression(
                                  node.data.label,
                                  `row.${col.id}`,
                                );
                                const colIsLast = i === dynamicExcelColumns.length - 1;
                                return (
                                  <div
                                    key={col.id}
                                    className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                                    onClick={() => copyExpression(expression)}
                                    title={`Click to copy: ${displayExpression}`}
                                  >
                                    <span className="text-emerald-600">
                                      &quot;{col.label}&quot;
                                    </span>
                                    <span className="text-slate-400">:</span>
                                    <span className="text-green-600 ml-1">&quot;...&quot;</span>
                                    {!colIsLast && <span className="text-slate-400">,</span>}
                                    {copiedExpression === expression ? (
                                      <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                                    )}
                                  </div>
                                );
                              })}
                              <div className="text-slate-500 pl-0">
                                {'}'}
                                {dynamicSecrets.length > 0 && ','}
                              </div>
                            </div>
                          )}

                          {/* Vault Secrets (for secrets.* nodes) */}
                          {dynamicSecrets.length > 0 && (
                            <div className="pl-4">
                              {/* vault object header */}
                              <div className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1">
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                                <span className="text-yellow-600">&quot;vault&quot;</span>
                                <span className="text-slate-400">:</span>
                                <span className="text-slate-500 ml-1">{'{'}</span>
                              </div>
                              {/* Secret fields */}
                              {dynamicSecrets.map((secret, i) => {
                                const expression = `\${vault.${secret.id}}`;
                                const secretIsLast = i === dynamicSecrets.length - 1;
                                return (
                                  <div
                                    key={secret.id}
                                    className="group pl-4 py-0.5 hover:bg-yellow-50 rounded cursor-pointer flex items-center gap-1"
                                    onClick={() => copyExpression(expression)}
                                    title={`Click to copy: ${expression}\nFull path: ${secret.fullPath}`}
                                  >
                                    <span className="text-yellow-600">
                                      &quot;{secret.label}&quot;
                                    </span>
                                    <span className="text-slate-400">:</span>
                                    <span className="text-green-600 ml-1">&quot;••••••&quot;</span>
                                    {!secretIsLast && <span className="text-slate-400">,</span>}
                                    {copiedExpression === expression ? (
                                      <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                                    )}
                                  </div>
                                );
                              })}
                              <div className="text-slate-500 pl-0">{'}'}</div>
                            </div>
                          )}

                          <div className="text-slate-500">{'}'}</div>
                        </div>

                        {/* Legend */}
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <p className="text-[10px] text-slate-400 mb-2">
                            Click any field to copy expression
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                              string
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              number
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                              boolean
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                              object
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {isFormTrigger && (
        <FormPreview
          isOpen={showFormPreview}
          onClose={() => setShowFormPreview(false)}
          formConfig={{
            title: node.data.config.formTitle || 'Form',
            description: node.data.config.formDescription,
            fields: (node.data.config.fields as FormFieldDefinition[]) || [],
            submitButtonLabel: node.data.config.submitButtonLabel,
          }}
        />
      )}
    </>
  );
}
