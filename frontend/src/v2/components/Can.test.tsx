// frontend/src/v2/components/Can.test.tsx
//
// Note: Can's `usePermissions` placeholder always returns ['*']
// so currently only the "allowed" branch is reachable. Coverage of
// the disallowed branches is intentionally accepted as dead code
// pending B-back-permissions wire-up.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Can } from './Can'

describe('Can - allowed branch (placeholder)', () => {
  it('renders element children unchanged', () => {
    render(
      <Can action="datasource.delete">
        <button>do</button>
      </Can>,
    )
    expect(screen.getByRole('button', { name: 'do' })).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('renders text children unchanged', () => {
    render(<Can action="x">just-text</Can>)
    expect(screen.getByText('just-text')).toBeInTheDocument()
  })

  it('honors disabledTip prop without crashing (currently unused)', () => {
    render(
      <Can action="x" disabledTip="needs-perm">
        <span>x</span>
      </Can>,
    )
    expect(screen.getByText('x')).toBeInTheDocument()
  })
})
