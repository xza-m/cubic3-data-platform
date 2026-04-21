// frontend/src/v2/components/ui/Kbd.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Kbd } from './Kbd'

describe('Kbd', () => {
  it('renders children inside <kbd>', () => {
    const { container } = render(<Kbd>Esc</Kbd>)
    expect(container.querySelector('kbd')).not.toBeNull()
    expect(screen.getByText('Esc')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Kbd className="extra">A</Kbd>)
    expect(container.querySelector('kbd')!.className).toContain('extra')
  })
})
