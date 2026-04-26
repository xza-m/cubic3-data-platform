// frontend/src/v2/pages/semantic/ontology/Objects.tsx
//
// 业务对象列表页 · 行点击通过 AppShell.openTab 开顶部 Tab（多对象并行）。
// 接口：GET /api/v1/ontology/objects

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button, Chip, Input } from '@v2/components/ui'
import { ResourceListPage } from '@v2/components/ResourceListPage'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'
import { useObjectList } from '@v2/hooks/ontology'
import type { BusinessObject } from '@v2/api/ontology'

export const ONTOLOGY_OBJECT_TAB_ID_PREFIX = 'ontology-object:'

// eslint-disable-next-line react-refresh/only-export-components -- 同文件内导出 Tab id 构造器与组件，沿用 R3 共导出约定；被本模块测试与未来 ObjectDetail 复用，避免为 1~2 行 helper 拆文件。
export function buildOntologyObjectTabId(name: string): string {
  return `${ONTOLOGY_OBJECT_TAB_ID_PREFIX}${name}`
}

export default function OntologyObjects() {
  const navigate = useNavigate()
  const { openTab } = useAppShell()
  const [keyword, setKeyword] = useState('')

  const objectsQuery = useObjectList()
  const items = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((o) =>
      `${o.name} ${o.title ?? ''} ${o.aliases?.join(' ') ?? ''}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const openObjectTab = (obj: BusinessObject) => {
    const to = `/semantic/ontology/objects/${obj.name}`
    openTab({
      id: buildOntologyObjectTabId(obj.name),
      label: obj.title || obj.name,
      closeable: true,
      to,
    })
    navigate(to)
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <ResourceListPage
        title={t('ontology.objects.title', '业务对象')}
        total={filtered.length}
        loading={objectsQuery.isLoading}
        error={objectsQuery.isError}
        actions={
          <div className="flex items-center gap-2">
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
                onClick={() => openObjectTab(o)}
                aria-label={t('ontology.objects.tab.aria', '打开对象 {name} 工作 Tab', {
                  name: o.title || o.name,
                })}
                data-testid={`ontology-objects-row-${o.name}`}
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
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-3">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-2">{children}</td>
}

function StatusChip({ status }: { status?: string }) {
  if (status === 'active') return <Chip tone="success">{t('status.active', '已发布')}</Chip>
  if (status === 'deprecated') return <Chip tone="danger">{t('status.deprecated', '已废弃')}</Chip>
  return <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
}
