import React from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
  onRecoverToWelcome?: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unknown UI error",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[AppErrorBoundary] UI crash", error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  private handleRecoverToWelcome = () => {
    this.props.onRecoverToWelcome?.();
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-screen w-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white shadow-lg p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">UI error recovered</h1>
              <p className="text-sm text-slate-500">
                The app crashed during rendering. You can recover without reloading.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-600">Error</p>
            <p className="mt-1 text-sm text-slate-700 break-words">
              {this.state.message || "No error details available."}
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700"
            >
              <RefreshCcw className="w-4 h-4" />
              Retry UI
            </button>
            <button
              type="button"
              onClick={this.handleRecoverToWelcome}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <Home className="w-4 h-4" />
              Go to Welcome
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-slate-300 bg-white text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
