import type { AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const axiosClientMocks = vi.hoisted(() => {
  const state: {
    config?: Record<string, unknown>
    requestSuccess?: (config: Record<string, any>) => Record<string, any>
    requestError?: (error: Error) => Promise<never>
    responseSuccess?: (response: AxiosResponse) => unknown
    responseError?: (error: any) => Promise<never>
  } = {}

  const instance = {
    interceptors: {
      request: {
        use: vi.fn((success, error) => {
          state.requestSuccess = success
          state.requestError = error
        }),
      },
      response: {
        use: vi.fn((success, error) => {
          state.responseSuccess = success
          state.responseError = error
        }),
      },
    },
  }

  return {
    state,
    create: vi.fn((config: Record<string, unknown>) => {
      state.config = config
      return instance
    }),
  }
})

vi.mock('axios', () => ({
  default: {
    create: axiosClientMocks.create,
  },
  create: axiosClientMocks.create,
}))

import apiClient from './client'

type StorageState = Record<string, string>

let storageState: StorageState = {}

function installStorageStub() {
  const storage = {
    getItem: vi.fn((key: string) => storageState[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storageState[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete storageState[key]
    }),
    clear: vi.fn(() => {
      storageState = {}
    }),
  }

  vi.stubGlobal('localStorage', storage)
}

describe('apiClient', () => {
  beforeEach(() => {
    storageState = {}
    installStorageStub()
    vi.clearAllMocks()
    axiosClientMocks.create.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('按预期创建 axios 客户端配置', () => {
    expect(apiClient).toBeDefined()
    expect(axiosClientMocks.state.config).toMatchObject({
      baseURL: '/api/v1',
      timeout: 300000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })

  it('请求拦截器会注入认证 token', () => {
    localStorage.setItem('auth_token', 'secret-token')

    const config = axiosClientMocks.state.requestSuccess?.({ headers: {} })

    expect(config?.headers.Authorization).toBe('Bearer secret-token')
  })

  it('响应成功时直接返回 response.data', () => {
    const payload = { data: { items: [1, 2, 3] } }

    const result = axiosClientMocks.state.responseSuccess?.({ data: payload } as AxiosResponse)

    expect(result).toEqual(payload)
  })

  it('401 时清理 token 并跳转登录页', async () => {
    localStorage.setItem('auth_token', 'expired')
    vi.stubGlobal('window', {
      location: { href: '' },
    })

    await expect(
      axiosClientMocks.state.responseError?.({
        response: {
          status: 401,
          data: { message: 'unauthorized' },
        },
        config: { url: '/apps' },
      }),
    ).rejects.toThrow('unauthorized')

    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(window.location.href).toBe('/login')

    vi.unstubAllGlobals()
  })

  it('语义目录 404 返回专用提示', async () => {
    await expect(
      axiosClientMocks.state.responseError?.({
        response: {
          status: 404,
          data: { message: 'missing' },
        },
        config: { url: '/semantic/catalogs/default' },
      }),
    ).rejects.toThrow('目录接口不存在，当前后端可能尚未加载最新版本，请重启后端服务后重试')
  })

  it('普通字符串错误会映射为易读消息', async () => {
    await expect(
      axiosClientMocks.state.responseError?.({
        response: {
          status: 404,
          data: 'not found',
        },
        config: { url: '/datasets/1' },
      }),
    ).rejects.toThrow('请求的接口不存在')
  })

  it('对象错误优先返回 message 字段', async () => {
    await expect(
      axiosClientMocks.state.responseError?.({
        response: {
          status: 500,
          data: { message: '服务器异常' },
        },
        config: { url: '/datasets/1' },
      }),
    ).rejects.toThrow('服务器异常')
  })

  it('超时请求返回超时提示', async () => {
    await expect(
      axiosClientMocks.state.responseError?.({
        request: {},
        code: 'ECONNABORTED',
      }),
    ).rejects.toThrow('请求超时，查询可能仍在执行中，请稍后重试')
  })

  it('网络错误返回统一提示', async () => {
    await expect(
      axiosClientMocks.state.responseError?.({
        request: {},
        code: 'ERR_NETWORK',
      }),
    ).rejects.toThrow('网络错误，请检查您的网络连接')
  })

  it('请求配置错误返回统一提示', async () => {
    await expect(
      axiosClientMocks.state.responseError?.(new Error('boom')),
    ).rejects.toThrow('请求配置错误')
  })
})
