// frontend/src/main.tsx
//
// 统一入口（Round 3 cutover · 2026-04-20）。
// 仅挂载 v2 应用。Legacy 代码归档于 src/legacy/，不再被引用。
//
// 启动期一次性迁移：
//  1. 老 localStorage.auth_token 复制到 sessionStorage.v2.access_token，
//     这样有未过期 cookie/token 的用户不会被踢回登录页。
//  2. 老 localStorage.theme 暂存为 v2.theme.fallback，由 ThemeProvider 兜底使用，
//     登录后 ThemeProvider 会自动 PUT /users/me/preferences 写回后端。
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@v2/App'
import { installObservability } from '@v2/observability'
import '@v2/styles/index.css'

function migrateLegacyClientState(): void {
  if (typeof window === 'undefined') return
  try {
    const legacyToken = window.localStorage.getItem('auth_token')
    const v2Token = window.sessionStorage.getItem('v2.access_token')
    if (legacyToken && !v2Token) {
      window.sessionStorage.setItem('v2.access_token', legacyToken)
    }
    const legacyTheme = window.localStorage.getItem('theme')
    if (legacyTheme && !window.localStorage.getItem('v2.theme.fallback')) {
      window.localStorage.setItem('v2.theme.fallback', legacyTheme)
    }
  } catch {
    // 隐私模式下 storage 抛错；忽略，不阻塞渲染
  }
}

migrateLegacyClientState()

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
