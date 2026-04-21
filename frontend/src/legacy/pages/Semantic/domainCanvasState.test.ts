import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { DomainDetail, CubeSummary } from '@/api/semantic'
import { buildDomainValidationSummary, serializeDomainGraph } from './domainCanvasState'

function makeNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
  }
}

function makeCube(name: string, status: string = 'active'): CubeSummary {
  return {
    name,
    title: name,
    description: '',
    table: `${name}_table`,
    in_domain: true,
    domain_id: 'semantic-domain',
    domain_name: '语义领域',
    domain_ids: ['semantic-domain'],
    domains: [
      {
        id: 'semantic-domain',
        code: 'semantic-domain',
        name: '语义领域',
      },
    ],
    domain_count: 1,
    dimensions: [],
    measures: [],
    dimension_count: 2,
    measure_count: 1,
    status,
  }
}

function makeDomain(overrides: Partial<DomainDetail> = {}): DomainDetail {
  return {
    code: 'semantic-domain',
    name: '语义领域',
    status: 'draft',
    cubes: [],
    joins: [],
    ...overrides,
  }
}

describe('domainCanvasState', () => {
  it('稳定序列化节点和连线，避免脏状态误判', () => {
    const nodes = [makeNode('cube_b'), makeNode('cube_a')]
    const edges: Edge[] = [
      {
        id: 'cube_b__cube_a',
        source: 'cube_b',
        target: 'cube_a',
        data: {
          relationship: 'many_to_one',
          join_type: 'left',
          source_field: 'id',
          target_field: 'id',
          aggregation_strategy: 'sum',
          description: '事实到维度',
        },
      },
    ]

    expect(serializeDomainGraph(nodes, edges)).toBe(
      JSON.stringify({
        nodes: ['cube_a', 'cube_b'],
        edges: [
          {
            id: 'cube_b__cube_a',
            source: 'cube_b',
            target: 'cube_a',
            relationship: 'many_to_one',
            joinType: 'left',
            aggregationStrategy: 'sum',
            sourceField: 'id',
            targetField: 'id',
            description: '事实到维度',
          },
        ],
      }),
    )
  })

  it('在存在阻塞项时返回 blocked 摘要', () => {
    const summary = buildDomainValidationSummary(
      makeDomain({ cubes: ['draft_cube'] }),
      [makeNode('draft_cube')],
      [],
      [makeCube('draft_cube', 'draft')],
      true,
      false,
    )

    expect(summary.status).toBe('blocked')
    expect(summary.blockers).toContain('Cube draft_cube 当前为 草稿，领域发布只接受活跃 Cube。')
    expect(summary.stats?.find((item) => item.label === '待处理阻塞项')?.value).toBe(1)
  })

  it('在发布中时返回 publishing 摘要', () => {
    const summary = buildDomainValidationSummary(
      makeDomain({ cubes: ['active_cube'], status: 'active' }),
      [makeNode('active_cube')],
      [],
      [makeCube('active_cube', 'active')],
      false,
      true,
    )

    expect(summary.status).toBe('publishing')
    expect(summary.title).toContain('领域发布中')
  })
})
