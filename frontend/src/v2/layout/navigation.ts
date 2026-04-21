// frontend/src/v2/layout/navigation.ts
// 模块清单 — 路由结构与 demo（tmp/platform-redesign/src/layout/navigation.ts）1:1 对齐
import {
  LayoutDashboard,
  Database,
  Table2,
  Workflow,
  Brain,
  MessagesSquare,
  AppWindow,
  Cable,
  BellRing,
  Search,
  type LucideIcon,
} from 'lucide-react'

export interface SubNavItem {
  label: string
  path: string
  description?: string
  implemented?: boolean
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
}

export const NAV_MODULES: NavModule[] = [
  {
    id: 'dashboard',
    label: '总览',
    description: '平台健康度与最近活动',
    icon: LayoutDashboard,
    basePath: '/dashboard',
    group: '系统',
    implemented: true,
  },
  {
    id: 'datasources',
    label: '数据源',
    description: '连接管理与目录同步',
    icon: Database,
    basePath: '/data-center/datasources',
    group: '数据',
    implemented: true,
  },
  {
    id: 'datasets',
    label: '数据集',
    description: '物理 / 虚拟 / 文件数据集',
    icon: Table2,
    basePath: '/data-center/datasets',
    group: '数据',
    implemented: true,
  },
  {
    id: 'extraction',
    label: '提取任务',
    description: '调度 + 订阅',
    icon: Workflow,
    basePath: '/extraction-tasks',
    group: '数据',
    implemented: true,
    subnav: [
      { label: '任务列表', path: '/extraction-tasks', implemented: true },
      { label: '执行记录', path: '/extraction/runs', implemented: true },
      { label: '任务配置', path: '/extraction/config', implemented: true },
    ],
  },
  {
    id: 'queries',
    label: '查询中心',
    description: 'SQL 编辑 / 历史 / 模板',
    icon: Search,
    basePath: '/queries',
    group: '数据',
    implemented: true,
    subnav: [
      { label: '查询工作台', path: '/queries', implemented: true },
      { label: '我的查询', path: '/queries/my', implemented: true },
      { label: '查询历史', path: '/queries/history', implemented: true },
      { label: '可视化构建', path: '/queries/visual', implemented: true },
      { label: '调度查询', path: '/queries/scheduled', implemented: true },
    ],
  },
  {
    id: 'semantic',
    label: '语义中心',
    description: '以业务对象为中心的语义层',
    icon: Brain,
    basePath: '/semantic',
    defaultPath: '/semantic/ontology',
    group: '语义',
    implemented: true,
    subnav: [
      { section: '本体工作台', label: '总览', path: '/semantic/ontology', implemented: true },
      {
        section: '本体工作台',
        label: '对象',
        path: '/semantic/ontology/objects',
        implemented: true,
      },
      {
        section: '本体工作台',
        label: '指标索引',
        path: '/semantic/ontology/metrics',
        implemented: true,
      },
      {
        section: '本体工作台',
        label: '关系索引',
        path: '/semantic/ontology/relations',
        implemented: true,
      },
      {
        section: '本体工作台',
        label: '治理中心',
        path: '/semantic/ontology/governance',
        implemented: true,
      },
      { section: '物理底座', label: 'Cube', path: '/semantic/cubes', implemented: true },
      { section: '物理底座', label: '业务域', path: '/semantic/domains', implemented: true },
      {
        section: '物理底座',
        label: '语义诊断',
        path: '/semantic/workbench',
        implemented: true,
      },
    ],
  },
  {
    id: 'chat',
    label: 'Data Chat',
    description: '语义对话与 AI 分析',
    icon: MessagesSquare,
    basePath: '/data-chat',
    group: '语义',
    implemented: true,
  },
  {
    id: 'apps',
    label: '应用市场',
    description: '语义应用上架与发布',
    icon: AppWindow,
    basePath: '/apps',
    group: '应用',
    implemented: true,
    subnav: [
      { label: '应用列表', path: '/apps', implemented: true },
      { label: '应用实例', path: '/apps/instances', implemented: true },
      { label: '执行监控', path: '/executions', implemented: true },
    ],
  },
  {
    id: 'channels',
    label: '渠道',
    description: '钉钉 / 飞书 / 邮件 / Webhook',
    icon: Cable,
    basePath: '/config/channels',
    group: '应用',
    implemented: true,
  },
  {
    id: 'subscriptions',
    label: '订阅',
    description: '订阅作业与推送',
    icon: BellRing,
    basePath: '/config/subscriptions',
    group: '应用',
    implemented: true,
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
