// frontend/src/main.tsx
//
// 统一入口（Round 3 cutover · 2026-04-20；Round 4 D+21 清理 · 2026-04-22）。
// 仅挂载 v2 应用。Legacy 源码与启动期迁移代码已随 D+21 清理一并移除
//   — 距 cutover 已 21d+，旧客户端 session 全部过期，无需再兜底。
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@v2/App'
import { installObservability } from '@v2/observability'
import '@v2/styles/index.css'

// 前端可观测性：Console + Buffer 默认装配；若 VITE_OBS_ENDPOINT 配置则附带 HttpSink。
// 必须在 ReactDOM render 之前安装，确保第一帧渲染期的错误也被捕获。
installObservability()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
