import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const createCube = vi.fn()
const draftCube = vi.fn()
const navigate = vi.fn()
const setBreadcrumbs = vi.fn()
const setTopBarActions = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs,
    setTopBarActions,
  }),
}))

vi.mock('@v2/hooks/semantic', () => ({
  useCreateCube: () => ({ mutateAsync: createCube, isPending: false, isError: false }),
  useDraftCubeFromSource: () => ({ mutateAsync: draftCube, isPending: false, isError: false }),
}))

import CubeCreate from './CubeCreate'

function renderPage() {
  return render(
    <MemoryRouter>
      <CubeCreate />
    </MemoryRouter>,
  )
}

describe('CubeCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    createCube.mockResolvedValue({ name: 'manual_cube' })
    draftCube.mockResolvedValue({ name: 'draft_cube' })
  })

  it('展示字段候选生成入口文案', () => {
    renderPage()

    expect(screen.getByText('从数据集候选生成')).toBeInTheDocument()
    expect(screen.getByText('从数据源候选生成')).toBeInTheDocument()
    expect(screen.getAllByText('先生成字段候选并进行风险确认，再生成 Cube 草稿')).toHaveLength(2)
  })

  it('草稿成功后缓存字段候选 trace', async () => {
    draftCube.mockResolvedValueOnce({
      name: 'student_comment',
      field_candidate_trace: {
        candidate_set_id: 'fcs_1',
        measure_count: 2,
        dimension_count: 3,
        risk_summary: { high: 1 },
      },
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '从数据源候选生成' }))
    fireEvent.change(screen.getByPlaceholderText('cube_name_snake_case'), { target: { value: 'student_comment' } })
    fireEvent.change(screen.getByPlaceholderText('如：订单交易 Cube'), { target: { value: '学生评论' } })
    fireEvent.click(screen.getByRole('button', { name: '生成草稿' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/semantic/cubes/student_comment/edit'))

    expect(sessionStorage.getItem('cube-draft-field-candidates:student_comment')).toContain('fcs_1')
  })

  it('草稿返回字段候选 trace 但缺少 name 时不缓存 undefined 且不跳转', async () => {
    draftCube.mockResolvedValueOnce({
      field_candidate_trace: {
        candidate_set_id: 'fcs_missing_name',
      },
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '从数据源候选生成' }))
    fireEvent.click(screen.getByRole('button', { name: '生成草稿' }))

    await waitFor(() => expect(screen.getByText('创建失败，请检查输入后重试')).toBeInTheDocument())

    expect(sessionStorage.getItem('cube-draft-field-candidates:undefined')).toBeNull()
    expect(navigate).not.toHaveBeenCalledWith('/semantic/cubes/undefined/edit')
  })
})
