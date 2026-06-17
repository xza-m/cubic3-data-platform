// frontend/src/v2/components/ui/Tabs.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs, Tab } from './Tabs'

describe('Tabs', () => {
  it('renders tabs and marks active', () => {
    render(
      <Tabs value="b" onChange={() => {}}>
        <Tab value="a">A</Tab>
        <Tab value="b">B</Tab>
      </Tabs>,
    )
    const a = screen.getByRole('tab', { name: 'A' })
    const b = screen.getByRole('tab', { name: 'B' })
    expect(a).toHaveAttribute('aria-selected', 'false')
    expect(b).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onChange when clicking a tab', async () => {
    const onChange = vi.fn()
    render(
      <Tabs value="a" onChange={onChange}>
        <Tab value="a">A</Tab>
        <Tab value="b">B</Tab>
      </Tabs>,
    )
    await userEvent.click(screen.getByRole('tab', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('disabled tab does not fire onChange', async () => {
    const onChange = vi.fn()
    render(
      <Tabs value="a" onChange={onChange}>
        <Tab value="a">A</Tab>
        <Tab value="b" disabled>B</Tab>
      </Tabs>,
    )
    const b = screen.getByRole('tab', { name: 'B' })
    expect(b).toBeDisabled()
    await userEvent.click(b)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('honors size=sm', () => {
    render(
      <Tabs value="a" onChange={() => {}} size="sm">
        <Tab value="a">A</Tab>
      </Tabs>,
    )
    expect(screen.getByRole('tab').className).toContain('h-7')
  })

  it('can render as inline tabs without a tablist divider', () => {
    render(
      <Tabs value="a" onChange={() => {}} bordered={false}>
        <Tab value="a">A</Tab>
      </Tabs>,
    )
    expect(screen.getByRole('tablist').className).not.toContain('border-b')
    expect(screen.getByRole('tab').className).not.toContain('-mb-px')
  })

  it('Tab throws if used outside Tabs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Tab value="a">x</Tab>)).toThrow(/inside <Tabs>/)
    spy.mockRestore()
  })

  it('skips non-element children gracefully', () => {
    render(
      <Tabs value="a" onChange={() => {}}>
        {'text-child'}
        <Tab value="a">A</Tab>
      </Tabs>,
    )
    expect(screen.getByRole('tab', { name: 'A' })).toBeInTheDocument()
  })
})
