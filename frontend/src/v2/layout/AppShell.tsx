// frontend/src/v2/layout/AppShell.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useMyPreferences } from '@v2/hooks/userPreferences'
import { UiPreferenceContext, type UiPreference } from './uiPreference'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LeftRail } from './LeftRail'
import { SecondarySidebar } from './SecondarySidebar'
import { TopBar } from './TopBar'
import { TabStrip, type TabItem } from './TabStrip'
import { Inspector } from './Inspector'
import { StatusBar } from './StatusBar'
import { CommandPalette } from '@v2/components/CommandPalette'
import { findLayout, findModule, NAV_MODULES } from './navigation'

interface ContextPanelPayload {
  title?: ReactNode
  subtitle?: ReactNode
  body?: ReactNode
  defaultExpanded?: boolean
}

export interface LegacyInspectorPayload {
  open: boolean
  title?: ReactNode
  subtitle?: ReactNode
  body?: ReactNode
}

export interface ManagedTab extends TabItem {
  to?: string
  onClose?: () => boolean | void
}

export function resolveActiveManagedTabId(tabs: ManagedTab[], pathname: string): string | null {
  return tabs.find((tab) => tab.to === pathname)?.id ?? null
}

export function resolveVisibleManagedTabs(tabs: ManagedTab[], pathname: string): ManagedTab[] {
  return resolveActiveManagedTabId(tabs, pathname) == null ? [] : tabs
}

interface AppShellContextValue {
  setBreadcrumbs: (segments: string[]) => void
  setTopBarActions: (actions: ReactNode) => void
  setSidebarSections: (
    sections:
      | Array<{
          title: ReactNode
          items: Array<{
            label: ReactNode
            to?: string
            meta?: ReactNode
            active?: boolean
            onClick?: () => void
          }>
        }>
      | null,
  ) => void
  setContextPanel: (payload: ContextPanelPayload | null) => void
  setInspector: (payload: LegacyInspectorPayload) => void
  setInspectorEmptyState: (node: ReactNode | null) => void
  openTab: (tab: ManagedTab) => void
  closeTab: (id: string) => void
  setTabs: (tabs: ManagedTab[]) => void
  setActiveTab: (id: string | null) => void
  openCommandPalette: () => void
  setPeekActive: (active: boolean) => void
}

const INSPECTOR_COLLAPSED_KEY = 'cubic3.inspector.collapsed'

// UiPreference Context（表格密度等）已抽到 ./uiPreference，避免底层 UI 原语反向依赖 shell 成环。

// ── AppShell Context ───────────────────────────────────────────────────────────

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShell')
  return ctx
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const module = findModule(location.pathname) ?? NAV_MODULES[0]

  // ── 用户偏好：表格密度（主题已收敛到 ThemeProvider，避免重复写 dark 类）──
  const { data: userPrefs } = useMyPreferences()

  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([module.label])
  const [topBarActions, setTopBarActions] = useState<ReactNode>(null)
  const [tabs, setTabs] = useState<ManagedTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [contextPanel, setContextPanelState] = useState<ContextPanelPayload | null>(null)
  const [legacyEmptyState, setLegacyEmptyState] = useState<ReactNode | null>(null)
  const [peekActive, setPeekActive] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(INSPECTOR_COLLAPSED_KEY)
    return stored == null ? true : stored === '1'
  })
  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((cur) => {
      const next = !cur
      try {
        window.localStorage.setItem(INSPECTOR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }, [])
  const setContextPanel = useCallback((payload: ContextPanelPayload | null) => {
    if (payload?.defaultExpanded) {
      setInspectorCollapsed(false)
    }
    setContextPanelState(payload)
  }, [])
  const [sidebarSections, setSidebarSections] = useState<
    Array<{
      title: ReactNode
      items: Array<{
        label: ReactNode
        to?: string
        meta?: ReactNode
        active?: boolean
        onClick?: () => void
      }>
    }> | null
  >(null)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  useEffect(() => {
    setBreadcrumbs([module.label])
    setTopBarActions(null)
    setContextPanel(null)
    setLegacyEmptyState(null)
    setSidebarSections(null)
    setPeekActive(false)
  }, [module.id, module.label, setContextPanel])

  useEffect(() => {
    setTabs([])
    setActiveTab(null)
  }, [module.id])

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const meta = isMac ? e.metaKey : e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  const openTab = useCallback((tab: ManagedTab) => {
    setTabs((current) => {
      const exists = current.find((t) => t.id === tab.id)
      if (exists) {
        return current.map((t) => (t.id === tab.id ? { ...t, ...tab } : t))
      }
      return [...current, tab]
    })
    setActiveTab(tab.id)
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((current) => {
        const target = current.find((t) => t.id === id)
        if (!target) return current
        if (target.onClose) {
          const ret = target.onClose()
          if (ret === false) return current
        }
        const idx = current.findIndex((t) => t.id === id)
        const next = current.filter((t) => t.id !== id)
        if (activeTab === id) {
          const sibling = next[Math.max(0, idx - 1)]
          if (sibling?.to) navigate(sibling.to)
          setActiveTab(sibling?.id ?? null)
        }
        return next
      })
    },
    [activeTab, navigate],
  )

  const setInspectorLegacy = useCallback((payload: LegacyInspectorPayload) => {
    if (!payload.open) {
      setContextPanel(null)
      return
    }
    setContextPanel({ title: payload.title, subtitle: payload.subtitle, body: payload.body })
  }, [setContextPanel])

  const setInspectorEmptyStateLegacy = useCallback((node: ReactNode | null) => {
    setLegacyEmptyState(node)
  }, [])

  const ctxValue = useMemo<AppShellContextValue>(
    () => ({
      setBreadcrumbs,
      setTopBarActions,
      setSidebarSections,
      setContextPanel,
      setInspector: setInspectorLegacy,
      setInspectorEmptyState: setInspectorEmptyStateLegacy,
      openTab,
      closeTab,
      setTabs,
      setActiveTab,
      openCommandPalette: openPalette,
      setPeekActive,
    }),
    [openPalette, openTab, closeTab, setContextPanel, setInspectorLegacy, setInspectorEmptyStateLegacy],
  )

  const effectiveContextPanel: ContextPanelPayload | null =
    contextPanel ?? (legacyEmptyState ? { body: legacyEmptyState } : null)
  const resolvedLayout = useMemo(
    () => findLayout(location.pathname, module),
    [location.pathname, module],
  )
  const showSecondarySidebar = resolvedLayout.secondarySidebar
  const showInspector = resolvedLayout.inspector
  const hideBreadcrumbs = resolvedLayout.hideBreadcrumbs
  const hasInspectorContent = effectiveContextPanel?.body != null

  const routeActiveTabId = useMemo(
    () => resolveActiveManagedTabId(tabs, location.pathname),
    [tabs, location.pathname],
  )
  const visibleTabs = useMemo(
    () => resolveVisibleManagedTabs(tabs, location.pathname),
    [tabs, location.pathname],
  )

  useEffect(() => {
    setActiveTab(routeActiveTabId)
  }, [routeActiveTabId])

  const tabsWithActive = useMemo(
    () =>
      visibleTabs.map((t) => ({
        ...t,
        active: routeActiveTabId ? t.id === routeActiveTabId : activeTab ? t.id === activeTab : t.active,
      })),
    [visibleTabs, routeActiveTabId, activeTab],
  )

  const onSelectTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id)
      setActiveTab(id)
      if (tab?.to) navigate(tab.to)
    },
    [tabs, navigate],
  )

  const uiPref = useMemo<UiPreference>(
    () => ({ tableDensity: userPrefs?.table_density ?? 'comfortable' }),
    [userPrefs?.table_density],
  )

  return (
    <UiPreferenceContext.Provider value={uiPref}>
    <AppShellContext.Provider value={ctxValue}>
      <div className="app-bg flex h-screen w-screen overflow-hidden">
        <LeftRail pathname={location.pathname} onOpenCommandPalette={openPalette} />
        {showSecondarySidebar ? (
          <SecondarySidebar module={module} extraSections={sidebarSections ?? undefined} />
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar
            breadcrumbs={breadcrumbs}
            actions={topBarActions}
            onOpenCommandPalette={openPalette}
            hideBreadcrumbs={hideBreadcrumbs}
          />
          {tabsWithActive.length > 0 ? (
            <TabStrip
              tabs={tabsWithActive}
              onSelect={onSelectTab}
              onClose={(id) => closeTab(id)}
            />
          ) : null}
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </section>
            {peekActive || !showInspector || !hasInspectorContent ? null : (
              <Inspector
                title={effectiveContextPanel?.title}
                subtitle={effectiveContextPanel?.subtitle}
                collapsed={inspectorCollapsed}
                onToggleCollapse={toggleInspectorCollapsed}
              >
                {effectiveContextPanel?.body}
              </Inspector>
            )}
          </div>
          <StatusBar />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </AppShellContext.Provider>
    </UiPreferenceContext.Provider>
  )
}
