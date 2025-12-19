/**
 * Plan Step List Component
 * Displays and manages the list of generated plan steps
 */

import { useState } from "react";
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Edit2,
  Info,
} from "lucide-react";
import { useAIPlannerStore } from "../../store/aiPlannerStore";
import { PlanStep } from "../../types/ai-planner";
import { getCategoryIcon, getCategoryColor } from "../../utils/nodeCategories";

// Get icon component for a category
function CategoryIcon({ category }: { category: string }) {
  const Icon = getCategoryIcon(category);
  return <Icon className="w-4 h-4" />;
}

interface PlanStepItemProps {
  step: PlanStep;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<PlanStep>) => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function PlanStepItem({
  step,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onAddAfter,
  onDragStart,
  onDragOver,
  onDrop,
}: PlanStepItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(step.label);

  // Find matching template and category info
  const category = step.nodeType.split(".")[0];
  const categoryColor = getCategoryColor(category);

  const handleSaveLabel = () => {
    if (editLabel.trim() && editLabel !== step.label) {
      onUpdate({ label: editLabel.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`border rounded-xl overflow-hidden transition-all ${
        isExpanded ? "border-primary-300 shadow-sm" : "border-slate-200"
      } ${step.isManual ? "bg-amber-50/50" : "bg-white"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
        {/* Drag Handle */}
        <div className="cursor-grab text-slate-400 hover:text-slate-600">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Step Number */}
        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
          {index + 1}
        </div>

        {/* Category Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${categoryColor}20`, color: categoryColor }}
        >
          <CategoryIcon category={category} />
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0" onClick={onToggleExpand}>
          {isEditing ? (
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleSaveLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveLabel();
                if (e.key === "Escape") {
                  setEditLabel(step.label);
                  setIsEditing(false);
                }
              }}
              className="w-full px-2 py-1 text-sm border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-slate-800 truncate">
                {step.label}
              </span>
              {step.isManual && (
                <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded">
                  Manual
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500 truncate">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
            title="Edit label"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
            title="Remove step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleExpand}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          {/* Node Type */}
          <div className="text-xs text-slate-500 mb-2">
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              {step.nodeType}
            </span>
          </div>

          {/* Reasoning */}
          {step.reasoning && (
            <div className="flex gap-2 mb-3 p-2 bg-blue-50 rounded-lg">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">{step.reasoning}</p>
            </div>
          )}

          {/* Configuration Preview */}
          {Object.keys(step.config || {}).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Configuration:</p>
              <div className="text-xs font-mono bg-slate-100 p-2 rounded overflow-x-auto">
                {Object.entries(step.config).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-slate-500">{key}:</span>
                    <span className="text-slate-800">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Step After */}
          <button
            onClick={onAddAfter}
            className="mt-3 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-3 h-3" />
            Add step after
          </button>
        </div>
      )}
    </div>
  );
}

export function PlanStepList() {
  const { planSteps, updatePlanStep, removePlanStep, reorderPlanSteps, addPlanStep } =
    useAIPlannerStore();

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const toggleExpand = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (toIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      reorderPlanSteps(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
  };

  const handleAddStep = (afterId?: string) => {
    addPlanStep(
      {
        nodeType: "control.wait",
        label: "New Step",
        description: "Configure this step",
        config: {},
        isManual: true,
      },
      afterId
    );
  };

  if (planSteps.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500 text-sm">No steps generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-800">
          Generated Plan ({planSteps.length} steps)
        </h3>
        <button
          onClick={() => handleAddStep()}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-3 h-3" />
          Add Step
        </button>
      </div>

      {planSteps.map((step, index) => (
        <PlanStepItem
          key={step.id}
          step={step}
          index={index}
          isExpanded={expandedSteps.has(step.id)}
          onToggleExpand={() => toggleExpand(step.id)}
          onUpdate={(updates) => updatePlanStep(step.id, updates)}
          onRemove={() => removePlanStep(step.id)}
          onAddAfter={() => handleAddStep(step.id)}
          onDragStart={handleDragStart(index)}
          onDragOver={handleDragOver}
          onDrop={handleDrop(index)}
        />
      ))}
    </div>
  );
}

export default PlanStepList;
