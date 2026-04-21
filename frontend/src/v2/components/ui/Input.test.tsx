// frontend/src/v2/components/ui/Input.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input, Select, Textarea } from './Input'

describe('Input', () => {
  it('renders with default type=text', () => {
    render(<Input aria-label="x" />)
    expect(screen.getByLabelText('x')).toHaveAttribute('type', 'text')
  })

  it('honors custom type', () => {
    render(<Input type="number" aria-label="n" />)
    expect(screen.getByLabelText('n')).toHaveAttribute('type', 'number')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input ref={ref} aria-label="r" />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('handles change events', async () => {
    const onChange = vi.fn()
    render(<Input aria-label="i" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('i'), 'a')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('Select', () => {
  it('renders options and forwards ref', () => {
    const ref = createRef<HTMLSelectElement>()
    render(
      <Select ref={ref} aria-label="s" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    )
    expect(ref.current).toBeInstanceOf(HTMLSelectElement)
    expect((screen.getByLabelText('s') as HTMLSelectElement).value).toBe('b')
  })
})

describe('Textarea', () => {
  it('renders and accepts text', async () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} aria-label="t" />)
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
    await userEvent.type(screen.getByLabelText('t'), 'abc')
    expect((screen.getByLabelText('t') as HTMLTextAreaElement).value).toBe('abc')
  })
})
