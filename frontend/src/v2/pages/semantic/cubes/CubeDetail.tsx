// frontend/src/v2/pages/semantic/cubes/CubeDetail.tsx
//
// Cube 详情页 (L3)。
// 接口：GET /api/v1/semantic/cubes/:name
// B-back-7: dimension/measure counts 取 detail.dimensions.length，
//           不另外展示下游 BI 数（drop-frontend: backend has no design for downstream BI count — see plan §3.4）

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Pencil, Send, ShieldCheck } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell, @v2/layout/Inspector
import { useAppShell } from '@v2/layout/AppShell'
import { ContextRow, ContextSection } from '@v2/layout/Inspector'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useCubeDetail, useActivateCube, useDeprecateCube, useValidateCubeFields } from '@v2/hooks/semantic'
import { CubeDetailContent, StatusChip } from '@v2/pages/semantic/_shared/cube-detail-content'
import type { CubeFieldIssue } from '@v2/api/semantic'

export default function CubeDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()

  const detailQuery = useCubeDetail(name)
  const cube = detailQuery.data
  const activateMutation = useActivateCube()
  const deprecateMutation = useDeprecateCube()
  const validateMutation = useValidateCubeFields()
  const [showValidation, setShowValidation] = useState(false)

  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.cubes', 'Cube'),
      cube?.title ?? name ?? '',
    ])
  }, [setBreadcrumbs, cube?.title, name])

  useEffect(() => {
    setTopBarActions(
      <>
        <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/cubes')}>
          <ArrowLeft size={12} /> {t('action.back', '返回列表')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/semantic/cubes/${name}/edit`)}
          disabled={!name}
        >
          <Pencil size={12} /> {t('action.edit', '编辑')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={validateMutation.isPending || !name}
          onClick={async () => {
            if (!name) return
            await validateMutation.mutateAsync(name)
            setShowValidation(true)
          }}
        >
          <ShieldCheck size={12} /> {t('cube.validateFields', '字段校验')}
          {validateMutation.isPending ? <span className="ml-1 text-3">…</span> : null}
        </Button>
        {cube?.status === 'draft' || cube?.status === 'review' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={activateMutation.isPending}
            onClick={() => name && activateMutation.mutate(name)}
          >
            <Send size={12} /> {t('cube.activate', '上线')}
          </Button>
        ) : cube?.status === 'active' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={deprecateMutation.isPending}
            onClick={() => name && deprecateMutation.mutate(name)}
          >
            {t('cube.deprecate', '弃用')}
          </Button>
        ) : null}
      </>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, name, cube?.status, activateMutation, deprecateMutation])

  useEffect(() => {
    if (!cube) return
    const dims = cube.dimensions ?? []
    const measures = cube.measures ?? []
    setContextPanel({
      title: cube.title,
      subtitle: cube.domain_name ? `Cube · ${cube.domain_name}` : 'Cube',
      body: (
        <>
          <ContextSection title={t('cube.contextBasic', '基础')}>
            <ContextRow label="Cube" value={<code>{cube.name}</code>} />
            {cube.domain_name ? <ContextRow label={t('cube.domain', '业务域')} value={cube.domain_name} /> : null}
            {cube.fact_table ? <ContextRow label={t('cube.factTable', '事实表')} value={<code className="font-mono text-xs">{cube.fact_table}</code>} /> : null}
            <ContextRow label={t('cube.dimensions', '维度')} value={dims.length} />
            <ContextRow label={t('cube.measures', '度量')} value={measures.length} />
          </ContextSection>
          <ContextSection title={t('cube.contextQuickActions', '快捷操作')}>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start w-full"
              onClick={() => navigate(`/semantic/cubes/${cube.name}/edit`)}
            >
              <Pencil size={12} /> {t('action.openDesigner', '进入设计器')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start w-full"
              onClick={() => navigate('/semantic/devtools')}
            >
              {t('nav.devtools', '语义诊断')}
            </Button>
          </ContextSection>
        </>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, cube, navigate])

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-3">{t('loading', '加载中…')}</span>
      </div>
    )
  }

  if (detailQuery.isError || !cube) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <span className="text-sm text-danger">{t('error.cubeNotFound', 'Cube 不存在或加载失败')}</span>
        <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/cubes')}>
          {t('action.back', '返回列表')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 详情头部 */}
      <div
        className="border-b px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="obj-dot" style={{ background: 'var(--violet)' }}>CB</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-1">
            {cube.title}
            <StatusChip status={cube.status ?? 'draft'} />
          </div>
          <div className="truncate text-xs text-3">
            <code>{cube.name}</code>
            {cube.domain_name ? ` · ${cube.domain_name}` : ''}
            {cube.fact_table ? ` · ${cube.fact_table}` : ''}
          </div>
        </div>
      </div>

      {/* P4: 字段校验结果内联面板 */}
      {showValidation && validateMutation.data && (
        <FieldValidationPanel
          result={validateMutation.data}
          onClose={() => setShowValidation(false)}
        />
      )}

      {/* 内容 */}
      <div className="flex-1 overflow-auto scroll-thin">
        <CubeDetailContent
          cube={cube}
          actions={{
            onOpenDesigner: () => navigate(`/semantic/cubes/${cube.name}/edit`),
            onJumpOntology: () => navigate('/semantic/ontology/objects'),
            onRunDiagnose: () => navigate('/semantic/devtools'),
          }}
        />
      </div>
    </div>
  )
}

// ─── P4: 字段校验结果面板 ──────────────────────────────────────────────────────

function FieldValidationPanel({
  result,
  onClose,
}: {
  result: { ok: boolean; issues: CubeFieldIssue[] }
  onClose: () => void
}) {
  const grouped: Record<string, CubeFieldIssue[]> = { error: [], warning: [], info: [] }
  for (const issue of result.issues) {
    grouped[issue.severity] = grouped[issue.severity] ?? []
    grouped[issue.severity].push(issue)
  }

  const SEVERITY_CONFIG = {
    error: { label: t('severity.error', '错误'), Icon: AlertTriangle, color: 'var(--danger)', tone: 'danger' as const },
    warning: { label: t('severity.warning', '警告'), Icon: AlertTriangle, color: 'var(--warning)', tone: 'warning' as const },
    info: { label: t('severity.info', '提示'), Icon: Info, color: 'var(--accent)', tone: 'accent' as const },
  }

  return (
    <div
      className="shrink-0 border-b px-4 py-3"
      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-1">
          {result.ok ? (
            <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
          ) : (
            <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
          )}
          {result.ok
            ? t('cube.validateFields.ok', '字段校验通过')
            : t('cube.validateFields.failed', `字段校验发现 ${grouped.error?.length ?? 0} 个错误`)}
          <Chip tone={result.ok ? 'success' : 'danger'}>
            {result.issues.length} {t('cube.validateFields.issues', '项')}
          </Chip>
        </div>
        <button
          type="button"
          className="rail-btn text-xs text-3"
          onClick={onClose}
          aria-label={t('action.close', '关闭')}
        >
          ✕
        </button>
      </div>

      {result.issues.length === 0 ? (
        <div className="text-xs text-3">{t('cube.validateFields.noIssues', '未发现问题')}</div>
      ) : (
        <div className="space-y-2">
          {(['error', 'warning', 'info'] as const).map((sev) => {
            const items = grouped[sev] ?? []
            if (items.length === 0) return null
            const cfg = SEVERITY_CONFIG[sev]
            const Icon = cfg.Icon
            return (
              <div key={sev}>
                <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-3 uppercase tracking-wide">
                  <Icon size={10} style={{ color: cfg.color }} />
                  {cfg.label} ({items.length})
                </div>
                <div className="space-y-1">
                  {items.map((issue, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded border px-2 py-1.5 text-xs"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
                    >
                      <code
                        className="shrink-0 rounded px-1 font-mono text-[11px]"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}
                      >
                        {issue.field}
                      </code>
                      <span className="text-2">{issue.message}</span>
                      <Chip tone={cfg.tone} className="ml-auto shrink-0">{issue.code}</Chip>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
