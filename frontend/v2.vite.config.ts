// frontend/v2.vite.config.ts
//
// 兼容入口（Round 3 cutover 期保留）。在 cutover 后所有 `dev:v2` / `build:v2` 与
// 默认 vite.config.ts 等价（共用同一根 index.html、main.tsx）。保留独立 file 仅是为
// 不破坏 W4.C E2E 子代理 / Makefile / CI 已经引用的命令名；下个迭代可删除。
import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      port: 3001,
    },
    build: {
      outDir: 'dist-v2',
    },
  }),
)
