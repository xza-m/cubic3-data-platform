import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SemanticBuildProject } from '@v2/api/semanticModelingWorkbench'
import { useApplySemanticAssetPackageAction } from '@v2/hooks/semanticModelingWorkbench'

const mockCreateProject = vi.hoisted(() => vi.fn())
const mockScanProject = vi.hoisted(() => vi.fn())
const mockApplyPackageAction = vi.hoisted(() => vi.fn())

vi.mock('@v2/hooks/semanticModelingWorkbench', () => ({
  useCreateSemanticBuildProject: () => ({
    mutateAsync: mockCreateProject,
    isPending: false,
  }),
  useScanSemanticBuildProject: () => ({
    mutateAsync: mockScanProject,
    isPending: false,
  }),
  useApplySemanticAssetPackageAction: mockApplyPackageAction,
}))

import { BatchModelingWorkbench } from './BatchModelingWorkbench'

const scannedProject: SemanticBuildProject = {
  id: 'build-learning',
  name: '学情分析',
  business_domain: '学情分析',
  target: 'semantic_center',
  status: 'scanned',
  asset_package_count: 1,
  risk_summary: { low: 1, medium: 0, high: 0 },
  asset_packages: [
    {
      id: 'build-learning:fact:dwd-learning-activity-df',
      project_id: 'build-learning',
      title: '学情分析事实主题候选',
      package_type: 'fact',
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      confidence: 0.88,
      risk: 'low',
      status: 'ready_for_review',
      primary_action: 'open_builder',
      evidence: ['表画像显示行为时间字段完整。'],
    },
  ],
}

describe('BatchModelingWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateProject.mockResolvedValue({
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'draft',
      asset_package_count: 0,
      risk_summary: { low: 0, medium: 0, high: 0 },
      asset_packages: [],
    })
    mockScanProject.mockResolvedValue(scannedProject)
    mockApplyPackageAction.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
  })

  it('通过 Build Project API 生成候选资产队列且不提供直接发布按钮', async () => {
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('业务域'), { target: { value: '学情分析' } })
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    expect(screen.getByRole('heading', { name: '批量语义建设' })).toBeInTheDocument()
    expect(screen.queryByText('P2 批量 AI 建模助手')).not.toBeInTheDocument()
    expect(screen.queryByText('批量语义冷启动')).not.toBeInTheDocument()
    expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('学情分析批量语义建设')).toBeInTheDocument()
    expect(screen.getByText('候选资产队列')).toBeInTheDocument()
    expect(screen.getByText('1 个候选资产包')).toBeInTheDocument()
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: '学情分析',
      business_domain: '学情分析',
      scope: {
        source_count: 28,
        strategy: 'balanced',
        include_existing_semantics: true,
      },
    })
    expect(mockScanProject).toHaveBeenCalledWith({ projectId: 'build-learning', body: { strategy: 'balanced' } })
    expect(screen.queryByRole('button', { name: /发布/ })).not.toBeInTheDocument()
  })

  it('点击首个资产建设画布操作时回传 API 候选资产包', async () => {
    const onOpenBuilder = vi.fn()
    render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入资产建设画布' }))

    expect(onOpenBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'build-learning:fact:dwd-learning-activity-df', project_id: 'build-learning' }),
    )
  })

  it('探索策略或高候选表数量时展示高风险与需补范围状态', async () => {
    mockScanProject.mockResolvedValueOnce({
      ...scannedProject,
      asset_package_count: 1,
      risk_summary: { low: 0, medium: 0, high: 1 },
      asset_packages: [
        {
          ...scannedProject.asset_packages![0],
          risk: 'high',
          status: 'needs_scope',
          primary_action: 'open_builder',
        },
      ],
    })
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('业务域'), { target: { value: '跨域经营' } })
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('button', { name: '探索' }))
    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    expect(await screen.findByText('跨域经营批量语义建设')).toBeInTheDocument()
    expect((await screen.findAllByText('高风险')).length).toBeGreaterThan(0)
    expect(screen.getByText('需补范围')).toBeInTheDocument()
  })

  it('高风险重生成候选不能打开资产建设画布', async () => {
    const onOpenBuilder = vi.fn()
    mockScanProject.mockResolvedValueOnce({
      ...scannedProject,
      asset_packages: [
        {
          ...scannedProject.asset_packages![0],
          risk: 'high',
          status: 'high_risk',
          primary_action: 'regenerate',
        },
      ],
    })
    render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    const regenerateButton = await screen.findByRole('button', { name: '退回重生成' })

    expect(regenerateButton).toBeDisabled()
    fireEvent.click(regenerateButton)

    expect(onOpenBuilder).not.toHaveBeenCalled()
  })

  it('长业务域生成的计划标题和队列项标题具备换行保护', async () => {
    const longDomain = 'ExtremelyLongNoSpaceBusinessDomainForSemanticColdStartWorkbenchOverflowProtection'
    mockScanProject.mockResolvedValueOnce({
      ...scannedProject,
      name: longDomain,
      business_domain: longDomain,
      asset_packages: [
        {
          ...scannedProject.asset_packages![0],
          title: `${longDomain}事实主题候选`,
        },
      ],
    })
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('业务域'), { target: { value: longDomain } })
    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    const planTitle = await screen.findByText(`${longDomain}批量语义建设`)
    const itemTitle = await screen.findByText(`${longDomain}事实主题候选`)
    const planHeading = planTitle.closest('h3')
    const itemHeading = itemTitle.closest('h3')

    expect(planTitle).toBeInTheDocument()
    expect(itemTitle).toBeInTheDocument()
    expect(planHeading?.className).toContain('break-words')
    expect(itemHeading?.className).toContain('break-words')
  })

  it('在推荐为空时展示手动选表降级路径', async () => {
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    expect(screen.getByText('推荐建设范围')).toBeInTheDocument()
    expect(screen.getByText('若暂无自动推荐，可手动选择源表生成最小候选队列。')).toBeInTheDocument()
    expect(screen.getByLabelText('推荐为空，使用手动选表模式')).toBeInTheDocument()
  })

  it('手动选表降级使用输入源表创建 Build Project 候选队列', async () => {
    const user = userEvent.setup()
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    expect(screen.queryByLabelText('手动源表名')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('推荐为空，使用手动选表模式'))
    const manualSourceInput = screen.getByLabelText('手动源表名')

    expect(manualSourceInput).toBeEnabled()

    await user.clear(manualSourceInput)
    await user.type(manualSourceInput, 'ods_manual_fact_df')
    await user.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: '学情分析',
      business_domain: '学情分析',
      scope: {
        source_count: 18,
        strategy: 'balanced',
        include_existing_semantics: true,
        recommendation_empty: true,
        selected_sources: ['ods_manual_fact_df'],
      },
    })
  })

  it('候选资产支持暂缓和标记重复动作', async () => {
    const user = userEvent.setup()
    const onOpenBuilder = vi.fn()
    const actionSpy = vi.fn()
    vi.mocked(useApplySemanticAssetPackageAction).mockReturnValue({
      mutate: actionSpy,
      isPending: false,
    } as never)

    render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

    await user.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    await screen.findByText('候选资产队列')
    await user.click(screen.getAllByRole('button', { name: '暂缓' })[0])
    await user.click(screen.getAllByRole('button', { name: '标记重复' })[0])

    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { action: 'defer', reason: '用户在候选队列暂缓' } }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { action: 'mark_duplicate', reason: '用户在候选队列标记重复' } }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('暂缓动作成功后即时更新队列状态并禁用重复暂缓', async () => {
    const user = userEvent.setup()
    const actionSpy = vi.fn((_variables, options) => {
      options?.onSuccess?.({
        ...scannedProject.asset_packages![0],
        status: 'deferred',
      })
    })
    vi.mocked(useApplySemanticAssetPackageAction).mockReturnValue({
      mutate: actionSpy,
      isPending: false,
    } as never)

    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    await screen.findByText('学情分析事实主题候选')
    await user.click(screen.getByRole('button', { name: '暂缓' }))

    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { action: 'defer', reason: '用户在候选队列暂缓' } }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(await screen.findByText('已暂缓')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂缓' })).toBeDisabled()
  })

  it('标记重复成功后显示重复候选并禁用重复标记', async () => {
    const user = userEvent.setup()
    const actionSpy = vi.fn((_variables, options) => {
      options?.onSuccess?.({
        ...scannedProject.asset_packages![0],
        status: 'duplicate_candidate',
      })
    })
    vi.mocked(useApplySemanticAssetPackageAction).mockReturnValue({
      mutate: actionSpy,
      isPending: false,
    } as never)

    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    await screen.findByText('学情分析事实主题候选')
    await user.click(screen.getByRole('button', { name: '标记重复' }))

    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { action: 'mark_duplicate', reason: '用户在候选队列标记重复' } }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(await screen.findByText('重复候选')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标记重复' })).toBeDisabled()
  })
})
