import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Blocks, FolderTree, GitBranch, Wrench } from 'lucide-react'
import { listCubes, listDomainCatalogs, listDomains, listViews } from '@/api/semantic'
import { SemanticPageHeader, SemanticPageShell, SemanticStatCard, SemanticSurface } from '@/components/Semantic/workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

const moduleCards = [
  {
    key: 'cubes',
    title: 'Cube',
    description: '维护 Cube 与 View，先把维度、指标和来源定义收敛清楚。',
    href: '/semantic/cubes',
    icon: Blocks,
    metricLabel: '语义单元',
  },
  {
    key: 'domains',
    title: '领域目录',
    description: '按目录管理业务领域，查看状态、规模和发布时间。',
    href: '/semantic/domains',
    icon: FolderTree,
    metricLabel: '业务领域',
  },
  {
    key: 'modeling',
    title: '领域建模',
    description: '新建领域或回到草稿画布，继续编排边界和 Join。',
    href: '/semantic/modeling',
    icon: GitBranch,
    metricLabel: '建模入口',
  },
  {
    key: 'tools',
    title: '开发工具',
    description: '查看 YAML、编译调试和 Schema 同步结果。',
    href: '/semantic/tools',
    icon: Wrench,
    metricLabel: '工具入口',
  },
] as const

export default function SemanticOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['semantic', 'overview'],
    queryFn: async () => {
      const [cubesRes, viewsRes, domainsRes, catalogsRes] = await Promise.all([
        listCubes(),
        listViews(),
        listDomains(),
        listDomainCatalogs(),
      ])
      return {
        cubes: cubesRes.data.cubes ?? [],
        views: viewsRes.data.views ?? [],
        domains: domainsRes.data.domains ?? [],
        catalogs: catalogsRes.data.catalogs ?? [],
      }
    },
  })

  const summary = useMemo(() => {
    const cubes = data?.cubes ?? []
    const views = data?.views ?? []
    const domains = data?.domains ?? []
    const catalogs = data?.catalogs ?? []
    return {
      cubeCount: cubes.length,
      viewCount: views.length,
      domainCount: domains.length,
      catalogCount: catalogs.length,
      activeDomainCount: domains.filter((item) => item.status === 'active').length,
      draftDomainCount: domains.filter((item) => item.status === 'draft').length,
      emptyDomainCount: domains.filter((item) => item.cube_count === 0).length,
      missingJoinCount: domains.filter((item) => item.cube_count > 1 && item.join_count === 0).length,
    }
  }, [data])

  if (isLoading) {
    return <OverviewSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="语义工作台"
        description="统一维护 Cube、领域、画布和 DevTools。首页只保留关键状态与高频入口。"
        status="ready"
        eyebrow="Semantic Workbench"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-white/90 text-[hsl(var(--workbench-muted-foreground))]">{summary.cubeCount} 个 Cube</Badge>
            <Badge variant="outline" className="border-transparent bg-white/90 text-[hsl(var(--workbench-muted-foreground))]">{summary.viewCount} 个 View</Badge>
            <Badge variant="outline" className="border-transparent bg-white/90 text-[hsl(var(--workbench-muted-foreground))]">{summary.domainCount} 个领域</Badge>
            <Badge variant="outline" className="border-transparent bg-white/90 text-[hsl(var(--workbench-muted-foreground))]">{summary.catalogCount} 个目录</Badge>
          </>
        }
        actions={
          <>
            <Button asChild className="h-10 rounded-full px-4">
              <Link to="/semantic/modeling">开始领域建模</Link>
            </Button>
            <Button variant="outline" asChild className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
              <Link to="/semantic/tools">打开 DevTools</Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <SemanticSurface
          eyebrow="Focus"
          title="当前关注"
          description="首页只保留最值得先看的风险和下一步，不重复堆子页统计。"
        >
          <div className="space-y-3">
            {[
              {
                title: `${summary.emptyDomainCount} 个领域还没有纳入 Cube`,
                description: '先从 Cube 模块补齐基础定义，再回到领域画布组织边界。',
                href: '/semantic/cubes',
                actionLabel: '去维护 Cube',
              },
              {
                title: `${summary.missingJoinCount} 个领域缺少 Join`,
                description: '这些领域已经具备多个 Cube，但关系规则还没有沉淀下来。',
                href: '/semantic/modeling',
                actionLabel: '去继续建模',
              },
              {
                title: `${summary.draftDomainCount} 个领域仍处于草稿`,
                description: '建议优先回到领域目录确认状态，再进入画布完成发布前检查。',
                href: '/semantic/domains',
                actionLabel: '去看领域目录',
              },
            ].map((item, index) => (
              <div
                key={item.title}
                className={cn(
                  'grid gap-4 rounded-[var(--workbench-radius)] border px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto]',
                  index === 0
                    ? 'border-[hsl(var(--workbench-accent))]/20 bg-[hsl(var(--workbench-accent-soft))]'
                    : 'border-[hsl(var(--workbench-outline))] bg-white/86',
                )}
              >
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.title}</div>
                  <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{item.description}</div>
                </div>
                <div className="flex items-center">
                  <Button variant="outline" asChild className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/92 px-4">
                    <Link to={item.href}>
                      {item.actionLabel}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[hsl(var(--workbench-outline))] pt-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
              推荐路径
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['01', '先维护 Cube'],
                ['02', '再编排领域'],
                ['03', '回目录检查状态'],
                ['04', '最后用 DevTools 校验'],
              ].map(([step, label]) => (
                <div key={step} className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] px-3.5 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">{step}</div>
                  <div className="mt-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </SemanticSurface>

        <SemanticSurface
          eyebrow="Modules"
          title="模块入口"
          description="如果你已经知道下一步要做什么，可以直接进入对应子页。"
          bodyClassName="space-y-3"
        >
          {moduleCards.map((item) => {
            const Icon = item.icon
            const value = item.key === 'cubes'
              ? summary.cubeCount
              : item.key === 'domains'
                ? summary.domainCount
                : item.key === 'modeling'
                  ? summary.draftDomainCount
                  : 3
            return (
              <Link
                key={item.key}
                to={item.href}
                className="flex items-start gap-3 rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/88 px-4 py-4 transition-colors hover:border-[hsl(var(--workbench-accent))]/20 hover:bg-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-accent))]">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.title}</div>
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">{value}</div>
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{item.description}</div>
                </div>
              </Link>
            )
          })}
        </SemanticSurface>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SemanticStatCard
          label="语义单元"
          value={summary.cubeCount}
          description={`${summary.viewCount} 个 View，供查询和消费复用。`}
          tone="accent"
          icon={<Blocks className="h-4.5 w-4.5" />}
        />
        <SemanticStatCard
          label="领域规模"
          value={summary.domainCount}
          description={`${summary.activeDomainCount} 个已发布，${summary.draftDomainCount} 个草稿。`}
          icon={<FolderTree className="h-4.5 w-4.5" />}
        />
        <SemanticStatCard
          label="目录组织"
          value={summary.catalogCount}
          description="按 Catalog 管理业务边界和领域归属。"
          icon={<GitBranch className="h-4.5 w-4.5" />}
        />
        <SemanticStatCard
          label="待处理风险"
          value={summary.emptyDomainCount + summary.missingJoinCount}
          description="需要先补齐未纳入 Cube 的领域和缺失的 Join。"
          tone="warning"
          icon={<Wrench className="h-4.5 w-4.5" />}
        />
      </div>
    </SemanticPageShell>
  )
}
