/**
 * Validation Panel - Real-time Validation Feedback
 * Shows errors, warnings, and validation status
 */

import { CheckCircle2, AlertCircle, XCircle, TrendingUp, Zap, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";

interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  nodeType?: string;
}

// Mock validation data
const mockValidation = {
  valid: true,
  compilable: true,
  confidence: 0.85,
  errors: [] as ValidationIssue[],
  warnings: [
    {
      severity: "warning" as const,
      message: "Consider adding error handling for failed downloads",
      nodeId: "node-3",
      nodeType: "files.download_attachment",
    },
  ],
  suggestions: [
    "Add retry logic for network operations",
    "Consider implementing rate limiting for API calls",
  ],
};

export function ValidationPanel() {
  const { valid, compilable, confidence, errors, warnings, suggestions } = mockValidation;

  return (
    <div className="h-full bg-neutral-50">
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
          {/* Overall Status */}
          <Card className="border-2 border-primary-200 bg-primary-50/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-neutral-900 text-base mb-1">
                      Workflow Ready
                    </CardTitle>
                    <CardDescription className="text-sm">
                      All validations passed, workflow is executable
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-primary-500 text-white border-primary-600">
                  Valid & Compilable
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-primary-200">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-600 mb-1">
                    {(confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-neutral-600 font-medium flex items-center justify-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Confidence
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-600 mb-1">
                    {errors.length}
                  </div>
                  <div className="text-xs text-neutral-600 font-medium flex items-center justify-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Errors
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600 mb-1">
                    {warnings.length}
                  </div>
                  <div className="text-xs text-neutral-600 font-medium flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Warnings
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validation Checks */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Validation Checks
            </h3>
            <div className="space-y-2">
              {[
                { label: "DSL Structure", status: "passed", icon: CheckCircle2 },
                { label: "Node Types Valid", status: "passed", icon: CheckCircle2 },
                { label: "No Unreachable Nodes", status: "passed", icon: CheckCircle2 },
                { label: "No Cycles Detected", status: "passed", icon: CheckCircle2 },
                { label: "Compilability Test", status: "passed", icon: CheckCircle2 },
                { label: "Error Handling", status: "warning", icon: AlertCircle },
              ].map((check) => (
                <Card key={check.label} className="border-neutral-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          check.status === "passed"
                            ? "bg-primary-100"
                            : "bg-amber-100"
                        }`}>
                          <check.icon className={`w-4 h-4 ${
                            check.status === "passed"
                              ? "text-primary-600"
                              : "text-amber-600"
                          }`} />
                        </div>
                        <span className="text-sm font-medium text-neutral-900">
                          {check.label}
                        </span>
                      </div>
                      <Badge 
                        variant={check.status === "passed" ? "outline" : "default"}
                        className={
                          check.status === "passed"
                            ? "bg-primary-50 text-primary-700 border-primary-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }
                      >
                        {check.status === "passed" ? "Passed" : "Warning"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Warnings ({warnings.length})
              </h3>
              <div className="space-y-2">
                {warnings.map((warning, index) => (
                  <Card key={index} className="border-amber-200 bg-amber-50/50">
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-amber-900 leading-relaxed mb-2">
                            {warning.message}
                          </p>
                          {warning.nodeType && (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-white text-amber-800 border-amber-300 text-xs">
                                {warning.nodeType}
                              </Badge>
                              {warning.nodeId && (
                                <span className="text-xs text-amber-700 font-mono">
                                  {warning.nodeId}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Errors ({errors.length})
              </h3>
              <div className="space-y-2">
                {errors.map((error, index) => (
                  <Card key={index} className="border-red-200 bg-red-50/50">
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                          <XCircle className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-red-900 leading-relaxed mb-2">
                            {error.message}
                          </p>
                          {error.nodeType && (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-white text-red-800 border-red-300 text-xs">
                                {error.nodeType}
                              </Badge>
                              {error.nodeId && (
                                <span className="text-xs text-red-700 font-mono">
                                  {error.nodeId}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Optimization Suggestions
              </h3>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-4">
                  <div className="flex gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">
                        Recommended Improvements
                      </h4>
                      <p className="text-xs text-blue-700 leading-relaxed">
                        These suggestions can improve robustness and performance
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 ml-11">
                    {suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <span className="text-sm text-blue-900">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Production Ready Badge */}
          {valid && compilable && (
            <Card className="border-2 border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-emerald-900 mb-0.5">
                      Production Ready
                    </h4>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      This workflow has passed all validation checks and can be deployed to runners
                    </p>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Deploy
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

