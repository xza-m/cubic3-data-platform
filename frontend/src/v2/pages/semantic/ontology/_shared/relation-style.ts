// frontend/src/v2/pages/semantic/ontology/_shared/relation-style.ts
//
// 关系索引的稳定色彩映射。后端暂未提供枚举色板，前端先按关系枚举与对象名
// 做确定性映射，保证图和列表表达一致。

export interface RelationTone {
  bg: string
  border: string
  text: string
  strong: string
  soft: string
}

export interface ObjectTone {
  bg: string
  text: string
  soft: string
  border: string
}

const RELATION_TONES: Array<RelationTone & { keys: string[] }> = [
  {
    keys: ['belongs_to', 'belong', '归属'],
    bg: '#e0ecff',
    border: '#bfdbfe',
    text: '#2563eb',
    strong: '#2f80ed',
    soft: '#eff6ff',
  },
  {
    keys: ['owned_by', 'owner', 'owned'],
    bg: '#efe7ff',
    border: '#ddd6fe',
    text: '#7c3aed',
    strong: '#8b5cf6',
    soft: '#f5f3ff',
  },
  {
    keys: ['owns'],
    bg: '#f0e7ff',
    border: '#e9d5ff',
    text: '#9333ea',
    strong: '#a855f7',
    soft: '#faf5ff',
  },
  {
    keys: ['submits', 'submit', '提交'],
    bg: '#fff3d8',
    border: '#fde68a',
    text: '#c47a1a',
    strong: '#f59e0b',
    soft: '#fffbeb',
  },
  {
    keys: ['contains', 'contain', '包含'],
    bg: '#dcfce7',
    border: '#bbf7d0',
    text: '#16a34a',
    strong: '#22c55e',
    soft: '#f0fdf4',
  },
  {
    keys: ['linked_to', 'link', '关联'],
    bg: '#f1f5f9',
    border: '#e2e8f0',
    text: '#64748b',
    strong: '#94a3b8',
    soft: '#f8fafc',
  },
  {
    keys: ['one_to_one', '1:1'],
    bg: '#dcfce7',
    border: '#bbf7d0',
    text: '#15803d',
    strong: '#16a34a',
    soft: '#f0fdf4',
  },
  {
    keys: ['one_to_many', '1:n'],
    bg: '#dbeafe',
    border: '#bfdbfe',
    text: '#1d4ed8',
    strong: '#2563eb',
    soft: '#eff6ff',
  },
  {
    keys: ['many_to_many', 'n:n'],
    bg: '#fce7f3',
    border: '#fbcfe8',
    text: '#db2777',
    strong: '#ec4899',
    soft: '#fdf2f8',
  },
  {
    keys: ['has'],
    bg: '#cffafe',
    border: '#a5f3fc',
    text: '#0891b2',
    strong: '#06b6d4',
    soft: '#ecfeff',
  },
]

const FALLBACK_RELATION_TONES: RelationTone[] = [
  { bg: '#e0f2fe', border: '#bae6fd', text: '#0284c7', strong: '#0ea5e9', soft: '#f0f9ff' },
  { bg: '#fef3c7', border: '#fde68a', text: '#b45309', strong: '#d97706', soft: '#fffbeb' },
  { bg: '#ede9fe', border: '#ddd6fe', text: '#6d28d9', strong: '#7c3aed', soft: '#f5f3ff' },
  { bg: '#dcfce7', border: '#bbf7d0', text: '#15803d', strong: '#16a34a', soft: '#f0fdf4' },
]

const OBJECT_TONES: ObjectTone[] = [
  { bg: '#16a34a', text: '#ffffff', soft: '#dcfce7', border: '#bbf7d0' },
  { bg: '#2563eb', text: '#ffffff', soft: '#dbeafe', border: '#bfdbfe' },
  { bg: '#f59e0b', text: '#ffffff', soft: '#fef3c7', border: '#fde68a' },
  { bg: '#db2777', text: '#ffffff', soft: '#fce7f3', border: '#fbcfe8' },
  { bg: '#06b6d4', text: '#ffffff', soft: '#cffafe', border: '#a5f3fc' },
  { bg: '#8b5cf6', text: '#ffffff', soft: '#ede9fe', border: '#ddd6fe' },
  { bg: '#dc2626', text: '#ffffff', soft: '#fee2e2', border: '#fecaca' },
]

function hashText(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getRelationTone(type?: string | null): RelationTone {
  const normalized = (type || '').trim().toLowerCase()
  if (!normalized) return FALLBACK_RELATION_TONES[0]
  const known = RELATION_TONES.find((tone) =>
    tone.keys.some((key) => normalized.includes(key.toLowerCase())),
  )
  if (known) return known
  return FALLBACK_RELATION_TONES[hashText(normalized) % FALLBACK_RELATION_TONES.length]
}

export function getObjectTone(name: string): ObjectTone {
  return OBJECT_TONES[hashText(name || 'object') % OBJECT_TONES.length]
}

export function getObjectBadgeLabel(name: string, title?: string | null): string {
  const source = (title || name || '?').trim()
  const first = Array.from(source)[0] || '?'
  return /[a-z]/i.test(first) ? first.toUpperCase() : first
}
