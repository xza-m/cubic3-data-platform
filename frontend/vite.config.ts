import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:81'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xyflow/react') || id.includes('elkjs')) {
            return 'semantic-graph'
          }
          if (id.includes('react') || id.includes('scheduler') || id.includes('react-router-dom')) {
            return 'react-vendor'
          }
          if (id.includes('@tanstack/react-query') || id.includes('axios')) {
            return 'query-vendor'
          }
        },
      },
    },
  },
})
