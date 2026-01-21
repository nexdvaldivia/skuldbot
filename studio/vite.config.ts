import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Conditionally load obfuscator plugin (only in production and if installed)
let obfuscatorPlugin: any = null;
try {
  // @ts-ignore - Plugin may not be installed
  obfuscatorPlugin = require("vite-plugin-obfuscator").default;
} catch {
  // Plugin not installed, skip obfuscation
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const isProduction = !process.env.TAURI_DEBUG;

  const plugins: any[] = [react()];

  // Only add obfuscator in production if plugin is available
  if (isProduction && obfuscatorPlugin) {
    plugins.push(
      obfuscatorPlugin({
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: [/node_modules/],
        options: {
          // High protection settings
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: true,
          debugProtectionInterval: 2000,
          disableConsoleOutput: true,
          identifierNamesGenerator: "hexadecimal",
          log: false,
          numbersToExpressions: true,
          renameGlobals: false,
          selfDefending: true,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 5,
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayCallsTransformThreshold: 0.75,
          stringArrayEncoding: ["base64"],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 4,
          stringArrayWrappersType: "function",
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
        },
      })
    );
  }

  return {
    plugins,

    // Vite options tailored for Tauri development
    clearScreen: false,

    server: {
      port: 1420,
      strictPort: true,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // Tauri expects a fixed port, fail if that port is not available
    build: {
      target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
      // Use terser for better minification in production
      minify: isProduction ? "terser" : false,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ["console.log", "console.info", "console.debug"],
            },
            mangle: {
              toplevel: true,
              safari10: true,
            },
            format: {
              comments: false,
            },
          }
        : undefined,
      // Chunk splitting for better obfuscation
      rollupOptions: isProduction
        ? {
            output: {
              manualChunks: undefined,
              // Randomize chunk names
              chunkFileNames: "assets/[hash].js",
              entryFileNames: "assets/[hash].js",
              assetFileNames: "assets/[hash].[ext]",
            },
          }
        : undefined,
      // Source maps disabled for production
      sourcemap: !isProduction,
    },

    // Prevent exposing environment variables
    define: isProduction
      ? {
          "process.env": {},
        }
      : undefined,
  };
});
