// frontend/src/v2/pages/semantic/ontology/_layout.tsx
//
// Ontology Workbench 布局组件。
// 提供二级导航 Tab（工作台 / 对象 / 指标 / 关系 / 治理）。

import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, GitMerge, LayoutDashboard, Shield, TrendingUp } from 'lucide-react'
import { Tabs, Tab } from '@v2/components/ui'
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
  const activePath = NAV_ITEMS.find(({ path, exact }) => isActive(path, exact))?.path ?? '/semantic/ontology'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 二级导航 */}
      <div className="shrink-0" style={{ background: 'var(--bg-surface)' }}>
        <Tabs
          value={activePath}
          onChange={(path) => navigate(path)}
          className="px-4"
          aria-label={t('ontology.tabNavigation', '本体与关系导航')}
        >
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            return (
              <Tab
                key={path}
                value={path}
                id={`ontology-tab-${path.replace(/[^a-z0-9]+/gi, '-')}`}
              >
                <Icon size={12} />
                {label}
              </Tab>
            )
          })}
        </Tabs>
      </div>

      {/* 子路由内容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
