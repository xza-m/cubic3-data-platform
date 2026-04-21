// frontend/src/v2/pages/settings/Settings.test.tsx
//
// Settings 页面单元测试
// - 渲染偏好表单
// - 切换主题
// - 点击保存 → mutation 以正确 patch 调用

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

// Mock hooks
vi.mock('@v2/hooks/userPreferences', () => ({
  useMyPreferences: vi.fn(),
  useUpdateMyPreferences: vi.fn(),
}))

// Mock AppShell (setBreadcrumbs 不做 DOM 操作)
vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({ setBreadcrumbs: vi.fn() }),
}))

import { useMyPreferences, useUpdateMyPreferences } from '@v2/hooks/userPreferences'
import Settings from './Settings'
import type { UserPreferences } from '@v2/api/userPreferences'

const mockUsePrefs = useMyPreferences as ReturnType<typeof vi.fn>
const mockUseUpdate = useUpdateMyPreferences as ReturnType<typeof vi.fn>

const DEFAULT_PREFS: UserPreferences = {
  user_id: 1,
  theme: 'system',
  default_landing: '/dashboard',
  list_page_size: 20,
  table_density: 'comfortable',
  extra: {},
  updated_at: null,
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<Settings />, { wrapper: Wrapper })
}

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loader while prefs are loading', () => {
    mockUsePrefs.mockReturnValue({ data: undefined, isLoading: true })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })

  it('renders all form controls when prefs loaded', () => {
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()

    expect(screen.getByRole('button', { name: '浅色' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '深色' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跟随系统' })).toBeInTheDocument()
    expect(screen.getByLabelText('默认落地页')).toBeInTheDocument()
    expect(screen.getByLabelText('列表默认条数')).toBeInTheDocument()
  })

  it('保存 button is disabled when form is pristine', () => {
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()
    expect(screen.getByRole('button', { name: '保存偏好' })).toBeDisabled()
  })

  it('enables 保存 after changing theme', () => {
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()

    // Switch from 'system' to 'dark'
    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    expect(screen.getByRole('button', { name: '保存偏好' })).not.toBeDisabled()
  })

  it('calls mutateAsync with correct patch on save', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ ...DEFAULT_PREFS, theme: 'dark' })
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync, isPending: false })

    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    fireEvent.click(screen.getByRole('button', { name: '保存偏好' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ theme: 'dark' })
    })
  })

  it('重置 reverts form to server snapshot', () => {
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()

    // Change theme
    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    expect(screen.getByRole('button', { name: '保存偏好' })).not.toBeDisabled()

    // Reset
    fireEvent.click(screen.getByRole('button', { name: '重置为上次保存' }))
    expect(screen.getByRole('button', { name: '保存偏好' })).toBeDisabled()
  })

  it('disables 保存 when default_landing is missing leading slash', () => {
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderSettings()

    const input = screen.getByLabelText('默认落地页')
    fireEvent.change(input, { target: { value: 'dashboard' } })

    expect(screen.getByRole('button', { name: '保存偏好' })).toBeDisabled()
  })
})
