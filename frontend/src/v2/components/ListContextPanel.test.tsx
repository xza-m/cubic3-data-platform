// frontend/src/v2/components/ListContextPanel.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  CtxSection,
  DistList,
  ListContextBody,
  PeekHint,
  QuickAction,
  Stat,
  StatGrid,
} from './ListContextPanel'

describe('ListContextBody', () => {
  it('renders children', () => {
    render(
      <ListContextBody>
        <span>x</span>
      </ListContextBody>,
    )
    expect(screen.getByText('x')).toBeInTheDocument()
  })
})

describe('CtxSection', () => {
  it('renders title and children', () => {
    render(
      <CtxSection title="T">
        <span>body</span>
      </CtxSection>,
    )
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})

describe('Stat', () => {
  it.each(['default', 'success', 'danger', 'warning'] as const)('renders tone=%s', (tone) => {
    render(<Stat label={`L-${tone}`} value="42" tone={tone} />)
    expect(screen.getByText(`L-${tone}`)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('default tone is "default"', () => {
    render(<Stat label="omit" value="7" />)
    expect(screen.getByText('omit')).toBeInTheDocument()
  })
})

describe('StatGrid', () => {
  it('renders 2-col grid for fewer than 3 items', () => {
    const { container } = render(
      <StatGrid items={[
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ]} />,
    )
    expect(container.firstChild).toHaveClass('grid-cols-2')
  })

  it('renders 3-col grid for 3+ items', () => {
    const { container } = render(
      <StatGrid items={[
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
        { label: 'C', value: 3 },
      ]} />,
    )
    expect(container.firstChild).toHaveClass('grid-cols-3')
  })
})

describe('DistList', () => {
  it('renders empty placeholder', () => {
    render(<DistList items={[]} />)
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('renders rows', () => {
    render(<DistList items={[{ label: 'a', value: 1 }, { label: 'b', value: 2 }]} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
  })
})

describe('QuickAction', () => {
  it('renders label and shortcut', () => {
    render(<QuickAction label="A" shortcut={<span>S</span>} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('omits shortcut when not provided', () => {
    render(<QuickAction label="A" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})

describe('PeekHint', () => {
  it('renders 3 hints', () => {
    const { container } = render(<PeekHint />)
    expect(container.querySelectorAll('li')).toHaveLength(3)
  })
})
