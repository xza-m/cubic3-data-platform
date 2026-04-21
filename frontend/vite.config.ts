// frontend/vite.config.ts
//
// 统一构建配置（Round 3 cutover · 2026-04-20）。
// 入口为 frontend/index.html → /src/main.tsx → @v2/App。
// Legacy 仍可以通过 dev:legacy / build:legacy 跑（参见 v2.vite.config.ts 兼容入口
// 与 src/legacy/）但不进入正式产物。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:81'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @  → legacy（归档目录）。保留是为了避免 src/legacy/ 内部互相 @/ 引用断裂；
      // 新代码不应再使用 @/，应改为 @v2/。
      '@': path.resolve(__dirname, './src/legacy'),
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
