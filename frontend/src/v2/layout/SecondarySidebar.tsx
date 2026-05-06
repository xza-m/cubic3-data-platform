// frontend/src/v2/layout/SecondarySidebar.tsx
import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { type NavModule, type SubNavItem, groupLabel } from './navigation'

interface SecondarySidebarProps {
  module: NavModule
  extraSections?: Array<{
    title: ReactNode
    items: Array<{
      label: ReactNode
      to?: string
      meta?: ReactNode
      active?: boolean
      onClick?: () => void
    }>
  }>
}

interface SubNavGroup {
  section: string | null
  items: SubNavItem[]
}

const groupSubnav = (subnav: SubNavItem[] | undefined): SubNavGroup[] => {
  if (!subnav || subnav.length === 0) return []
  const groups: SubNavGroup[] = []
  const indexBySection = new Map<string, number>()
  for (const item of subnav) {
    const key = item.section ?? '__default__'
    let idx = indexBySection.get(key)
    if (idx === undefined) {
      idx = groups.length
      indexBySection.set(key, idx)
      groups.push({ section: item.section ?? null, items: [] })
    }
    groups[idx].items.push(item)
  }
  return groups
}

export function SecondarySidebar({ module, extraSections }: SecondarySidebarProps) {
  const groups = groupSubnav(module.subnav)
  return (
    <aside
      className="surface hidden h-full w-[248px] shrink-0 flex-col border-r lg:flex"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="text-[11px] uppercase tracking-wide text-3">{groupLabel(module.group)}</div>
        <div className="mt-1 flex items-center gap-2">
          <module.icon size={14} className="text-[color:var(--accent)]" />
          <div className="text-[13px] font-semibold text-1">{module.label}</div>
        </div>
        {module.description ? (
          <div className="mt-1 text-[11px] text-3 leading-4">{module.description}</div>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className="px-2 pb-2">
          {groups.map((g, gIdx) => (
            <div key={gIdx} className={gIdx === 0 ? '' : 'mt-3'}>
              {g.section ? (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-3">
                  {g.section}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {g.items.map((s) => (
                  <NavLink
                    key={s.path}
                    to={s.path}
                    end
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <ChevronRight size={12} className="text-3" />
                    <span className="flex-1 truncate">{s.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-3">
        {extraSections?.map((section, idx) => (
          <div key={idx} className="mt-2">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-3">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item, ii) => {
                const className = `nav-item ${item.active ? 'active' : ''}`
                if (item.to) {
                  return (
                    <NavLink
                      key={ii}
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `nav-item ${isActive || item.active ? 'active' : ''}`
                      }
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.meta ? (
                        <span className="text-[10px] text-3">{item.meta}</span>
                      ) : null}
                    </NavLink>
                  )
                }
                return (
                  <button
                    key={ii}
                    type="button"
                    className={`${className} w-full text-left`}
                    onClick={item.onClick}
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.meta ? (
                      <span className="text-[10px] text-3">{item.meta}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
