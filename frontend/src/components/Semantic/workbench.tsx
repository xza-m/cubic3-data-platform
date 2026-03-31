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
    <div className={cn('semantic-workbench mx-auto max-w-[1680px] space-y-5 pb-12', className)}>
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
    <header className="border-b border-[hsl(var(--workbench-outline))]/80 px-1 pb-4 pt-0.5" data-testid="semantic-page-header">
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
              className="text-[length:var(--text-display)] font-semibold leading-[var(--leading-display)] tracking-[var(--tracking-display)] text-[hsl(var(--workbench-ink))] md:text-[2.18rem]"
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
            <Code2 className="h-4 w-4 text-[hsl(var(--workbench-accent))]" aria-hidden="true" />
            语义层
          </div>
          <div className="space-y-2">
            <h1 className="text-[2.4rem] font-semibold tracking-[-0.045em] text-[hsl(var(--workbench-ink))]" data-semantic-display="true">
              语义层
            </h1>
            <p className="max-w-3xl text-[1.02rem] leading-8 text-[hsl(var(--workbench-muted-foreground))]">
              统一定义业务语义模型，让数据查询标准化、可复用。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          <Button
            asChild
            className="h-12 rounded-[1.15rem] px-5 text-base shadow-[0_18px_40px_rgba(40,145,225,0.22)]"
            data-testid={actionTestId}
          >
            <Link to={actionHref}>
              {actionIcon ?? <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />}
              {actionLabel}
            </Link>
          </Button>
        </div>
      </div>

      <div className="inline-flex flex-wrap items-center gap-2 rounded-[1.35rem] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.9)] p-1.5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <Button
              key={tab.key}
              asChild
              variant="ghost"
              className={cn(
                'h-12 rounded-[1rem] px-5 text-lg font-medium text-[hsl(var(--workbench-muted-foreground))]',
                isActive
                  ? 'border border-[hsl(var(--workbench-accent))] bg-white text-[hsl(var(--workbench-ink))] shadow-[0_12px_24px_rgba(40,145,225,0.14)]'
                  : 'hover:bg-white/70 hover:text-[hsl(var(--workbench-ink))]',
              )}
            >
              <Link to={tab.href} className="inline-flex items-center gap-2.5">
                {tab.icon}
                {tab.label}
              </Link>
            </Button>
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
        'overflow-hidden rounded-[var(--workbench-radius-lg)] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.92)] shadow-[0_10px_28px_rgba(15,23,42,0.035)]',
        className,
      )}
      data-testid={testId}
    >
      {(title || description || actions || eyebrow) && (
        <div className="border-b border-[hsl(var(--workbench-outline))] bg-[rgba(248,250,252,0.9)] px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              {eyebrow && (
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
                  {eyebrow}
                </div>
              )}
              {title && <div className="text-[0.98rem] font-semibold text-[hsl(var(--workbench-ink))]">{title}</div>}
              {description && (
                <p className="max-w-3xl text-[0.9rem] leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                  {description}
                </p>
              )}
            </div>
            {actions}
          </div>
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
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
        'rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.03)]',
        toneClassName,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
          {label}
        </div>
        {icon ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/90 text-[hsl(var(--workbench-muted-foreground))] shadow-sm">
            {icon}
          </div>
        ) : null}
      </div>
      <div
        className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-[hsl(var(--workbench-ink))]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        data-semantic-display="true"
      >
        {value}
      </div>
      <p className="mt-1.5 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{description}</p>
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
      className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.84)] px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
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
      className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.9)] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]"
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
      className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.88)] px-4 py-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)]"
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
    <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.74)] px-6 py-10 text-center">
      <div className="mb-4 rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4 text-[hsl(var(--workbench-muted-foreground))]">
        {icon ?? <PanelRight className="h-6 w-6" />}
      </div>
      <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]">{title}</div>
      <p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
