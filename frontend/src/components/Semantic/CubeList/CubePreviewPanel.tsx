import { ArrowRight, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeDetail, CubeSummary } from '@/api/semantic'
import { Button } from '@/components/ui/button'
import { formatSummaryTime } from '@/components/Semantic/CubeList/cubeListUtils'
import { buildSemanticWorkbenchHref, useSemanticWorkbench } from '@/hooks/semantic-ia'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

interface CubePreviewPanelProps {
  selectedCube: CubeSummary
  cubeDetail?: CubeDetail
  cubeDetailLoading?: boolean
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'blue' | 'purple'
}) {
  const palette = tone === 'blue'
    ? 'bg-blue-50 text-blue-700'
    : 'bg-purple-50 text-purple-700'

  return (
    <div className={`rounded-lg px-4 py-3 ${palette}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

export function CubePreviewPanel({
  selectedCube,
  cubeDetail,
  cubeDetailLoading,
}: CubePreviewPanelProps) {
  const activeCube = cubeDetail
    ? { ...selectedCube, ...cubeDetail }
    : selectedCube
  const isPublished = (activeCube.status || '').toLowerCase() === 'active'
  const statusLabel = getSemanticStatusLabel(activeCube.status)
  const domainLabel = activeCube.domain_name?.trim() || '未归属'
  const recentChangeLabel = formatSummaryTime(
    activeCube.state_summary?.updated_at
      ?? activeCube.state_summary?.last_published_at
      ?? activeCube.state_summary?.last_loaded_at,
  )
  const fieldSummary = {
    dimensions: cubeDetail ? Object.keys(cubeDetail.dimensions || {}).length : selectedCube.dimension_count,
    measures: cubeDetail ? Object.keys(cubeDetail.measures || {}).length : selectedCube.measure_count,
  }
  const { startRevision, isStartingRevision } = useSemanticWorkbench({
    currentCube: {
      name: activeCube.name,
      status: activeCube.status,
    },
  })
  const workbenchHref = buildSemanticWorkbenchHref(activeCube.name, isPublished ? 'preview' : 'modeling')

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="text-sm font-semibold text-slate-900">基础信息</div>
        <InfoRow label="Cube 名称" value={activeCube.name} />
        <InfoRow label="SQL 表" value={activeCube.table || '—'} mono />
        <InfoRow label="状态" value={statusLabel} />
        <InfoRow label="所属领域" value={domainLabel} />
        <InfoRow label="最近变更" value={recentChangeLabel} />
      </section>

      <div className="h-px bg-slate-200" />

      <section className="space-y-3">
        <div className="text-sm font-semibold text-slate-900">字段摘要</div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="维度" value={String(fieldSummary.dimensions)} tone="blue" />
          <SummaryCard label="指标" value={String(fieldSummary.measures)} tone="purple" />
        </div>
        {cubeDetailLoading ? (
          <div className="text-xs text-slate-400">正在加载字段摘要...</div>
        ) : null}
      </section>

      <div className="h-px bg-slate-200" />

      <section className="space-y-3">
        <div className="text-sm font-semibold text-slate-900">操作</div>
        {isPublished ? (
          <>
            <Button
              type="button"
              className="w-full justify-center gap-2"
              disabled={isStartingRevision}
              onClick={() => startRevision(activeCube.name)}
            >
              <Pencil className="h-4 w-4" />
              新建修订版
            </Button>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              不会影响当前发布版本
            </div>
          </>
        ) : null}
        <Button asChild variant="outline" className="w-full justify-center gap-2">
          <Link to={workbenchHref}>
            <ArrowRight className="h-4 w-4" />
            {isPublished ? '去工作台查看' : '去工作台继续建模'}
          </Link>
        </Button>
      </section>
    </div>
  )
}
