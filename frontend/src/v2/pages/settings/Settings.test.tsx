// frontend/src/v2/pages/settings/Settings.test.tsx
//
// Settings 页面单元测试
// - 渲染偏好表单
// - 切换主题
// - 点击保存 → mutation 以正确 patch 调用

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

// Mock hooks
vi.mock('@v2/hooks/userPreferences', () => ({
  useMyPreferences: vi.fn(),
  useUpdateMyPreferences: vi.fn(),
}))

vi.mock('@v2/hooks/agent-runtime', () => ({
  useAgentRuntimeStatus: vi.fn(),
  useStartAgentRuntimeProvider: vi.fn(),
  useTestAgentRuntimeProvider: vi.fn(),
  useRestartAgentRuntimeProvider: vi.fn(),
}))

// Mock AppShell (setBreadcrumbs 不做 DOM 操作)
vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({ setBreadcrumbs: vi.fn() }),
}))

import { useMyPreferences, useUpdateMyPreferences } from '@v2/hooks/userPreferences'
import {
  useAgentRuntimeStatus,
  useRestartAgentRuntimeProvider,
  useStartAgentRuntimeProvider,
  useTestAgentRuntimeProvider,
} from '@v2/hooks/agent-runtime'
import Settings from './Settings'
import type { UserPreferences } from '@v2/api/userPreferences'
import { A11yPreferencesProvider } from '@v2/components/A11yPreferencesProvider'

const mockUsePrefs = useMyPreferences as ReturnType<typeof vi.fn>
const mockUseUpdate = useUpdateMyPreferences as ReturnType<typeof vi.fn>
const mockUseRuntimeStatus = useAgentRuntimeStatus as ReturnType<typeof vi.fn>
const mockUseStartRuntime = useStartAgentRuntimeProvider as ReturnType<typeof vi.fn>
const mockUseTestRuntime = useTestAgentRuntimeProvider as ReturnType<typeof vi.fn>
const mockUseRestartRuntime = useRestartAgentRuntimeProvider as ReturnType<typeof vi.fn>
const startRuntimeProvider = vi.fn()
const testRuntimeProvider = vi.fn()
const restartRuntimeProvider = vi.fn()

const DEFAULT_PREFS: UserPreferences = {
  principal_id: 'internal:test:test_admin',
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
      <MemoryRouter>
        <A11yPreferencesProvider>{children}</A11yPreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<Settings />, { wrapper: Wrapper })
}

function renderAgentRuntimeSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <A11yPreferencesProvider>{children}</A11yPreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<Settings initialTab="agent-runtime" />, { wrapper: Wrapper })
}

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRuntimeStatus.mockReturnValue({
      data: {
        can_manage: true,
        providers: [
          {
            runtime_name: 'openai_compatible',
            label: 'OpenAI SDK / LLM API',
            configured: true,
            available: true,
            status: 'ready',
            message: 'OpenAI Runtime 已配置。',
            operations: ['test_connection'],
          },
          {
            runtime_name: 'codex_sdk',
            label: 'Codex SDK',
            configured: true,
            available: false,
            status: 'not_verified',
            message: 'Codex SDK 等待联通测试。',
            operations: ['test_connection', 'capabilities'],
            details: {
              provider: 'codex-sdk',
              transport: 'sdk',
              sandbox: 'read-only',
              project_root: '/tmp/cubic3',
              runtime_root: '/tmp/cubic3/.cubic3/agent-codex',
            },
          },
        ],
        action_bindings: [
          {
            action: 'semantic.modeling.review_proposal',
            default_runtime: 'codex_sdk',
            allowed_runtimes: ['codex_sdk'],
            expose_selector: false,
            requires_connection: true,
            reason: '语义 Proposal 复审固定走 Codex runtime。',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockUseStartRuntime.mockReturnValue({
      mutateAsync: startRuntimeProvider,
      isPending: false,
      isSuccess: false,
    })
    mockUseTestRuntime.mockReturnValue({
      mutateAsync: testRuntimeProvider,
      isPending: false,
      isSuccess: false,
    })
    mockUseRestartRuntime.mockReturnValue({
      mutateAsync: restartRuntimeProvider,
      isPending: false,
      isSuccess: false,
    })
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
    // A-1/A-2 加入 SegmentedControl 后有 3 处"跟随系统"（主题 / 减少动态效果 / 高对比）
    expect(screen.getAllByRole('button', { name: '跟随系统' })).toHaveLength(3)
    expect(screen.getByLabelText('默认落地页')).toBeInTheDocument()
    expect(screen.getByLabelText('列表默认条数')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '减少动态效果' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '高对比主题' })).toBeInTheDocument()
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

  it('shows platform agent runtime management tab and codex sdk test action', async () => {
    const user = userEvent.setup()
    testRuntimeProvider.mockResolvedValue({
      runtime_name: 'codex_sdk',
      label: 'Codex SDK',
      configured: true,
      available: true,
      status: 'ready',
      message: 'Codex SDK 联通测试通过。',
      operations: ['test_connection', 'capabilities'],
    })
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderAgentRuntimeSettings()

    expect(screen.getByRole('tablist', { name: '设置分类' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI Runtime' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'AI Runtime' })).toBeInTheDocument()
    expect(screen.getByText('OpenAI SDK / LLM API')).toBeInTheDocument()
    expect(screen.getByText('Codex SDK')).toBeInTheDocument()
    expect(screen.getAllByText('待连接测试').length).toBeGreaterThan(0)
    expect(screen.getAllByText('可调用状态').length).toBeGreaterThan(0)
    expect(screen.getByText('provider')).toBeInTheDocument()
    expect(screen.getByText('codex-sdk')).toBeInTheDocument()
    expect(screen.getByText('transport')).toBeInTheDocument()
    expect(screen.getByText('sdk')).toBeInTheDocument()
    expect(screen.queryByText('endpoint')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动 Codex' })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '测试连接' })[1])

    expect(testRuntimeProvider).toHaveBeenCalledWith('codex_sdk')
    expect(await screen.findByText('Codex SDK 联通测试通过。')).toBeInTheDocument()
  })

  it('disables runtime management operations for non-admin users', () => {
    mockUseRuntimeStatus.mockReturnValue({
      data: {
        can_manage: false,
        providers: [
          {
            runtime_name: 'codex_sdk',
            label: 'Codex SDK',
            configured: true,
            available: false,
            status: 'not_verified',
            message: 'Codex SDK 等待联通测试。',
            operations: ['test_connection'],
          },
        ],
        action_bindings: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderAgentRuntimeSettings()

    expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled()
    expect(screen.getByText('仅平台管理员可执行连接测试和运行态诊断。')).toBeInTheDocument()
  })

  it('keeps runtime tab usable while general preferences are loading', () => {
    mockUsePrefs.mockReturnValue({ data: undefined, isLoading: true })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderAgentRuntimeSettings()

    expect(screen.getByRole('tab', { name: 'AI Runtime' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Codex SDK')).toBeInTheDocument()
  })

  it('does not render the empty state when runtime status fails', () => {
    mockUseRuntimeStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderAgentRuntimeSettings()

    expect(screen.getByText('AI Runtime 状态加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无可用 runtime provider。')).not.toBeInTheDocument()
  })

  it('tolerates partial runtime snapshots without action bindings', () => {
    mockUseRuntimeStatus.mockReturnValue({
      data: {
        can_manage: true,
        providers: [
          {
            runtime_name: 'openai_compatible',
            label: 'OpenAI SDK / LLM API',
            configured: true,
            available: true,
            status: 'ready',
            message: 'OpenAI Runtime 已配置。',
            operations: ['test_connection'],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockUsePrefs.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    mockUseUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderAgentRuntimeSettings()

    expect(screen.getByText('OpenAI SDK / LLM API')).toBeInTheDocument()
  })
})
