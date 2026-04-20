import { X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useEffect } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CheckCircle2,
    bg: "bg-white",
    border: "border-primary-200",
    ring: "ring-1 ring-primary-100/50",
    iconColor: "text-primary-600",
  },
  error: {
    icon: XCircle,
    bg: "bg-white",
    border: "border-orange-200",
    ring: "ring-1 ring-orange-100/50",
    iconColor: "text-orange-600",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-white",
    border: "border-yellow-200",
    ring: "ring-1 ring-yellow-100/50",
    iconColor: "text-yellow-600",
  },
  info: {
    icon: Info,
    bg: "bg-white",
    border: "border-blue-200",
    ring: "ring-1 ring-blue-100/50",
    iconColor: "text-blue-600",
  },
};

export function ToastComponent({ toast, onClose }: ToastProps) {
  const config = toastConfig[toast.type];
  const Icon = config.icon;

  useEffect(() => {
    const duration = toast.duration || 5000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  return (
    <div
      className={`
        group
        flex items-start gap-3 p-4 rounded-xl
        ${config.bg} ${config.border} ${config.ring}
        border shadow-lg backdrop-blur-sm
        animate-in slide-in-from-right-5 fade-in
        duration-350
      `}
    >
      {/* Icono con animación */}
      <div className="flex-shrink-0 pt-0.5 animate-in zoom-in duration-250 delay-75">
        <Icon 
          size={20} 
          strokeWidth={2} 
          className={config.iconColor}
        />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-right-2 duration-250 delay-100">
        <p className="font-semibold text-sm text-neutral-900 leading-tight">
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
            {toast.description}
          </p>
        )}
      </div>

      {/* Close button con hover refinado */}
      <button
        onClick={() => onClose(toast.id)}
        className="
          flex-shrink-0 p-1 rounded-lg
          text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100
          active:bg-neutral-150
          transition-all duration-150 ease-smooth
          opacity-60 group-hover:opacity-100
        "
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
