// frontend/src/v2/pages/semantic/ontology/Relations.tsx
//
// 对象关系页 · 左 SVG 关系图 + 右关系列表（双面板）。
// 接口：GET /api/v1/ontology/relations
//       POST /api/v1/ontology/relations
//       GET /api/v1/ontology/objects（提供节点显示名）
//
// B-back-6: 全局搜索上线前，本地 filter

import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button, Chip, Input } from '@v2/components/ui'
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
import { t } from '@v2/i18n'
import { useObjectList, useRelationList, useCreateRelation } from '@v2/hooks/ontology'
import {
  OntologyRelationGraph,
  type OntologyGraphSelection,
} from './_shared/OntologyRelationGraph'

export default function OntologyRelations() {
  const [keyword, setKeyword] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<OntologyGraphSelection>(null)

  const objectsQuery = useObjectList()
  const relationsQuery = useRelationList()
  const create = useCreateRelation()

  const objects = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])
  const relations = useMemo(() => relationsQuery.data?.items ?? [], [relationsQuery.data])

  // 选中态过滤：选中对象 → 过滤为该对象相关的关系；选中关系 → 仅留该关系
  const filteredBySelection = useMemo(() => {
    if (!selected) return relations
    if (selected.kind === 'relation') {
      return relations.filter((r) => r.name === selected.name)
    }
    return relations.filter(
      (r) =>
        r.source_object_name === selected.name || r.target_object_name === selected.name,
    )
  }, [relations, selected])

  // 关键字进一步过滤
  const visible = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return filteredBySelection
    return filteredBySelection.filter((r) =>
      `${r.name} ${r.title ?? ''} ${r.source_object_name} ${r.target_object_name} ${r.relation_type ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [filteredBySelection, keyword])

  const handleCreate = async (data: Record<string, string>) => {
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

  const isLoading = relationsQuery.isLoading || objectsQuery.isLoading
  const isError = relationsQuery.isError || objectsQuery.isError
  const selectedObjectTitle = useMemo(() => {
    if (!selected || selected.kind !== 'object') return null
    return objects.find((o) => o.name === selected.name)?.title ?? selected.name
  }, [selected, objects])
  const selectedRelationTitle = useMemo(() => {
    if (!selected || selected.kind !== 'relation') return null
    return relations.find((r) => r.name === selected.name)?.title ?? selected.name
  }, [selected, relations])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 顶部统计 + 操作 */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-4 py-2 text-xs text-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <span className="font-medium text-1">
          {t('ontology.relations.title', '关系')} · {relations.length}
        </span>
        {selected ? (
          <Chip tone="accent">
            {selected.kind === 'object'
              ? t('ontology.relations.relatedToObject', '已选择对象：{name}', {
                  name: selectedObjectTitle ?? '',
                })
              : t('ontology.relations.relatedToRelation', '已选择关系：{name}', {
                  name: selectedRelationTitle ?? '',
                })}
            <button
              type="button"
              className="ml-1.5 rounded p-0.5 hover:bg-hover"
              aria-label={t('ontology.relations.clearSelection', '清除筛选')}
              onClick={() => setSelected(null)}
            >
              <X size={10} />
            </button>
          </Chip>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
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
      </div>

      {/* 双面板主区 */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {/* 左：SVG 图 */}
        <div
          className="flex min-h-[280px] flex-[3] xl:basis-3/5 xl:border-r"
          style={{ borderColor: 'var(--border)' }}
        >
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-3">
              {t('loading', '加载中…')}
            </div>
          ) : isError ? (
            <div className="flex flex-1 items-center justify-center text-sm text-danger">
              {t('error.loadFailed', '加载失败')}
            </div>
          ) : (
            <OntologyRelationGraph
              objects={objects}
              relations={relations}
              selected={selected}
              onSelectObject={(name) =>
                setSelected(name ? { kind: 'object', name } : null)
              }
              onSelectRelation={(name) =>
                setSelected(name ? { kind: 'relation', name } : null)
              }
            />
          )}
        </div>

        {/* 右：关系列表 */}
        <div
          className="flex min-h-0 flex-[2] flex-col overflow-hidden border-t xl:basis-2/5 xl:border-t-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="flex shrink-0 items-center gap-3 border-b px-4 py-2 text-xs text-3"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <span className="font-medium text-2">
              {t('ontology.relations.listTitle', '关系列表')} · {visible.length}
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {visible.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-3">
                {selected
                  ? t('ontology.relations.emptyForSelection', '所选对象暂无关系')
                  : t('ontology.relations.empty', '尚无关系定义')}
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="ontology-relations-table">
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
                  {visible.map((r) => {
                    const active =
                      selected?.kind === 'relation' && selected.name === r.name
                    return (
                      <tr
                        key={r.name}
                        className="cursor-pointer transition hover:bg-hover"
                        style={{
                          background: active ? 'var(--bg-hover)' : undefined,
                          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                        onClick={() => setSelected({ kind: 'relation', name: r.name })}
                        data-testid={`ontology-relations-row-${r.name}`}
                      >
                        <Td>
                          <div className="font-medium text-1">{r.name}</div>
                          {r.title && r.title !== r.name ? (
                            <div className="text-xs text-3">{r.title}</div>
                          ) : null}
                        </Td>
                        <Td>
                          <span className="font-mono text-xs">{r.source_object_name}</span>
                        </Td>
                        <Td>
                          <span className="font-mono text-xs">{r.target_object_name}</span>
                        </Td>
                        <Td>
                          <Chip tone="neutral">{r.relation_type ?? '—'}</Chip>
                        </Td>
                        <Td>
                          <StatusChip status={r.status ?? 'draft'} />
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

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
