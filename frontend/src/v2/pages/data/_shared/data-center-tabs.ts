import { Activity, Boxes, GitBranch, RefreshCw, ServerCog, Settings2, Timer, type LucideIcon } from 'lucide-react'
import { t } from '@v2/i18n'

export type DataCenterTab = 'overview' | 'connections' | 'assets' | 'sync' | 'impact'
export type DataCenterSyncTab = 'tasks' | 'runs' | 'config'

interface DataCenterTabItem<TTab extends string> {
  id: TTab
  label: string
  icon: LucideIcon
  path: string
}

export const DATA_CENTER_TABS: Array<DataCenterTabItem<DataCenterTab>> = [
  { id: 'overview', label: t('dataCenter.tab.overview', '概览'), icon: Activity, path: '/data-center' },
  { id: 'connections', label: t('dataCenter.tab.connections', '连接管理'), icon: ServerCog, path: '/data-center/connections' },
  { id: 'assets', label: t('dataCenter.tab.assets', '资产目录'), icon: Boxes, path: '/data-center/assets' },
  { id: 'sync', label: t('dataCenter.tab.sync', '同步任务'), icon: RefreshCw, path: '/data-center/sync' },
  { id: 'impact', label: t('dataCenter.tab.impact', '影响分析'), icon: GitBranch, path: '/data-center/impact' },
]

export const DATA_CENTER_SYNC_TABS: Array<DataCenterTabItem<DataCenterSyncTab>> = [
  { id: 'tasks', label: t('dataCenter.syncTab.tasks', '任务列表'), icon: RefreshCw, path: '/data-center/sync/tasks' },
  { id: 'runs', label: t('dataCenter.syncTab.runs', '同步记录'), icon: Timer, path: '/data-center/sync/runs' },
  { id: 'config', label: t('dataCenter.syncTab.config', '同步配置'), icon: Settings2, path: '/data-center/sync/config' },
]

export function dataCenterTabFromPath(pathname: string): DataCenterTab {
  if (pathname.startsWith('/data-center/connections')) return 'connections'
  if (pathname.startsWith('/data-center/assets')) return 'assets'
  if (pathname.startsWith('/data-center/sync')) return 'sync'
  if (pathname.startsWith('/data-center/impact')) return 'impact'
  return 'overview'
}

export function dataCenterSyncTabFromPath(pathname: string): DataCenterSyncTab {
  if (pathname.startsWith('/data-center/sync/runs')) return 'runs'
  if (pathname.startsWith('/data-center/sync/config')) return 'config'
  return 'tasks'
}
