import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { Badge } from '@/components/ui/badge'

function getStatusLabel(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return '已发布'
  if (normalized === 'draft') return '草稿'
  return '未标记'
}

function getStatusVariant(status?: string): 'default' | 'secondary' | 'outline' {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'default'
  if (normalized === 'draft') return 'secondary'
  return 'outline'
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
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>

      {cubes.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {cubes.slice(0, 4).map((cube) => (
            <Link
              key={cube.name}
              to={`/semantic/workbench?cube=${encodeURIComponent(cube.name)}`}
              className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{cube.title}</div>
                <span className="font-mono text-xs text-slate-400">{cube.name}</span>
              </div>
              <Badge variant={getStatusVariant(cube.status)}>{getStatusLabel(cube.status)}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-slate-500">
          {emptyText}
        </div>
      )}
    </section>
  )
}
