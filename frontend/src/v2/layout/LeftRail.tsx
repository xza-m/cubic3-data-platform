// frontend/src/v2/layout/LeftRail.tsx
import { useNavigate } from 'react-router-dom'
import { Command, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from '@v2/components/ThemeProvider'
import { Tooltip } from '@v2/components/ui'
import { NAV_MODULES, findModule, moduleHomePath } from './navigation'

interface LeftRailProps {
  pathname: string
  onOpenCommandPalette: () => void
}

export function LeftRail({ pathname, onOpenCommandPalette }: LeftRailProps) {
  const navigate = useNavigate()
  const { effectiveTheme, toggle } = useTheme()
  const isDark = effectiveTheme === 'dark'
  const active = findModule(pathname)

  return (
    <div
      className="rail flex h-full w-12 flex-col items-center justify-between border-r py-2"
      style={{ background: 'var(--bg-rail)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="mb-2 flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
          title="Cubic³ 数据平台"
        >
          C³
        </div>
        {NAV_MODULES.map((m) => {
          const Icon = m.icon
          const isActive = active?.id === m.id
          return (
            <Tooltip
              key={m.id}
              label={
                <span>
                  {m.label}
                  {!m.implemented ? <span className="ml-1 text-3">（即将上线）</span> : null}
                </span>
              }
              side="right"
            >
              <button
                type="button"
                aria-label={m.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigate(moduleHomePath(m))}
                className={`rail-btn ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
              </button>
            </Tooltip>
          )
        })}
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Tooltip label="命令面板  ⌘K" side="right">
          <button
            type="button"
            className="rail-btn"
            onClick={onOpenCommandPalette}
            aria-label="打开命令面板"
          >
            <Command size={16} />
          </button>
        </Tooltip>
        <Tooltip label={isDark ? '切换浅色主题' : '切换暗色主题'} side="right">
          <button type="button" className="rail-btn" onClick={toggle} aria-label="切换主题">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
        <Tooltip label="设置" side="right">
          <button type="button" className="rail-btn" aria-label="设置">
            <Settings size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
