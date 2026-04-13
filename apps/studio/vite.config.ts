import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

type JsObfuscator = {
  obfuscate: (
    code: string,
    options: Record<string, unknown>,
  ) => { getObfuscatedCode: () => string };
};

function createObfuscationPlugin(obfuscator: JsObfuscator): Plugin {
  return {
    name: 'studio-js-obfuscate',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk' || !fileName.endsWith('.js')) {
          continue;
        }

        const moduleIds = Object.keys(item.modules);
        const isVendorChunk =
          moduleIds.length > 0 && moduleIds.every((moduleId) => moduleId.includes('node_modules'));
        if (isVendorChunk) {
          continue;
        }

        const obfuscated = obfuscator.obfuscate(item.code, {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
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
          stringArrayEncoding: ['base64'],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 4,
          stringArrayWrappersType: 'function',
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
        });

        item.code = obfuscated.getObfuscatedCode();
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const isProduction = !process.env.TAURI_DEBUG;
  const shouldObfuscate = isProduction && process.env.STUDIO_OBFUSCATE === 'true';

  const plugins: any[] = [react()];

  let obfuscatorLib: JsObfuscator | null = null;
  try {
    const obfuscatorModule = await import('javascript-obfuscator');
    const candidate = obfuscatorModule.default as JsObfuscator | undefined;
    if (candidate && typeof candidate.obfuscate === 'function') {
      obfuscatorLib = candidate;
    }
  } catch {
    obfuscatorLib = null;
  }

  if (shouldObfuscate && obfuscatorLib) {
    plugins.push(createObfuscationPlugin(obfuscatorLib));
  }

  return {
    plugins,

    // Vite options tailored for Tauri development
    clearScreen: false,

    server: {
      port: 1421,
      strictPort: true,
      host: '127.0.0.1',
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // Tauri expects a fixed port, fail if that port is not available
    build: {
      target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
      // Use terser for better minification in production
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug'],
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
              manualChunks: (id: string) => {
                if (!id.includes('node_modules')) {
                  return undefined;
                }

                const afterNodeModules = id.split('node_modules/')[1];
                if (!afterNodeModules) {
                  return 'vendor-misc';
                }

                const pathParts = afterNodeModules.split('/');
                const packageName = pathParts[0]?.startsWith('@')
                  ? `${pathParts[0]}/${pathParts[1]}`
                  : pathParts[0];

                if (!packageName) {
                  return 'vendor-misc';
                }

                if (packageName === 'detect-node-es') {
                  return undefined;
                }

                return `vendor-${packageName.replace('@', '').replace('/', '-')}`;
              },
              // Randomize chunk names
              chunkFileNames: 'assets/[hash].js',
              entryFileNames: 'assets/[hash].js',
              assetFileNames: 'assets/[hash].[ext]',
            },
          }
        : undefined,
      chunkSizeWarningLimit: 3000,
      // Source maps disabled for production
      sourcemap: !isProduction,
    },

    // Prevent exposing environment variables
    define: isProduction
      ? {
          'process.env': {},
        }
      : undefined,
  };
});
