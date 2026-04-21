// frontend/src/v2/hooks/apps.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/apps', () => ({
  listApps: vi.fn(),
  getApp: vi.fn(),
  listAppCategories: vi.fn(),
  validateAppConfig: vi.fn(),
  enableApp: vi.fn(),
  disableApp: vi.fn(),
}))

import {
  listApps,
  getApp,
  listAppCategories,
  validateAppConfig,
  enableApp,
  disableApp,
} from '@v2/api/apps'
import {
  useApps,
  useApp,
  useAppCategories,
  useValidateAppConfig,
  useEnableApp,
  useDisableApp,
} from './apps'
import { makeWrapper } from './test-utils'

const m = {
  list: listApps as ReturnType<typeof vi.fn>,
  get: getApp as ReturnType<typeof vi.fn>,
  cats: listAppCategories as ReturnType<typeof vi.fn>,
  validate: validateAppConfig as ReturnType<typeof vi.fn>,
  enable: enableApp as ReturnType<typeof vi.fn>,
  disable: disableApp as ReturnType<typeof vi.fn>,
}

beforeEach(() => vi.clearAllMocks())

describe('useApps / useApp / useAppCategories', () => {
  it('useApps fetches list', async () => {
    m.list.mockResolvedValue([{ code: 'a' }])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useApps({ category: 'x' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(m.list).toHaveBeenCalledWith({ category: 'x' })
  })

  it('useApp does not fetch when code falsy', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useApp(undefined), { wrapper })
    expect(m.get).not.toHaveBeenCalled()
  })

  it('useApp fetches when code present', async () => {
    m.get.mockResolvedValue({ code: 'a' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useApp('a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(m.get).toHaveBeenCalledWith('a')
  })

  it('useAppCategories fetches list', async () => {
    m.cats.mockResolvedValue(['x'])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAppCategories(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(m.cats).toHaveBeenCalled()
  })
})

describe('mutations', () => {
  it('useValidateAppConfig calls API', async () => {
    m.validate.mockResolvedValue({ ok: true })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useValidateAppConfig(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ code: 'a', config: { foo: 1 } })
    })
    expect(m.validate).toHaveBeenCalledWith('a', { foo: 1 })
  })

  it('useEnableApp invalidates apps', async () => {
    m.enable.mockResolvedValue({ code: 'a' })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useEnableApp(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('a')
    })
    expect(m.enable).toHaveBeenCalledWith('a')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['apps'] })
  })

  it('useDisableApp invalidates apps', async () => {
    m.disable.mockResolvedValue({ code: 'a' })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDisableApp(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('a')
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['apps'] })
  })
})
