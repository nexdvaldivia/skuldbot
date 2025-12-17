import { useState } from "react";
import { createPortal } from "react-dom";
import { useFlowStore } from "../store/flowStore";
import { getNodeTemplate } from "../data/nodeTemplates";
import { X, Info, Eye } from "lucide-react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { FormBuilder } from "./FormBuilder";
import { FormPreview } from "./FormPreview";
import { FormFieldDefinition } from "../types/flow";

export default function NodeConfig() {
  const { selectedNode, nodes, updateNode, setSelectedNode } = useFlowStore();
  const [showFormPreview, setShowFormPreview] = useState(false);

  // Get the actual node from the nodes array to ensure we have the latest data
  const node = selectedNode ? nodes.find(n => n.id === selectedNode.id) ?? null : null;

  if (!node) return null;

  const template = getNodeTemplate(node.data.nodeType);
  if (!template) return null;

  // Check if this is a Form Trigger node
  const isFormTrigger = node.data.nodeType === "trigger.form";

  const handleConfigChange = (field: string, value: string | number | boolean) => {
    updateNode(node.id, {
      config: {
        ...node.data.config,
        [field]: value,
      },
    });
  };

  const handleLabelChange = (label: string) => {
    updateNode(node.id, { label });
  };

  const panel = (
    <div
      className="fixed top-20 right-4 w-[320px] bg-card border rounded-lg shadow-lg overflow-hidden z-[9999]"
    >
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
              <Icon name={template.icon} size={18} />
            </div>
            <div>
              <h3 className="text-sm font-medium">{template.label}</h3>
              <p className="text-xs text-muted-foreground font-mono">{template.type}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isFormTrigger && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFormPreview(true)}
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Vista previa del formulario"
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

      {/* Config Form */}
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
        {/* Node Label */}
        <div className="space-y-2">
          <Label htmlFor="node-name">Node Name</Label>
          <Input
            id="node-name"
            type="text"
            value={node.data.label}
            onChange={(e) => handleLabelChange(e.target.value)}
          />
        </div>

        {/* Divider */}
        {template.configSchema.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Config</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* Config Fields */}
        {template.configSchema.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.type === "text" && (
              <Input
                id={field.name}
                type="text"
                value={node.data.config[field.name] || ""}
                onChange={(e) => handleConfigChange(field.name, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {field.type === "textarea" && (
              <Textarea
                id={field.name}
                value={node.data.config[field.name] || ""}
                onChange={(e) => handleConfigChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
              />
            )}

            {field.type === "number" && (
              <Input
                id={field.name}
                type="number"
                value={node.data.config[field.name] ?? 0}
                onChange={(e) =>
                  handleConfigChange(field.name, parseFloat(e.target.value) || 0)
                }
                placeholder={field.placeholder}
              />
            )}

            {field.type === "boolean" && (
              <div className="flex items-center gap-2">
                <Switch
                  id={field.name}
                  checked={node.data.config[field.name] || false}
                  onCheckedChange={(checked) => handleConfigChange(field.name, checked)}
                />
                <Label htmlFor={field.name} className="text-sm font-normal">Enable</Label>
              </div>
            )}

            {field.type === "select" && field.options && (
              <Select
                value={node.data.config[field.name] ?? field.default}
                onValueChange={(value) => handleConfigChange(field.name, value)}
              >
                <SelectTrigger>
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

            {field.type === "password" && (
              <Input
                id={field.name}
                type="password"
                value={node.data.config[field.name] || ""}
                onChange={(e) => handleConfigChange(field.name, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {field.type === "form-builder" && (
              <FormBuilder
                value={(node.data.config[field.name] as FormFieldDefinition[]) || []}
                onChange={(fields) => handleConfigChange(field.name, fields as any)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-muted/50 border-t">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {isFormTrigger && (
        <FormPreview
          isOpen={showFormPreview}
          onClose={() => setShowFormPreview(false)}
          formConfig={{
            title: node.data.config.formTitle || "Formulario",
            description: node.data.config.formDescription,
            fields: (node.data.config.fields as FormFieldDefinition[]) || [],
            submitButtonLabel: node.data.config.submitButtonLabel,
          }}
        />
      )}
    </>
  );
}
