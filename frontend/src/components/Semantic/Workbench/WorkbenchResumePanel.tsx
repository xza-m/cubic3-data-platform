import { ArrowRight, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'

function getStatusTone(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (normalized === 'draft') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function getStatusLabel(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return '已发布'
  if (normalized === 'draft') return '草稿'
  return '未标记'
}

export function WorkbenchResumePanel({
  title,
  description,
  cubes,
  emptyText,
}: {
  title: string
  description: string
  cubes: CubeSummary[]
  emptyText: string
}) {
  return (
    <section className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-white/92 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[hsl(var(--workbench-ink))]">{title}</h2>
          <p className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{description}</p>
        </div>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--workbench-surface))] text-[hsl(var(--workbench-muted-foreground))]">
          <Clock3 className="h-4 w-4" />
        </div>
      </div>

      {cubes.length > 0 ? (
        <div className="mt-4 space-y-3">
          {cubes.slice(0, 4).map((cube) => (
            <Link
              key={cube.name}
              to={`/semantic/workbench?cube=${encodeURIComponent(cube.name)}`}
              className="flex items-center gap-3 rounded-[20px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-3 transition hover:border-[hsl(var(--workbench-accent))]/30 hover:bg-white"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">{cube.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  <span className="font-mono">{cube.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 ${getStatusTone(cube.status)}`}>
                    {getStatusLabel(cube.status)}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-5 text-sm text-[hsl(var(--workbench-muted-foreground))]">
          {emptyText}
        </div>
      )}
    </section>
  )
}
