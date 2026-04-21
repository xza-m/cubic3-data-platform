// frontend/src/v2/components/CommandPalette.tsx
//
// P19: 全局搜索 + 键盘导航。
// 搜索结果：客户端聚合 cubes / domains / metrics list 接口做 substring 过滤。
// TODO(B-back-search): GET /api/v1/search?q=&types=cube,domain,metric 上线后
//   替换 _useClientSearch 为真实 API hook。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Command as CommandIcon, Database, Globe, Search as SearchIcon, TrendingUp, type LucideIcon } from 'lucide-react'
import { Kbd } from '@v2/components/ui'
import { NAV_MODULES, moduleHomePath } from '@v2/layout/navigation'
import { useCubeList, useDomainList } from '@v2/hooks/semantic'
import { useMetricList } from '@v2/hooks/ontology'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon?: LucideIcon
  group: string
  run: () => void
}

// ─── 客户端搜索 hook ──────────────────────────────────────────────────────────
// TODO(B-back-search): 后端 /api/v1/search 上线后替换此 hook

function _useClientSearch(query: string, navigate: ReturnType<typeof useNavigate>, onClose: () => void): PaletteItem[] {
  const cubeQuery = useCubeList({ page_size: 200 })
  const domainQuery = useDomainList({ page_size: 200 })
  const metricQuery = useMetricList()

  const q = query.trim().toLowerCase()

  return useMemo(() => {
    if (!q) return []
    const results: PaletteItem[] = []

    const cubes = cubeQuery.data?.cubes ?? []
    for (const c of cubes) {
      if (`${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase().includes(q)) {
        results.push({
          id: `cube:${c.name}`,
          label: c.title || c.name,
          hint: `Cube · ${c.name}`,
          icon: Database,
          group: 'Cube',
          run: () => { navigate(`/semantic/cubes/${c.name}`); onClose() },
        })
      }
    }

    const domains = domainQuery.data?.domains ?? []
    for (const d of domains) {
      if (`${d.name} ${d.title ?? ''} ${d.description ?? ''}`.toLowerCase().includes(q)) {
        results.push({
          id: `domain:${d.name}`,
          label: d.title || d.name,
          hint: `业务域 · ${d.name}`,
          icon: Globe,
          group: '业务域',
          run: () => { navigate(`/semantic/domains/${d.id ?? d.name}`); onClose() },
        })
      }
    }

    const metrics = metricQuery.data?.items ?? []
    for (const m of metrics) {
      if (`${m.name} ${m.title ?? ''} ${m.object_name}`.toLowerCase().includes(q)) {
        results.push({
          id: `metric:${m.name}`,
          label: m.title || m.name,
          hint: `指标 · ${m.object_name}`,
          icon: TrendingUp,
          group: '指标',
          run: () => { navigate(`/semantic/ontology/objects/${m.object_name}`); onClose() },
        })
      }
    }

    return results.slice(0, 20)
  }, [q, cubeQuery.data, domainQuery.data, metricQuery.data, navigate, onClose])
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const stableOnClose = useCallback(onClose, [onClose])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  // ── 静态导航条目 ──
  const staticItems = useMemo<PaletteItem[]>(() => {
    const quick: PaletteItem[] = [
      {
        id: 'quick:dashboard',
        label: '回到总览',
        hint: '/dashboard',
        icon: NAV_MODULES[0].icon,
        group: '快捷',
        run: () => { navigate('/dashboard'); stableOnClose() },
      },
      {
        id: 'quick:semantic',
        label: '打开本体语义 · 总览',
        hint: '/semantic/ontology',
        icon: NAV_MODULES.find((m) => m.id === 'semantic')!.icon,
        group: '快捷',
        run: () => { navigate('/semantic/ontology'); stableOnClose() },
      },
      {
        id: 'quick:semantic-cubes',
        label: '业务语义 · Cube 列表',
        hint: '/semantic/cubes',
        icon: NAV_MODULES.find((m) => m.id === 'semantic')!.icon,
        group: '快捷',
        run: () => { navigate('/semantic/cubes'); stableOnClose() },
      },
      {
        id: 'quick:relation-canvas',
        label: '语义关系画布',
        hint: '/semantic/relations',
        icon: NAV_MODULES.find((m) => m.id === 'semantic')!.icon,
        group: '快捷',
        run: () => { navigate('/semantic/relations'); stableOnClose() },
      },
    ]
    const fromNav: PaletteItem[] = NAV_MODULES.map((m) => ({
      id: `nav:${m.id}`,
      label: m.label,
      hint: m.implemented ? '跳转到模块' : '即将上线（占位页）',
      icon: m.icon,
      group: m.group,
      run: () => {
        navigate(moduleHomePath(m))
        stableOnClose()
      },
    }))
    return [...quick, ...fromNav]
  }, [navigate, stableOnClose])

  // ── P19: 客户端语义搜索结果 ──
  const searchResults = _useClientSearch(query, navigate, stableOnClose)

  const allItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staticItems
    const filteredStatic = staticItems.filter((it) =>
      `${it.label} ${it.hint ?? ''} ${it.group}`.toLowerCase().includes(q),
    )
    return [...searchResults, ...filteredStatic]
  }, [query, staticItems, searchResults])

  // 选中索引重置
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // ── 键盘处理（↑↓ Enter Esc）──
  useEffect(() => {
    if (!open) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stableOnClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = allItems[selectedIndex]
        if (item) item.run()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, stableOnClose, allItems, selectedIndex])

  // 滚动选中项到视口
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  const grouped = allItems.reduce<Record<string, PaletteItem[]>>((acc, it) => {
    acc[it.group] = acc[it.group] ?? []
    acc[it.group].push(it)
    return acc
  }, {})

  // 构建全局索引映射 group+label → index
  let globalIdx = 0
  const indexMap = new Map<string, number>()
  for (const items of Object.values(grouped)) {
    for (const it of items) {
      indexMap.set(it.id, globalIdx++)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] cmdk-backdrop"
      onClick={stableOnClose}
      role="dialog"
      aria-modal
      aria-label="命令面板"
    >
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        {/* 搜索框 */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <SearchIcon size={14} className="text-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="跳转、搜索 Cube / 域 / 指标…"
            className="flex-1 bg-transparent text-[13px] text-1 placeholder:text-3 outline-none"
            aria-label="搜索"
            role="combobox"
            aria-expanded={allItems.length > 0}
            aria-autocomplete="list"
            aria-activedescendant={`palette-item-${selectedIndex}`}
          />
          <span className="flex items-center gap-1 text-3">
            <Kbd>↑↓</Kbd>
            <span className="text-[11px]">导航</span>
            <Kbd>↵</Kbd>
            <span className="text-[11px]">执行</span>
            <Kbd>esc</Kbd>
          </span>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto scroll-thin py-1" role="listbox">
          {allItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-3">未匹配到任何结果</div>
          ) : (
            Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="px-1.5 pb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-3">
                  {group}
                </div>
                {list.map((it) => {
                  const itemIdx = indexMap.get(it.id) ?? 0
                  const isSelected = itemIdx === selectedIndex
                  const Icon = it.icon ?? CommandIcon
                  return (
                    <button
                      key={it.id}
                      id={`palette-item-${itemIdx}`}
                      data-idx={itemIdx}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className="nav-item w-full"
                      style={isSelected ? { background: 'var(--bg-hover)', color: 'var(--text-1)' } : undefined}
                      onClick={() => it.run()}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                    >
                      <Icon size={14} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.hint ? <span className="text-[11px] text-3">{it.hint}</span> : null}
                      <ArrowRight size={11} className="text-3" />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
