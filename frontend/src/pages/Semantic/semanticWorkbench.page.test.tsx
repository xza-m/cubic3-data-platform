import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSemanticWorkbench } from '@/hooks/semantic-ia'

const semanticApiMocks = vi.hoisted(() => ({
  createCubeRevision: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    createCubeRevision: semanticApiMocks.createCubeRevision,
  }
})

function createWrapper(initialEntry = '/semantic/workbench') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

describe('useSemanticWorkbench', () => {
  beforeEach(() => {
    semanticApiMocks.createCubeRevision.mockReset()
    navigateMock.mockReset()
  })

  it('无当前 Cube 时进入 start 模式并默认打开建模 tab', () => {
    const { result } = renderHook(() => useSemanticWorkbench(), {
      wrapper: createWrapper(),
    })

    expect(result.current.mode).toBe('start')
    expect(result.current.defaultTab).toBe('modeling')
    expect(result.current.currentCube).toBeNull()
  })

  it('草稿 Cube 会作为当前工作对象并默认进入建模 tab', () => {
    const { result } = renderHook(
      () =>
        useSemanticWorkbench({
          currentCube: {
            name: 'answer_records__revision_draft',
            status: 'draft',
          },
        }),
      {
        wrapper: createWrapper('/semantic/workbench?cube=answer_records__revision_draft'),
      },
    )

    expect(result.current.mode).toBe('workspace')
    expect(result.current.defaultTab).toBe('modeling')
    expect(result.current.currentCube).toMatchObject({
      name: 'answer_records__revision_draft',
      status: 'draft',
    })
  })

  it('已发布 Cube 默认进入预览 tab', () => {
    const { result } = renderHook(
      () =>
        useSemanticWorkbench({
          currentCube: {
            name: 'answer_records',
            status: 'active',
          },
        }),
      {
        wrapper: createWrapper('/semantic/workbench?cube=answer_records'),
      },
    )

    expect(result.current.mode).toBe('workspace')
    expect(result.current.defaultTab).toBe('preview')
  })

  it('已发布 Cube 发起修订后跳回工作台开发态', async () => {
    semanticApiMocks.createCubeRevision.mockResolvedValue({
      data: {
        name: 'answer_records__revision_draft',
        title: '答题记录修订草稿',
        table: 'answer_records',
        source_id: 1,
        dimensions: {},
        measures: {},
        status: 'draft',
      },
    })

    const { result } = renderHook(
      () =>
        useSemanticWorkbench({
          currentCube: {
            name: 'answer_records',
            status: 'active',
          },
        }),
      {
        wrapper: createWrapper('/semantic/workbench?cube=answer_records'),
      },
    )

    await act(async () => {
      await result.current.startRevision('answer_records')
    })

    expect(semanticApiMocks.createCubeRevision).toHaveBeenCalledWith('answer_records')
    expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?cube=answer_records__revision_draft&tab=modeling')
  })
})
