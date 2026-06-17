import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  useApplySemanticAssetPackageAction: () => ({
    mutate: mockApplyPackageAction,
    isPending: false,
  }),
  useSemanticAssetPackageProposalReadiness: mockReadiness,
}))

vi.mock('@v2/hooks/datasources', () => ({
  useDatasources: () => ({ data: { items: [{ id: 1, name: 'dw 测试源' }] } }),
  useDatasourceDatabases: () => ({ data: ['dw', 'ods'], isLoading: false }),
}))

import BatchModelingAgent from './BatchModelingAgent'

function WorkbenchStateProbe() {
  const location = useLocation()
  return <pre data-testid="workbench-state">{JSON.stringify(location.state)}</pre>
}

describe('BatchModelingAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadiness.mockReturnValue({
      data: undefined,
      isFetching: false,
    })
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
    mockScanProject.mockResolvedValue({
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
    })
  })

  it('低风险 API 候选资产包直接进入建设画布并保留真实项目上下文', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<BatchModelingAgent />} />
          <Route
            path="/semantic/modeling-workbench/:projectId/candidate/:candidateId"
            element={<WorkbenchStateProbe />}
          />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入资产建设画布' }))

    expect(screen.queryByRole('dialog', { name: '学情分析事实主题候选' })).not.toBeInTheDocument()

    expect(JSON.parse((await screen.findByTestId('workbench-state')).textContent || '{}')).toEqual(
      expect.objectContaining({
        workbenchMode: 'batch',
        projectId: 'build-learning',
        candidateId: 'build-learning:fact:dwd-learning-activity-df',
        candidateTitle: '学情分析事实主题候选',
        target: 'semantic_center',
        source: 'dwd_learning_activity_df',
      }),
    )
  })

  it('需补范围候选资产包也直接进入建设画布，不再出现二次确认弹层', async () => {
    mockScanProject.mockResolvedValueOnce({
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'scanned',
      asset_package_count: 1,
      risk_summary: { low: 0, medium: 1, high: 0 },
      asset_packages: [
        {
          id: 'build-learning:metric:dws-learning-student-activity-di',
          project_id: 'build-learning',
          title: '学情分析活跃学生指标候选',
          package_type: 'metric',
          target: 'semantic_center',
          source: 'dws_learning_student_activity_di',
          grain: '按天、学生聚合',
          confidence: 0.79,
          risk: 'medium',
          status: 'needs_scope',
          primary_action: 'open_builder',
          evidence: ['存在多种活跃口径，需要业务 owner 确认。'],
        },
      ],
    })

    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<BatchModelingAgent />} />
          <Route
            path="/semantic/modeling-workbench/:projectId/candidate/:candidateId"
            element={<WorkbenchStateProbe />}
          />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成候选队列' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入资产建设画布' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse((await screen.findByTestId('workbench-state')).textContent || '{}')).toEqual(
      expect.objectContaining({
        workbenchMode: 'batch',
        projectId: 'build-learning',
        candidateId: 'build-learning:metric:dws-learning-student-activity-di',
        risk: 'medium',
        source: 'dws_learning_student_activity_di',
      }),
    )
  })

})
