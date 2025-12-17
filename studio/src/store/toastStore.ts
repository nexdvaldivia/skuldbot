import { create } from "zustand";
import type { Toast } from "../components/ui/Toast";

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (title, description) => {
    useToastStore.getState().addToast({
      type: "success",
      title,
      description,
      duration: 5000,
    });
  },

  error: (title, description) => {
    useToastStore.getState().addToast({
      type: "error",
      title,
      description,
      duration: 7000,
    });
  },

  warning: (title, description) => {
    useToastStore.getState().addToast({
      type: "warning",
      title,
      description,
      duration: 6000,
    });
  },

  info: (title, description) => {
    useToastStore.getState().addToast({
      type: "info",
      title,
      description,
      duration: 5000,
    });
  },
}));

