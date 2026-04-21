// frontend/src/v2/components/RouteGuard.test.tsx
//
// Note: RouteGuard's placeholder usePermissions returns ['*'], so the
// /forbidden branch is intentionally unreachable until B-back-permissions
// is wired up.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RouteGuard } from './RouteGuard'

describe('RouteGuard - allowed branch (placeholder)', () => {
  it('renders children when permission satisfied', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route
            path="/x"
            element={
              <RouteGuard required="anything">
                <div>protected-content</div>
              </RouteGuard>
            }
          />
          <Route path="/forbidden" element={<div>FORBIDDEN</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('protected-content')).toBeInTheDocument()
    expect(screen.queryByText('FORBIDDEN')).toBeNull()
  })
})
