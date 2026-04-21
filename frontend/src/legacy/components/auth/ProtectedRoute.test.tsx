import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'

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

function renderRoute(initialEntries: string[] = ['/dashboard']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>受保护页面</div>} />
        </Route>
        <Route path="/login" element={<div>登录页</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    storageState = {}
    installStorageStub()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('存在 token 时渲染受保护页面', () => {
    localStorage.setItem('auth_token', 'token-123')

    renderRoute()

    expect(screen.getByText('受保护页面')).toBeInTheDocument()
  })

  it('缺少 token 时重定向到登录页', () => {
    renderRoute()

    expect(screen.getByText('登录页')).toBeInTheDocument()
    expect(screen.queryByText('受保护页面')).not.toBeInTheDocument()
  })
})
