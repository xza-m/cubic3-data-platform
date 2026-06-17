// frontend/src/v2/components/RouteGuard.test.tsx
//
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { getCurrentUser } from '@v2/api/auth'
import { setAccessToken } from '@v2/api/client'
import { RouteGuard } from './RouteGuard'

vi.mock('@v2/api/auth', () => ({
  getCurrentUser: vi.fn(),
}))

function renderRoute(required: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route
            path="/x"
            element={
              <RouteGuard required={required}>
                <div>protected-content</div>
              </RouteGuard>
            }
          />
          <Route path="/forbidden" element={<div>FORBIDDEN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  setAccessToken(null)
  vi.clearAllMocks()
})

describe('RouteGuard', () => {
  it('renders children when permission satisfied', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ permissions: ['access.read'] })
    setAccessToken('test-token')
    renderRoute('access.read')
    expect(await screen.findByText('protected-content')).toBeInTheDocument()
    expect(screen.queryByText('FORBIDDEN')).toBeNull()
  })

  it('redirects to forbidden when permission is missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ permissions: ['access.read'] })
    setAccessToken('test-token')
    renderRoute('access.write')
    expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument()
    expect(screen.queryByText('protected-content')).toBeNull()
  })

  it('redirects to forbidden when token is missing', async () => {
    renderRoute('anything')
    expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument()
  })
})
