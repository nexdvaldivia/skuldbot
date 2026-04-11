import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Play, Loader2 } from "lucide-react";
import { Button } from "./ui/Button";
import { FormFieldDefinition } from "../types/flow";

interface FormTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Record<string, any>) => void;
  isLoading?: boolean;
  formConfig: {
    title: string;
    description?: string;
    fields: FormFieldDefinition[];
    submitButtonLabel?: string;
  };
}

export function FormTriggerModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  formConfig,
}: FormTriggerModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setFormData({});
      setErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error when user types
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    formConfig.fields.forEach((field) => {
      if (field.required) {
        const value = formData[field.id];
        if (value === undefined || value === "" || value === null) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit(formData);
  };

  const renderField = (field: FormFieldDefinition) => {
    const hasError = !!errors[field.id];
    const baseInputClass = `
      w-full px-3 py-2 border rounded-lg text-sm
      focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
      transition-colors
      ${hasError ? "border-red-300 bg-red-50" : "border-slate-200"}
    `;

    switch (field.type) {
      case "text":
      case "email":
        return (
          <input
            type={field.type}
            placeholder={field.placeholder}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
            disabled={isLoading}
          />
        );

      case "number":
        return (
          <input
            type="number"
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
            disabled={isLoading}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
            disabled={isLoading}
          />
        );

      case "textarea":
        return (
          <textarea
            placeholder={field.placeholder}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            rows={3}
            className={`${baseInputClass} resize-none`}
            disabled={isLoading}
          />
        );

      case "dropdown":
        return (
          <select
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
            disabled={isLoading}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData[field.id] || false}
              onChange={(e) => handleInputChange(field.id, e.target.checked)}
              className="w-4 h-4 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
              disabled={isLoading}
            />
            <span className="text-sm text-slate-600">{field.label}</span>
          </label>
        );

      case "file":
        return (
          <input
            type="file"
            onChange={(e) =>
              handleInputChange(field.id, e.target.files?.[0]?.name || "")
            }
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            disabled={isLoading}
          />
        );

      default:
        return (
          <input
            type="text"
            placeholder={field.placeholder}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
            disabled={isLoading}
          />
        );
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-2xl w-[480px] max-h-[90vh] m-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-slate-700">
              Run Bot
            </span>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
              Form Input Required
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isLoading}
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form Title */}
            <div className="text-center pb-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                {formConfig.title || "Enter Form Data"}
              </h2>
              {formConfig.description && (
                <p className="text-sm text-slate-500 mt-1">
                  {formConfig.description}
                </p>
              )}
            </div>

            {/* Fields */}
            {formConfig.fields.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p>No fields defined in the form trigger.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {formConfig.fields.map((field) => (
                  <div key={field.id}>
                    {field.type !== "checkbox" && (
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {field.label}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                    )}
                    {renderField(field)}
                    {errors[field.id] && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Bot...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {formConfig.submitButtonLabel || "Run Bot"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {formConfig.fields.length} fields ·{" "}
              {formConfig.fields.filter((f) => f.required).length} required
            </span>
            <span className="text-xs text-slate-400">
              Data will be passed to bot as variables
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default FormTriggerModal;
