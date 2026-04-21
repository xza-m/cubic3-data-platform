// frontend/src/v2/pages/semantic/ontology/Relations.tsx
//
// 对象关系列表页。
// 接口：GET /api/v1/ontology/relations
//       POST /api/v1/ontology/relations
//
// B-back-6: 全局搜索上线前，本地 filter

import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip, Input } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/components/ResourceListPage
import { ResourceListPage } from '@v2/components/ResourceListPage'
// 等待 X-Crosscut：@v2/components/EntityFormDialog
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useRelationList, useCreateRelation } from '@v2/hooks/ontology'

export default function OntologyRelations() {
  // TODO(B-back-6): 后端搜索上线后改为 API 参数 filter
  const [keyword, setKeyword] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const relationsQuery = useRelationList()
  const items = relationsQuery.data?.items ?? []
  const create = useCreateRelation()

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((r) =>
      `${r.name} ${r.source_object_name} ${r.target_object_name} ${r.relation_type ?? ''}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const handleCreate = async (data: Record<string, string>) => {
    // drop-frontend: BusinessRelation 没有 cardinality 字段
    await create.mutateAsync({
      name: data.name,
      title: data.title || data.name,
      source_object_name: data.source_object_name,
      target_object_name: data.target_object_name,
      relation_type: data.relation_type || undefined,
      description: data.description || undefined,
    })
    setShowCreate(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ResourceListPage
        title={t('ontology.relations.title', '关系')}
        total={filtered.length}
        loading={relationsQuery.isLoading}
        error={relationsQuery.isError}
        actions={
          <div className="flex items-center gap-2">
            {/* TODO(B-back-6): 改为 API 全文搜索 */}
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
                aria-hidden
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('ontology.relations.search', '搜索关系…')}
                className="w-48 pl-7"
                aria-label={t('ontology.relations.searchLabel', '搜索关系')}
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={12} /> {t('ontology.relations.create', '新建关系')}
            </Button>
          </div>
        }
        emptyText={t('ontology.relations.empty', '尚无关系定义')}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>{t('col.name', '名称')}</Th>
              <Th>{t('col.from', '来源对象')}</Th>
              <Th>{t('col.to', '目标对象')}</Th>
              <Th>{t('col.type', '关系类型')}</Th>
              <Th>{t('col.status', '状态')}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name} className="transition hover:bg-hover">
                <Td>
                  <div className="font-medium text-1">{r.name}</div>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{r.source_object_name}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{r.target_object_name}</span>
                </Td>
                <Td>
                  <Chip tone="neutral">{r.relation_type}</Chip>
                </Td>
                <Td>
                  <StatusChip status={r.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResourceListPage>

      <EntityFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('ontology.relations.createTitle', '新建关系')}
        loading={create.isPending}
        onSubmit={handleCreate}
        fields={[
          { key: 'name', label: t('col.name', '名称（英文）'), required: true },
          { key: 'title', label: t('objectCreate.title', '显示名称') },
          { key: 'source_object_name', label: t('col.from', '来源对象'), required: true },
          { key: 'target_object_name', label: t('col.to', '目标对象'), required: true },
          {
            key: 'relation_type',
            label: t('col.type', '关系类型'),
            type: 'select',
            required: true,
            options: [
              { value: 'one_to_one', label: t('relationType.oneToOne', '一对一') },
              { value: 'one_to_many', label: t('relationType.oneToMany', '一对多') },
              { value: 'many_to_many', label: t('relationType.manyToMany', '多对多') },
            ],
          },
          { key: 'description', label: t('objectCreate.description', '描述'), type: 'textarea' },
        ]}
      />
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-3">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-2">{children}</td>
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return <Chip tone="success">{t('status.active', '已发布')}</Chip>
  if (status === 'deprecated') return <Chip tone="danger">{t('status.deprecated', '已废弃')}</Chip>
  return <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
}
