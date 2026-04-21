// frontend/src/v2/hooks/channels.test.tsx
//
// 渠道域 hook 单元测试 — 重点覆盖 P12 useTestChannel
// - useTestChannel: success + failure path

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@v2/api/channels', () => ({
  listChannels: vi.fn(),
  getChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  enableChannel: vi.fn(),
  disableChannel: vi.fn(),
  testChannel: vi.fn(),
}))

import { testChannel } from '@v2/api/channels'
import { useTestChannel } from './channels'
import type { ChannelTestResult } from '@v2/api/channels'

const mockTestChannel = testChannel as ReturnType<typeof vi.fn>

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  })
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  }
}

describe('useTestChannel (P12)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns success result on ok=true', async () => {
    const successResult: ChannelTestResult = {
      ok: true,
      message: '发送成功',
      latency_ms: 120,
      sent_at: '2026-04-21T00:00:00Z',
    }
    mockTestChannel.mockResolvedValue(successResult)

    const { qc, wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestChannel(), { wrapper })

    let data: ChannelTestResult | undefined
    await act(async () => {
      data = await result.current.mutateAsync(42)
    })

    expect(mockTestChannel).toHaveBeenCalledWith(42)
    expect(data?.ok).toBe(true)
    expect(data?.latency_ms).toBe(120)
    qc.clear()
  })

  it('returns failure result on ok=false', async () => {
    const failResult: ChannelTestResult = {
      ok: false,
      message: '连接超时',
      latency_ms: 7000,
      sent_at: '2026-04-21T00:00:00Z',
      error_code: 'CONNECTION_TIMEOUT',
    }
    mockTestChannel.mockResolvedValue(failResult)

    const { qc, wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestChannel(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(1)
    })

    await waitFor(() => expect(result.current.data?.ok).toBe(false))
    expect(result.current.data?.error_code).toBe('CONNECTION_TIMEOUT')
    qc.clear()
  })
})
