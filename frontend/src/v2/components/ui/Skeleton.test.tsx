// frontend/src/v2/components/ui/Skeleton.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonRows } from './Skeleton'

describe('Skeleton', () => {
  it('renders with default height and rounded class', () => {
    const { container } = render(<Skeleton />)
    const span = container.querySelector('span')!
    expect(span.style.height).toBe('12px')
    expect(span.className).toContain('rounded')
    expect(span.className).not.toContain('rounded-full')
  })

  it('uses rounded-full when rounded=true', () => {
    const { container } = render(<Skeleton rounded />)
    expect(container.querySelector('span')!.className).toContain('rounded-full')
  })

  it('supports numeric width/height', () => {
    const { container } = render(<Skeleton width={100} height={20} />)
    const span = container.querySelector('span')!
    expect(span.style.width).toBe('100px')
    expect(span.style.height).toBe('20px')
  })

  it('supports string width/height', () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />)
    const span = container.querySelector('span')!
    expect(span.style.width).toBe('50%')
    expect(span.style.height).toBe('2rem')
  })
})

describe('SkeletonRows', () => {
  it('renders default 5x4 grid', () => {
    const { container } = render(<SkeletonRows />)
    expect(container.querySelectorAll('span').length).toBe(20)
  })

  it('honors rows/columns', () => {
    const { container } = render(<SkeletonRows rows={2} columns={3} />)
    expect(container.querySelectorAll('span').length).toBe(6)
  })
})
