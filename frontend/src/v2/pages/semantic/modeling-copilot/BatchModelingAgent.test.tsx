import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  useApplySemanticAssetPackageAction: () => ({
    mutate: mockApplyPackageAction,
    isPending: false,
  }),
}))

import BatchModelingAgent from './BatchModelingAgent'

function WorkbenchStateProbe() {
  const location = useLocation()
  return <pre data-testid="workbench-state">{JSON.stringify(location.state)}</pre>
}

describe('BatchModelingAgent', () => {
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

  it('选择 API 候选资产包后展示确认浮层并保留真实项目上下文', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入资产建设画布' }))

    const confirmation = screen.getByRole('dialog', { name: '学情分析事实主题候选' })

    expect(within(confirmation).getByText('已选择批量候选资产')).toBeInTheDocument()
    expect(within(confirmation).getByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(
      within(confirmation).getByText('进入语义建设工作台后继续完成字段候选、口径确认、沙盒校验和发布门禁。'),
    ).toBeInTheDocument()

    const link = within(confirmation).getByRole('link', { name: '打开语义建设工作台' })
    expect(link).toHaveAttribute(
      'href',
      '/semantic/modeling-workbench/build-learning/candidate/build-learning%3Afact%3Adwd-learning-activity-df',
    )
    expect(confirmation).toHaveFocus()

    fireEvent.click(link)

    expect(JSON.parse(screen.getByTestId('workbench-state').textContent || '{}')).toEqual(
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

})
