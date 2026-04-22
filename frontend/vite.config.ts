// frontend/vite.config.ts
//
// 统一构建配置（Round 3 cutover · 2026-04-20，Round 4 D+21 清理 2026-04-22）。
// 入口为 frontend/index.html → /src/main.tsx → @v2/App。
// `v2.vite.config.ts` 为兼容入口（不同端口 / outDir），仅 CI/deploy 沿用；新代码直接改本文件。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:81'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@v2': path.resolve(__dirname, './src/v2'),
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
          if (id.includes('lucide-react')) {
            return 'icons'
          }
        },
      },
    },
  },
})
