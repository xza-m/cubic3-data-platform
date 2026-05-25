import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn())

vi.mock('@v2/api/client', () => ({
  apiClient: {
    post: mockPost,
  },
}))

import { draftCubeFromCandidates, previewFieldCandidates } from './semantic'

describe('semantic field candidates API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previewFieldCandidates 调用字段候选预览 endpoint 并透传 payload', async () => {
    const body = {
      source_kind: 'physical_table',
      source_id: 'ds_1',
      database: 'df_cb_258187',
      schema: 'dw',
      table: 'dwd_comment_df',
    }
    mockPost.mockResolvedValueOnce({ data: { data: { candidate_set_id: 'fcs_1', candidates: [] } } })

    await expect(previewFieldCandidates(body)).resolves.toEqual({ candidate_set_id: 'fcs_1', candidates: [] })

    expect(mockPost).toHaveBeenCalledWith('/semantic/field-candidates/preview', body, undefined)
  })

  it('draftCubeFromCandidates 调用候选生成 Cube 草稿 endpoint 并透传 payload', async () => {
    const body = {
      candidate_set_id: 'fcs_1',
      selected_candidate_ids: ['metric_total', 'dim_school'],
      name: 'student_comment',
      title: '学生评论',
    }
    mockPost.mockResolvedValueOnce({ data: { data: { name: 'student_comment' } } })

    await expect(draftCubeFromCandidates(body)).resolves.toEqual({ name: 'student_comment' })

    expect(mockPost).toHaveBeenCalledWith('/semantic/cubes/draft-from-candidates', body, undefined)
  })
})
