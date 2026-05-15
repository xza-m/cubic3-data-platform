import { describe, expect, it } from 'vitest'
import { findLayout, findModule, NAV_MODULES } from './navigation'

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

  it('语义中心默认双栏，但 modeling-agent 子路由切到 fullBleed', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const ontology = findLayout('/semantic/ontology', semantic)
    expect(ontology).toEqual({
      secondarySidebar: true,
      inspector: true,
      hideBreadcrumbs: false,
    })

    const copilot = findLayout('/semantic/modeling-agent/new', semantic)
    expect(copilot).toEqual({
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    })
  })

  it('byPathPrefix 命中前缀完全相等也算', () => {
    const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!
    const exact = findLayout('/semantic/modeling-agent', semantic)
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
  it('/semantic/modeling-agent/new 命中 semantic 模块并应用 fullBleed', () => {
    const module = findModule('/semantic/modeling-agent/new')
    expect(module?.id).toBe('semantic')
    const layout = findLayout('/semantic/modeling-agent/new', module!)
    expect(layout.secondarySidebar).toBe(false)
    expect(layout.inspector).toBe(false)
    expect(layout.hideBreadcrumbs).toBe(true)
  })
})
