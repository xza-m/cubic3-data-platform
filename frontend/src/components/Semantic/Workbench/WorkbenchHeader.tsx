import { Bot, Eye, FileCode2, FlaskConical, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { cn } from '@/lib/utils'

type WorkspaceTab = 'modeling' | 'preview' | 'yaml' | 'python'

const tabItems: Array<{ key: WorkspaceTab; label: string; icon: typeof Bot }> = [
  { key: 'modeling', label: '建模', icon: Bot },
  { key: 'preview', label: '预览', icon: Eye },
  { key: 'yaml', label: 'YAML', icon: FileCode2 },
  { key: 'python', label: 'PY', icon: FlaskConical },
]

function getStatusLabel(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return '已发布'
  if (normalized === 'draft') return '草稿'
  if (normalized === 'deprecated') return '已废弃'
  return '未标记'
}

export function WorkbenchHeader({
  cube,
  activeTab,
  onTabChange,
}: {
  cube: CubeSummary
  activeTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[hsl(var(--workbench-outline))] bg-[radial-gradient(circle_at_top_left,rgba(66,153,225,0.18),transparent_38%),linear-gradient(135deg,#071A2F_0%,#102A43_48%,#EDF6FF_180%)] shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-6 px-5 py-5 text-white md:px-7 md:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/78">
              <Bot className="h-3.5 w-3.5" />
              语义工作台
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-[2.5rem]">语义工作台</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/72">
                <span>{cube.title}</span>
                <span className="hidden h-1.5 w-1.5 rounded-full bg-white/35 md:inline-block" />
                <span className="font-mono text-xs text-white/60">{cube.name}</span>
                <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-xs text-white/88">
                  {getStatusLabel(cube.status)}
                </span>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-white/74 md:text-[0.96rem]">
              以 AI 起步的开发流先完成建模骨架，再进入预览、YAML 和 Python 视图做校验与细化。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/semantic/cubes/${cube.name}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white/92"
            >
              <Rocket className="h-4 w-4" />
              发布
            </Link>
          </div>
        </div>

        <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-[20px] border border-white/10 bg-white/8 p-2 backdrop-blur">
          {tabItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.key

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                data-testid={`devtools-tab-${item.key}`}
                data-state={isActive ? 'active' : 'inactive'}
                className={cn(
                  'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.14)]'
                    : 'text-white/72 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
