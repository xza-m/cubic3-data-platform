import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Clock3,
  Code2,
  GitBranch,
  Loader2,
  PanelRight,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export type SemanticPageStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'dirty'
  | 'validating'
  | 'blocked'
  | 'publishing'
  | 'success'
  | 'error'

export interface SemanticPrimaryAction {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
  disabled?: boolean
  variant?: 'default' | 'outline' | 'secondary'
  testId?: string
}

export interface SemanticValidationSummary {
  status: SemanticPageStatus
  title: string
  description: string
  blockers?: string[]
  hints?: string[]
  stats?: Array<{ label: string; value: ReactNode }>
}

type SemanticStatTone = 'default' | 'accent' | 'positive' | 'warning'
type SemanticWorkbenchMode = 'modeling' | 'tools' | 'cubes'

const statusMeta: Record<SemanticPageStatus, { label: string; className: string; icon: ReactNode }> = {
  idle: {
    label: '待开始',
    className: 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-muted))] text-[hsl(var(--workbench-ink))]',
    icon: <Clock3 className="h-3.5 w-3.5" />,
  },
  loading: {
    label: '加载中',
    className: 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  ready: {
    label: '就绪',
    className: 'border-[hsl(var(--semantic-ok))]/20 bg-[hsl(var(--semantic-ok))]/8 text-[hsl(var(--semantic-ok))]',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  dirty: {
    label: '有未保存变更',
    className: 'border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]',
    icon: <Clock3 className="h-3.5 w-3.5" />,
  },
  validating: {
    label: '校验中',
    className: 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  blocked: {
    label: '存在阻塞',
    className: 'border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/8 text-[hsl(var(--semantic-error))]',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  publishing: {
    label: '发布中',
    className: 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  success: {
    label: '已完成',
    className: 'border-[hsl(var(--semantic-ok))]/20 bg-[hsl(var(--semantic-ok))]/8 text-[hsl(var(--semantic-ok))]',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  error: {
    label: '错误',
    className: 'border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/8 text-[hsl(var(--semantic-error))]',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
}

function PrimaryActionButton({ action }: { action: SemanticPrimaryAction }) {
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  )
  if (action.href) {
    return (
      <Button
        asChild
        variant={action.variant ?? 'default'}
        disabled={action.disabled}
        data-testid={action.testId ?? 'semantic-primary-action'}
      >
        <Link to={action.href}>{content}</Link>
      </Button>
    )
  }
  return (
    <Button
      variant={action.variant ?? 'default'}
      disabled={action.disabled}
      onClick={action.onClick}
      data-testid={action.testId ?? 'semantic-primary-action'}
    >
      {content}
    </Button>
  )
}

export function SemanticPageShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('semantic-workbench mx-auto max-w-[1680px] space-y-4 pb-8', className)}>
      {children}
    </div>
  )
}

export function SemanticPageHeader({
  backHref,
  backLabel,
  title,
  description,
  status,
  badges,
  meta,
  actions,
  eyebrow,
}: {
  backHref?: string
  backLabel?: string
  title: string
  description?: string
  status?: SemanticPageStatus
  badges?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode | null
}) {
  const statusChip = status ? statusMeta[status] : null
  const eyebrowContent = eyebrow === undefined ? null : eyebrow
  const showTopline = eyebrow !== null && (eyebrowContent || statusChip || badges)
  return (
    <header className="border-b border-slate-200 px-1 pb-3 pt-0.5" data-testid="semantic-page-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          {showTopline ? (
            <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-caps)] text-[hsl(var(--workbench-muted-foreground))]">
              {eyebrowContent ? <span>{eyebrowContent}</span> : null}
              {statusChip && (
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-none', statusChip.className)}>
                  {statusChip.icon}
                  {statusChip.label}
                </span>
              )}
              {badges}
            </div>
          ) : null}
          {backHref && backLabel && (
            <Link to={backHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:text-[hsl(var(--workbench-ink))]">
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              {backLabel}
            </Link>
          )}
          <div className="space-y-2">
            <h1
              className="text-lg font-semibold text-slate-900"
              data-semantic-display="true"
            >
              {title}
            </h1>
            {description && (
              <p className="max-w-[62ch] text-[length:var(--text-body-lg)] leading-7 text-[hsl(var(--workbench-muted-foreground))]">
                {description}
              </p>
            )}
          </div>
          {meta && <div className="flex flex-wrap items-center gap-2 pt-0.5">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>}
      </div>
    </header>
  )
}

export function SemanticWorkbenchHeader({
  active,
  actionHref = '/semantic/modeling',
  actionLabel = '新建模型',
  actionIcon,
  actionTestId,
  secondaryActions,
}: {
  active: SemanticWorkbenchMode
  actionHref?: string
  actionLabel?: string
  actionIcon?: ReactNode
  actionTestId?: string
  secondaryActions?: ReactNode
}) {
  const tabs: Array<{ key: SemanticWorkbenchMode; label: string; href: string; icon: ReactNode }> = [
    {
      key: 'modeling',
      label: '领域建模',
      href: '/semantic/modeling',
      icon: <GitBranch className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'tools',
      label: '开发工具',
      href: '/semantic/workbench',
      icon: <Code2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'cubes',
      label: 'Cube 列表',
      href: '/semantic/cubes',
      icon: <Blocks className="h-4 w-4" aria-hidden="true" />,
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">语义层</h1>
          <p className="mt-0.5 text-xs text-slate-500">统一定义业务语义模型，让数据查询标准化、可复用。</p>
        </div>
        <div className="flex items-center gap-2">
          {secondaryActions}
          <Button asChild size="sm" data-testid={actionTestId}>
            <Link to={actionHref}>
              {actionIcon ?? <ArrowRight className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
              {actionLabel}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex h-10 items-center gap-0 border-b border-slate-200 px-4">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <Link
              key={tab.key}
              to={tab.href}
              className={cn(
                'relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors',
                isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab.icon}
              {tab.label}
              {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-600" />}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function SemanticSurface({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  testId,
}: {
  title?: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-slate-200 bg-white',
        className,
      )}
      data-testid={testId}
    >
      {(title || description || actions || eyebrow) && (
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5">
              {eyebrow && (
                <div className="text-[10px] font-medium text-slate-400">
                  {eyebrow}
                </div>
              )}
              {title && <div className="text-sm font-medium text-slate-900">{title}</div>}
              {description && (
                <p className="max-w-3xl text-xs text-slate-500">
                  {description}
                </p>
              )}
            </div>
            {actions}
          </div>
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function SemanticStatCard({
  label,
  value,
  description,
  icon,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  description: string
  icon?: ReactNode
  tone?: SemanticStatTone
  className?: string
}) {
  const toneClassName = {
    default: 'bg-[rgba(255,255,255,0.96)]',
    accent: 'bg-[hsl(var(--workbench-accent-soft))]',
    positive: 'bg-[hsl(var(--semantic-ok))]/6',
    warning: 'bg-[hsl(var(--semantic-warn))]/7',
  }[tone]

  return (
    <div
      className={cn(
        'rounded-md border border-slate-200 px-3 py-3',
        toneClassName,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{label}</div>
        {icon ? (
          <div className="text-slate-400">{icon}</div>
        ) : null}
      </div>
      <div
        className="mt-1 text-lg font-semibold text-slate-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        data-semantic-display="true"
      >
        {value}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </div>
  )
}

export function SemanticActionBar({
  title,
  description,
  status,
  primaryAction,
  secondaryActions,
}: {
  title: string
  description: string
  status: SemanticPageStatus
  primaryAction?: SemanticPrimaryAction
  secondaryActions?: ReactNode
}) {
  const meta = statusMeta[status]
  return (
    <section
      className="rounded-md border border-slate-200 bg-white px-4 py-3"
      data-testid="semantic-status-banner"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.className)}>
              {meta.icon}
              {meta.label}
            </span>
            {title}
          </div>
          <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction && <PrimaryActionButton action={primaryAction} />}
        </div>
      </div>
    </section>
  )
}

export function SemanticInspectorPanel({
  title,
  description,
  children,
  actions,
  testId,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  testId?: string
}) {
  return (
    <aside
      className="rounded-md border border-slate-200 bg-white p-4"
      data-testid={testId ?? 'domain-inspector-panel'}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
            <PanelRight className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
            {title}
          </div>
          {description && (
            <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      <div className="space-y-4">{children}</div>
    </aside>
  )
}

export function SemanticStatusBanner({
  summary,
  primaryAction,
  secondaryActions,
  testId,
}: {
  summary: SemanticValidationSummary
  primaryAction?: SemanticPrimaryAction
  secondaryActions?: ReactNode
  testId?: string
}) {
  const meta = statusMeta[summary.status]
  return (
    <section
      className="rounded-md border border-slate-200 bg-white px-4 py-3"
      data-testid={testId ?? 'semantic-status-banner'}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium', meta.className)}>
              {meta.icon}
              {meta.label}
            </span>
            <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{summary.title}</div>
          </div>
          <p className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{summary.description}</p>
          {!!summary.stats?.length && (
            <div className="flex flex-wrap gap-2">
              {summary.stats.map((item) => (
                <div key={item.label} className="min-w-[112px] rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">{item.label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!summary.blockers?.length && (
            <div className="space-y-2 rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/8 px-3 py-3">
              <div className="text-xs font-semibold text-[hsl(var(--semantic-error))]">阻塞项</div>
              <ul className="space-y-1 text-xs leading-5 text-[hsl(var(--workbench-ink))]">
                {summary.blockers.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[hsl(var(--semantic-error))]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!summary.hints?.length && (
            <div className="flex flex-wrap gap-2">
              {summary.hints.map((item) => (
                <Badge key={item} variant="outline" className="border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                  {item}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction && <PrimaryActionButton action={primaryAction} />}
        </div>
      </div>
    </section>
  )
}

export function SemanticEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 px-4 py-6 text-center">
      <div className="mb-3 text-slate-400">
        {icon ?? <PanelRight className="h-5 w-5" />}
      </div>
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <p className="mt-1 max-w-md text-xs text-slate-500">
        {description}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
