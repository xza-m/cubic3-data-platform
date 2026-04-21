// frontend/src/main.test.tsx
//
// 统一入口冒烟测试。验证：
//  1. 启动期把 localStorage.auth_token 迁移到 sessionStorage.v2.access_token；
//  2. 启动期把 localStorage.theme 暂存为 v2.theme.fallback；
//  3. 调用 ReactDOM.createRoot + render，挂载到 #root。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mainEntryMocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
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

vi.mock('@v2/styles/index.css', () => ({}))

describe('main entry (cutover)', () => {
  beforeEach(() => {
    vi.resetModules()
    mainEntryMocks.render.mockReset()
    mainEntryMocks.createRoot.mockReset()
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

  it('迁移 legacy auth_token 到 sessionStorage.v2.access_token', async () => {
    window.localStorage.setItem('auth_token', 'legacy-jwt-abc')
    await import('./main')
    expect(window.sessionStorage.getItem('v2.access_token')).toBe('legacy-jwt-abc')
  })

  it('已存在 v2 token 时不覆盖', async () => {
    window.localStorage.setItem('auth_token', 'legacy-jwt-abc')
    window.sessionStorage.setItem('v2.access_token', 'fresh-jwt')
    await import('./main')
    expect(window.sessionStorage.getItem('v2.access_token')).toBe('fresh-jwt')
  })

  it('暂存 legacy theme 为 v2.theme.fallback', async () => {
    window.localStorage.setItem('theme', 'dark')
    await import('./main')
    expect(window.localStorage.getItem('v2.theme.fallback')).toBe('dark')
  })

  it('storage 抛错时不阻塞渲染', async () => {
    const original = window.localStorage.getItem
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('storage disabled')
        },
        setItem: () => {
          throw new Error('storage disabled')
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    })
    await import('./main')
    expect(mainEntryMocks.createRoot).toHaveBeenCalled()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: original } as unknown as Storage,
    })
  })
})
