// frontend/src/v2/components/Can.test.tsx
//
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { getCurrentUser } from '@v2/api/auth'
import { setAccessToken } from '@v2/api/client'
import { Can } from './Can'

vi.mock('@v2/api/auth', () => ({
  getCurrentUser: vi.fn(),
}))

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  setAccessToken(null)
  vi.clearAllMocks()
})

describe('Can', () => {
  it('renders element children unchanged when permission is granted', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ permissions: ['datasource.delete'] })
    setAccessToken('test-token')
    renderWithQuery(
      <Can action="datasource.delete">
        <button>do</button>
      </Can>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'do' })).not.toBeDisabled())
  })

  it('disables element children when permission is missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ permissions: [] })
    setAccessToken('test-token')
    renderWithQuery(
      <Can action="datasource.delete" disabledTip="needs-perm">
        <button>do</button>
      </Can>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'do' })).toBeDisabled())
  })

  it('keeps text children visible when permission is missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ permissions: [] })
    setAccessToken('test-token')
    renderWithQuery(
      <Can action="x" disabledTip="needs-perm">
        just-text
      </Can>,
    )
    expect(await screen.findByText('just-text')).toBeInTheDocument()
  })
})
