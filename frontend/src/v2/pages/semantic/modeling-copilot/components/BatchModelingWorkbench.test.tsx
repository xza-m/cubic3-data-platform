import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SemanticBuildProject } from '@v2/api/semanticModelingWorkbench'
import { useApplySemanticAssetPackageAction } from '@v2/hooks/semanticModelingWorkbench'

const mockCreateProject = vi.hoisted(() => vi.fn())
const mockScanProject = vi.hoisted(() => vi.fn())
const mockApplyPackageAction = vi.hoisted(() => vi.fn())
const mockReadiness = vi.hoisted(() => vi.fn())

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
  useSemanticAssetPackageProposalReadiness: mockReadiness,
}))

vi.mock('@v2/hooks/datasources', () => ({
  useDatasources: () => ({ data: { items: [{ id: 1, name: 'dw 测试源' }] } }),
  useDatasourceDatabases: () => ({ data: ['dw', 'ods'], isLoading: false }),
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
      modeling_source: {
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        schema: null,
        table: 'dwd_learning_activity_df',
        evidence_bundle: {
          schema_snapshot: {
            snapshot_id: 'scan:1:dw:dwd_learning_activity_df',
            table: 'dwd_learning_activity_df',
            columns: [{ name: 'student_id', type: 'string' }],
            partitions: ['ds'],
          },
        },
      },
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
    mockReadiness.mockReturnValue({
      data: undefined,
      isFetching: false,
    })
  })

  it('通过 Build Project API 生成候选资产队列且不提供直接发布按钮', async () => {
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('业务主题'), { target: { value: '学情分析' } })
    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(screen.getByRole('heading', { name: '语义冷启动项目' })).toBeInTheDocument()
    expect(screen.queryByText('P2 批量 AI 建模助手')).not.toBeInTheDocument()
    expect(screen.queryByText('批量语义冷启动')).not.toBeInTheDocument()
    expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('学情分析语义冷启动项目')).toBeInTheDocument()
    expect(screen.getByText('候选资产队列')).toBeInTheDocument()
    expect(screen.getByText('1 个候选资产包')).toBeInTheDocument()
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: '学情分析',
      business_domain: '学情分析',
      scope: expect.objectContaining({
        batch_run_id: expect.stringMatching(/^run-/),
        source_count: 28,
        strategy: 'balanced',
        include_existing_semantics: true,
      }),
    })
    expect(mockScanProject).toHaveBeenCalledWith({ projectId: 'build-learning', body: { strategy: 'balanced' } })
    expect(screen.queryByRole('button', { name: /发布/ })).not.toBeInTheDocument()
  })

  it('选定真实数据源与库后下发扫描坐标', async () => {
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('数据源'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('数据库 / 项目'), { target: { value: 'dw' } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: '学情分析',
      business_domain: '学情分析',
      scope: expect.objectContaining({
        source_id: 1,
        database: 'dw',
      }),
    })
    expect(screen.queryByText(/未从表缓存扫描到候选/)).not.toBeInTheDocument()
  })

  it('选定真实数据源但扫描回退到非真实候选时提示同步目录', async () => {
    mockScanProject.mockResolvedValueOnce({
      ...scannedProject,
      asset_packages: [
        {
          ...scannedProject.asset_packages![0],
          modeling_source: {
            ...scannedProject.asset_packages![0].modeling_source,
            evidence_bundle: {
              schema_snapshot: {
                snapshot_id: 'workbench:dw:dwd_learning_activity_df',
                table: 'dwd_learning_activity_df',
                columns: [{ name: 'student_id', type: 'string' }],
                partitions: ['ds'],
              },
            },
          },
        },
      ],
    })
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('数据源'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('数据库 / 项目'), { target: { value: 'dw' } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(await screen.findByText(/未从表缓存扫描到候选/)).toBeInTheDocument()
  })

  it('候选队列按分诊桶分组展示', async () => {
    mockScanProject.mockResolvedValueOnce({
      ...scannedProject,
      asset_package_count: 2,
      risk_summary: { low: 1, medium: 0, high: 1 },
      asset_packages: [
        scannedProject.asset_packages![0],
        {
          ...scannedProject.asset_packages![0],
          id: 'build-learning:metric:dws-x',
          title: '学情分析指标候选',
          package_type: 'metric',
          source: 'dws_x_di',
          risk: 'high',
          status: 'needs_scope',
        },
      ],
    })
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(await screen.findByText('自动就绪')).toBeInTheDocument()
    expect(screen.getByText('待补口径 / 高风险')).toBeInTheDocument()
    expect(screen.getByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('学情分析指标候选')).toBeInTheDocument()
  })

  it('点击首个资产建设画布操作时回传 API 候选资产包', async () => {
    const onOpenBuilder = vi.fn()
    render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入资产建设画布' }))

    expect(onOpenBuilder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'build-learning:fact:dwd-learning-activity-df',
        project_id: 'build-learning',
        modeling_source: expect.objectContaining({
          source_id: 1,
          database: 'dw',
          table: 'dwd_learning_activity_df',
        }),
      }),
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

    fireEvent.change(screen.getByLabelText('业务主题'), { target: { value: '跨域经营' } })
    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('button', { name: '探索' }))
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(await screen.findByText('跨域经营语义冷启动项目')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    const regenerateButton = await screen.findByRole('button', { name: '退回重生成' })

    expect(regenerateButton).toBeDisabled()
    fireEvent.click(regenerateButton)

    expect(onOpenBuilder).not.toHaveBeenCalled()
  })

  it('长业务主题生成的计划标题和队列项标题具备换行保护', async () => {
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

    fireEvent.change(screen.getByLabelText('业务主题'), { target: { value: longDomain } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))

    const planTitle = await screen.findByText(`${longDomain}语义冷启动项目`)
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

    expect(screen.getByText('推荐范围')).toBeInTheDocument()
    expect(
      screen.getByText('未选真实数据源，使用演示数据生成候选队列；选定数据源与库后可扫描真实表。'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('推荐为空，使用手动选表模式')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    expect(screen.getByLabelText('推荐为空，使用手动选表模式')).toBeInTheDocument()
  })

  it('手动选表降级使用输入源表创建 Build Project 候选队列', async () => {
    const user = userEvent.setup()
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    expect(screen.queryByLabelText('手动源表名')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /高级设置/ }))
    await user.click(screen.getByLabelText('推荐为空，使用手动选表模式'))
    const manualSourceInput = screen.getByLabelText('手动源表名')

    expect(manualSourceInput).toBeEnabled()

    await user.clear(manualSourceInput)
    await user.type(manualSourceInput, 'ods_manual_fact_df')
    await user.click(screen.getByRole('button', { name: '生成候选队列' }))

    expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: '学情分析',
      business_domain: '学情分析',
      scope: expect.objectContaining({
        batch_run_id: expect.stringMatching(/^run-/),
        source_count: 18,
        strategy: 'balanced',
        include_existing_semantics: true,
        recommendation_empty: true,
        selected_sources: ['ods_manual_fact_df'],
      }),
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

    await user.click(screen.getByRole('button', { name: '生成候选队列' }))
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

    await user.click(screen.getByRole('button', { name: '生成候选队列' }))
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

    await user.click(screen.getByRole('button', { name: '生成候选队列' }))
    await screen.findByText('学情分析事实主题候选')
    await user.click(screen.getByRole('button', { name: '标记重复' }))

    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { action: 'mark_duplicate', reason: '用户在候选队列标记重复' } }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(await screen.findByText('重复候选')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标记重复' })).toBeDisabled()
  })

  it('候选资产操作失败时展示错误反馈', async () => {
    const user = userEvent.setup()
    const actionSpy = vi.fn((_variables, options) => {
      options?.onError?.(new Error('后端返回 500'))
    })
    vi.mocked(useApplySemanticAssetPackageAction).mockReturnValue({
      mutate: actionSpy,
      isPending: false,
    } as never)

    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '生成候选队列' }))
    await screen.findByText('学情分析事实主题候选')
    await user.click(screen.getByRole('button', { name: '暂缓' }))

    expect(await screen.findByText('后端返回 500')).toBeInTheDocument()
  })
})
