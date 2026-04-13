import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CubeDetail, CubeSummary, DimensionInfo, MeasureInfo } from '@/api/semantic'
import { Button } from '@/components/ui/button'

type FieldTone = 'dimension' | 'measure' | 'time'

interface FieldDefinition {
  name: string
  title: string
  semanticType: string
  sourceDataType?: string | null
  description?: string | null
  recommendationReason?: string | null
  confidence?: number | null
  descriptionStatus?: string | null
  tone: FieldTone
}

function normalizeFieldDefinitions(
  entries: Array<[string, DimensionInfo | MeasureInfo]>,
  tone: FieldTone,
): FieldDefinition[] {
  return entries.map(([name, item]) => ({
    name,
    title: item.title || name,
    semanticType: item.type || (tone === 'measure' ? 'sum' : 'string'),
    sourceDataType: item.source_data_type || null,
    description: item.description || null,
    recommendationReason: item.recommendation_reason || null,
    confidence: item.confidence ?? null,
    descriptionStatus: item.description_status || null,
    tone,
  }))
}

function FieldTableRow({ field, expanded, onToggle }: { field: FieldDefinition; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/50"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="font-medium text-slate-900">{field.title}</div>
          <div className="font-mono text-xs text-slate-400">{field.name}</div>
        </td>
        <td className="px-4 py-2.5">
          <code className="text-xs text-slate-600">{field.semanticType}</code>
        </td>
        <td className="px-4 py-2.5 text-xs text-slate-500">{field.sourceDataType || '—'}</td>
        <td className="px-4 py-2.5 text-sm text-slate-500">{field.description || '—'}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/50">
          <td colSpan={4} className="px-4 py-3">
            <div className="grid gap-x-6 gap-y-2 text-xs text-slate-600 sm:grid-cols-3">
              <div>
                <span className="text-slate-400">来源类型</span>{' '}
                <span className="font-medium text-slate-700">{field.sourceDataType || '未识别'}</span>
              </div>
              <div>
                <span className="text-slate-400">置信度</span>{' '}
                <span className="font-medium text-slate-700">
                  {typeof field.confidence === 'number' ? `${Math.round(field.confidence * 100)}%` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">推荐理由</span>{' '}
                <span className="font-medium text-slate-700">{field.recommendationReason || '默认识别'}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FieldTable({ fields }: { fields: FieldDefinition[] }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  if (fields.length === 0) {
    return <div className="px-4 py-6 text-center text-xs text-slate-400">暂无数据</div>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
          <th className="px-4 py-2">名称</th>
          <th className="px-4 py-2">表达式 / 类型</th>
          <th className="px-4 py-2">源类型</th>
          <th className="px-4 py-2">描述</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <FieldTableRow
            key={field.name}
            field={field}
            expanded={expandedRow === field.name}
            onToggle={() => setExpandedRow(expandedRow === field.name ? null : field.name)}
          />
        ))}
      </tbody>
    </table>
  )
}

function ModelingSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-slate-200">
      <div className="flex h-10 items-center justify-between border-b border-slate-200 px-4">
        <div className="text-sm font-medium text-slate-900">
          {title}
          <span className="ml-1.5 text-xs text-slate-400">({count})</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          添加
        </Button>
      </div>
      {children}
    </section>
  )
}

export function WorkbenchModelingTab({
  cube,
  cubeDetail,
}: {
  cube: CubeSummary
  cubeDetail?: CubeDetail
}) {
  const dimensionEntries = Object.entries(cubeDetail?.dimensions || {})
  const measureEntries = Object.entries(cubeDetail?.measures || {})
  const timeEntries = normalizeFieldDefinitions(
    dimensionEntries.filter(([, value]) => value.type === 'time'),
    'time',
  )
  const plainDimensionEntries = normalizeFieldDefinitions(
    dimensionEntries.filter(([, value]) => value.type !== 'time'),
    'dimension',
  )
  const measureDefinitions = normalizeFieldDefinitions(measureEntries, 'measure')

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4" data-testid="workbench-modeling-tab">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>维度 <strong className="text-slate-900">{dimensionEntries.length || cube.dimension_count}</strong></span>
        <span className="h-3 w-px bg-slate-200" />
        <span>指标 <strong className="text-slate-900">{measureEntries.length || cube.measure_count}</strong></span>
        <span className="h-3 w-px bg-slate-200" />
        <span>来源 <strong className="text-slate-900">{cubeDetail?.source_binding_summary?.display || cube.table}</strong></span>
      </div>

      <ModelingSection title="维度" count={plainDimensionEntries.length + timeEntries.length}>
        <FieldTable fields={[...plainDimensionEntries, ...timeEntries]} />
      </ModelingSection>

      <ModelingSection title="指标" count={measureDefinitions.length}>
        <FieldTable fields={measureDefinitions} />
      </ModelingSection>
    </div>
  )
}
