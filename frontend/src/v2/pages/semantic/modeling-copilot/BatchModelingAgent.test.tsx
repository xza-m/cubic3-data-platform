import { fireEvent, render, screen } from '@testing-library/react'
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

    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
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

})
