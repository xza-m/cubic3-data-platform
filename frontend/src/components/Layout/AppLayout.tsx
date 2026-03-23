/**
 * 现代化应用布局
 * 参考 DataPulse 设计风格
 */
import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import {
  Database,
  Table2,
  BarChart3,
  Settings,
  User,
  Bell,
  Menu,
  X,
  MessageSquare,
  Code,
  FolderTree,
  ChevronDown,
  ChevronRight,
  AppWindow,
  Radio,
  Link2,
  Hexagon,
  Box,
  GitBranch,
  Wrench,
} from 'lucide-react'

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const isSemanticRoute = location.pathname.startsWith('/semantic')

  const menuItems = [
    { path: '/dashboard', icon: BarChart3, label: '控制台', color: 'indigo' },
    { path: '/queries', icon: Code, label: '查询中心', color: 'cyan' },
    {
      key: 'data-center',
      icon: FolderTree,
      label: '数据中心',
      color: 'blue',
      children: [
        { path: '/data-center/datasources', icon: Database, label: '数据源' },
        { path: '/data-center/datasets', icon: Table2, label: '数据集' }
      ]
    },
    {
      key: 'app-center',
      icon: AppWindow,
      label: '应用中心',
      color: 'purple',
      children: [
        { path: '/apps', icon: AppWindow, label: '应用市场' },
        { path: '/executions', icon: BarChart3, label: '执行监控' }
      ]
    },
    {
      key: 'config-center',
      icon: Settings,
      label: '配置中心',
      color: 'emerald',
      children: [
        { path: '/config/channels', icon: Radio, label: '渠道管理' },
        { path: '/config/subscriptions', icon: Link2, label: '订阅管理' }
      ]
    },
    {
      key: 'semantic-center',
      icon: Hexagon,
      label: '语义中心',
      color: 'indigo',
      children: [
        { path: '/semantic/overview', icon: Box, label: '总览' },
        { path: '/semantic/cubes', icon: Box, label: 'Cube' },
        { path: '/semantic/domains', icon: FolderTree, label: '领域目录' },
        { path: '/semantic/modeling', icon: GitBranch, label: '领域建模' },
        { path: '/semantic/tools', icon: Wrench, label: '开发工具' },
      ],
    },
    { path: '/data-chat', icon: MessageSquare, label: '智能问数', color: 'pink' }
  ]

  const isActive = (path?: string) => {
    if (!path) return false
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const isMenuExpanded = (key: string) => expandedMenus.includes(key)

  const toggleMenu = (key: string) => {
    setExpandedMenus(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // 自动展开当前活动的父菜单
  const isParentActive = (children?: Array<{ path: string }>) => {
    if (!children) return false
    return children.some(child => isActive(child.path))
  }

  const getColorClasses = (color: string, active: boolean) => {
    if (!active) return ''
    const colors: Record<string, string> = {
      indigo: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      cyan: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      blue: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      emerald: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      purple: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      pink: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      orange: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]',
      teal: 'bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]'
    }
    return colors[color] || ''
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f8f6_0%,#f2f4f8_100%)] text-slate-900">
      {/* 顶部导航栏 */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="h-full px-5 flex items-center justify-between">
          {/* 左侧：Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-white transition-colors lg:hidden"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-[1.05rem] font-semibold tracking-tight text-slate-900">CUBIC3</h1>
                <p className="text-[11px] tracking-[0.08em] text-slate-400">3 Layers: Source, Semantic, Application</p>
              </div>
            </div>
          </div>

          {/* 右侧：用户操作 */}
          <div className="flex items-center gap-2">
            <button className="relative w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 hover:text-slate-900 transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>

            <div className="hidden sm:flex items-center gap-3 ml-2 pl-4 border-l border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center ring-2 ring-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                <User className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Admin</div>
                <div className="text-xs text-slate-500">管理员</div>
              </div>
            </div>

          </div>
        </div>
      </header>

      <div className="flex pt-16">
        {/* 侧边栏 */}
        <aside
          className={`
            fixed left-0 top-16 bottom-0 z-40
            border-r border-slate-200/80 bg-[rgba(251,251,252,0.92)] backdrop-blur-xl
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'w-60' : 'w-20'}
          `}
        >
          {/* 导航菜单 */}
          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const hasChildren = 'children' in item && item.children
              const active = hasChildren ? isParentActive(item.children) : isActive('path' in item ? item.path : undefined)
              const expanded = hasChildren && 'key' in item ? isMenuExpanded(item.key) || isParentActive(item.children) : false

              return (
                <div key={'path' in item ? item.path : item.key}>
                  {/* 主菜单项 */}
                  <button
                    onClick={() => {
                      if (hasChildren && 'key' in item) {
                        toggleMenu(item.key)
                      } else if ('path' in item) {
                        navigate(item.path)
                      }
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl
                      font-medium transition-all duration-200 cursor-pointer
                      ${active
                        ? getColorClasses(item.color, true)
                        : 'text-slate-600 hover:bg-white/85 hover:text-slate-900'
                      }
                    `}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? '' : 'text-slate-400'}`} />
                    {sidebarOpen && (
                      <>
                        <span className={`text-sm flex-1 text-left ${active ? 'text-white' : ''}`}>
                          {item.label}
                        </span>
                        {hasChildren && (
                          expanded ?
                            <ChevronDown className="w-4 h-4" /> :
                            <ChevronRight className="w-4 h-4" />
                        )}
                      </>
                    )}
                  </button>

                  {/* 子菜单 */}
                  {hasChildren && expanded && sidebarOpen && (
                    <div className="mt-1 ml-4 space-y-1">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon
                        const childActive = isActive(child.path)

                        return (
                          <button
                            key={child.path}
                            onClick={() => navigate(child.path)}
                         className={`
                              w-full flex items-center gap-3 px-4 py-2.5 rounded-xl
                              text-sm transition-all duration-200
                              ${childActive
                                ? 'border border-slate-200 bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:bg-white/75 hover:text-slate-900'
                              }
                            `}
                          >
                            <ChildIcon className={`w-4 h-4 flex-shrink-0 ${childActive ? 'text-slate-900' : 'text-slate-400'}`} />
                            <span>{child.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* 底部信息 */}
          {sidebarOpen && (
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-slate-700">系统运行正常</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>版本</span>
                    <span className="font-medium text-slate-700">v2.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>架构</span>
                    <span className="font-medium text-slate-700">DDD/CQRS</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* 主内容区 */}
        <main
          className={`
            flex-1 min-h-[calc(100vh-4rem)] overflow-hidden
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'ml-60' : 'ml-20'}
          `}
        >
          <OverlayScrollbarsComponent
            className="app-scroll-area h-[calc(100vh-4rem)]"
            options={{
              scrollbars: {
                autoHide: 'scroll',
                autoHideDelay: 800,
              },
            }}
          >
            <div className={`mx-auto p-8 ${isSemanticRoute ? 'max-w-[1680px]' : 'max-w-7xl'}`}>
              <Outlet />
            </div>
          </OverlayScrollbarsComponent>
        </main>
      </div>
    </div>
  )
}
