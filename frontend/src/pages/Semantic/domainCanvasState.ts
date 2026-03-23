import type { Edge, Node } from '@xyflow/react'
import type { CubeSummary, DomainCanvasData } from '@/api/semantic'
import type { SemanticPageStatus, SemanticValidationSummary } from '@/components/Semantic/workbench'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

export function serializeDomainGraph(nodes: Node[], edges: Edge[]) {
  return JSON.stringify({
    nodes: [...nodes]
      .map((node) => node.id)
      .sort(),
    edges: [...edges]
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationship: String((edge.data as any)?.relationship || ''),
        joinType: String((edge.data as any)?.join_type || ''),
        aggregationStrategy: String((edge.data as any)?.aggregation_strategy || ''),
        sourceField: String((edge.data as any)?.source_field || ''),
        targetField: String((edge.data as any)?.target_field || ''),
        description: String((edge.data as any)?.description || ''),
      }))
      .sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)),
  })
}

export function buildDomainValidationSummary(
  domain: DomainCanvasData['domain'] | undefined,
  nodes: Node[],
  edges: Edge[],
  libraryCubes: CubeSummary[],
  hasDirtyChanges: boolean,
  isPublishing: boolean,
): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []

  if (nodes.length === 0) {
    blockers.push('当前领域还没有任何 Cube，至少需要拖入 1 个活跃 Cube。')
  }

  const cubeStatusMap = new Map(libraryCubes.map((cube) => [cube.name, cube.status || 'draft']))
  for (const node of nodes) {
    const status = cubeStatusMap.get(node.id)
    if (status && status !== 'active') {
      blockers.push(`Cube ${node.id} 当前为 ${getSemanticStatusLabel(status)}，领域发布只接受活跃 Cube。`)
    }
  }

  for (const edge of edges) {
    const sourceField = String((edge.data as any)?.source_field || '')
    const targetField = String((edge.data as any)?.target_field || '')
    const relationship = String((edge.data as any)?.relationship || 'N:1')
    const aggregationStrategy = String((edge.data as any)?.aggregation_strategy || 'none')
    if (!sourceField || !targetField) {
      blockers.push(`Join ${edge.source} -> ${edge.target} 缺少字段绑定。`)
    }
    if (relationship === '1:N' && aggregationStrategy === 'none') {
      blockers.push(`Join ${edge.source} -> ${edge.target} 为 1:N，必须指定聚合策略。`)
    }
  }

  if (edges.length === 0 && nodes.length > 1) {
    hints.push('当前已入域多个 Cube，但还没有定义任何 Join。')
  }
  if (domain?.status !== 'active') {
    hints.push('当前领域仍为草稿，只有发布后才会进入默认多 Cube 查询链路。')
  }
  if (hasDirtyChanges) {
    hints.push('存在未发布变更，离开页面前会触发提醒。')
  }

  const status: SemanticPageStatus = isPublishing
    ? 'publishing'
    : blockers.length > 0
      ? 'blocked'
      : hasDirtyChanges
        ? 'dirty'
        : 'ready'

  return {
    status,
    title: status === 'blocked'
      ? '当前画布还不能发布'
      : status === 'dirty'
        ? '关系编排已更新，等待发布'
        : status === 'publishing'
          ? '领域发布中'
          : '领域画布已就绪',
    description: status === 'blocked'
      ? '先修复阻塞项，再执行领域发布。'
      : status === 'dirty'
        ? '请确认 Join 字段、基数和聚合策略后再发布。'
        : status === 'publishing'
          ? '系统正在同步当前关系图和领域元数据。'
          : '当前结构可继续补充，也可直接进入发布流程。',
    blockers,
    hints,
    stats: [
      { label: '领域状态', value: getSemanticStatusLabel(domain?.status || 'draft') },
      { label: '已入域 Cube', value: nodes.length },
      { label: '关系数', value: edges.length },
      { label: '待处理阻塞项', value: blockers.length },
    ],
  }
}
