/**
 * Preview Panel - Visual Workflow Preview
 * Shows generated workflow steps with visual hierarchy
 */

import { CheckCircle2, Circle, AlertCircle, Play, Download, Eye } from "lucide-react";
import { Button } from "../../ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";
import { Badge } from "../../ui/Badge";

interface WorkflowStep {
  id: string;
  nodeType: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
  status: "valid" | "warning" | "error" | "pending";
}

// Mock data for preview
const mockSteps: WorkflowStep[] = [
  {
    id: "node-0",
    nodeType: "trigger.manual",
    label: "Start Automation",
    description: "Manual trigger to start the workflow",
    config: {},
    status: "valid",
  },
  {
    id: "node-1",
    nodeType: "email.read",
    label: "Read Gmail Invoices",
    description: "Fetch unread emails with invoices from Gmail",
    config: {
      folder: "INBOX",
      filter: "subject:invoice is:unread",
      limit: 50,
    },
    status: "valid",
  },
  {
    id: "node-2",
    nodeType: "control.loop",
    label: "Process Each Email",
    description: "Iterate through each invoice email",
    config: {
      items: "${Read Gmail Invoices.emails}",
    },
    status: "valid",
  },
  {
    id: "node-3",
    nodeType: "files.download_attachment",
    label: "Download PDF",
    description: "Extract and download PDF attachment",
    config: {
      email: "${current_item}",
      pattern: "*.pdf",
    },
    status: "warning",
  },
  {
    id: "node-4",
    nodeType: "storage.upload",
    label: "Upload to S3",
    description: "Store invoice in S3 bucket",
    config: {
      provider: "s3",
      bucket: "${S3_BUCKET}",
      path: "/invoices/${current_item.date}/",
    },
    status: "valid",
  },
  {
    id: "node-5",
    nodeType: "logging.log",
    label: "Log Success",
    description: "Record successful processing",
    config: {
      message: "Processed invoice: ${current_item.subject}",
      level: "INFO",
    },
    status: "valid",
  },
];

export function PreviewPanel() {
  const [steps] = useState(mockSteps);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  const getNodeCategoryColor = (nodeType: string) => {
    const [category] = nodeType.split(".");
    const colors: Record<string, string> = {
      trigger: "bg-blue-100 text-blue-700 border-blue-200",
      email: "bg-purple-100 text-purple-700 border-purple-200",
      control: "bg-amber-100 text-amber-700 border-amber-200",
      files: "bg-cyan-100 text-cyan-700 border-cyan-200",
      storage: "bg-emerald-100 text-emerald-700 border-emerald-200",
      logging: "bg-neutral-100 text-neutral-700 border-neutral-200",
    };
    return colors[category] || "bg-neutral-100 text-neutral-700 border-neutral-200";
  };

  const getStatusIcon = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "valid":
        return <CheckCircle2 className="w-4 h-4 text-primary-600" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Circle className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div className="flex h-full bg-neutral-50">
      {/* Steps List */}
      <div className="w-1/2 border-r border-neutral-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">
                Workflow Steps
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {steps.length} nodes generated
              </p>
            </div>
            <Badge variant="outline" className="bg-primary-50 text-primary-700 border-primary-200">
              Valid
            </Badge>
          </div>
          
          {/* Quick stats */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary-500" />
              <span className="text-neutral-600">5 Valid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-neutral-600">1 Warning</span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setSelectedStep(step.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedStep === step.id
                    ? "bg-primary-50 border-primary-300 shadow-sm"
                    : "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Step number */}
                  <div className="w-6 h-6 rounded-md bg-neutral-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-neutral-600">
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-neutral-900 truncate">
                        {step.label}
                      </span>
                      {getStatusIcon(step.status)}
                    </div>
                    <p className="text-xs text-neutral-500 line-clamp-1">
                      {step.description}
                    </p>
                    <div className="mt-2">
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${getNodeCategoryColor(step.nodeType)}`}>
                        {step.nodeType}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 border-t border-neutral-200 bg-white space-y-2">
          <Button 
            className="w-full bg-primary-500 hover:bg-primary-600 text-white shadow-sm"
            size="sm"
          >
            <Play className="w-4 h-4 mr-2" />
            Apply to Canvas
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              <Eye className="w-4 h-4 mr-2" />
              Preview Flow
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Export DSL
            </Button>
          </div>
        </div>
      </div>

      {/* Step Details */}
      <div className="w-1/2 flex flex-col bg-white">
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
              <div className="p-4 space-y-6">
                {(() => {
                  const step = steps.find((s) => s.id === selectedStep);
                  if (!step) return null;

                  return (
                    <>
                      {/* Basic Info */}
                      <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                          Node Information
                        </label>
                        <Card>
                          <CardContent className="p-4 space-y-3">
                            <div>
                              <div className="text-xs text-neutral-500 mb-1">Type</div>
                              <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${getNodeCategoryColor(step.nodeType)}`}>
                                {step.nodeType}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500 mb-1">Label</div>
                              <div className="text-sm font-medium text-neutral-900">{step.label}</div>
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500 mb-1">Description</div>
                              <div className="text-sm text-neutral-700 leading-relaxed">{step.description}</div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Configuration */}
                      <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                          Configuration
                        </label>
                        <Card>
                          <CardContent className="p-4">
                            <pre className="text-xs text-neutral-700 font-mono bg-neutral-50 p-3 rounded-md overflow-x-auto">
                              {JSON.stringify(step.config, null, 2)}
                            </pre>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                          Validation Status
                        </label>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(step.status)}
                              <span className="text-sm font-medium text-neutral-900 capitalize">
                                {step.status}
                              </span>
                            </div>
                            {step.status === "warning" && (
                              <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200">
                                ⚠️ Consider adding error handling for failed downloads
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </>
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

