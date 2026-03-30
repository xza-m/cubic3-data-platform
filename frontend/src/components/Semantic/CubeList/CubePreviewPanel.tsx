import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeDetail, CubeSummary } from '@/api/semantic'
import { SemanticObjectIdentity } from '@/components/Semantic/SemanticObjectIdentity'
import { SemanticPreviewFacts, SemanticPreviewPanel, SemanticPreviewSection } from '@/components/Semantic/SemanticPreviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  buildCubePreviewActions,
  formatSummaryTime,
  getCubeAttentionReasons,
  getCubePrimaryStatus,
  getCubeSyncLabel,
  inferCubeCategory,
} from './cubeListUtils'

interface CubePreviewPanelProps {
  selectedCube: CubeSummary
  cubeDetail?: CubeDetail
  cubeDetailLoading?: boolean
}

function EmptyPreview({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/72 px-3 py-3 text-[12px] leading-5 text-[hsl(var(--workbench-muted-foreground))]">
      <div className="font-medium text-[hsl(var(--workbench-ink))]">{title}</div>
      <div className="mt-0.5">{description}</div>
    </div>
  )
}

export function CubePreviewPanel({
  selectedCube,
  cubeDetail,
  cubeDetailLoading,
}: CubePreviewPanelProps) {
  const activeCube = cubeDetail ?? selectedCube
  const attentionReasons = getCubeAttentionReasons(selectedCube)
  const actions = buildCubePreviewActions(activeCube)
  const dimensionFields = cubeDetail ? Object.entries(cubeDetail.dimensions || {}).map(([key, value]) => value.title || key) : []
  const measureFields = cubeDetail ? Object.entries(cubeDetail.measures || {}).map(([key, value]) => value.title || key) : []
  const fieldSummary = cubeDetail
    ? [...dimensionFields.slice(0, 4), ...measureFields.slice(0, 4)].join(' · ')
    : `${selectedCube.dimension_count} 个维度，${selectedCube.measure_count} 个指标`

  return (
    <SemanticPreviewPanel
      title="当前选择"
      actions={(
        <div className="flex shrink-0 items-center">
          {actions.map((action) => (
            <Button key={action.href} asChild variant="default" size="sm" className="h-7 rounded-md px-2 text-[11px]">
              <Link to={action.href}>
                {action.label}
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          ))}
        </div>
      )}
    >
      <SemanticPreviewSection label="当前对象">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SemanticObjectIdentity
              title={activeCube.title}
              code={activeCube.name}
              description={activeCube.description}
              meta={[inferCubeCategory(selectedCube)]}
              className="flex-1"
            />
            <Badge variant="outline" className="h-5.5 border-transparent bg-[hsl(var(--workbench-accent-soft))] px-2 text-[10px] text-[hsl(var(--workbench-accent))]">
              {getCubePrimaryStatus(activeCube)}
            </Badge>
          </div>
        </div>
      </SemanticPreviewSection>

      <SemanticPreviewSection label="阻塞项">
        {attentionReasons.length ? (
          <div className="space-y-2">
            {attentionReasons.map((reason) => (
              <div
                key={reason}
                className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 px-2.5 py-1.5 text-[11px] leading-5 text-[hsl(var(--semantic-warn))]"
              >
                {reason}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-ok))]/15 bg-[hsl(var(--semantic-ok))]/8 px-2.5 py-1.5 text-[11px] leading-5 text-[hsl(var(--semantic-ok))]">
            当前没有阻塞项，可以继续校对定义或进入设计页。
          </div>
        )}
      </SemanticPreviewSection>

      {cubeDetailLoading ? (
        <EmptyPreview title="正在加载摘要" description="稍后显示字段、属性和所属领域。" />
      ) : null}

      <SemanticPreviewSection label="字段列表">
        <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/84 px-3 py-2.5 text-[12px] leading-5 text-[hsl(var(--workbench-ink))]">
          {fieldSummary || '当前没有可展示字段。'}
        </div>
      </SemanticPreviewSection>

      <SemanticPreviewSection label="属性摘要">
        <SemanticPreviewFacts
          items={[
            { label: '模型类型', value: inferCubeCategory(selectedCube) },
            { label: '同步状态', value: getCubeSyncLabel(selectedCube) },
            { label: '结构规模', value: `${selectedCube.dimension_count} 维度 / ${selectedCube.measure_count} 指标` },
          ]}
        />
      </SemanticPreviewSection>

      <SemanticPreviewSection label="所属领域">
        <SemanticPreviewFacts
          items={[
            { label: '当前领域', value: selectedCube.domain_name || '未纳入领域' },
            { label: 'Join', value: typeof selectedCube.join_count === 'number' ? `${selectedCube.join_count} 条` : '待补充' },
          ]}
        />
      </SemanticPreviewSection>

      <SemanticPreviewSection label="最近变更">
        <SemanticPreviewFacts
          items={[
            { label: '最近修改', value: formatSummaryTime(selectedCube.state_summary?.updated_at) },
            { label: '最近发布', value: formatSummaryTime(selectedCube.state_summary?.last_published_at) },
          ]}
        />
      </SemanticPreviewSection>
    </SemanticPreviewPanel>
  )
}
