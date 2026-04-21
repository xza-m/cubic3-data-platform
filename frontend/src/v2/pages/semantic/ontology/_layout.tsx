// frontend/src/v2/pages/semantic/ontology/_layout.tsx
//
// Ontology Workbench 布局组件。
// 提供二级导航 Tab（工作台 / 对象 / 指标 / 关系 / 治理）。

import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, GitMerge, LayoutDashboard, Shield, TrendingUp } from 'lucide-react'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'

const NAV_ITEMS = [
  { path: '/semantic/ontology', label: t('ontology.tab.workbench', '工作台'), icon: LayoutDashboard, exact: true },
  { path: '/semantic/ontology/objects', label: t('ontology.tab.objects', '业务对象'), icon: Boxes },
  { path: '/semantic/ontology/metrics', label: t('ontology.tab.metrics', '指标'), icon: TrendingUp },
  { path: '/semantic/ontology/relations', label: t('ontology.tab.relations', '关系'), icon: GitMerge },
  { path: '/semantic/ontology/governance', label: t('ontology.tab.governance', '治理'), icon: Shield },
]

export default function OntologyLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setBreadcrumbs } = useAppShell()

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.ontology', '本体工作台')])
  }, [setBreadcrumbs])

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 二级导航 */}
      <div
        className="flex items-center gap-1 border-b px-4"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {NAV_ITEMS.map(({ path, label, icon: Icon, exact }) => {
          const active = isActive(path, exact)
          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className="flex items-center gap-1.5 rounded px-2.5 py-2 text-xs transition-colors"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-2)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
                background: 'transparent',
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          )
        })}
      </div>

      {/* 子路由内容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
