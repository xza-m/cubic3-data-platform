// frontend/src/v2/layout/navigation.ts
// 模块清单 — 路由结构与 demo（tmp/platform-redesign/src/layout/navigation.ts）1:1 对齐
//
// Round 4 · T-001c — 全量 label / description / section 走 t(key, fallback)。
// key 命名遵循 NAMING.md：nav.<module>.label / .desc / .sub.<slug> / .section.<slug>。
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
import { t } from '@v2/i18n'

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
  layout?: {
    secondarySidebar?: boolean
    inspector?: boolean
  }
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
    id: 'datasources',
    label: t('nav.datasources.label', '数据源'),
    description: t('nav.datasources.desc', '连接管理与目录同步'),
    icon: Database,
    basePath: '/data-center/datasources',
    group: '数据',
    implemented: true,
  },
  {
    id: 'datasets',
    label: t('nav.datasets.label', '数据集'),
    description: t('nav.datasets.desc', '物理 / 虚拟 / 文件数据集'),
    icon: Table2,
    basePath: '/data-center/datasets',
    group: '数据',
    implemented: true,
  },
  {
    id: 'extraction',
    label: t('nav.extraction.label', '提取任务'),
    description: t('nav.extraction.desc', '调度 + 订阅'),
    icon: Workflow,
    basePath: '/extraction',
    defaultPath: '/extraction/tasks',
    group: '数据',
    implemented: true,
    subnav: [
      { label: t('nav.extraction.sub.tasks', '任务列表'), path: '/extraction/tasks', implemented: true },
      { label: t('nav.extraction.sub.runs', '执行记录'), path: '/extraction/runs', implemented: true },
      { label: t('nav.extraction.sub.config', '任务配置'), path: '/extraction/config', implemented: true },
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
        section: t('nav.semantic.section.build', '语义构建'),
        label: t('nav.semantic.sub.modelingAgent', '建模助手 Agent'),
        path: '/semantic/modeling-agent/new',
        implemented: true,
      },
      { section: t('nav.semantic.section.ontology', '本体工作台'), label: t('nav.semantic.sub.overview', '总览'), path: '/semantic/ontology', implemented: true },
      {
        section: t('nav.semantic.section.ontology', '本体工作台'),
        label: t('nav.semantic.sub.objects', '对象'),
        path: '/semantic/ontology/objects',
        implemented: true,
      },
      {
        section: t('nav.semantic.section.ontology', '本体工作台'),
        label: t('nav.semantic.sub.metrics', '指标索引'),
        path: '/semantic/ontology/metrics',
        implemented: true,
      },
      {
        section: t('nav.semantic.section.ontology', '本体工作台'),
        label: t('nav.semantic.sub.relations', '关系索引'),
        path: '/semantic/ontology/relations',
        implemented: true,
      },
      {
        section: t('nav.semantic.section.ontology', '本体工作台'),
        label: t('nav.semantic.sub.governance', '治理中心'),
        path: '/semantic/ontology/governance',
        implemented: true,
      },
      { section: t('nav.semantic.section.physical', '物理底座'), label: 'Cube', path: '/semantic/cubes', implemented: true },
      { section: t('nav.semantic.section.physical', '物理底座'), label: t('nav.semantic.sub.domains', '业务上下文'), path: '/semantic/domains', implemented: true },
      {
        section: t('nav.semantic.section.physical', '物理底座'),
        label: t('nav.semantic.sub.workbench', '语义诊断'),
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
      { label: t('nav.apps.sub.executions', '执行监控'), path: '/executions', implemented: true },
    ],
  },
  {
    id: 'channels',
    label: t('nav.channels.label', '渠道'),
    description: t('nav.channels.desc', '钉钉 / 飞书 / 邮件 / Webhook'),
    icon: Cable,
    basePath: '/config/channels',
    group: '应用',
    implemented: true,
  },
  {
    id: 'subscriptions',
    label: t('nav.subscriptions.label', '订阅'),
    description: t('nav.subscriptions.desc', '订阅作业与推送'),
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
