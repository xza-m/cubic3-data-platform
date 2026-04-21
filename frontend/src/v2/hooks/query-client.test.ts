// frontend/src/v2/hooks/query-client.test.ts
//
// 验证 createQueryClient 默认值与 qk 拼接行为。
import { describe, it, expect } from 'vitest'
import { createQueryClient, qk } from './query-client'

describe('createQueryClient', () => {
  it('configures default queries.staleTime, retry, refetchOnWindowFocus', () => {
    const qc = createQueryClient()
    const opts = qc.getDefaultOptions()
    expect(opts.queries?.staleTime).toBe(30_000)
    expect(opts.queries?.retry).toBe(1)
    expect(opts.queries?.refetchOnWindowFocus).toBe(false)
    expect(opts.mutations?.retry).toBe(0)
  })
})

describe('qk', () => {
  it('returns [domain, action]', () => {
    expect(qk('foo', 'list')).toEqual(['foo', 'list'])
  })
  it('appends rest args', () => {
    expect(qk('foo', 'detail', 1, { a: 1 })).toEqual(['foo', 'detail', 1, { a: 1 }])
  })
})
