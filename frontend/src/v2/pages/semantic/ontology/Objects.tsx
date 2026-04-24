// frontend/src/v2/pages/semantic/ontology/Objects.tsx
//
// 业务对象列表页。分页 + 搜索（本地过滤，B-back-6 上线后替换）
// 接口：GET /api/v1/ontology/objects

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip, Input } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/components/ResourceListPage
import { ResourceListPage } from '@v2/components/ResourceListPage'
// 等待 X-Crosscut：@v2/components/PeekPanel
import { PeekPanel } from '@v2/components/PeekPanel'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useObjectList } from '@v2/hooks/ontology'
import OntologyObjectContent from '../_shared/ontology-object-content'
import { useWorkbenchObjectOverview } from '@v2/hooks/ontology'

export default function OntologyObjects() {
  const navigate = useNavigate()
  // TODO(B-back-6): 后端搜索上线后改为服务端 filter
  const [keyword, setKeyword] = useState('')
  const [peekName, setPeekName] = useState<string | null>(null)

  const objectsQuery = useObjectList()
  const items = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((o) =>
      `${o.name} ${o.title ?? ''} ${o.aliases?.join(' ') ?? ''}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const overview = useWorkbenchObjectOverview(peekName ?? '')
  const peekReady = peekName !== null && !overview.isLoading && overview.data

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <ResourceListPage
        title={t('ontology.objects.title', '业务对象')}
        total={filtered.length}
        loading={objectsQuery.isLoading}
        error={objectsQuery.isError}
        actions={
          <div className="flex items-center gap-2">
            {/* TODO(B-back-6): 搜索框改为 API 全文搜索 */}
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
                aria-hidden
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('ontology.objects.search', '搜索对象…')}
                className="w-48 pl-7"
                aria-label={t('ontology.objects.searchLabel', '搜索业务对象')}
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('/semantic/ontology/objects/new')}
            >
              <Plus size={12} /> {t('ontology.createObject', '新建对象')}
            </Button>
          </div>
        }
        emptyText={t('ontology.objects.empty', '尚无业务对象')}
      >
        {/* drop-frontend: BusinessObject 没有 domain / property_count / owner — 用 aliases 代替展示 */}
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>{t('col.name', '名称')}</Th>
              <Th>{t('col.aliases', '别名')}</Th>
              <Th>{t('col.status', '状态')}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr
                key={o.name}
                className="cursor-pointer transition hover:bg-hover"
                onClick={() => setPeekName(o.name)}
              >
                <Td>
                  <div className="font-medium text-1">{o.title || o.name}</div>
                  <div className="font-mono text-xs text-3">{o.name}</div>
                </Td>
                <Td>{o.aliases?.length ? o.aliases.join(', ') : '—'}</Td>
                <Td>
                  <StatusChip status={o.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResourceListPage>

      {/* Peek Panel */}
      <PeekPanel
        open={peekName !== null}
        onClose={() => setPeekName(null)}
        title={overview.data?.object?.title || peekName || ''}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPeekName(null)
              navigate(`/semantic/ontology/objects/${peekName}`)
            }}
          >
            {t('action.viewDetail', '查看详情')}
          </Button>
        }
      >
        {overview.isLoading ? (
          <div className="py-8 text-center text-sm text-3">{t('loading', '加载中…')}</div>
        ) : peekReady ? (
          <OntologyObjectContent overview={overview.data} />
        ) : null}
      </PeekPanel>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium text-3">{children}</th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-2">{children}</td>
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active')
    return <Chip tone="success">{t('status.active', '已发布')}</Chip>
  if (status === 'deprecated')
    return <Chip tone="danger">{t('status.deprecated', '已废弃')}</Chip>
  return <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
}
