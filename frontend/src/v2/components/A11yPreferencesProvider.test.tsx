// frontend/src/v2/components/A11yPreferencesProvider.test.tsx
//
// Round 4 · A-1 / A-2 — 覆盖 OS 信号 / 用户覆盖 / DOM 副作用。

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  A11yPreferencesProvider,
  useA11yPreferences,
} from './A11yPreferencesProvider'

type MediaState = { reduce: boolean; more: boolean }

let mediaState: MediaState = { reduce: false, more: false }
const listeners = new Map<string, Set<(e: MediaQueryListEvent) => void>>()

function makeMQ(query: string): MediaQueryList {
  const isReduce = query === '(prefers-reduced-motion: reduce)'
  const isMore = query === '(prefers-contrast: more)'
  const match = () => (isReduce ? mediaState.reduce : isMore ? mediaState.more : false)
  const key = query
  if (!listeners.has(key)) listeners.set(key, new Set())
  const set = listeners.get(key)!
  return {
    matches: match(),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_ev: string, cb: (e: MediaQueryListEvent) => void) => {
      set.add(cb)
    },
    removeEventListener: (_ev: string, cb: (e: MediaQueryListEvent) => void) => {
      set.delete(cb)
    },
    dispatchEvent: () => true,
  } as MediaQueryList
}

function fireMediaChange(query: string, matches: boolean) {
  if (query === '(prefers-reduced-motion: reduce)') mediaState.reduce = matches
  if (query === '(prefers-contrast: more)') mediaState.more = matches
  listeners.get(query)?.forEach((cb) =>
    cb({ matches, media: query } as MediaQueryListEvent),
  )
}

beforeEach(() => {
  mediaState = { reduce: false, more: false }
  listeners.clear()
  localStorage.clear()
  document.documentElement.removeAttribute('data-reduced-motion')
  document.documentElement.removeAttribute('data-contrast')
  vi.stubGlobal('matchMedia', makeMQ)
})

function Probe() {
  const p = useA11yPreferences()
  return (
    <div>
      <span data-testid="rm">{String(p.effectiveReducedMotion)}</span>
      <span data-testid="hc">{String(p.effectiveHighContrast)}</span>
      <button onClick={() => p.setReducedMotion('on')}>rm-on</button>
      <button onClick={() => p.setReducedMotion('off')}>rm-off</button>
      <button onClick={() => p.setReducedMotion('auto')}>rm-auto</button>
      <button onClick={() => p.setHighContrast('on')}>hc-on</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <A11yPreferencesProvider>
      <Probe />
    </A11yPreferencesProvider>,
  )
}

describe('A11yPreferencesProvider', () => {
  it('默认跟随 OS (auto + 无 OS 信号) → 关闭', () => {
    renderProbe()
    expect(screen.getByTestId('rm').textContent).toBe('false')
    expect(screen.getByTestId('hc').textContent).toBe('false')
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull()
    expect(document.documentElement.getAttribute('data-contrast')).toBeNull()
  })

  it('OS reduced-motion 变 true → effective 跟随 + data-reduced-motion 置位', () => {
    renderProbe()
    act(() => {
      fireMediaChange('(prefers-reduced-motion: reduce)', true)
    })
    expect(screen.getByTestId('rm').textContent).toBe('true')
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true')
  })

  it('用户显式 on 覆盖 OS off', () => {
    renderProbe()
    act(() => {
      screen.getByText('rm-on').click()
    })
    expect(screen.getByTestId('rm').textContent).toBe('true')
    expect(localStorage.getItem('cubic3-v2-reduced-motion')).toBe('on')
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true')
  })

  it('用户显式 off 覆盖 OS on', () => {
    mediaState.reduce = true
    renderProbe()
    expect(screen.getByTestId('rm').textContent).toBe('true')
    act(() => {
      screen.getByText('rm-off').click()
    })
    expect(screen.getByTestId('rm').textContent).toBe('false')
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull()
  })

  it('auto 恢复 OS 值', () => {
    renderProbe()
    act(() => {
      screen.getByText('rm-on').click()
    })
    act(() => {
      screen.getByText('rm-auto').click()
    })
    expect(localStorage.getItem('cubic3-v2-reduced-motion')).toBe('auto')
    expect(screen.getByTestId('rm').textContent).toBe('false') // OS 仍为 off
  })

  it('high-contrast 覆盖链路与 rm 对称', () => {
    renderProbe()
    act(() => {
      screen.getByText('hc-on').click()
    })
    expect(screen.getByTestId('hc').textContent).toBe('true')
    expect(document.documentElement.getAttribute('data-contrast')).toBe('more')
  })
})
