import { useState } from 'react'
import { Button, Chip, Input, type ChipTone } from '@v2/components/ui'

export type FieldCandidateActionType = 'accept' | 'ignore' | 'rename'

export interface FieldCandidateReviewAction {
  candidateId: string
  action: FieldCandidateActionType
  value?: string
}

export interface FieldCandidateReviewItem {
  id: string
  field: string
  label?: string
  role?: string
  aggregation?: string
  semanticType?: string
  cubeBindingLabel?: string
  ontologyBindingLabel?: string
  confidence?: number
  confidenceLabel?: string
  evidence?: string
  risk?: string
  action?: 'pending' | 'accepted' | 'ignored' | 'renamed' | 'deferred'
}

interface FieldCandidateReviewProps {
  candidates: FieldCandidateReviewItem[]
  onAction?: (action: FieldCandidateReviewAction) => void
}

export function FieldCandidateReview({
  candidates,
  onAction,
}: FieldCandidateReviewProps) {
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const summary = candidates.reduce(
    (acc, candidate) => {
      acc.total += 1
      const action = candidate.action || 'pending'
      if (action !== 'pending') acc.done += 1
      if (normalizeRisk(candidate.risk) === 'high') acc.highRisk += 1
      if (normalizeRisk(candidate.risk) === 'low' && action === 'pending')
        acc.lowRiskPending += 1
      return acc
    },
    { total: 0, done: 0, highRisk: 0, lowRiskPending: 0 },
  )
  const visibleCandidates =
    riskFilter === 'high'
      ? candidates.filter(
          (candidate) => normalizeRisk(candidate.risk) === 'high',
        )
      : candidates
  const lowRiskPendingCandidates = candidates.filter(
    (candidate) =>
      normalizeRisk(candidate.risk) === 'low' &&
      (candidate.action || 'pending') === 'pending',
  )

  return (
    <section
      data-testid="field-candidate-review"
      className="space-y-3 px-1 text-[12px]"
      aria-label="字段候选审阅"
    >
      <div
        className="border-l-2 py-1 pl-3"
        style={{ borderColor: 'var(--accent)' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
          字段候选
        </div>
        <h2 className="m-0 mt-1 text-[15px] font-semibold leading-tight text-1">
          字段候选审阅
        </h2>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3 py-2"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--bg-surface-2)',
        }}
      >
        <div className="flex flex-wrap gap-2 text-[12px] text-2">
          <Chip>
            已处理 {summary.done} / {summary.total}
          </Chip>
          <Chip tone={summary.highRisk > 0 ? 'danger' : 'success'}>
            高风险 {summary.highRisk}
          </Chip>
          <Chip tone="success">可批量采纳 {summary.lowRiskPending}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={riskFilter === 'high' ? 'primary' : 'ghost'}
            onClick={() =>
              setRiskFilter(riskFilter === 'high' ? 'all' : 'high')
            }
          >
            只看高风险
          </Button>
          {onAction ? (
            <Button
              size="sm"
              variant="default"
              disabled={lowRiskPendingCandidates.length === 0}
              onClick={() =>
                lowRiskPendingCandidates.forEach((candidate) =>
                  onAction({ candidateId: candidate.id, action: 'accept' }),
                )
              }
            >
              批量采纳低风险 {lowRiskPendingCandidates.length}
            </Button>
          ) : null}
        </div>
      </div>

      {candidates.length === 0 ? (
        <div
          className="rounded-[8px] border px-3 py-3"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-surface-2)',
          }}
        >
          <div className="font-semibold text-1">等待字段候选</div>
          <p className="mt-1 leading-5 text-3">
            先确认来源证据，再生成字段候选表。
          </p>
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3 py-3"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-surface-2)',
          }}
        >
          <div className="font-semibold text-1">当前筛选无高风险字段</div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRiskFilter('all')}
          >
            显示全部
          </Button>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-[8px] border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table
            className="min-w-full border-collapse text-left"
            aria-label="字段候选审阅"
          >
            <thead style={{ background: 'var(--bg-surface-2)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  语义名
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  物理字段
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  角色
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  聚合/类型
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  Cube 映射
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  本体锚定
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  置信度
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  风险
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  证据
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">
                  操作
                </th>
              </tr>
            </thead>
            <tbody
              className="divide-y"
              style={{ borderColor: 'var(--border)' }}
            >
              {visibleCandidates.map((candidate) => (
                <FieldCandidateReviewRow
                  key={candidate.id}
                  candidate={candidate}
                  onAction={onAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FieldCandidateReviewRow({
  candidate,
  onAction,
}: {
  candidate: FieldCandidateReviewItem
  onAction?: (action: FieldCandidateReviewAction) => void
}) {
  const label = candidate.label || candidate.field
  const [renameValue, setRenameValue] = useState(label)
  const confidence = formatConfidence(
    candidate.confidence,
    candidate.confidenceLabel,
  )
  const semanticLabel =
    [candidate.aggregation, candidate.semanticType]
      .filter(Boolean)
      .join(' / ') || '未设置'
  const riskLevel = normalizeRisk(candidate.risk)
  const riskLabel = riskText(riskLevel)
  const canAct = Boolean(onAction)

  return (
    <tr className="align-top">
      <td className="min-w-[150px] px-3 py-2.5">
        <div className="font-semibold text-1">{label}</div>
        {candidate.action ? (
          <div className="mt-1 text-[11px] text-3">
            {actionText(candidate.action)}
          </div>
        ) : null}
      </td>
      <td className="min-w-[140px] break-all px-3 py-2.5 font-mono text-[11.5px] text-3">
        {candidate.field}
      </td>
      <td className="px-3 py-2.5">
        <Chip tone="accent">{candidate.role || 'unknown'}</Chip>
      </td>
      <td className="min-w-[110px] px-3 py-2.5">
        <Chip>{semanticLabel}</Chip>
      </td>
      <td className="min-w-[130px] px-3 py-2.5">
        <Chip>{candidate.cubeBindingLabel || '待映射'}</Chip>
      </td>
      <td className="min-w-[130px] px-3 py-2.5">
        <Chip>{candidate.ontologyBindingLabel || '待锚定'}</Chip>
      </td>
      <td className="px-3 py-2.5">
        {confidence ? (
          <Chip tone="success">{confidence}</Chip>
        ) : (
          <span className="text-3">待评估</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Chip tone={riskTone(candidate.risk)}>{riskLabel}</Chip>
      </td>
      <td className="min-w-[220px] max-w-[360px] px-3 py-2.5 leading-5 text-3">
        {candidate.evidence || '暂无证据'}
      </td>
      <td
        className={
          canAct ? 'min-w-[260px] px-3 py-2.5' : 'w-[72px] px-3 py-2.5'
        }
      >
        {canAct ? (
          <div className="flex flex-col gap-2">
            <Input
              aria-label={`改写 ${label}`}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="h-8 min-w-[180px]"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  onAction?.({ candidateId: candidate.id, action: 'accept' })
                }
              >
                采纳 {label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onAction?.({
                    candidateId: candidate.id,
                    action: 'rename',
                    value: renameValue.trim() || label,
                  })
                }
              >
                改写 {label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onAction?.({ candidateId: candidate.id, action: 'ignore' })
                }
              >
                忽略 {label}
              </Button>
            </div>
          </div>
        ) : (
          <Chip>只读</Chip>
        )}
      </td>
    </tr>
  )
}

function formatConfidence(
  value: number | undefined,
  label: string | undefined,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return label?.trim() || null
  const normalized = value > 1 ? value : value * 100
  return `${Math.round(normalized)}%`
}

type RiskLevel = 'high' | 'medium' | 'low' | 'unknown'

function normalizeRisk(value: string | undefined): RiskLevel {
  const normalized = value?.trim().toLowerCase() || ''
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('medium')) return 'medium'
  if (normalized.includes('low')) return 'low'
  return 'unknown'
}

function riskText(value: RiskLevel): string {
  if (value === 'high') return '高风险'
  if (value === 'medium') return '中风险'
  if (value === 'low') return '低风险'
  return '待评估'
}

function riskTone(value: string | undefined): ChipTone {
  const normalized = normalizeRisk(value)
  if (normalized === 'high') return 'danger'
  if (normalized === 'medium') return 'warning'
  if (normalized === 'low') return 'success'
  return 'neutral'
}

function actionText(
  value: NonNullable<FieldCandidateReviewItem['action']>,
): string {
  if (value === 'accepted') return '已采纳'
  if (value === 'ignored') return '已忽略'
  if (value === 'renamed') return '已改写'
  if (value === 'deferred') return '已暂缓'
  return '待处理'
}
