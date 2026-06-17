import { describe, expect, it } from 'vitest'
import {
  DATA_CENTER_TABS,
  dataCenterSyncTabFromPath,
  dataCenterTabFromPath,
} from './data-center-tabs'

describe('data-center-tabs', () => {
  it('主同步 Tab 指向数据中心统一工作台，二级任务列表保留在 sync/tasks', () => {
    const syncTab = DATA_CENTER_TABS.find((item) => item.id === 'sync')

    expect(syncTab?.path).toBe('/data-center/sync')
    expect(dataCenterTabFromPath('/data-center/sync')).toBe('sync')
    expect(dataCenterTabFromPath('/data-center/sync/tasks')).toBe('sync')
    expect(dataCenterSyncTabFromPath('/data-center/sync/tasks')).toBe('tasks')
  })
})
