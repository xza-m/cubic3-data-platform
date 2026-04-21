import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  CubeStudioStepRail,
  type CubeStudioStepKey,
  type CubeStudioStepItem,
} from './CubeStudioStepRail'
import { CubeStudioInspector } from './CubeStudioInspector'
import type { CubeDraftPayload, CubeDetail, DomainSummary } from '@/api/semantic'
import type { SemanticValidationSummary } from '@/components/Semantic/workbench'

vi.mock('@/components/Semantic/workbench', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/components/Semantic/workbench')
  return {
    ...actual,
    SemanticInspectorPanel: ({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) => (
      <div data-testid={testId}><h2>{title}</h2><div>{children}</div></div>
    ),
  }
})

vi.mock('@/components/Semantic/SemanticObjectIdentity', () => ({
  SemanticObjectIdentity: ({ title, code }: { title: string; code: string }) => (
    <div data-testid="mock-object-identity">{title} ({code})</div>
  ),
}))

vi.mock('@/components/Semantic/SemanticStatusBlock', () => ({
  SemanticStatusBlock: ({ status }: { status: string }) => (
    <div data-testid="mock-status-block">{status}</div>
  ),
}))

vi.mock('@/components/Semantic/SemanticStructureSummary', () => ({
  SemanticStructureSummary: () => <div data-testid="mock-structure-summary" />,
}))

vi.mock('@/components/Semantic/SemanticIssueList', () => ({
  SemanticIssueList: () => <div data-testid="mock-issue-list" />,
}))

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

function buildSteps(doneKeys: CubeStudioStepKey[] = []): CubeStudioStepItem[] {
  return [
    { key: 'basic', title: '基本信息', description: '名称与描述', done: doneKeys.includes('basic') },
    { key: 'source', title: '来源绑定', description: '选择数据源', done: doneKeys.includes('source') },
    { key: 'structure', title: '结构校对', description: '维度/指标', done: doneKeys.includes('structure') },
    { key: 'rules', title: '规则确认', description: '过滤与分区', done: doneKeys.includes('rules') },
    { key: 'validation', title: '验证', description: '校验结果', done: doneKeys.includes('validation') },
    { key: 'publish', title: '发布', description: '保存到语义层', done: doneKeys.includes('publish') },
  ]
}

function buildSummary(overrides: Partial<SemanticValidationSummary> = {}): SemanticValidationSummary {
  return {
    status: 'idle',
    title: '待开始',
    description: '',
    blockers: [],
    hints: [],
    ...overrides,
  }
}

function buildDraft(overrides: Partial<CubeDraftPayload> = {}): CubeDraftPayload {
  return {
    name: 'test_cube',
    title: '测试 Cube',
    description: '测试描述',
    table: 'test_table',
    source_id: 1,
    dimensions: { dim_a: { title: '维度 A', type: 'string' } },
    measures: { metric_a: { title: '指标 A', type: 'count' } },
    ...overrides,
  }
}

/* ================================================================== */
/*  CubeStudioStepRail                                                */
/* ================================================================== */

describe('CubeStudioStepRail', () => {
  it('渲染标题和说明文案', () => {
    render(
      <CubeStudioStepRail activeStep="basic" steps={buildSteps()} onSelect={() => {}} />,
    )
    expect(screen.getByText('设计步骤')).toBeInTheDocument()
    expect(screen.getByText(/当前页只处理单 Cube 定义/)).toBeInTheDocument()
  })

  it('渲染所有步骤标题', () => {
    const steps = buildSteps()
    render(
      <CubeStudioStepRail activeStep="basic" steps={steps} onSelect={() => {}} />,
    )
    for (const s of steps) {
      expect(screen.getByText(s.title)).toBeInTheDocument()
    }
  })

  it('当前 active 步骤高亮显示', () => {
    render(
      <CubeStudioStepRail activeStep="source" steps={buildSteps()} onSelect={() => {}} />,
    )
    const activeBtn = screen.getByTestId('cube-studio-step-2')
    expect(activeBtn.className).toMatch(/accent/)
  })

  it('已完成步骤显示勾选图标', () => {
    render(
      <CubeStudioStepRail activeStep="structure" steps={buildSteps(['basic', 'source'])} onSelect={() => {}} />,
    )
    const doneBtn = screen.getByTestId('cube-studio-step-1')
    expect(doneBtn.querySelector('svg')).toBeTruthy()
    expect(doneBtn.textContent).not.toContain('1')
  })

  it('点击步骤按钮触发 onSelect', () => {
    const onSelect = vi.fn()
    render(
      <CubeStudioStepRail activeStep="basic" steps={buildSteps()} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByTestId('cube-studio-step-3'))
    expect(onSelect).toHaveBeenCalledWith('structure')
  })
})

/* ================================================================== */
/*  CubeStudioInspector                                               */
/* ================================================================== */

describe('CubeStudioInspector', () => {
  const baseProps = {
    selectedTable: null,
    selectedDomain: '',
    draft: null as CubeDraftPayload | null,
    cubeDetail: undefined as CubeDetail | undefined,
    domains: [] as DomainSummary[],
    draftDiff: null,
    summary: buildSummary(),
  }

  it('渲染面板标题「建模摘要」', () => {
    render(<CubeStudioInspector {...baseProps} />)
    expect(screen.getByText('建模摘要')).toBeInTheDocument()
  })

  it('有 draft 时显示来源上下文信息', () => {
    render(
      <CubeStudioInspector
        {...baseProps}
        selectedDataSource={{ id: 1, name: '数据源A', source_type: 'clickhouse', connection_config: {}, is_active: true, connection_status: 'ok', created_at: '2026-01-01', updated_at: '2026-01-02' }}
        selectedTable={{ table: 'orders' }}
        draft={buildDraft()}
      />,
    )
    expect(screen.getByText('来源上下文')).toBeInTheDocument()
    expect(screen.getByText('数据源A')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
  })

  it('有 draftDiff 时显示重生成差异块', () => {
    render(
      <CubeStudioInspector
        {...baseProps}
        draft={buildDraft()}
        draftDiff={{ dimensionDelta: 2, measureDelta: -1, tableChanged: true }}
      />,
    )
    expect(screen.getByText('重生成差异')).toBeInTheDocument()
    expect(screen.getByText(/维度 \+2/)).toBeInTheDocument()
    expect(screen.getByText(/物理表已变更/)).toBeInTheDocument()
  })
})
