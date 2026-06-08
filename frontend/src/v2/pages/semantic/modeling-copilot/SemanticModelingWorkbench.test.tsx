import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const semanticBuildProjectRequests = vi.hoisted(() => [] as Array<string | undefined>)
const modelingAgentContexts = vi.hoisted(() => [] as unknown[])

vi.mock('@v2/hooks/semanticModelingWorkbench', () => ({
  useSemanticBuildProject: (projectId: string | undefined) => {
    semanticBuildProjectRequests.push(projectId)
    return {
      data: projectId === 'build-learning'
      ? {
          id: 'build-learning',
          name: '学情分析',
          business_domain: '学情分析',
          target: 'semantic_center',
          status: 'scanned',
          asset_package_count: 1,
          risk_summary: { low: 1 },
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
      : undefined,
      isLoading: false,
    }
  },
}))

vi.mock('./ModelingAgent', () => ({
  default: (props: { embeddedInWorkbench?: boolean; workbenchContext?: unknown }) => {
    modelingAgentContexts.push(props.workbenchContext)
    return <div>{props.embeddedInWorkbench ? '工作台内嵌资产建设画布' : '资产建设画布内容'}</div>
  },
}))

vi.mock('./BatchModelingAgent', () => ({
  default: () => <div>批量建设队列内容</div>,
}))

import SemanticModelingWorkbench from './SemanticModelingWorkbench'

function renderWorkbench(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/semantic/modeling-workbench" element={<SemanticModelingWorkbench />} />
        <Route path="/semantic/modeling-workbench/quick" element={<SemanticModelingWorkbench />} />
        <Route path="/semantic/modeling-workbench/:projectId/candidate/:candidateId" element={<SemanticModelingWorkbench />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SemanticModelingWorkbench', () => {
  it('renders batch project queue at the unified entry', () => {
    renderWorkbench('/semantic/modeling-workbench')

    expect(screen.getByRole('heading', { name: '语义建设工作台', hidden: true })).toBeInTheDocument()
    expect(screen.getByText('批量建设队列内容')).toBeInTheDocument()
  })

  it('renders quick mode with single asset builder', () => {
    modelingAgentContexts.length = 0
    renderWorkbench('/semantic/modeling-workbench/quick')

    expect(screen.getByText('快速单资产模式')).toBeInTheDocument()
    expect(screen.getByText('字段候选主画布')).toBeInTheDocument()
    expect(screen.getByText(/发布检查统一在右侧资产面板完成/)).toBeInTheDocument()
    expect(screen.queryByText('Builder 过渡工作区')).not.toBeInTheDocument()
    expect(screen.getByText('工作台内嵌资产建设画布')).toBeInTheDocument()
    expect(modelingAgentContexts).toEqual([null])
  })

  it('renders candidate context when opened from batch queue', () => {
    modelingAgentContexts.length = 0
    renderWorkbench('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', {
      workbenchMode: 'batch',
      projectId: 'batch-project',
      candidateId: 'fact-learning-activity',
      candidateTitle: '学情分析事实主题候选',
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      risk: 'low',
      evidence: ['表画像显示行为时间字段完整。'],
    })

    expect(screen.getByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('dwd_learning_activity_df')).toBeInTheDocument()
    expect(screen.getByText('表画像显示行为时间字段完整。')).toBeInTheDocument()
    expect(screen.getByText('字段候选主画布')).toBeInTheDocument()
    expect(screen.getByText(/发布检查统一在右侧资产面板完成/)).toBeInTheDocument()
    expect(screen.queryByText('Builder 过渡工作区')).not.toBeInTheDocument()
    expect(screen.getByText('工作台内嵌资产建设画布')).toBeInTheDocument()
    expect(modelingAgentContexts[0]).toMatchObject({
      candidateId: 'fact-learning-activity',
      source: 'dwd_learning_activity_df',
      target: 'semantic_center',
    })
  })

  it('falls back to route params when candidate state is invalid', () => {
    renderWorkbench('/semantic/modeling-workbench/project-a/candidate/candidate-a', { invalid: true })

    expect(screen.getAllByText('candidate-a').length).toBeGreaterThan(0)
    expect(screen.getByText('未知源表')).toBeInTheDocument()
    expect(screen.getByText('待确认粒度')).toBeInTheDocument()
    expect(screen.getByText('字段候选主画布')).toBeInTheDocument()
    expect(screen.queryByText('Builder 过渡工作区')).not.toBeInTheDocument()
  })

  it('candidate route can load candidate context from Build Project API', () => {
    semanticBuildProjectRequests.length = 0
    renderWorkbench(
      '/semantic/modeling-workbench/build-learning/candidate/build-learning%3Afact%3Adwd-learning-activity-df',
    )

    expect(semanticBuildProjectRequests).toContain('build-learning')
    expect(screen.getByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('dwd_learning_activity_df')).toBeInTheDocument()
    expect(screen.getByText('一条学习行为事件')).toBeInTheDocument()
    expect(screen.getByText('表画像显示行为时间字段完整。')).toBeInTheDocument()
  })

  it('does not show API candidate context when route project does not match', () => {
    semanticBuildProjectRequests.length = 0
    renderWorkbench(
      '/semantic/modeling-workbench/other-project/candidate/build-learning%3Afact%3Adwd-learning-activity-df',
    )

    expect(semanticBuildProjectRequests).toContain('other-project')
    expect(screen.queryByText('学情分析事实主题候选')).not.toBeInTheDocument()
    expect(screen.queryByText('dwd_learning_activity_df')).not.toBeInTheDocument()
    expect(screen.getByText('未知源表')).toBeInTheDocument()
  })
})
