import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

describe('ProtectedRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    window.sessionStorage.clear()
  })

  it('allows browser E2E fixture mode without a persisted token', () => {
    vi.stubEnv('VITE_BROWSER_E2E_FIXTURES', '1')

    render(
      <MemoryRouter initialEntries={['/protected-fixture']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute />}>
            <Route path="protected-fixture" element={<div>fixture page</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('fixture page')).toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })
})
