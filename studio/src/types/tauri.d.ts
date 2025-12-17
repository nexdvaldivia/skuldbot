// Tauri types
interface Window {
  __TAURI__?: {
    tauri: {
      invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
    };
    dialog: {
      save(options?: {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }): Promise<string | null>;
      open(options?: {
        multiple?: boolean;
        directory?: boolean;
        filters?: Array<{ name: string; extensions: string[] }>;
      }): Promise<string | string[] | null>;
      message(message: string, options?: { title?: string; type?: string }): Promise<void>;
    };
    fs: {
      readTextFile(path: string): Promise<string>;
      writeTextFile(path: string, contents: string): Promise<void>;
    };
  };
}

// Tauri Command Results
interface CompileResult {
  success: boolean;
  message: string;
  bot_path?: string;
}

interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  logs?: string[];
}


