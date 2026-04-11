import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Download, CheckCircle2, Loader2 } from "lucide-react";

interface SetupStatus {
  stage: string;
  message: string;
  progress: number;
  is_complete: boolean;
  is_error: boolean;
}

export function EngineSetupNotification() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const checkStatus = async () => {
      try {
        const result = await invoke<SetupStatus>("get_engine_setup_status");
        setStatus(result);

        // Show notification only if installing
        if (!result.is_complete) {
          setVisible(true);
        } else if (result.message.includes("installed")) {
          // Show success briefly then auto-hide
          setVisible(true);
          hideTimeout = setTimeout(() => {
            setVisible(false);
          }, 2500);
        } else {
          // Engine was already ready, don't show anything
          setVisible(false);
        }

        // Stop polling when complete
        if (result.is_complete && intervalId) {
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error("Failed to get engine setup status:", error);
      }
    };

    // Initial check
    checkStatus();

    // Poll while not complete
    intervalId = setInterval(checkStatus, 1000);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  // Don't render if not visible or no status
  if (!visible || !status) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div
        className={`
          mx-auto max-w-xs mb-3 px-3 py-1.5 rounded-full shadow-md pointer-events-auto
          flex items-center gap-2 text-xs font-medium
          transition-all duration-300 ease-out
          ${
            status.is_complete
              ? "bg-green-500/90 text-white"
              : "bg-slate-800/90 text-slate-100"
          }
        `}
      >
        {status.is_complete ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <Loader2 className="w-3 h-3 animate-spin" />
          </>
        )}
        <span className="truncate">{status.message}</span>
      </div>
    </div>
  );
}
