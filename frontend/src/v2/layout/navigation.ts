// frontend/src/v2/layout/navigation.ts
// 模块清单 — 路由结构与 demo（tmp/platform-redesign/src/layout/navigation.ts）1:1 对齐
//
// Round 4 · T-001c — 全量 label / description / section 走 t(key, fallback)。
// key 命名遵循 NAMING.md：nav.<module>.label / .desc / .sub.<slug> / .section.<slug>。
import {
  LayoutDashboard,
  Database,
  Brain,
  MessagesSquare,
  AppWindow,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { t } from '@v2/i18n'

export interface SubNavItem {
  label: string
  path: string
  description?: string
  implemented?: boolean
  /** 子路由作为同一能力域内 Tab 时，左侧父菜单保持选中 */
  matchPrefix?: boolean
  /** 可选分组标题：相同 section 的 subnav 会聚拢到同一段下，展示为 sidebar 小标题 */
  section?: string
}

export interface NavModule {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  basePath: string
  defaultPath?: string
  group: '数据' | '语义' | '应用' | '系统'
  implemented: boolean
  subnav?: SubNavItem[]
  layout?: {
    secondarySidebar?: boolean
    inspector?: boolean
    /**
     * 按子路由前缀覆盖模块默认 layout。
     * 命中规则：与当前 pathname 匹配 prefix（精确或 startsWith prefix + '/'），按 prefix 长度倒序取最长匹配。
     */
    byPathPrefix?: Array<{
      prefix: string
      secondarySidebar?: boolean
      inspector?: boolean
      hideBreadcrumbs?: boolean
    }>
  }
}

export interface ResolvedLayout {
  secondarySidebar: boolean
  inspector: boolean
  hideBreadcrumbs: boolean
}

// group 字段保留中文作为枚举键（代码逻辑用），展示时通过 groupLabel() 翻译。
export function groupLabel(group: NavModule['group']): string {
  switch (group) {
    case '数据':
      return t('nav.group.data', '数据')
    case '语义':
      return t('nav.group.semantic', '语义')
    case '应用':
      return t('nav.group.apps', '应用')
    case '系统':
      return t('nav.group.system', '系统')
  }
}

export const NAV_MODULES: NavModule[] = [
  {
    id: 'dashboard',
    label: t('nav.dashboard.label', '总览'),
    description: t('nav.dashboard.desc', '平台健康度与最近活动'),
    icon: LayoutDashboard,
    basePath: '/dashboard',
    group: '系统',
    implemented: true,
    layout: {
      secondarySidebar: false,
      inspector: false,
    },
  },
  {
    id: 'data-center',
    label: t('nav.dataCenter.label', '数据中心'),
    description: t('nav.dataCenter.desc', '连接、资产、同步与影响分析'),
    icon: Database,
    basePath: '/data-center',
    defaultPath: '/data-center',
    group: '数据',
    implemented: true,
    layout: {
      secondarySidebar: false,
    },
    subnav: [
      { label: t('nav.dataCenter.sub.overview', '概览'), path: '/data-center', implemented: true },
      { label: t('nav.dataCenter.sub.connections', '连接管理'), path: '/data-center/connections', implemented: true, matchPrefix: true },
      { label: t('nav.dataCenter.sub.assets', '资产目录'), path: '/data-center/assets', implemented: true, matchPrefix: true },
      { label: t('nav.dataCenter.sub.sync', '同步任务'), path: '/data-center/sync', implemented: true, matchPrefix: true },
      { label: t('nav.dataCenter.sub.impact', '影响分析'), path: '/data-center/impact', implemented: true, matchPrefix: true },
    ],
  },
  {
    id: 'queries',
    label: t('nav.queries.label', '查询中心'),
    description: t('nav.queries.desc', 'SQL 编辑 / 历史 / 模板'),
    icon: Search,
    basePath: '/queries',
    group: '数据',
    implemented: true,
    layout: {
      inspector: false,
    },
    subnav: [
      { label: t('nav.queries.sub.console', '查询工作台'), path: '/queries', implemented: true },
      { label: t('nav.queries.sub.my', '我的查询'), path: '/queries/my', implemented: true },
      { label: t('nav.queries.sub.history', '查询历史'), path: '/queries/history', implemented: true },
      { label: t('nav.queries.sub.visual', '可视化构建'), path: '/queries/visual', implemented: true },
      { label: t('nav.queries.sub.scheduled', '调度查询'), path: '/queries/scheduled', implemented: true },
      { label: t('nav.queries.sub.exports', '我的导出'), path: '/queries/exports', implemented: true },
    ],
  },
  {
    id: 'semantic',
    label: t('nav.semantic.label', '语义中心'),
    description: t('nav.semantic.desc', '以业务对象为中心的语义层'),
    icon: Brain,
    basePath: '/semantic',
    defaultPath: '/semantic/ontology',
    group: '语义',
    implemented: true,
    subnav: [
      {
        label: t('nav.semantic.sub.modelingWorkbench', '语义建设'),
        path: '/semantic/modeling-workbench',
        implemented: true,
        matchPrefix: true,
      },
      {
        label: t('nav.semantic.sub.assets', '语义资产'),
        path: '/semantic/assets',
        implemented: true,
        matchPrefix: true,
      },
      {
        label: t('nav.semantic.sub.cubes', 'Cube'),
        path: '/semantic/cubes',
        implemented: true,
        matchPrefix: true,
      },
      {
        label: t('nav.semantic.sub.ontologyRelations', '本体与关系'),
        path: '/semantic/ontology',
        implemented: true,
        matchPrefix: true,
      },
      {
        label: t('nav.semantic.sub.relationCanvas', '关系画布'),
        path: '/semantic/relations',
        implemented: true,
      },
      {
        label: t('nav.semantic.sub.domains', '业务上下文'),
        path: '/semantic/domains',
        implemented: true,
        matchPrefix: true,
      },
      {
        label: t('nav.semantic.sub.diagnosticsGovernance', '诊断治理'),
        path: '/semantic/workbench',
        implemented: true,
      },
    ],
  },
  {
    id: 'chat',
    label: t('nav.chat.label', 'Data Chat'),
    description: t('nav.chat.desc', '语义对话与 AI 分析'),
    icon: MessagesSquare,
    basePath: '/data-chat',
    group: '语义',
    implemented: true,
  },
  {
    id: 'apps',
    label: t('nav.apps.label', '应用市场'),
    description: t('nav.apps.desc', '语义应用上架与发布'),
    icon: AppWindow,
    basePath: '/apps',
    group: '应用',
    implemented: true,
    subnav: [
      { label: t('nav.apps.sub.list', '应用列表'), path: '/apps', implemented: true },
      { label: t('nav.apps.sub.instances', '应用实例'), path: '/apps/instances', implemented: true },
      { label: t('nav.apps.sub.executions', '执行监控'), path: '/apps/executions', implemented: true },
    ],
  },
  // F5 IA 决策：/config 下的访问网关 / 渠道 / 订阅收敛为一个「配置中心」模块，
  // 共享同一个二级侧栏壳（SecondarySidebar 按 section 分组），不再各占一个一级入口。
  {
    id: 'config',
    label: t('nav.config.label', '配置中心'),
    description: t('nav.config.desc', '权限、网关观测与通知交付配置'),
    icon: ShieldCheck,
    basePath: '/config',
    defaultPath: '/config/access',
    group: '系统',
    implemented: true,
    subnav: [
      {
        section: t('nav.config.section.permissions', '权限'),
        label: t('nav.config.sub.permissions', '权限管理'),
        path: '/config/access',
        implemented: true,
      },
      {
        section: t('nav.config.section.permissions', '权限'),
        label: t('nav.config.sub.audit', '权限审计'),
        path: '/config/access/audit',
        implemented: true,
      },
      {
        section: t('nav.config.section.gateway', '网关'),
        label: t('nav.config.sub.observability', '网关观测'),
        path: '/config/access/observability',
        implemented: true,
      },
      {
        section: t('nav.config.section.delivery', '通知与交付'),
        label: t('nav.config.sub.channels', '渠道'),
        path: '/config/channels',
        implemented: true,
        matchPrefix: true,
      },
      {
        section: t('nav.config.section.delivery', '通知与交付'),
        label: t('nav.config.sub.subscriptions', '订阅'),
        path: '/config/subscriptions',
        implemented: true,
        matchPrefix: true,
      },
    ],
  },
]

export const NAV_GROUPS: Array<{ group: NavModule['group']; modules: NavModule[] }> = [
  { group: '数据', modules: NAV_MODULES.filter((m) => m.group === '数据') },
  { group: '语义', modules: NAV_MODULES.filter((m) => m.group === '语义') },
  { group: '应用', modules: NAV_MODULES.filter((m) => m.group === '应用') },
  { group: '系统', modules: NAV_MODULES.filter((m) => m.group === '系统') },
]

export const findModule = (pathname: string): NavModule | null => {
  // 优先精确匹配 basePath，其次按前缀匹配最长
  let best: NavModule | null = null
  let bestLen = -1
  for (const m of NAV_MODULES) {
    if (pathname === m.basePath || pathname.startsWith(`${m.basePath}/`)) {
      if (m.basePath.length > bestLen) {
        best = m
        bestLen = m.basePath.length
      }
    }
  }
  return best
}

export const moduleHomePath = (m: NavModule): string => m.defaultPath ?? m.basePath

/**
 * 计算当前 pathname 在某模块下的有效 layout。
 *
 * 顺序：
 *   1. 取模块默认值（未配置则视为 secondarySidebar=true / inspector=true / hideBreadcrumbs=false）
 *   2. 找出 layout.byPathPrefix 中能命中当前 pathname 的最长前缀，覆盖默认值
 *
 * 命中规则：pathname === prefix 或 pathname.startsWith(prefix + '/')。
 */
export const findLayout = (pathname: string, module: NavModule): ResolvedLayout => {
  const fallback: ResolvedLayout = {
    secondarySidebar: module.layout?.secondarySidebar !== false,
    inspector: module.layout?.inspector !== false,
    hideBreadcrumbs: false,
  }
  const overrides = module.layout?.byPathPrefix
  if (!overrides || !overrides.length) return fallback

  let best: { len: number; override: NonNullable<NavModule['layout']>['byPathPrefix'] extends infer T ? (T extends Array<infer U> ? U : never) : never } | null = null
  for (const item of overrides) {
    if (pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) {
      if (best == null || item.prefix.length > best.len) {
        best = { len: item.prefix.length, override: item }
      }
    }
  }
  if (!best) return fallback
  return {
    secondarySidebar:
      best.override.secondarySidebar !== undefined ? best.override.secondarySidebar : fallback.secondarySidebar,
    inspector:
      best.override.inspector !== undefined ? best.override.inspector : fallback.inspector,
    hideBreadcrumbs: best.override.hideBreadcrumbs === true,
  }
}
