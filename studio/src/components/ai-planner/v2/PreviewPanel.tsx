/**
 * Preview Panel - Workflow Visualization
 * Shows the generated workflow with step-by-step execution plan
 */

import { useState } from "react";
import { Play, CheckCircle, AlertCircle, ChevronRight, Eye, Download } from "lucide-react";
import { Card, CardContent } from "../../ui/card";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ScrollArea } from "../../ui/scroll-area";
import { useAIPlannerV2Store } from "../../../store/aiPlannerV2Store";

export function PreviewPanel() {
  const { currentPlan, confidence, applyToCanvas } = useAIPlannerV2Store();
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  // Empty state
  if (!currentPlan) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
          <Play className="w-8 h-8 text-primary-400" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
          No Workflow Yet
        </h3>
        <p className="text-sm text-neutral-600 max-w-sm">
          Generate a plan in the Chat tab to see the workflow preview here
        </p>
      </div>
    );
  }

  const selectedStep = selectedStepIndex !== null ? currentPlan.tasks[selectedStepIndex] : null;
  const validCount = currentPlan.tasks.filter(t => 
    !currentPlan.validation.errors.some(e => e.nodeId === t.id) &&
    !currentPlan.validation.warnings.some(w => w.nodeId === t.id)
  ).length;
  const warningCount = currentPlan.tasks.filter(t => 
    currentPlan.validation.warnings.some(w => w.nodeId === t.id)
  ).length;
  const errorCount = currentPlan.tasks.filter(t => 
    currentPlan.validation.errors.some(e => e.nodeId === t.id)
  ).length;

  const getNodeCategoryColor = (nodeType: string) => {
    const [category] = nodeType.split(".");
    const colors: Record<string, string> = {
      trigger: "bg-blue-100 text-blue-700 border-blue-200",
      email: "bg-purple-100 text-purple-700 border-purple-200",
      control: "bg-amber-100 text-amber-700 border-amber-200",
      files: "bg-cyan-100 text-cyan-700 border-cyan-200",
      storage: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cloud: "bg-emerald-100 text-emerald-700 border-emerald-200",
      logging: "bg-neutral-100 text-neutral-700 border-neutral-200",
      ai: "bg-pink-100 text-pink-700 border-pink-200",
      vectordb: "bg-indigo-100 text-indigo-700 border-indigo-200",
    };
    return colors[category] || "bg-neutral-100 text-neutral-700 border-neutral-200";
  };

  return (
    <div className="flex h-full bg-neutral-50">
      {/* Left: Steps List */}
      <div className="w-96 border-r border-neutral-200 bg-neutral-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-900">
              {currentPlan.goal}
            </h3>
            <Badge className="bg-primary-50 text-primary-700 border-primary-200">
              {currentPlan.tasks.length} steps
            </Badge>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed mb-3">
            {currentPlan.description}
          </p>
          
          {/* Confidence */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-700">Confidence:</span>
            <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  confidence >= 0.8
                    ? "bg-green-500"
                    : confidence >= 0.5
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-neutral-900">
              {(confidence * 100).toFixed(0)}%
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-xs">
            {validCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-neutral-600">{validCount} Valid</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-neutral-600">{warningCount} Warning</span>
              </div>
            )}
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-neutral-600">{errorCount} Error</span>
              </div>
            )}
          </div>
        </div>

        {/* Steps */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {currentPlan.tasks.map((step, index) => {
              const hasError = currentPlan.validation.errors.some(e => e.nodeId === step.id);
              const hasWarning = currentPlan.validation.warnings.some(w => w.nodeId === step.id);
              const isSelected = selectedStepIndex === index;

              return (
                <button
                  key={step.id}
                  onClick={() => setSelectedStepIndex(index)}
                  className={`w-full text-left transition-all ${
                    isSelected
                      ? "bg-white shadow-sm border-primary-200"
                      : "bg-white border-neutral-200 hover:border-neutral-300"
                  } border rounded-lg p-3`}
                >
                  <div className="flex items-start gap-3">
                    {/* Step Number */}
                    <div
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isSelected
                          ? "bg-primary-400 text-white"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {index + 1}
                    </div>

                    {/* Step Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-neutral-900 truncate">
                          {step.label}
                        </h4>
                        {hasError && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )}
                        {!hasError && hasWarning && (
                          <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                        )}
                        {!hasError && !hasWarning && (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 line-clamp-1 mb-2">
                        {step.description}
                      </p>
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${getNodeCategoryColor(step.nodeType)}`}>
                        {step.nodeType}
                      </span>
                    </div>

                    {/* Arrow */}
                    {isSelected && (
                      <ChevronRight className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 border-t border-neutral-200 bg-white space-y-2">
          <Button 
            onClick={applyToCanvas}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white shadow-sm"
            size="sm"
            disabled={!currentPlan.validation.valid || !currentPlan.validation.compilable}
          >
            <Play className="w-4 h-4 mr-2" />
            Apply to Canvas
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => {
                const dataStr = JSON.stringify(currentPlan.dsl, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                const exportFileDefaultName = `${currentPlan.goal.replace(/\s+/g, '-').toLowerCase()}.json`;
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export DSL
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Step Details */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedStep ? (
          <>
            {/* Details Header */}
            <div className="p-4 border-b border-neutral-200">
              <h3 className="font-semibold text-neutral-900 text-sm mb-1">
                Step Details
              </h3>
              <p className="text-xs text-neutral-500">
                Configuration and properties
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 block">
                    Node Information
                  </label>
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Type</div>
                        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${getNodeCategoryColor(selectedStep.nodeType)}`}>
                          {selectedStep.nodeType}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Label</div>
                        <div className="text-sm font-medium text-neutral-900">{selectedStep.label}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Description</div>
                        <div className="text-sm text-neutral-700 leading-relaxed">{selectedStep.description}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Configuration */}
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 block">
                    Configuration
                  </label>
                  <Card>
                    <CardContent className="p-4">
                      <pre className="text-xs text-neutral-700 font-mono bg-neutral-50 p-3 rounded-md overflow-x-auto leading-relaxed">
                        {JSON.stringify(selectedStep.config, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>

                {/* Validation Issues */}
                {(() => {
                  const stepErrors = currentPlan.validation.errors.filter(e => e.nodeId === selectedStep.id);
                  const stepWarnings = currentPlan.validation.warnings.filter(w => w.nodeId === selectedStep.id);
                  
                  if (stepErrors.length === 0 && stepWarnings.length === 0) {
                    return (
                      <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 block">
                          Validation Status
                        </label>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700">Valid</span>
                            </div>
                            <p className="mt-2 text-xs text-neutral-600">
                              This step passed all validation checks
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  }

                  return (
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 block">
                        Validation Issues
                      </label>
                      <div className="space-y-2">
                        {stepErrors.map((error, i) => (
                          <Card key={`error-${i}`} className="border-red-200 bg-red-50">
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <div className="text-xs font-semibold text-red-700 mb-1">Error</div>
                                  <p className="text-xs text-red-600 leading-relaxed">{error.message}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {stepWarnings.map((warning, i) => (
                          <Card key={`warning-${i}`} className="border-yellow-200 bg-yellow-50">
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <div className="text-xs font-semibold text-yellow-700 mb-1">Warning</div>
                                  <p className="text-xs text-yellow-600 leading-relaxed">{warning.message}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Eye className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">
                Select a Step
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Click on any workflow step to view its configuration and validation details.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
