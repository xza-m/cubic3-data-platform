import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import {
  Activity,
  Bell,
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  Grid3X3,
  HardDrive,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Radio,
  Settings,
  Sparkles,
  Store,
  Table2,
  Terminal,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CommandPalette from '../CommandPalette'
import AIAssistant from '../AIAssistant'
import NotificationCenter from '../NotificationCenter'

/* ---------- navigation config ---------- */

type NavItem =
  | { path: string; icon: LucideIcon; label: string }
  | { key: string; icon: LucideIcon; label: string; children: { path: string; icon: LucideIcon; label: string }[] }

const navigation: NavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  { path: '/queries', icon: Terminal, label: '查询分析' },
  {
    key: 'data-center',
    icon: Database,
    label: '数据中心',
    children: [
      { path: '/data-center/datasources', icon: HardDrive, label: '数据源' },
      { path: '/data-center/datasets', icon: Table2, label: '数据集' },
    ],
  },
  {
    key: 'app-center',
    icon: Grid3X3,
    label: '应用中心',
    children: [
      { path: '/apps', icon: Store, label: '应用市场' },
      { path: '/executions', icon: Activity, label: '执行监控' },
    ],
  },
  {
    key: 'config-center',
    icon: Settings,
    label: '配置中心',
    children: [
      { path: '/config/channels', icon: Radio, label: '渠道管理' },
      { path: '/config/subscriptions', icon: Link2, label: '订阅管理' },
    ],
  },
  {
    key: 'semantic-center',
    icon: Layers,
    label: '语义中心',
    children: [
      { path: '/semantic/workbench', icon: LayoutDashboard, label: '语义工作台' },
      { path: '/semantic/cubes', icon: Box, label: 'Cube 管理' },
      { path: '/semantic/modeling', icon: GitBranch, label: '领域建模' },
    ],
  },
  { path: '/data-chat', icon: Bot, label: '智能问数' },
]

const DEFAULT_EXPANDED_MENUS = navigation
  .filter((item): item is Extract<NavItem, { key: string }> => 'key' in item)
  .map((item) => item.key)

/* ---------- component ---------- */

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState<string[]>(DEFAULT_EXPANDED_MENUS)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const isDashboardRoute = location.pathname === '/dashboard'

  // ⌘K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isActive = (path?: string) => {
    if (!path) return false
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const isParentActive = (children?: { path: string }[]) =>
    children?.some((c) => isActive(c.path)) ?? false

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside data-testid="app-shell-sidebar" className="flex w-60 shrink-0 flex-col bg-[#0F172A] px-4 py-6">
        {/* Logo */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mb-6 flex items-center gap-3 px-3 cursor-pointer"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold text-white font-['Inter']">Cubic&sup3;</span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const hasChildren = 'children' in item
            const active = hasChildren ? isParentActive(item.children) : isActive(item.path)
            const expanded = hasChildren ? expandedMenus.includes(item.key) || isParentActive(item.children) : false

            return (
              <div key={'path' in item ? item.path : item.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (hasChildren) toggleMenu(item.key)
                    else navigate(item.path)
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                    active && !hasChildren
                      ? 'bg-[#1E293B] font-medium text-white'
                      : 'text-[#94A3B8] hover:bg-[#1E293B]/50 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left font-['Inter']">{item.label}</span>
                  {hasChildren ? (
                    expanded
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                  ) : null}
                </button>

                {hasChildren && expanded ? (
                  <div className="mt-1 space-y-0.5">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon
                      const childActive = isActive(child.path)
                      return (
                        <button
                          key={child.path}
                          type="button"
                          onClick={() => navigate(child.path)}
                          className={`flex w-full items-center gap-2 rounded-md py-2 pl-11 pr-3 text-[13px] transition-colors cursor-pointer ${
                            childActive
                              ? 'font-medium text-white'
                              : 'text-[#94A3B8] hover:text-slate-200'
                          }`}
                        >
                          <ChildIcon className="h-4 w-4 shrink-0" />
                          <span className="font-['Inter']">{child.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        {/* User section */}
        <div className="mt-4 border-t border-[#1E293B] pt-4">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#334155] text-white">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-white font-['Inter']">数据工程师</div>
              <div className="text-xs text-[#94A3B8] font-['Inter']">管理员</div>
            </div>
            {!isDashboardRoute ? (
              <>
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="relative shrink-0 text-[#94A3B8] transition-colors hover:text-white cursor-pointer"
                  aria-label="通知中心"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="shrink-0 text-[#94A3B8] transition-colors hover:text-white cursor-pointer"
                  aria-label="退出登录"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <OverlayScrollbarsComponent
          className="h-full"
          options={{ scrollbars: { autoHide: 'scroll', autoHideDelay: 800 } }}
        >
          <Outlet />
        </OverlayScrollbarsComponent>
      </main>

      {/* AI FAB */}
      {!aiAssistantOpen && !isDashboardRoute && (
        <button
          onClick={() => setAiAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition-shadow"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Overlays */}
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
      <AIAssistant open={aiAssistantOpen} onClose={() => setAiAssistantOpen(false)} />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  )
}
