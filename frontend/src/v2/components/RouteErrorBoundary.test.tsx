// frontend/src/v2/components/RouteErrorBoundary.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
let routeError: unknown

vi.mock('react-router-dom', () => ({
  useRouteError: () => routeError,
  useNavigate: () => mockNavigate,
  isRouteErrorResponse: (e: unknown) =>
    typeof e === 'object' && e !== null && 'status' in (e as Record<string, unknown>),
}))

import { RouteErrorBoundary } from './RouteErrorBoundary'

beforeEach(() => {
  mockNavigate.mockReset()
  routeError = undefined
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RouteErrorBoundary', () => {
  it('renders generic title for thrown Error and reports it', () => {
    routeError = new Error('runtime-bad')
    render(<RouteErrorBoundary />)
    expect(screen.getByText('页面加载失败')).toBeInTheDocument()
    expect(screen.getByText('runtime-bad')).toBeInTheDocument()
  })

  it('renders 404 title for Response 404', () => {
    routeError = { status: 404, data: undefined }
    render(<RouteErrorBoundary />)
    expect(screen.getByText('页面不存在')).toBeInTheDocument()
  })

  it('renders 403 title for Response 403', () => {
    routeError = { status: 403, data: undefined }
    render(<RouteErrorBoundary />)
    expect(screen.getByText('无访问权限')).toBeInTheDocument()
  })

  it('uses data.message for other Response status', () => {
    routeError = { status: 500, data: { message: 'server-down' } }
    render(<RouteErrorBoundary />)
    expect(screen.getByText('页面加载失败')).toBeInTheDocument()
    expect(screen.getByText('server-down')).toBeInTheDocument()
  })

  it('uses default desc when other Response status has no message', () => {
    routeError = { status: 500, data: undefined }
    render(<RouteErrorBoundary />)
    expect(screen.getByText('发生了意外错误，请重试或返回上一页。')).toBeInTheDocument()
  })

  it('falls back to default text when error is plain', () => {
    routeError = 'string-error'
    render(<RouteErrorBoundary />)
    expect(screen.getByText('页面加载失败')).toBeInTheDocument()
    expect(screen.getByText('发生了意外错误，请重试或返回上一页。')).toBeInTheDocument()
  })

  it('back button calls navigate(-1)', () => {
    routeError = new Error('x')
    render(<RouteErrorBoundary />)
    fireEvent.click(screen.getByText('回到上一页'))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('retry button calls window.location.reload', () => {
    routeError = new Error('x')
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    render(<RouteErrorBoundary />)
    fireEvent.click(screen.getByText('重试'))
    expect(reload).toHaveBeenCalled()
  })

  it('renders error id', () => {
    routeError = new Error('x')
    render(<RouteErrorBoundary />)
    expect(screen.getByText(/ERR-/)).toBeInTheDocument()
  })
})
