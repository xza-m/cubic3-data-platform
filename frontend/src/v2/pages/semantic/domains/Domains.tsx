// frontend/src/v2/pages/semantic/domains/Domains.tsx
//
// 业务上下文列表页。
// 接口：GET /api/v1/semantic/domains
//       POST /api/v1/semantic/domains

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Network, ArrowRight } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip } from '@v2/components/ui'
import { ListPagination } from '@v2/components/ListPagination'
// 等待 X-Crosscut：@v2/components/EntityFormDialog
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useDomainList, useCreateDomain } from '@v2/hooks/semantic'

const LIST_PAGE_SIZE = 20

export default function Domains() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  const domainsQuery = useDomainList({})
  const domains = useMemo(() => domainsQuery.data?.domains ?? [], [domainsQuery.data?.domains])
  const pageCount = Math.max(1, Math.ceil(domains.length / LIST_PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedDomains = useMemo(() => {
    const start = (safePage - 1) * LIST_PAGE_SIZE
    return domains.slice(start, start + LIST_PAGE_SIZE)
  }, [domains, safePage])
  const createDomain = useCreateDomain()

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.domains', '业务上下文')])
    setTopBarActions(
      <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
        <Plus size={12} /> {t('domains.create', '新建业务上下文')}
      </Button>,
    )
  }, [setBreadcrumbs, setTopBarActions])

  const handleCreate = async (data: Record<string, string>) => {
    const res = await createDomain.mutateAsync({
      name: data.name,
      title: data.title || undefined,
      description: data.description || undefined,
    })
    setShowCreate(false)
    navigate(`/semantic/domains/${res.name}/canvas`)
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      {domainsQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-3">{t('loading', '加载中…')}</div>
      ) : domainsQuery.isError ? (
        <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
      ) : domains.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedDomains.map((d) => (
              <DomainCard
                key={d.name}
                domain={d}
                onClick={() => navigate(`/semantic/domains/${d.name}/canvas`)}
              />
            ))}
          </div>
          <ListPagination
            page={safePage}
            pageSize={LIST_PAGE_SIZE}
            total={domains.length}
            onPageChange={setPage}
          />
        </>
      )}

      <EntityFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('domains.createTitle', '新建业务上下文')}
        loading={createDomain.isPending}
        onSubmit={handleCreate}
        fields={[
          { key: 'name', label: t('objectCreate.name', '标识符（英文）'), required: true },
          { key: 'title', label: t('objectCreate.title', '显示名称') },
          { key: 'description', label: t('objectCreate.description', '描述'), type: 'textarea' },
        ]}
      />
    </div>
  )
}

function DomainCard({
  domain,
  onClick,
}: {
  domain: {
    name: string
    title?: string | null
    description?: string | null
    status?: string
  }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-md border p-4 text-left transition hover:shadow-sm focus-visible:ring-2"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
        outlineColor: 'var(--accent)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
        >
          <Network size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-1">{domain.title || domain.name}</div>
          <div className="font-mono text-xs text-3">{domain.name}</div>
        </div>
        {domain.status === 'published' ? (
          <Chip tone="success">{t('status.published', '已发布')}</Chip>
        ) : (
          <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
        )}
      </div>

      {domain.description ? (
        <p className="mt-3 text-xs leading-5 text-2 line-clamp-2">{domain.description}</p>
      ) : (
        <p className="mt-3 text-xs text-3">{t('domains.noDesc', '暂无描述')}</p>
      )}

      <div
        className="mt-3 flex items-center justify-between border-t pt-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* drop-frontend: backend DomainSummary has no cube_count / updated_at fields */}
        <span className="text-xs text-3">{t('domains.cubes', 'Cubes')}</span>
        <ArrowRight
          size={12}
          className="text-3 transition group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden
        />
      </div>
    </button>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed py-20 text-center"
      style={{ borderColor: 'var(--border)' }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-md"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
      >
        <Network size={20} />
      </div>
      <div className="mt-3 font-semibold text-1">{t('domains.emptyTitle', '尚未创建业务上下文')}</div>
      <div className="mt-1 text-sm text-3">{t('domains.emptyDesc', '业务上下文帮助你按主题组织 Cube 与本体引用，不承载具体语义定义')}</div>
      <Button size="sm" variant="primary" className="mt-4" onClick={onCreate}>
        <Plus size={12} /> {t('domains.create', '新建业务上下文')}
      </Button>
    </div>
  )
}
