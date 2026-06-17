import { useLocation, useNavigate } from 'react-router-dom'
import { Tab, Tabs } from '@v2/components/ui'
import { t } from '@v2/i18n'
import {
  DATA_CENTER_SYNC_TABS,
  DATA_CENTER_TABS,
  dataCenterSyncTabFromPath,
  dataCenterTabFromPath,
} from './data-center-tabs'

export function DataCenterNavTabs({ className }: { className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = dataCenterTabFromPath(location.pathname)

  return (
    <Tabs
      value={activeTab}
      onChange={(value) => {
        const target = DATA_CENTER_TABS.find((item) => item.id === value)
        if (target) navigate(target.path)
      }}
      aria-label={t('dataCenter.nav.ariaLabel', '数据中心')}
      className={className}
    >
      {DATA_CENTER_TABS.map((item) => (
        <Tab key={item.id} value={item.id}>
          <item.icon size={13} aria-hidden />
          {item.label}
        </Tab>
      ))}
    </Tabs>
  )
}

export function DataCenterSyncTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = dataCenterSyncTabFromPath(location.pathname)

  return (
    <div className="border-b px-5 pt-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <DataCenterNavTabs />
      <Tabs
        value={activeTab}
        onChange={(value) => {
          const target = DATA_CENTER_SYNC_TABS.find((item) => item.id === value)
          if (target) navigate(target.path)
        }}
        size="sm"
        aria-label={t('dataCenter.syncTab.ariaLabel', '同步任务')}
        className="mt-2"
      >
        {DATA_CENTER_SYNC_TABS.map((item) => (
          <Tab key={item.id} value={item.id}>
            <item.icon size={12} aria-hidden />
            {item.label}
          </Tab>
        ))}
      </Tabs>
    </div>
  )
}
