import { describe, expect, it } from 'vitest'
import {
  resolveActiveManagedTabId,
  resolveVisibleManagedTabs,
  type ManagedTab,
} from './AppShell'

const tabs: ManagedTab[] = [
  {
    id: 'datasource:1',
    label: 'prod-mc',
    to: '/data-center/connections/1',
  },
  {
    id: 'dataset:7',
    label: 'dwd_order',
    to: '/data-center/assets/7',
  },
]

describe('AppShell 托管 Tab 路由同步', () => {
  it('列表页和其他功能页不继承详情页 TabStrip', () => {
    expect(resolveActiveManagedTabId(tabs, '/data-center/connections')).toBeNull()
    expect(resolveVisibleManagedTabs(tabs, '/data-center/connections')).toEqual([])
    expect(resolveVisibleManagedTabs(tabs, '/data-center/assets')).toEqual([])
    expect(resolveVisibleManagedTabs(tabs, '/apps')).toEqual([])
  })

  it('详情路由命中已打开 tab 时展示托管 TabStrip 并同步 active', () => {
    expect(resolveActiveManagedTabId(tabs, '/data-center/connections/1')).toBe('datasource:1')
    expect(resolveVisibleManagedTabs(tabs, '/data-center/connections/1').map((tab) => tab.id)).toEqual([
      'datasource:1',
      'dataset:7',
    ])
  })

  it('编辑和新建等非详情 tab 路由不沿用对象 tab', () => {
    expect(resolveActiveManagedTabId(tabs, '/data-center/connections/1/edit')).toBeNull()
    expect(resolveVisibleManagedTabs(tabs, '/data-center/connections/1/edit')).toEqual([])
    expect(resolveVisibleManagedTabs(tabs, '/data-center/connections/new')).toEqual([])
  })
})
