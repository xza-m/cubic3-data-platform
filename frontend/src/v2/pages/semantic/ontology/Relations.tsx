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
import { Button, Chip, Input, Select } from '@v2/components/ui'
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
import { t } from '@v2/i18n'
import { useObjectList, useRelationList, useCreateRelation } from '@v2/hooks/ontology'
import {
  OntologyRelationGraph,
  type OntologyGraphSelection,
} from './_shared/OntologyRelationGraph'
import {
  getObjectBadgeLabel,
  getObjectTone,
  getRelationTone,
} from './_shared/relation-style'

export default function OntologyRelations() {
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<OntologyGraphSelection>(null)

  const objectsQuery = useObjectList()
  const relationsQuery = useRelationList()
  const create = useCreateRelation()

  const objects = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])
  const relations = useMemo(() => relationsQuery.data?.items ?? [], [relationsQuery.data])
  const titleByName = useMemo(
    () => new Map(objects.map((o) => [o.name, o.title || o.name])),
    [objects],
  )
  const relationTypes = useMemo(
    () =>
      Array.from(
        new Set(
          relations
            .map((r) => r.relation_type?.trim())
            .filter((type): type is string => Boolean(type)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [relations],
  )

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

  const filteredByType = useMemo(() => {
    if (typeFilter === 'all') return filteredBySelection
    return filteredBySelection.filter((r) => (r.relation_type ?? '') === typeFilter)
  }, [filteredBySelection, typeFilter])

  // 关键字进一步过滤
  const visible = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return filteredByType
    return filteredByType.filter((r) =>
      `${r.name} ${r.title ?? ''} ${r.source_object_name} ${r.target_object_name} ${r.relation_type ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [filteredByType, keyword])

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
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <div className="flex shrink-0 items-start gap-4 px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7 text-1">
            {t('ontology.relations.indexTitle', '关系索引')}
          </h1>
          <p className="mt-0.5 text-sm text-3">
            {t(
              'ontology.relations.indexSubtitle',
              '跨对象的语义关系，承载连接、归属、触发等语义含义。',
            )}
          </p>
        </div>
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
        <div className="ml-auto">
          <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={12} /> {t('ontology.relations.create', '新建关系')}
          </Button>
        </div>
      </div>

      {/* 双面板主区 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-5 pb-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
        {/* 左：SVG 图 */}
        <div
          className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="text-base font-semibold text-1">
              {t('ontology.relations.graphTitle', '语义关系图')}
            </div>
          </div>
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-3">
              {t('common.loading', '加载中…')}
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
          className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="flex shrink-0 flex-col gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-1">
                {t('ontology.relations.listTitle', '关系列表')} · {visible.length}
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_9.5rem] gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-3"
                  aria-hidden
                />
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t('ontology.relations.search', '搜索关系…')}
                  className="h-9 pl-9 text-sm"
                  aria-label={t('ontology.relations.searchLabel', '搜索关系')}
                />
              </div>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 text-sm"
                aria-label={t('ontology.relations.typeFilterLabel', '关系类型筛选')}
              >
                <option value="all">{t('ontology.relations.allTypes', '全部类型')}</option>
                {relationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {visible.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-3">
                {selected
                  ? t('ontology.relations.emptyForSelection', '所选对象暂无关系')
                  : t('ontology.relations.empty', '尚无关系定义')}
              </div>
            ) : (
              <table
                className="w-full table-fixed border-collapse text-sm"
                data-testid="ontology-relations-table"
              >
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '2rem' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '36%' }} />
                </colgroup>
                <thead
                  className="sticky top-0 z-10"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <Th>{t('ontology.relations.source', '源')}</Th>
                    <Th className="w-8" aria-label={t('ontology.relation.to', '关联')} />
                    <Th>{t('ontology.relations.target', '目标')}</Th>
                    <Th>{t('ontology.relations.type', '类型')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const active =
                      selected?.kind === 'relation' && selected.name === r.name
                    const relationTone = getRelationTone(r.relation_type)
                    return (
                      <tr
                        key={r.name}
                        className="cursor-pointer transition-colors hover:bg-hover"
                        style={{
                          background: active ? 'var(--bg-hover)' : undefined,
                          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onClick={() => setSelected({ kind: 'relation', name: r.name })}
                        data-testid={`ontology-relations-row-${r.name}`}
                      >
                        <Td>
                          <ObjectRef
                            name={r.source_object_name}
                            title={titleByName.get(r.source_object_name)}
                          />
                        </Td>
                        <Td>
                          <span className="text-lg text-3" aria-hidden>
                            →
                          </span>
                        </Td>
                        <Td>
                          <ObjectRef
                            name={r.target_object_name}
                            title={titleByName.get(r.target_object_name)}
                          />
                        </Td>
                        <Td>
                          <span
                            className="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-1 font-mono text-xs font-semibold leading-none"
                            style={{
                              background: relationTone.bg,
                              borderColor: relationTone.border,
                              color: relationTone.text,
                            }}
                            title={r.title || r.name}
                            data-testid={`ontology-relation-type-${r.name}`}
                            data-relation-type={r.relation_type ?? ''}
                          >
                            {r.relation_type ?? '—'}
                          </span>
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

function ObjectRef({ name, title }: { name: string; title?: string }) {
  const tone = getObjectTone(name)
  const displayName = title || name
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
        style={{ background: tone.bg, color: tone.text }}
      >
        {getObjectBadgeLabel(name, title)}
      </span>
      <div className="min-w-0">
        <div
          className="truncate font-medium text-1"
          title={title && title !== name ? `${title} · ${name}` : name}
        >
          {displayName}
        </div>
      </div>
    </div>
  )
}

function Th({
  children,
  className = '',
  ...rest
}: {
  children?: React.ReactNode
  className?: string
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-3 py-3 text-left text-xs font-medium text-3 ${className}`} {...rest}>
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-middle text-2">{children}</td>
}
