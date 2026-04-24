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
      channel_type: 'feishu',
      latency_ms: 120,
      status_code: 200,
      detail: '飞书 Webhook 发送成功',
      error: null,
      dry_run: false,
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
      channel_type: 'webhook',
      latency_ms: 7000,
      status_code: null,
      detail: '请求超时',
      error: 'timeout',
      dry_run: false,
    }
    mockTestChannel.mockResolvedValue(failResult)

    const { qc, wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestChannel(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(1)
    })

    await waitFor(() => expect(result.current.data?.ok).toBe(false))
    expect(result.current.data?.error).toBe('timeout')
    qc.clear()
  })
})
