import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  EntityLifecyclePanel,
  PreviewContent,
  StaleImpactPanel,
} from './OntologyWorkbench'

describe('OntologyWorkbench internal components', () => {
  it('PreviewContent 支持渲染治理、投影、联邦、执行和一致性摘要', () => {
    render(
      <PreviewContent
        payload={{
          governance: {
            target_name: 'gmv',
            target_type: 'metric',
            visibility: 'restricted',
            allowed_roles: ['finance', 'admin'],
          },
          projection: {
            projection: {
              targets: [
                {
                  target_name: 'orders',
                  match_reason: '命中订单分析实体',
                  join_path: 'customer -> orders',
                  source_cube: 'customers',
                  target_cube: 'orders',
                },
              ],
            },
          },
          links: {
            linked_measures: [
              {
                measure_ref: 'orders.gmv',
                cube_title: '订单分析',
              },
            ],
          },
          compiler: {
            pseudo_sql: 'select sum(total_amount) from orders',
          },
          consistency: {
            summary: {
              issue_count: 2,
            },
          },
        }}
      />,
    )

    expect(screen.getByText('权限挂点预览')).toBeInTheDocument()
    expect(screen.getByText('gmv')).toBeInTheDocument()
    expect(screen.getByText('finance, admin')).toBeInTheDocument()
    expect(screen.getByText('只读投影')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
    expect(screen.getByText('Join Path：customer -> orders')).toBeInTheDocument()
    expect(screen.getByText('customers → orders')).toBeInTheDocument()
    expect(screen.getByText('指标联邦追踪')).toBeInTheDocument()
    expect(screen.getByText('orders.gmv')).toBeInTheDocument()
    expect(screen.getByText('最小执行预览')).toBeInTheDocument()
    expect(screen.getByText('select sum(total_amount) from orders')).toBeInTheDocument()
    expect(screen.getByText('一致性摘要')).toBeInTheDocument()
    expect(screen.getByText('issue count：2')).toBeInTheDocument()
  })

  it('PreviewContent 在空投影和空联邦时展示兜底文案', () => {
    render(
      <PreviewContent
        payload={{
          governance: {
            target_name: '',
            target_type: '',
            visibility: '',
            allowed_roles: [],
          },
          projection: {
            projection: {
              targets: [],
            },
          },
          links: {
            linked_measures: [],
          },
          compiler: {
            reason: '暂无执行预览',
          },
        }}
      />,
    )

    expect(screen.getByText('未绑定目标')).toBeInTheDocument()
    expect(screen.getByText('未指定，默认仅 public 可匿名访问')).toBeInTheDocument()
    expect(screen.getByText('当前定义还没有找到明确的分析语义投影目标。')).toBeInTheDocument()
    expect(screen.getByText('当前业务指标尚未绑定分析 Measure。')).toBeInTheDocument()
  })

  it('StaleImpactPanel 支持渲染告警列表并触发定位', () => {
    const onSelect = vi.fn()
    render(
      <StaleImpactPanel
        items={[
          {
            entity_type: 'metric',
            entity_name: 'gmv',
            status: 'warning',
            reason: 'measure 绑定已失效',
            missing_refs: ['orders.gmv'],
          },
        ]}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText('stale / impact')).toBeInTheDocument()
    expect(screen.getByText('gmv')).toBeInTheDocument()
    expect(screen.getByText('缺失引用：orders.gmv')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '定位定义' }))
    expect(onSelect).toHaveBeenCalledWith('metric', 'gmv')
  })

  it('StaleImpactPanel 在无告警时展示空态', () => {
    render(<StaleImpactPanel items={[]} onSelect={vi.fn()} />)

    expect(screen.getByText('当前没有 stale 或 impact 告警，业务语义与分析层的一致性状态良好。')).toBeInTheDocument()
  })

  it('EntityLifecyclePanel 在新建状态下展示引导文案', () => {
    render(
      <EntityLifecyclePanel
        entityType="object"
        entityName={null}
        entityStatus="draft"
        historyItems={[]}
        lastPublishResult={null}
        lastPublishError={null}
        isImpactLoading={false}
        isHistoryLoading={false}
      />,
    )

    expect(screen.getByText('当前处于新建状态，保存后即可查看发布链、影响范围和历史记录。')).toBeInTheDocument()
  })

  it('EntityLifecyclePanel 支持渲染影响、发布和历史分支', () => {
    render(
      <EntityLifecyclePanel
        entityType="metric"
        entityName="gmv"
        entityStatus="active"
        impact={{
          linked_entity_count: 3,
          projection_status: 'warning',
          traceability: { status: 'ready' },
          issues: ['measure 未绑定'],
        } as any}
        historyItems={[
          {
            id: 'h-1',
            action: 'saved',
            entity_type: 'metric',
            entity_name: 'gmv',
            status: 'draft',
            summary: '保存业务指标 GMV',
            timestamp: '2026-04-15T09:00:00Z',
          },
        ]}
        lastPublishResult={{
          validation: {
            preview_status: 'blocked',
            issues: ['measure 未绑定'],
          },
        } as any}
        lastPublishError="发布前缺少 Measure 绑定"
        isImpactLoading={false}
        isHistoryLoading={false}
      />,
    )

    expect(screen.getByText('影响分析')).toBeInTheDocument()
    expect(screen.getByText('一致性状态：warning')).toBeInTheDocument()
    expect(screen.getByText('投影命中：3')).toBeInTheDocument()
    expect(screen.getByText('Traceability：已生成')).toBeInTheDocument()
    expect(screen.getAllByText('measure 未绑定').length).toBeGreaterThan(0)
    expect(screen.getByText('最近一次发布失败')).toBeInTheDocument()
    expect(screen.getByText('发布前缺少 Measure 绑定')).toBeInTheDocument()
    expect(screen.getByText('最近一次发布校验')).toBeInTheDocument()
    expect(screen.getByText('最近变更')).toBeInTheDocument()
    expect(screen.getByText('saved')).toBeInTheDocument()
    expect(screen.getByText('保存业务指标 GMV')).toBeInTheDocument()
  })

  it('EntityLifecyclePanel 支持影响与历史加载空态', () => {
    render(
      <EntityLifecyclePanel
        entityType="metric"
        entityName="gmv"
        entityStatus="draft"
        impact={undefined}
        historyItems={[]}
        lastPublishResult={null}
        lastPublishError={null}
        isImpactLoading={true}
        isHistoryLoading={true}
      />,
    )

    expect(screen.getByText('正在加载当前资产的影响分析...')).toBeInTheDocument()
    expect(screen.getByText('正在加载历史记录...')).toBeInTheDocument()
  })
})
