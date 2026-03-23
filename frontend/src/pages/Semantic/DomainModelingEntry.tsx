import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, PlusCircle } from 'lucide-react'
import {
  createDomain,
  listDomainCatalogs,
  listDomains,
  type DomainSummary,
} from '@/api/semantic'
import { CatalogEditorDialog } from '@/components/Semantic/CatalogEditorDialog'
import { useToast } from '@/components/business'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SemanticPageHeader, SemanticPageShell, SemanticSurface } from '@/components/Semantic/workbench'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

function sortByRecent(domains: DomainSummary[]) {
  return [...domains].sort((a, b) => {
    const at = Date.parse(a.state_summary?.updated_at || a.state_summary?.last_published_at || '') || 0
    const bt = Date.parse(b.state_summary?.updated_at || b.state_summary?.last_published_at || '') || 0
    return bt - at
  })
}

export default function DomainModelingEntry() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [catalogCode, setCatalogCode] = useState('default')
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['semantic', 'domains'],
    queryFn: async () => (await listDomains()).data,
  })

  const { data: catalogData } = useQuery({
    queryKey: ['semantic', 'catalogs'],
    queryFn: async () => (await listDomainCatalogs()).data,
  })

  const catalogs = catalogData?.catalogs ?? []

  const createMutation = useMutation({
    mutationFn: async () => (await createDomain({ name: name.trim(), catalog_code: catalogCode || 'default' })).data,
    onSuccess: async (domain) => {
      toast({ title: '领域草稿已创建，开始进入建模画布' })
      setName('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semantic', 'domains'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic', 'catalogs'] }),
      ])
      navigate(`/semantic/domains/${domain.id || domain.code}`)
    },
    onError: (err) => {
      toast({ title: '创建领域失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const domains: DomainSummary[] = data?.domains ?? []
  const draftDomains = useMemo(
    () => sortByRecent(domains.filter((domain) => domain.status === 'draft')).slice(0, 6),
    [domains],
  )
  const publishedDomains = useMemo(
    () => sortByRecent(domains.filter((domain) => domain.status === 'active')).slice(0, 6),
    [domains],
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-[28rem] rounded-2xl" />
      </div>
    )
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="领域建模"
        description="左侧创建新领域，右侧继续草稿或已发布领域，避免在目录页和画布之间反复跳转。"
        status="ready"
        eyebrow="Domain Modeling"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{catalogs.length} 个目录</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{domains.length} 个领域</Badge>
          </>
        }
        actions={
          <Button variant="outline" asChild className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/84 px-4">
            <Link to="/semantic/domains">返回领域目录</Link>
          </Button>
        }
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="grid xl:grid-cols-[400px_minmax(0,1fr)]">
          <aside className="border-b border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.86)] p-6 xl:border-b-0 xl:border-r">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                Create
              </div>
              <h2 className="text-[1.12rem] font-semibold text-[hsl(var(--workbench-ink))]">新建领域并进入画布</h2>
              <p className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                先选目录，再创建领域。创建成功后直接进入画布，不在当前页堆积额外流程。
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[hsl(var(--workbench-ink))]">所属目录</label>
                <div className="flex gap-2">
                    <Select value={catalogCode} onValueChange={setCatalogCode}>
                    <SelectTrigger data-testid="domain-create-catalog-select" className="h-11 flex-1 rounded-xl border-[hsl(var(--workbench-outline))] bg-white">
                      <SelectValue placeholder="选择目录" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogs.map((catalog) => (
                        <SelectItem key={catalog.code} value={catalog.code}>
                          {catalog.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-[hsl(var(--workbench-outline))] bg-white"
                    onClick={() => setCatalogDialogOpen(true)}
                  >
                    新建目录
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="domain-create-name" className="text-sm font-medium text-[hsl(var(--workbench-ink))]">
                  领域名称
                </label>
                <Input
                  id="domain-create-name"
                  name="domain_name"
                  autoComplete="off"
                  data-testid="domain-create-name"
                  placeholder="例如：答题分析、课程画像、教学运营…"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="领域名称"
                  className="h-11 rounded-xl border-[hsl(var(--workbench-outline))] bg-white"
                />
              </div>

              <Button
                data-testid="domain-create-submit"
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                className="h-11 w-full rounded-xl shadow-[0_14px_28px_rgba(67,97,238,0.14)]"
              >
                <PlusCircle className="mr-1.5 h-4 w-4" />
                创建并进入画布
              </Button>

              <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/88 px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                目录只负责组织领域。真正的业务边界、Cube 编排和 Join 定义，都在领域画布里完成。
              </div>
            </div>
          </aside>

          <section className="space-y-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-6 py-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                  Continue
                </div>
                <div className="text-[1.02rem] font-semibold text-[hsl(var(--workbench-ink))]">继续已有领域</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
                  {draftDomains.length} 个草稿
                </Badge>
                <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
                  {publishedDomains.length} 个已发布
                </Badge>
              </div>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="border-b border-[hsl(var(--workbench-outline))] p-6 xl:border-b-0 xl:border-r">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">继续草稿建模</div>
                    <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                      优先返回最近编辑过的草稿领域，避免用户重新从目录页兜一圈。
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {draftDomains.length === 0 ? (
                    <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] px-4 py-8 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                      当前没有可继续的草稿领域。
                    </div>
                  ) : (
                    draftDomains.map((domain) => (
                      <Link
                        key={String(domain.id || domain.code)}
                        to={`/semantic/domains/${domain.id || domain.code}`}
                        className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/92 p-4 transition-all hover:border-[hsl(var(--workbench-accent))]/25 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-[hsl(var(--workbench-ink))]">{domain.name}</div>
                            <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{domain.code}</div>
                          </div>
                          <Badge variant="secondary" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
                            {getSemanticStatusLabel('draft')}
                          </Badge>
                        </div>
                        <div className="mt-3 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                          {domain.catalog_name || '默认目录'}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">从已发布领域继续调整</div>
                  <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                    用于增补关系、补充说明或做边界微调，不需要重新新建领域。
                  </p>
                </div>
                <div className="space-y-2">
                  {publishedDomains.length === 0 ? (
                    <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] px-4 py-8 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                      当前没有近期已发布领域。
                    </div>
                  ) : (
                    publishedDomains.map((domain) => (
                      <div
                        key={String(domain.id || domain.code)}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/92 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">{domain.name}</div>
                          <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{domain.code}</div>
                          <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                            {domain.catalog_name || '默认目录'}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" asChild className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/88">
                          <Link to={`/semantic/domains/${domain.id || domain.code}`}>
                            <GitBranch className="mr-1.5 h-4 w-4" />
                            进入建模
                          </Link>
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </SemanticSurface>

      <CatalogEditorDialog
        open={catalogDialogOpen}
        onOpenChange={setCatalogDialogOpen}
        onSuccess={(catalog) => setCatalogCode(catalog.code)}
      />
    </SemanticPageShell>
  )
}
