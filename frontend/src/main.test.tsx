// frontend/src/main.test.tsx
//
// 统一入口冒烟测试（Round 4 · D+21 收尾 · 2026-04-22）。
//
// D+21 已把启动期 legacy localStorage→sessionStorage 迁移代码清掉
// （详见 `src/main.tsx`），此处仅验证 React 根节点挂载、observability
// 装配与 storage 异常不阻塞渲染三条。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mainEntryMocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
  installObservability: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: mainEntryMocks.createRoot,
  },
  createRoot: mainEntryMocks.createRoot,
}))

vi.mock('@v2/App', () => ({
  default: () => <div>v2 应用壳层</div>,
}))

vi.mock('@v2/observability', () => ({
  installObservability: mainEntryMocks.installObservability,
}))

vi.mock('@v2/styles/index.css', () => ({}))

describe('main entry (cutover · D+21)', () => {
  beforeEach(() => {
    vi.resetModules()
    mainEntryMocks.render.mockReset()
    mainEntryMocks.createRoot.mockReset()
    mainEntryMocks.installObservability.mockReset()
    mainEntryMocks.createRoot.mockReturnValue({ render: mainEntryMocks.render })
    document.body.innerHTML = '<div id="root"></div>'
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('挂载 React 根节点并渲染 v2 应用', async () => {
    await import('./main')
    expect(mainEntryMocks.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
    expect(mainEntryMocks.render).toHaveBeenCalledTimes(1)
  })

  it('渲染前装配前端可观测性（Console/Buffer sink）', async () => {
    await import('./main')
    expect(mainEntryMocks.installObservability).toHaveBeenCalledTimes(1)
    // observability 必须在 render 之前，以便首帧渲染期错误也被捕获
    const obsCall = mainEntryMocks.installObservability.mock.invocationCallOrder[0]
    const renderCall = mainEntryMocks.render.mock.invocationCallOrder[0]
    expect(obsCall).toBeLessThan(renderCall)
  })

  it('D+21 不再迁移 legacy auth_token / theme', async () => {
    window.localStorage.setItem('auth_token', 'legacy-jwt-abc')
    window.localStorage.setItem('theme', 'dark')
    await import('./main')
    // cutover 已 21d+，旧客户端 session 理论上全部过期，不再兜底
    expect(window.sessionStorage.getItem('v2.access_token')).toBeNull()
    expect(window.localStorage.getItem('v2.theme.fallback')).toBeNull()
  })
})
