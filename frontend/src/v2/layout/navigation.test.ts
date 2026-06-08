import { describe, expect, it } from 'vitest'
import { findLayout, findModule, NAV_MODULES } from './navigation'
import zhMessages from '../i18n/zh.json'
import enMessages from '../i18n/en.json'

describe('navigation access entry', () => {
  it('权限治理入口指向 Access 工作台', () => {
    const paths = NAV_MODULES.flatMap((module) => [
      module.basePath,
      ...(module.subnav ?? []).map((item) => item.path),
    ])

    expect(paths).toContain('/config/access')
  })

  it('系统侧用访问网关承载权限、审计和网关观测', () => {
    const access = NAV_MODULES.find((module) => module.id === 'access')
    expect(access?.label).toBe('访问网关')
    expect(access?.description).toBe('权限配置、审计与网关观测')
    expect(access?.subnav?.map((item) => item.label)).toEqual(['权限管理', '权限审计', '网关观测'])
    expect(access?.subnav?.map((item) => item.section)).toEqual(['权限', '权限', '网关'])
  })
})

describe('findLayout', () => {
  it('未配置 layout 的模块默认开启 secondarySidebar 与 inspector', () => {
    const datasources = NAV_MODULES.find((m) => m.id === 'datasources')!
    const resolved = findLayout('/data-center/datasources', datasources)
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

  it('语义中心默认双栏，但语义建设工作台和 modeling-copilot 兼容路由切到 fullBleed', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const ontology = findLayout('/semantic/ontology', semantic)
    expect(ontology).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })

    const workbench = findLayout('/semantic/modeling-workbench', semantic)
    expect(workbench).toEqual({
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    })

    const candidate = findLayout('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', semantic)
    expect(candidate).toEqual({
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    })

    const copilot = findLayout('/semantic/modeling-copilot/new', semantic)
    expect(copilot).toEqual({
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    })

    const batch = findLayout('/semantic/modeling-copilot/batch', semantic)
    expect(batch).toEqual({
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    })
  })

  it('byPathPrefix 命中前缀完全相等也算', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const exact = findLayout('/semantic/modeling-copilot', semantic)
    expect(exact.secondarySidebar).toBe(false)
    expect(exact.hideBreadcrumbs).toBe(true)
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
  it('/semantic/modeling-workbench 命中 semantic 模块并应用 fullBleed', () => {
    const module = findModule('/semantic/modeling-workbench')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-workbench', module!)
    expect(layout.secondarySidebar).toBe(false)
    expect(layout.inspector).toBe(false)
    expect(layout.hideBreadcrumbs).toBe(true)
  })

  it('/semantic/modeling-workbench/:projectId/candidate/:candidateId 命中 semantic 模块并应用 fullBleed', () => {
    const module = findModule('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', module!)
    expect(layout.secondarySidebar).toBe(false)
    expect(layout.inspector).toBe(false)
    expect(layout.hideBreadcrumbs).toBe(true)
  })

  it('/semantic/modeling-copilot/new 命中 semantic 模块并应用 fullBleed', () => {
    const module = findModule('/semantic/modeling-copilot/new')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-copilot/new', module!)
    expect(layout.secondarySidebar).toBe(false)
    expect(layout.inspector).toBe(false)
    expect(layout.hideBreadcrumbs).toBe(true)
  })

  it('/semantic/modeling-copilot/batch 命中 semantic 模块并应用 fullBleed', () => {
    const module = findModule('/semantic/modeling-copilot/batch')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-copilot/batch', module!)
    expect(layout.secondarySidebar).toBe(false)
    expect(layout.inspector).toBe(false)
    expect(layout.hideBreadcrumbs).toBe(true)
  })
})

describe('数据资产底座导航', () => {
  it('语义中心只保留数据资产底座分组和六个资产页面', () => {
    const semantic = NAV_MODULES.find((module) => module.id === 'semantic')
    const assetItems = semantic?.subnav?.filter((item) => item.section === '数据资产底座') ?? []
    const buildItems = semantic?.subnav?.filter((item) => item.section === '语义构建') ?? []

    expect(buildItems.map((item) => item.label)).toEqual(['语义建设'])
    expect(buildItems.map((item) => item.path)).toEqual(['/semantic/modeling-workbench'])
    expect(assetItems.map((item) => item.label)).toEqual([
      '资产雷达',
      '物理表',
      '表画像',
      '字段画像',
      '血缘使用',
      '元数据同步',
    ])
    expect(assetItems.map((item) => item.path)).toEqual([
      '/semantic/assets',
      '/semantic/assets/tables',
      '/semantic/assets/table-profile',
      '/semantic/assets/field-profile',
      '/semantic/assets/lineage-usage',
      '/semantic/assets/sync',
    ])
  })
})

describe('semantic navigation i18n', () => {
  it('zh/en 保留统一工作台入口和旧冷启动 key', () => {
    expect(zhMessages['nav.semantic.sub.modelingWorkbench']).toBe('语义建设')
    expect(enMessages['nav.semantic.sub.modelingWorkbench']).toBe('Semantic modeling')

    expect(zhMessages).toHaveProperty('nav.semantic.sub.modelingBuilder')
    expect(zhMessages).toHaveProperty('nav.semantic.sub.batchColdStart')
    expect(enMessages).toHaveProperty('nav.semantic.sub.modelingBuilder')
    expect(enMessages).toHaveProperty('nav.semantic.sub.batchColdStart')
  })
})
