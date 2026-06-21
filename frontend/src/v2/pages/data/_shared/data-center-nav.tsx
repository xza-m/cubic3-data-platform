import { useLocation, useNavigate } from 'react-router-dom'
import { Tab, Tabs } from '@v2/components/ui'
import { t } from '@v2/i18n'
import {
  DATA_CENTER_SYNC_TABS,
  dataCenterSyncTabFromPath,
} from './data-center-tabs'

export function DataCenterSyncTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = dataCenterSyncTabFromPath(location.pathname)

  return (
    <div className="border-b px-5 pt-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <Tabs
        value={activeTab}
        onChange={(value) => {
          const target = DATA_CENTER_SYNC_TABS.find((item) => item.id === value)
          if (target) navigate(target.path)
        }}
        size="sm"
        aria-label={t('dataCenter.syncTab.ariaLabel', '同步任务')}
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
