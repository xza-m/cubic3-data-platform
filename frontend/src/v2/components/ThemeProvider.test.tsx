// frontend/src/v2/components/ThemeProvider.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@v2/hooks/userPreferences', () => ({
  useMyPreferences: vi.fn(),
  useUpdateMyPreferences: vi.fn(),
}))

import {
  useMyPreferences,
  useUpdateMyPreferences,
} from '@v2/hooks/userPreferences'
import { ThemeProvider, useTheme } from './ThemeProvider'

const mockGet = useMyPreferences as ReturnType<typeof vi.fn>
const mockPut = useUpdateMyPreferences as ReturnType<typeof vi.fn>

function Probe() {
  const { theme, effectiveTheme, setTheme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button onClick={() => setTheme('light')}>set-light</button>
      <button onClick={() => setTheme('dark')}>set-dark</button>
      <button onClick={() => setTheme('system')}>set-system</button>
      <button onClick={toggle}>toggle</button>
    </div>
  )
}

const STORAGE_KEY = 'cubic3-v2-theme'

describe('ThemeProvider', () => {
  let mqHandlers: Array<(e: MediaQueryListEvent) => void> = []
  const mq = {
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn((_: string, h: (e: MediaQueryListEvent) => void) => {
      mqHandlers.push(h)
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }

  beforeEach(() => {
    mqHandlers = []
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(mq),
    })
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockGet.mockReturnValue({ data: undefined })
    mockPut.mockReturnValue({ mutate: vi.fn() })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to system when no storage and no prefs', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('effective')).toHaveTextContent('light') // mq.matches=false
  })

  it('reads light theme from localStorage when no prefs', () => {
    window.localStorage.setItem(STORAGE_KEY, 'light')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
  })

  it('reads dark theme from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('rejects unknown localStorage value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'garbage')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('system')
  })

  it('prefers server theme over localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'light')
    mockGet.mockReturnValue({
      data: { principal_id: 'internal:test:test_admin', theme: 'dark', default_landing: '/', list_page_size: 20, table_density: 'comfortable', extra: {}, updated_at: null },
    })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('respects system dark via matchMedia', () => {
    mq.matches = true
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    mq.matches = false
  })

  it('updates effectiveTheme when system change handler fires', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    act(() => {
      for (const h of mqHandlers) {
        h({ matches: true } as MediaQueryListEvent)
      }
    })
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
  })

  it('setTheme updates state, writes localStorage, does NOT call mutate when no prefs', () => {
    const mutate = vi.fn()
    mockPut.mockReturnValue({ mutate })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByText('set-dark'))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('setTheme calls mutate when prefs are loaded', () => {
    const mutate = vi.fn()
    mockGet.mockReturnValue({
      data: { principal_id: 'internal:test:test_admin', theme: 'light', default_landing: '/', list_page_size: 20, table_density: 'comfortable', extra: {}, updated_at: null },
    })
    mockPut.mockReturnValue({ mutate })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByText('set-dark'))
    expect(mutate).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('toggle flips between dark and light', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('toggle from system uses effectiveTheme as base', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('useTheme throws outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/within ThemeProvider/)
    spy.mockRestore()
  })

  it('persist tolerates localStorage errors', () => {
    const mutate = vi.fn()
    mockPut.mockReturnValue({ mutate })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(() => fireEvent.click(screen.getByText('set-light'))).not.toThrow()
    setItem.mockRestore()
  })

  it('server-prefs sync tolerates localStorage errors', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    mockGet.mockReturnValue({
      data: { principal_id: 'internal:test:test_admin', theme: 'light', default_landing: '/', list_page_size: 20, table_density: 'comfortable', extra: {}, updated_at: null },
    })
    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow()
    setItem.mockRestore()
  })
})
