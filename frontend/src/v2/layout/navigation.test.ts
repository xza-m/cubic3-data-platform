import { describe, expect, it } from 'vitest'
import { findLayout, findModule, NAV_MODULES } from './navigation'
import zhMessages from '../i18n/zh.json'

describe('navigation access entry', () => {
  it('权限治理入口指向 Access 工作台', () => {
    const paths = NAV_MODULES.flatMap((module) => [
      module.basePath,
      ...(module.subnav ?? []).map((item) => item.path),
    ])

    expect(paths).toContain('/config/access')
  })

  it('F5：/config 收敛为统一配置中心模块，权限/网关/通知共享一个二级侧栏壳', () => {
    const config = NAV_MODULES.find((module) => module.id === 'config')
    expect(config?.label).toBe('配置中心')
    expect(config?.basePath).toBe('/config')
    expect(config?.defaultPath).toBe('/config/access')
    expect(config?.group).toBe('系统')
    expect(config?.subnav?.map((item) => item.label)).toEqual([
      '权限管理',
      '权限审计',
      '网关观测',
      '渠道',
      '订阅',
    ])
    expect(config?.subnav?.map((item) => item.section)).toEqual([
      '权限',
      '权限',
      '网关',
      '通知与交付',
      '通知与交付',
    ])
  })

  it('F5：渠道/订阅/访问网关不再各占一个一级模块', () => {
    const ids = NAV_MODULES.map((module) => module.id)
    expect(ids).not.toContain('channels')
    expect(ids).not.toContain('subscriptions')
    expect(ids).not.toContain('access')
  })

  it('F5：/config 子路径均命中统一 config 模块', () => {
    expect(findModule('/config/access')?.id).toBe('config')
    expect(findModule('/config/access/audit')?.id).toBe('config')
    expect(findModule('/config/channels/3')?.id).toBe('config')
    expect(findModule('/config/subscriptions/new')?.id).toBe('config')
  })
})

describe('findLayout', () => {
  it('数据中心采用正式 IA：二级侧栏承载模块入口，正文不再重复一级 Tab', () => {
    const dataCenter = NAV_MODULES.find((m) => m.id === 'data-center')!
    const resolved = findLayout('/data-center/connections', dataCenter)
    expect(resolved).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })
  })

  it('dashboard 模块按模块默认值关闭 secondarySidebar / inspector', () => {
    const dashboard = NAV_MODULES.find((m) => m.id === 'dashboard')!
    const resolved = findLayout('/dashboard', dashboard)
    expect(resolved.secondarySidebar).toBe(false)
    expect(resolved.inspector).toBe(false)
    expect(resolved.hideBreadcrumbs).toBe(false)
  })

  it('语义中心所有正式入口统一使用模块内嵌布局', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const ontology = findLayout('/semantic/ontology', semantic)
    expect(ontology).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })

    const workbench = findLayout('/semantic/modeling-workbench', semantic)
    expect(workbench).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })

    const candidate = findLayout('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', semantic)
    expect(candidate).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })
  })

  it('未注册旧语义建设路径时仍只归属 semantic 模块默认布局，不建立兼容路由规则', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const exact = findLayout('/semantic/modeling-copilot', semantic)
    expect(exact.secondarySidebar).toBe(true)
    expect(exact.hideBreadcrumbs).toBe(false)
  })

  it('byPathPrefix 不命中时退回模块默认值', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const cubes = findLayout('/semantic/cubes', semantic)
    expect(cubes).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })
  })
})

describe('findModule + findLayout 组合', () => {
  it('/semantic/modeling-workbench 命中 semantic 模块并应用统一内嵌布局', () => {
    const module = findModule('/semantic/modeling-workbench')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-workbench', module!)
    expect(layout.secondarySidebar).toBe(true)
    expect(layout.inspector).toBe(true)
    expect(layout.hideBreadcrumbs).toBe(false)
  })

  it('/semantic/modeling-workbench/:projectId/candidate/:candidateId 命中 semantic 模块并应用统一内嵌布局', () => {
    const module = findModule('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', module!)
    expect(layout.secondarySidebar).toBe(true)
    expect(layout.inspector).toBe(true)
    expect(layout.hideBreadcrumbs).toBe(false)
  })

})

describe('数据中心导航收敛', () => {
  it('只保留一个数据中心模块，旧数据源/数据集/提取模块不再注册', () => {
    expect(NAV_MODULES.map((module) => module.id)).toContain('data-center')
    expect(NAV_MODULES.map((module) => module.id)).not.toContain('datasources')
    expect(NAV_MODULES.map((module) => module.id)).not.toContain('datasets')
    expect(NAV_MODULES.map((module) => module.id)).not.toContain('extraction')
    expect(NAV_MODULES.map((module) => module.id)).not.toContain('data-center-demo')
  })

  it('数据中心二级语义由侧栏承载，路径按连接/资产/同步/影响组织', () => {
    const dataCenter = NAV_MODULES.find((module) => module.id === 'data-center')
    expect(dataCenter?.label).toBe('数据中心')
    expect(dataCenter?.description).toBe('连接、资产、同步与影响分析')
    expect(dataCenter?.basePath).toBe('/data-center')
    expect(dataCenter?.defaultPath).toBe('/data-center')
    expect(findLayout('/data-center/assets', dataCenter!).secondarySidebar).toBe(true)
    expect(dataCenter?.subnav?.map((item) => item.label)).toEqual([
      '概览',
      '数据连接',
      '数据资产',
      '数据同步',
      '影响分析',
    ])
    expect(dataCenter?.subnav?.map((item) => item.path)).toEqual([
      '/data-center',
      '/data-center/connections',
      '/data-center/assets',
      '/data-center/sync',
      '/data-center/impact',
    ])
  })

  it('新路径均命中 data-center 模块，旧路径不再命中模块入口', () => {
    expect(findModule('/data-center')?.id).toBe('data-center')
    expect(findModule('/data-center/connections/1')?.id).toBe('data-center')
    expect(findModule('/data-center/assets/11')?.id).toBe('data-center')
    expect(findModule('/data-center/sync/tasks/201')?.id).toBe('data-center')
    expect(findModule('/data-center/impact')?.id).toBe('data-center')
    expect(findModule('/extraction/tasks')).toBeNull()
  })
})

describe('语义中心导航降噪', () => {
  it('正式版二级导航暴露语义中心核心能力，不依赖正文索引补入口', () => {
    const semantic = NAV_MODULES.find((module) => module.id === 'semantic')
    const subnav = semantic?.subnav ?? []

    expect(subnav.map((item) => item.label)).toEqual([
      '语义建设',
      '语义资产',
      'Cube',
      '本体与关系',
      'Cube Join 画布',
      '业务上下文',
      '语义诊断',
    ])
    expect(subnav.map((item) => item.path)).toEqual([
      '/semantic/modeling-workbench',
      '/semantic/assets',
      '/semantic/cubes',
      '/semantic/ontology',
      '/semantic/relations',
      '/semantic/domains',
      '/semantic/workbench',
    ])
    expect(subnav.every((item) => item.section == null)).toBe(true)
    expect(subnav.find((item) => item.path === '/semantic/modeling-workbench')?.matchPrefix).toBe(true)
    expect(subnav.find((item) => item.path === '/semantic/assets')?.matchPrefix).toBe(true)
    expect(subnav.find((item) => item.path === '/semantic/cubes')?.matchPrefix).toBe(true)
    expect(subnav.find((item) => item.path === '/semantic/ontology')?.matchPrefix).toBe(true)
    expect(subnav.find((item) => item.path === '/semantic/domains')?.matchPrefix).toBe(true)
  })

  it('资产与本体内部路由不在二级导航平铺，但仍归属 semantic 模块', () => {
    const semantic = NAV_MODULES.find((module) => module.id === 'semantic')
    const entryPaths = semantic?.subnav?.map((item) => item.path) ?? []
    const innerPaths = [
      '/semantic/assets/tables',
      '/semantic/assets/table-profile',
      '/semantic/assets/field-profile',
      '/semantic/assets/lineage-usage',
      '/semantic/assets/sync',
      '/semantic/ontology/objects',
      '/semantic/ontology/metrics',
      '/semantic/ontology/relations',
      '/semantic/ontology/governance',
    ]

    for (const path of innerPaths) {
      expect(entryPaths).not.toContain(path)
      expect(findModule(path)?.id).toBe('semantic')
    }
  })
})

describe('semantic navigation i18n', () => {
  it('zh 保留正式入口 key 和旧冷启动 key', () => {
    expect(zhMessages['nav.semantic.sub.modelingWorkbench']).toBe('语义建设')
    expect(zhMessages['nav.semantic.sub.assets']).toBe('语义资产')
    expect(zhMessages['nav.semantic.sub.ontologyRelations']).toBe('本体与关系')
    expect(zhMessages['nav.semantic.sub.diagnosticsGovernance']).toBe('语义诊断')
    expect(zhMessages['nav.semantic.sub.cubes']).toBe('Cube')
    expect(zhMessages['nav.semantic.sub.domains']).toBe('业务上下文')
    expect(zhMessages['nav.semantic.sub.relationCanvas']).toBe('Cube Join 画布')

    expect(zhMessages).toHaveProperty('nav.semantic.sub.modelingBuilder')
    expect(zhMessages).toHaveProperty('nav.semantic.sub.batchColdStart')
  })
})
