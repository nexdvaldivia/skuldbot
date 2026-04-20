'use client';

import { useToast } from '@/hooks/use-toast';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const variantStyles = {
  default: {
    container: 'bg-white border-zinc-200',
    icon: Info,
    iconClass: 'text-zinc-500',
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200',
    icon: CheckCircle,
    iconClass: 'text-emerald-500',
  },
  error: {
    container: 'bg-red-50 border-red-200',
    icon: AlertCircle,
    iconClass: 'text-red-500',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200',
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((toast) => {
        const variant = toast.variant || 'default';
        const styles = variantStyles[variant];
        const Icon = styles.icon;

        return (
          <div
            key={toast.id}
            className={`${styles.container} border rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right-full duration-200`}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${styles.iconClass}`} />
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-sm font-medium text-zinc-900">{toast.title}</p>
              )}
              {toast.description && (
                <p className="text-sm text-zinc-600 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
