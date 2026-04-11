import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Note: JavaScript obfuscation is handled by terser minification below
// For stronger obfuscation, consider rollup-plugin-obfuscator in CI/CD
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    // Minification settings
    minify: 'terser',
    terserOptions: {
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
    },
    // Chunk splitting for better obfuscation
    rollupOptions: {
      output: {
        manualChunks: undefined,
        // Randomize chunk names
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
    // Source maps disabled for production
    sourcemap: false,
  },
  // Prevent exposing environment variables
  define: {
    'process.env': {},
  },
})
