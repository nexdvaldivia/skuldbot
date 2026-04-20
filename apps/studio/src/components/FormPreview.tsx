import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { Button } from "./ui/Button";
import { FormFieldDefinition } from "../types/flow";

interface FormPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  formConfig: {
    title: string;
    description?: string;
    fields: FormFieldDefinition[];
    submitButtonLabel?: string;
  };
}

export function FormPreview({ isOpen, onClose, formConfig }: FormPreviewProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    console.log("Form submitted:", formData);
    // Reset after 2 seconds
    setTimeout(() => {
      setSubmitted(false);
      setFormData({});
    }, 2000);
  };

  const renderField = (field: FormFieldDefinition) => {
    const baseInputClass =
      "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent";

    switch (field.type) {
      case "text":
      case "email":
        return (
          <input
            type={field.type}
            placeholder={field.placeholder}
            required={field.required}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
          />
        );

      case "number":
        return (
          <input
            type="number"
            placeholder={field.placeholder}
            required={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
          />
        );

      case "date":
        return (
          <input
            type="date"
            required={field.required}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
          />
        );

      case "textarea":
        return (
          <textarea
            placeholder={field.placeholder}
            required={field.required}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            rows={3}
            className={`${baseInputClass} resize-none`}
          />
        );

      case "dropdown":
        return (
          <select
            required={field.required}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
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
              required={field.required}
              checked={formData[field.id] || false}
              onChange={(e) => handleInputChange(field.id, e.target.checked)}
              className="w-4 h-4 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-600">{field.label}</span>
          </label>
        );

      case "file":
        return (
          <input
            type="file"
            required={field.required}
            onChange={(e) =>
              handleInputChange(field.id, e.target.files?.[0]?.name || "")
            }
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
        );

      default:
        return (
          <input
            type="text"
            placeholder={field.placeholder}
            required={field.required}
            value={formData[field.id] || ""}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            className={baseInputClass}
          />
        );
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          transition-all duration-300 ease-out
          ${isMaximized ? "w-full h-full m-0 rounded-none" : "w-[480px] max-h-[90vh] m-4"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-700">
              Form Preview
            </span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              Preview
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-7 w-7"
            >
              {isMaximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto p-6">
          {submitted ? (
            // Success State
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Form Submitted!
              </h3>
              <p className="text-sm text-slate-500 text-center">
                Data would be shown in the console.
                <br />
                In production, this would trigger the bot.
              </p>
            </div>
          ) : (
            // Form
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Form Title */}
              <div className="text-center pb-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-800">
                  {formConfig.title || "Untitled Form"}
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
                  <p>No fields defined.</p>
                  <p className="text-sm mt-1">
                    Add fields in the Form Builder.
                  </p>
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
                    </div>
                  ))}
                </div>
              )}

              {/* Submit Button */}
              {formConfig.fields.length > 0 && (
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
                >
                  {formConfig.submitButtonLabel || "Submit"}
                </button>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {formConfig.fields.length} fields ·{" "}
              {formConfig.fields.filter((f) => f.required).length} required
            </span>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <ExternalLink className="w-3 h-3" />
              <span>Will be published on compile</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default FormPreview;
