// frontend/src/v2/components/ThemeProvider.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// Single source of truth for the v2 theme. (W3 · w3-theme-merge)
//
// 历史问题：AppShell 依据 useMyPreferences 写 <html class="dark">，
// 同时 ThemeProvider 自己维护 localStorage 状态写 dark 类。两路同时跑会
// 反复覆盖，且 LeftRail 的 toggle 不会回写到后端。
//
// 现在的合并策略：
//   1. 服务端用户偏好（B-back-1 / P21）是权威源；ThemeProvider 启动后
//      持续订阅 useMyPreferences。
//   2. 没拿到偏好（未登录、加载中、401）时退化使用 localStorage 缓存
//      与 prefers-color-scheme，让登录页和首屏不闪。
//   3. setTheme / toggle：在已认证状态下写入后端（mutation 内部自动
//      失效缓存），同时更新 localStorage 缓存以便下次冷启动复用。
//   4. AppShell 不再自己写 <html class="dark"> —— 唯一副作用收敛在此。
//
// 暴露 API 与之前兼容：
//   const { theme, effectiveTheme, setTheme, toggle } = useTheme()
//   - theme: 'light' | 'dark' | 'system'   （后端字段值）
//   - effectiveTheme: 'light' | 'dark'     （system 解析后实际生效）

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  useMyPreferences,
  useUpdateMyPreferences,
} from '@v2/hooks/userPreferences'
import type { ThemePreference } from '@v2/api/userPreferences'

export type Theme = ThemePreference // 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  effectiveTheme: EffectiveTheme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'cubic3-v2-theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // localStorage 是冷启动 / 未登录时的回退源
  const [localTheme, setLocalTheme] = useState<Theme>(readStoredTheme)

  // 服务端偏好（已经具备 retry/cache，不要重新请求）
  const { data: prefs } = useMyPreferences()
  const updatePrefs = useUpdateMyPreferences()

  // 服务端值优先；服务端未到达时使用 localStorage
  const theme: Theme = prefs?.theme ?? localTheme

  // 监听 system 变化，确保 'system' 模式下能跟随
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const effectiveTheme: EffectiveTheme = useMemo(() => {
    if (theme === 'light' || theme === 'dark') return theme
    return systemDark ? 'dark' : 'light'
  }, [theme, systemDark])

  // 唯一写 <html class="dark"> 的地方
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  // 服务端值变了 → 同步回 localStorage
  useEffect(() => {
    if (!prefs?.theme || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, prefs.theme)
    } catch {
      // ignore quota / private mode
    }
  }, [prefs?.theme])

  const persist = useCallback(
    (next: Theme) => {
      // 总是写 localStorage 缓存（用于冷启动）
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // ignore
        }
      }
      setLocalTheme(next)
      // 已经登录（prefs 已加载）才写回后端
      if (prefs) {
        updatePrefs.mutate({ theme: next })
      }
    },
    [prefs, updatePrefs],
  )

  const setTheme = useCallback((next: Theme) => persist(next), [persist])

  const toggle = useCallback(() => {
    // 把 'system' 视作当前实际生效值，再翻转到对立面
    const base: EffectiveTheme = theme === 'system' ? effectiveTheme : (theme as EffectiveTheme)
    persist(base === 'dark' ? 'light' : 'dark')
  }, [theme, effectiveTheme, persist])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, effectiveTheme, setTheme, toggle }),
    [theme, effectiveTheme, setTheme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
