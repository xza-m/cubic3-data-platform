import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const navigateMock = vi.fn()
const fetchMock = vi.fn()
const originalLocalStorage = globalThis.localStorage
const originalLocation = window.location

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

beforeEach(() => {
  const storage = new Map<string, string>()

  navigateMock.mockReset()
  fetchMock.mockReset()

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key)
      }),
      clear: vi.fn(() => {
        storage.clear()
      }),
    },
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  })
})

describe('Login page', () => {
  const getSubmitButton = () => screen.getByRole('button', { name: /^登\s*录$/ })

  it('渲染新版双栏登录页与三层架构说明', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(screen.getByText('登录以继续使用数据平台')).toBeInTheDocument()
    expect(screen.getByText('SOURCE')).toBeInTheDocument()
    expect(screen.getByText('SEMANTIC')).toBeInTheDocument()
    expect(screen.getByText('APPLICATION')).toBeInTheDocument()
  })

  it('空用户名时给出校验提示', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.click(getSubmitButton())

    expect(await screen.findByText('请输入用户名')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('支持回调 token、密码显隐和飞书登录跳转', async () => {
    const locationStub = { href: 'http://localhost/login' }
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    })

    render(
      <MemoryRouter initialEntries={['/login?token=abc123']}>
        <Login />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('abc123')
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true })
    })

    const passwordInput = screen.getByLabelText('密码') as HTMLInputElement
    expect(passwordInput.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: '显示密码' }))
    expect(passwordInput.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }))
    expect(passwordInput.type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: '飞书登录' }))
    expect(locationStub.href).toBe('/api/v1/auth/feishu/authorize')
  })

  it('支持回调错误提示', async () => {
    render(
      <MemoryRouter initialEntries={['/login?error=%E9%A3%9E%E4%B9%A6%E7%99%BB%E5%BD%95%E5%A4%B1%E8%B4%A5']}>
        <Login />
      </MemoryRouter>,
    )

    expect(await screen.findByText('飞书登录失败')).toBeInTheDocument()
  })

  it('处理空密码、登录失败、网络失败和成功登录', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: ' admin ' } })
    fireEvent.click(getSubmitButton())
    expect(await screen.findByText('请输入密码')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: '账号或密码错误' }),
    })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'bad-pass' } })
    fireEvent.click(getSubmitButton())
    expect(await screen.findByText('账号或密码错误')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'bad-pass' }),
    }))

    fetchMock.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(getSubmitButton())
    expect(await screen.findByText('网络错误，请稍后重试')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { token: 'nested-token' } }),
    })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'admin123' } })
    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('nested-token')
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })
})
