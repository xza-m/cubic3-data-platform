// frontend/src/v2/components/A11yPreferencesProvider.tsx
//
// Round 4 · A-1 / A-2 — 可访问性偏好（动效减免 / 高对比）。
//
// 设计约束：
//   1. 默认跟随 OS：`prefers-reduced-motion: reduce` / `prefers-contrast: more`。
//   2. 用户可在 Settings 里显式覆盖 OS：
//        reducedMotion: 'auto' | 'on' | 'off'
//        highContrast:  'auto' | 'on' | 'off'
//      覆盖值写 localStorage（和主题一样的策略，不走 B-back 后端以免扩字段）。
//   3. 副作用统一收敛在此处：写 <html data-reduced-motion> / <html data-contrast>。
//      CSS 侧见 styles/tokens.css（@media + :root[data-*] 双通道）。
//   4. 读取侧暴露 `useA11yPreferences()`，供 Settings UI / 动画组件使用。
//
// 注意：本文件不读服务端偏好，保持"偏好即立即生效"的体验。未来若要跨设备同步，
// 再把 'reducedMotion' / 'highContrast' 字段加到 B-back 偏好 schema。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type OverrideMode = 'auto' | 'on' | 'off'

interface A11yPreferencesValue {
  reducedMotion: OverrideMode
  highContrast: OverrideMode
  effectiveReducedMotion: boolean
  effectiveHighContrast: boolean
  setReducedMotion: (next: OverrideMode) => void
  setHighContrast: (next: OverrideMode) => void
}

const Context = createContext<A11yPreferencesValue | null>(null)

const STORAGE_REDUCED_MOTION = 'cubic3-v2-reduced-motion'
const STORAGE_HIGH_CONTRAST = 'cubic3-v2-high-contrast'

function readStored(key: string): OverrideMode {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem(key)
  if (raw === 'on' || raw === 'off' || raw === 'auto') return raw
  return 'auto'
}

function writeStored(key: string, value: OverrideMode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

export function A11yPreferencesProvider({ children }: { children: ReactNode }) {
  const [reducedMotion, setReducedMotionState] = useState<OverrideMode>(() =>
    readStored(STORAGE_REDUCED_MOTION),
  )
  const [highContrast, setHighContrastState] = useState<OverrideMode>(() =>
    readStored(STORAGE_HIGH_CONTRAST),
  )

  const osReducedMotion = useMatchMedia('(prefers-reduced-motion: reduce)')
  const osHighContrast = useMatchMedia('(prefers-contrast: more)')

  const effectiveReducedMotion =
    reducedMotion === 'on' ? true : reducedMotion === 'off' ? false : osReducedMotion
  const effectiveHighContrast =
    highContrast === 'on' ? true : highContrast === 'off' ? false : osHighContrast

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (effectiveReducedMotion) {
      root.setAttribute('data-reduced-motion', 'true')
    } else {
      root.removeAttribute('data-reduced-motion')
    }
  }, [effectiveReducedMotion])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (effectiveHighContrast) {
      root.setAttribute('data-contrast', 'more')
    } else {
      root.removeAttribute('data-contrast')
    }
  }, [effectiveHighContrast])

  const setReducedMotion = useCallback((next: OverrideMode) => {
    writeStored(STORAGE_REDUCED_MOTION, next)
    setReducedMotionState(next)
  }, [])
  const setHighContrast = useCallback((next: OverrideMode) => {
    writeStored(STORAGE_HIGH_CONTRAST, next)
    setHighContrastState(next)
  }, [])

  const value = useMemo<A11yPreferencesValue>(
    () => ({
      reducedMotion,
      highContrast,
      effectiveReducedMotion,
      effectiveHighContrast,
      setReducedMotion,
      setHighContrast,
    }),
    [
      reducedMotion,
      highContrast,
      effectiveReducedMotion,
      effectiveHighContrast,
      setReducedMotion,
      setHighContrast,
    ],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useA11yPreferences(): A11yPreferencesValue {
  const ctx = useContext(Context)
  if (!ctx) {
    throw new Error('useA11yPreferences must be used within A11yPreferencesProvider')
  }
  return ctx
}
