import { useToastStore } from "../../store/toastStore";
import { ToastComponent } from "./Toast";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}


