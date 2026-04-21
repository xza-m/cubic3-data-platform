// frontend/src/v2/components/ui/Card.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHead, CardBody } from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello</Card>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('applies tight class', () => {
    const { container } = render(<Card tight>x</Card>)
    expect(container.firstChild).toHaveClass('card-tight')
  })
})

describe('CardHead', () => {
  it('renders title and subtitle', () => {
    render(<CardHead title="T" subtitle="S" />)
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('renders extra (right slot)', () => {
    render(<CardHead title="T" extra={<span>E</span>} />)
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  it('actions takes precedence over extra', () => {
    render(<CardHead title="T" extra={<span>E</span>} actions={<span>A</span>} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText('E')).not.toBeInTheDocument()
  })

  it('renders children between title and right slot', () => {
    render(
      <CardHead title="T">
        <span>middle</span>
      </CardHead>,
    )
    expect(screen.getByText('middle')).toBeInTheDocument()
  })

  it('omits title block when title and subtitle absent', () => {
    const { container } = render(<CardHead><span>only</span></CardHead>)
    expect(container.querySelector('.card-title')).toBeNull()
  })
})

describe('CardBody', () => {
  it('renders children', () => {
    render(<CardBody>body</CardBody>)
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})
