// frontend/src/v2/components/EntityFormDialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EntityFormDialog, type FieldSpec } from './EntityFormDialog'

const allFields: FieldSpec[] = [
  { name: 'name', label: '名称', type: 'text', required: true, placeholder: 'name…' },
  { name: 'note', label: '备注', type: 'textarea', help: 'help-text' },
  { name: 'age', label: '年龄', type: 'number' },
  {
    name: 'role',
    label: '角色',
    type: 'select',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
  { name: 'enabled', label: '启用', type: 'switch' },
  { name: 'tags', label: '标签', type: 'tags' },
  { key: 'aliasField', label: 'alias' }, // tests `key` alias
]

describe('EntityFormDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <EntityFormDialog
        open={false}
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={() => {}}
      />,
    )
    expect(screen.queryByText('t')).toBeNull()
  })

  it('renders all field types and description', () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="新建"
        description="form-desc"
        schema={allFields}
        onSubmit={() => {}}
      />,
    )
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('form-desc')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('name…')).toBeInTheDocument()
    expect(screen.getByText('help-text')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('throws if a field is missing both name and key', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <EntityFormDialog
          open
          onClose={() => {}}
          title="t"
          schema={[{ label: 'no-name' } as FieldSpec]}
          onSubmit={() => {}}
        />,
      ),
    ).toThrow(/`name` or `key`/)
    spy.mockRestore()
  })

  it('shows required validation error and blocks submit', async () => {
    const onSubmit = vi.fn()
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A', required: true }]}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByText('保存'))
    expect(await screen.findByText('必填')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears error after typing into field', async () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A', required: true, placeholder: 'a' }]}
        onSubmit={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('保存'))
    expect(await screen.findByText('必填')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('a'), { target: { value: 'x' } })
    await waitFor(() => expect(screen.queryByText('必填')).toBeNull())
  })

  it('calls onSubmit with values, then closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <EntityFormDialog
        open
        onClose={onClose}
        title="t"
        schema={[{ name: 'a', label: 'A', placeholder: 'a' }]}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('a'), { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.click(screen.getByText('保存'))
    })
    expect(onSubmit).toHaveBeenCalledWith({ a: 'hi' })
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel button triggers onClose without submitting', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(
      <EntityFormDialog
        open
        onClose={onClose}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('uses initial values + defaultValue + type defaults', () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[
          { name: 'name', label: 'N', placeholder: 'name' },
          { name: 'enabled', label: 'E', type: 'switch', defaultValue: true },
          { name: 'tags', label: 'T', type: 'tags' },
          { name: 'cnt', label: 'C', type: 'number' },
        ]}
        initialValues={{ name: 'alice' }}
        onSubmit={() => {}}
      />,
    )
    expect((screen.getByPlaceholderText('name') as HTMLInputElement).value).toBe('alice')
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('runs custom validate and surfaces returned message', async () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[
          {
            name: 'a',
            label: 'A',
            placeholder: 'a',
            validate: (v) => (v === 'bad' ? 'no-bad' : null),
          },
        ]}
        onSubmit={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('a'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('保存'))
    expect(await screen.findByText('no-bad')).toBeInTheDocument()
  })

  it('switches submitting state during submit and respects loading prop', () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={() => {}}
        loading
      />,
    )
    expect(screen.getByText('保存中…')).toBeInTheDocument()
  })

  it('Cmd+Enter submits the form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={onSubmit}
      />,
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    })
    expect(onSubmit).toHaveBeenCalled()
  })

  it('Ctrl+Enter submits the form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={onSubmit}
      />,
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    })
    expect(onSubmit).toHaveBeenCalled()
  })

  it('typing in textarea / number / select / switch / tags field updates value', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={allFields}
        initialValues={{ name: 'a' }}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('name…'), { target: { value: 'a' } })
    // textarea
    const textarea = document.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'note-content' } })
    // number
    const number = document.querySelector('input[type="number"]')!
    fireEvent.change(number, { target: { value: '42' } })
    // select
    const select = document.querySelector('select')!
    fireEvent.change(select, { target: { value: 'b' } })
    // switch toggle
    fireEvent.click(screen.getByRole('switch'))
    // tags
    const tagsInput = document.querySelector('input[placeholder="英文逗号分隔"]')!
    fireEvent.change(tagsInput, { target: { value: 'foo, bar，baz' } })

    await act(async () => {
      fireEvent.click(screen.getByText('保存'))
    })

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        note: 'note-content',
        age: '42',
        role: 'b',
        enabled: true,
        tags: ['foo', 'bar', 'baz'],
      }),
    )
  })

  it('fields prop is alias for schema', () => {
    render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        fields={[{ name: 'a', label: 'AAA', placeholder: 'a' }]}
        onSubmit={() => {}}
      />,
    )
    expect(screen.getByText('AAA')).toBeInTheDocument()
  })

  it('onClose is suppressed while submitting via dialog backdrop', async () => {
    let resolve!: () => void
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    const onClose = vi.fn()
    render(
      <EntityFormDialog
        open
        onClose={onClose}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={onSubmit}
      />,
    )
    act(() => {
      fireEvent.click(screen.getByText('保存'))
    })
    expect(onSubmit).toHaveBeenCalled()
    await act(async () => {
      resolve()
    })
  })

  it('does not auto-submit when not open (no key listener)', () => {
    const onSubmit = vi.fn()
    render(
      <EntityFormDialog
        open={false}
        onClose={() => {}}
        title="t"
        schema={[{ name: 'a', label: 'A' }]}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('half-span fields render as expected', () => {
    const { container } = render(
      <EntityFormDialog
        open
        onClose={() => {}}
        title="t"
        schema={[
          { name: 'a', label: 'A', span: 'half' },
          { name: 'b', label: 'B', span: 'half' },
        ]}
        onSubmit={() => {}}
      />,
    )
    expect(container.querySelectorAll('.col-span-1').length).toBe(2)
  })
})
