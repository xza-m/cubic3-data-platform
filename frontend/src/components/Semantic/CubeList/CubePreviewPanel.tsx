import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeDetail, CubeSummary, MaterializeStatus, ViewSummary } from '@/api/semantic'
import { SemanticPreviewMetricGrid, SemanticPreviewPanel, SemanticPreviewSection } from '@/components/Semantic/SemanticPreviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  buildCubePreviewActions,
  formatSummaryTime,
  getCubeAttentionReasons,
  getCubePrimaryStatus,
  getCubePublishLabel,
  getCubeSourceLabel,
  getCubeSyncLabel,
  getViewPublishLabel,
} from './cubeListUtils'

type ObjectKind = 'cube' | 'view'

interface CubePreviewPanelProps {
  kind: ObjectKind
  selectedCube: CubeSummary | null
  selectedView: ViewSummary | null
  cubeDetail?: CubeDetail
  cubeDetailLoading?: boolean
  materializeStatusMap?: Record<string, MaterializeStatus>
}

function EmptyPreview({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/72 px-4 py-5 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
      <div className="font-medium text-[hsl(var(--workbench-ink))]">{title}</div>
      <div className="mt-1">{description}</div>
    </div>
  )
}

export function CubePreviewPanel({
  kind,
  selectedCube,
  selectedView,
  cubeDetail,
  cubeDetailLoading,
  materializeStatusMap,
}: CubePreviewPanelProps) {
  if (kind === 'view') {
    if (!selectedView) {
      return (
        <SemanticPreviewPanel title="对象预览" description="选择一个 View 后，这里会显示摘要和下一步动作。">
          <EmptyPreview title="先选择一个 View" description="右侧会展示当前 View 的发布状态和引用情况。" />
        </SemanticPreviewPanel>
      )
    }

    return (
      <SemanticPreviewPanel
        title="对象预览"
        description="查看当前 View 的发布状态、可见性和下一步动作。"
        actions={(
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to={`/semantic/views/${selectedView.name}`}>
              查看
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      >
        <SemanticPreviewSection label="当前对象">
          <div className="space-y-2">
            <div className="text-lg font-semibold tracking-[-0.03em] text-[hsl(var(--workbench-ink))]">
              {selectedView.title}
            </div>
            <div className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">
              {selectedView.name}
            </div>
            <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              {selectedView.description || '当前 View 还没有补充业务说明。'}
            </div>
          </div>
        </SemanticPreviewSection>

        <SemanticPreviewMetricGrid
          items={[
            { label: '可见性', value: selectedView.public ? '公开' : '私有' },
            { label: '引用 Cube', value: `${selectedView.cube_count} 个` },
            { label: '发布状态', value: getViewPublishLabel(selectedView, materializeStatusMap?.[selectedView.name]) },
            { label: '下一步', value: '查看定义或进入 DevTools' },
          ]}
        />
      </SemanticPreviewPanel>
    )
  }

  if (!selectedCube) {
    return (
      <SemanticPreviewPanel title="对象预览" description="选择一个 Cube 后，这里会显示当前状态、结构摘要和下一步动作。">
        <EmptyPreview title="先选择一个 Cube" description="右侧会展示当前模型的来源绑定、领域归属和结构摘要。" />
      </SemanticPreviewPanel>
    )
  }

  const activeCube = cubeDetail ?? selectedCube
  const attentionReasons = getCubeAttentionReasons(selectedCube)
  const actions = buildCubePreviewActions(activeCube)

  return (
    <SemanticPreviewPanel
      title="对象预览"
      description="右侧摘要用于快速判断当前 Cube 的状态、绑定和下一步动作。"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button key={action.href} asChild variant={action.label === '继续设计' ? 'default' : 'ghost'} size="sm" className="rounded-full">
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
            <div className="text-lg font-semibold tracking-[-0.03em] text-[hsl(var(--workbench-ink))]">
              {activeCube.title}
            </div>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]">
              {getCubePrimaryStatus(activeCube)}
            </Badge>
          </div>
          <div className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">
            {activeCube.name}
          </div>
          <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
            {activeCube.description || '当前 Cube 还没有补充业务说明。'}
          </div>
        </div>
      </SemanticPreviewSection>

      {cubeDetailLoading ? (
        <EmptyPreview title="正在加载摘要" description="稍后会展示维度、指标和待处理事项。" />
      ) : null}

      <SemanticPreviewMetricGrid
        items={[
          { label: '来源绑定', value: getCubeSourceLabel(selectedCube) },
          { label: '领域归属', value: selectedCube.domain_name || '未归属领域' },
          {
            label: '模型结构',
            value: `${cubeDetail ? Object.keys(cubeDetail.dimensions).length : selectedCube.dimension_count} 维度 / ${cubeDetail ? Object.keys(cubeDetail.measures).length : selectedCube.measure_count} 指标`,
          },
          { label: '发布 / 同步', value: `${getCubePublishLabel(selectedCube)} / ${getCubeSyncLabel(selectedCube)}` },
        ]}
      />

      <SemanticPreviewSection label="待处理事项">
        {attentionReasons.length ? (
          <div className="space-y-2">
            {attentionReasons.map((reason) => (
              <div
                key={reason}
                className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 px-3 py-2 text-sm text-[hsl(var(--semantic-warn))]"
              >
                {reason}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-ok))]/15 bg-[hsl(var(--semantic-ok))]/8 px-3 py-2 text-sm text-[hsl(var(--semantic-ok))]">
            当前没有阻塞项，可以继续校对定义或进入设计页。
          </div>
        )}
      </SemanticPreviewSection>

      {cubeDetail ? (
        <>
          <SemanticPreviewSection label="维度预览">
            <div className="space-y-2">
              {Object.entries(cubeDetail.dimensions).slice(0, 4).map(([key, item]) => (
                <div key={key} className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/86 px-3 py-2.5">
                  <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{item.title}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {key} · {item.type}
                  </div>
                </div>
              ))}
            </div>
          </SemanticPreviewSection>

          <SemanticPreviewSection label="指标预览">
            <div className="space-y-2">
              {Object.entries(cubeDetail.measures).slice(0, 4).map(([key, item]) => (
                <div key={key} className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/86 px-3 py-2.5">
                  <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{item.title}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {key} · {item.type}
                  </div>
                </div>
              ))}
            </div>
          </SemanticPreviewSection>
        </>
      ) : null}

      <SemanticPreviewSection label="最近变更">
        <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
          最近修改：{formatSummaryTime(selectedCube.state_summary?.updated_at)}
          <br />
          最近发布：{formatSummaryTime(selectedCube.state_summary?.last_published_at)}
        </div>
      </SemanticPreviewSection>
    </SemanticPreviewPanel>
  )
}
