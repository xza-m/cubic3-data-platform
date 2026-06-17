import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Database, GitMerge, RefreshCw, ScanSearch, Table2 } from 'lucide-react'
import { Tabs, Tab } from '@v2/components/ui'

const ASSET_TABS = [
  { path: '/semantic/assets', label: '资产雷达', icon: Database, exact: true },
  { path: '/semantic/assets/tables', label: '物理表', icon: Table2 },
  { path: '/semantic/assets/table-profile', label: '表画像', icon: Activity },
  { path: '/semantic/assets/field-profile', label: '字段画像', icon: ScanSearch },
  { path: '/semantic/assets/lineage-usage', label: '血缘使用', icon: GitMerge },
  { path: '/semantic/assets/sync', label: '元数据同步', icon: RefreshCw },
]

export default function AssetLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)
  const activePath = ASSET_TABS.find(({ path, exact }) => isActive(path, exact))?.path ?? '/semantic/assets'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0" style={{ background: 'var(--bg-surface)' }}>
        <Tabs
          value={activePath}
          onChange={(path) => navigate(path)}
          className="px-4"
          aria-label="语义资产导航"
        >
          {ASSET_TABS.map(({ path, label, icon: Icon }) => (
            <Tab key={path} value={path} id={`asset-tab-${path.replace(/[^a-z0-9]+/gi, '-')}`}>
              <Icon size={12} />
              {label}
            </Tab>
          ))}
        </Tabs>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
