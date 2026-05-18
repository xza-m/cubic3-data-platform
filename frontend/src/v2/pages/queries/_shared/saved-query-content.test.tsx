import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SavedQueryDetailContent } from './saved-query-content'
import type { SavedQuery } from '@v2/api/queries'

vi.mock('@v2/hooks/access', () => ({
  usePrincipalDisplayNames: (ids: string[]) => ({
    data: Object.fromEntries(ids.map((id) => [id, '李老师'])),
  }),
}))

const row: SavedQuery = {
  id: 12,
  query_name: '近 7 天活跃学校',
  query_code: 'active_school_7d',
  sql_query: 'select 1',
  source_id: 1,
  created_by: 'ou_a233770c5639ea99ec09a3a5e148fee0',
  created_by_display_name: null,
  description: null,
  folder_id: null,
  tags: [],
  is_favorite: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
}

describe('SavedQueryDetailContent', () => {
  it('共享详情里的查询操作使用图标按钮，用户名通过身份组件显示', () => {
    render(
      <SavedQueryDetailContent
        row={row}
        actions={{
          onOpen: () => {},
          onEdit: () => {},
          onToggleFavorite: () => {},
          onDelete: () => {},
        }}
      />,
    )

    expect(screen.getByText('李老师')).toBeInTheDocument()
    expect(screen.queryByText(/ou_a233770c5639ea99ec09a3a5e148fee0/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '在工作台打开' })).toBeInTheDocument()
    expect(screen.queryByText('在工作台打开')).not.toBeInTheDocument()
  })
})
