// frontend/src/v2/pages/semantic/_shared/cube-detail-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// Cube 详情内容组件——Peek Panel 和 CubeDetail 全屏页共用。
// 维度/度量计数直接用 detail.dimensions.length，
// 不另外派生下游 BI 数（drop-frontend: backend has no design for downstream BI count — see plan §3.4）

import type { ReactNode } from 'react'
import { Boxes, Database, GitBranch, Pencil, Sparkles } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui（Button, Card, CardBody, Chip）
import { Button, Card, CardBody, Chip } from '@v2/components/ui'
import { fmtNum } from '@v2/lib/format'
// 等待 X-Crosscut：@v2/i18n（t()）
import { t } from '@v2/i18n'
import type { CubeDetail, CubeDimension, CubeMeasure } from '@v2/api/semantic'

export interface CubeActions {
  onOpenDesigner?: () => void
  onJumpDataset?: () => void
  onJumpOntology?: () => void
  onRunDiagnose?: () => void
}

const TYPE_TONE: Record<string, 'accent' | 'warning' | 'violet' | 'neutral'> = {
  string: 'accent',
  time: 'warning',
  number: 'violet',
  boolean: 'neutral',
}

const AGG_LABEL: Record<string, string> = {
  sum: 'SUM',
  count: 'COUNT',
  count_distinct: 'COUNT DISTINCT',
  avg: 'AVG',
  max: 'MAX',
  min: 'MIN',
}

export function CubeDetailContent({
  cube,
  actions,
}: {
  cube: CubeDetail
  actions?: CubeActions
}) {
  const dims = cube.dimensions ?? []
  const measures = cube.measures ?? []

  return (
    <div className="px-4 py-3">
      {actions ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {actions.onOpenDesigner ? (
            <Button size="sm" variant="primary" onClick={actions.onOpenDesigner}>
              <Pencil size={12} /> {t('cube.edit', '进入设计器')}
            </Button>
          ) : null}
          {actions.onJumpDataset ? (
            <Button size="sm" variant="ghost" onClick={actions.onJumpDataset}>
              <Database size={12} /> {t('cube.physicalTable', '物理表')}
            </Button>
          ) : null}
          {actions.onJumpOntology ? (
            <Button size="sm" variant="ghost" onClick={actions.onJumpOntology}>
              <Boxes size={12} /> {t('cube.ontologyObjects', '本体对象')}
            </Button>
          ) : null}
          {actions.onRunDiagnose ? (
            <Button size="sm" variant="ghost" onClick={actions.onRunDiagnose}>
              <Sparkles size={12} /> {t('cube.diagnose', '语义诊断')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Section title={t('cube.basicInfo', '基础信息')}>
        <dl
          className="divide-y rounded-md border text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label={t('cube.title', '标题')} value={cube.title} />
          <Row label={t('cube.name', '名称')} value={<code className="font-mono text-xs">{cube.name}</code>} />
          {cube.domain_name ? (
            <Row label={t('cube.domain', '业务域')} value={<Chip tone="violet">{cube.domain_name}</Chip>} />
          ) : null}
          {cube.fact_table ? (
            <Row
              label={t('cube.factTable', '事实表')}
              value={<code className="font-mono text-xs">{cube.fact_table}</code>}
            />
          ) : null}
          {cube.source_database ? (
            <Row
              label={t('cube.sourceDB', '数据库')}
              value={<code className="font-mono text-xs">{cube.source_database}</code>}
            />
          ) : null}
          {cube.status ? (
            <Row label={t('cube.status', '状态')} value={<StatusChip status={cube.status} />} />
          ) : null}
        </dl>
      </Section>

      {cube.description ? (
        <Section title={t('cube.description', '描述')}>
          <p className="text-xs leading-5 text-2">{cube.description}</p>
        </Section>
      ) : null}

      <Section title={t('cube.scale', '规模')}>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label={t('cube.dimensions', '维度')} value={dims.length} accent="var(--violet)" />
          <MetricCard label={t('cube.measures', '度量')} value={measures.length} accent="var(--accent)" />
          {/* drop-frontend: backend has no design for downstream BI count — see plan §3.4 */}
        </div>
      </Section>

      {dims.length > 0 ? (
        <Section
          title={
            <span className="flex items-center gap-1">
              {t('cube.dimensions', '维度')}
              <span className="text-3 font-normal">· {dims.length}</span>
            </span>
          }
        >
          <Card className="overflow-hidden">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>{t('cube.dim.name', '名称')}</th>
                  <th>{t('cube.dim.type', '类型')}</th>
                  <th>{t('cube.dim.expr', '表达式')}</th>
                </tr>
              </thead>
              <tbody>
                {dims.map((d: CubeDimension) => (
                  <tr key={d.name}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {d.primary ? (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: 'var(--violet)' }}
                            title={t('cube.dim.primaryKey', '主键维度')}
                          />
                        ) : null}
                        <span className="font-medium text-1">{d.title}</span>
                        <span className="font-mono text-xs text-3">{d.name}</span>
                      </div>
                    </td>
                    <td>
                      <Chip tone={TYPE_TONE[d.type] ?? 'neutral'}>{d.type}</Chip>
                    </td>
                    <td>
                      <code className="font-mono text-xs text-2">{d.expr ?? '—'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {measures.length > 0 ? (
        <Section
          title={
            <span className="flex items-center gap-1">
              {t('cube.measures', '度量')}
              <span className="text-3 font-normal">· {measures.length}</span>
            </span>
          }
        >
          <Card className="overflow-hidden">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>{t('cube.measure.name', '名称')}</th>
                  <th>{t('cube.measure.agg', '聚合')}</th>
                  <th>{t('cube.measure.expr', '表达式')}</th>
                  <th>{t('cube.measure.format', '格式')}</th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m: CubeMeasure) => (
                  <tr key={m.name}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-1">{m.title}</span>
                        <span className="font-mono text-xs text-3">{m.name}</span>
                      </div>
                    </td>
                    <td>
                      <Chip tone="violet">{AGG_LABEL[m.agg] ?? m.agg}</Chip>
                    </td>
                    <td>
                      <code className="font-mono text-xs text-2">{m.expr ?? '—'}</code>
                    </td>
                    <td className="text-3">{m.format ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      <Section title={t('cube.semanticLink', '语义衔接')}>
        <CardBody
          className="rounded-md border p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-3">
            <GitBranch size={11} /> {t('cube.dualLayer', '双层语义建模')}
          </div>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-2">
            <li>
              <b className="text-1">{t('cube.layer.physical', '物理底座')}</b>
              {cube.fact_table ? (
                <> · {t('cube.factTable', '事实表')} <code className="font-mono text-xs">{cube.fact_table}</code></>
              ) : null}
            </li>
            <li>
              <b className="text-1">{t('cube.layer.semantic', '数据语义层')}</b> · {t('cube.layer.semanticDesc', '当前 Cube，提供维度与度量')}
            </li>
            <li>
              <b className="text-1">{t('cube.layer.business', '业务语义层')}</b> · {t('cube.layer.businessDesc', '在本体里把度量提升为业务指标，把外键提升为业务关系')}
            </li>
          </ul>
        </CardBody>
      </Section>
    </div>
  )
}

export function cubeTabLabel(cube: { title: string; status?: string }): ReactNode {
  const color =
    cube.status === 'active'
      ? 'var(--success)'
      : cube.status === 'review'
        ? 'var(--warning)'
        : cube.status === 'deprecated'
          ? 'var(--danger)'
          : 'var(--text-3)'
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="truncate">{cube.title}</span>
    </span>
  )
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
    active: { tone: 'success', label: t('status.active', '已上线') },
    review: { tone: 'warning', label: t('status.review', '待审核') },
    draft: { tone: 'neutral', label: t('status.draft', '草稿') },
    deprecated: { tone: 'danger', label: t('status.deprecated', '已弃用') },
  }
  const conf = map[status] ?? { tone: 'neutral', label: status }
  return <Chip tone={conf.tone}>{conf.label}</Chip>
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-1.5 text-xs uppercase tracking-wide text-3 font-medium">{title}</div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <dt className="text-3 text-xs">{label}</dt>
      <dd className="truncate text-1 text-xs">{value ?? '—'}</dd>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-md border px-2 py-2 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="text-base font-semibold text-1" style={{ color: accent }}>
        {fmtNum(value)}
      </div>
      <div className="text-xs text-3">{label}</div>
    </div>
  )
}
