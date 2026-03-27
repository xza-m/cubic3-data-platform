import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { templates, widgets } from './rjsf-theme'

vi.mock('@/components/ui/input', () => ({
  Input: ({
    id,
    value,
    onChange,
    onBlur,
    onFocus,
    disabled,
    readOnly,
    type = 'text',
    className,
    min,
    max,
  }: {
    id?: string
    value?: string | number
    onChange?: (event: { target: { value: string } }) => void
    onBlur?: (event: { target: { value: string } }) => void
    onFocus?: (event: { target: { value: string } }) => void
    disabled?: boolean
    readOnly?: boolean
    type?: string
    className?: string
    min?: number
    max?: number
  }) => (
    <input
      id={id}
      value={value ?? ''}
      type={type}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      min={min}
      max={max}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      onBlur={(event) => onBlur?.({ target: { value: event.target.value } })}
      onFocus={(event) => onFocus?.({ target: { value: event.target.value } })}
    />
  ),
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({
    id,
    value,
    onChange,
    onBlur,
    onFocus,
    rows,
    className,
  }: {
    id?: string
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    onBlur?: (event: { target: { value: string } }) => void
    onFocus?: (event: { target: { value: string } }) => void
    rows?: number
    className?: string
  }) => (
    <textarea
      id={id}
      rows={rows}
      className={className}
      value={value ?? ''}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      onBlur={(event) => onBlur?.({ target: { value: event.target.value } })}
      onFocus={(event) => onFocus?.({ target: { value: event.target.value } })}
    />
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children: ReactNode
    htmlFor?: string
    className?: string
  }) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
    disabled,
  }: {
    id?: string
    checked: boolean
    onCheckedChange?: (checked: boolean) => void
    disabled?: boolean
  }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? '开' : '关'}
    </button>
  ),
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const { createContext, useContext } = React
  const SelectContext = createContext<{
    onValueChange?: (value: string) => void
  } | null>(null)

  function useSelectContext() {
    const context = useContext(SelectContext)
    if (!context) throw new Error('缺少 SelectContext')
    return context
  }

  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange?: (value: string) => void
      children: ReactNode
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({
      children,
      id,
      className,
    }: {
      children: ReactNode
      id?: string
      className?: string
    }) => (
      <div id={id} className={className}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      value,
      children,
    }: {
      value: string
      children: ReactNode
    }) => {
      const context = useSelectContext()
      return (
        <button type="button" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
  }
})

describe('rjsf-theme', () => {
  it('FieldTemplate 支持隐藏字段、普通字段与错误展示', () => {
    const FieldTemplate = templates.FieldTemplate!

    const { rerender } = render(
      <FieldTemplate
        id="field-1"
        label="名称"
        children={<input aria-label="名称输入" />}
        errors={<span>字段错误</span>}
        rawErrors={['字段错误']}
        help={<span>帮助</span>}
        description={<span>说明</span>}
        hidden={false}
        required
        displayLabel
        schema={{ type: 'string' }}
      />,
    )

    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('字段错误')).toBeInTheDocument()
    expect(screen.getByText('帮助')).toBeInTheDocument()
    expect(screen.getByText('说明')).toBeInTheDocument()

    rerender(
      <FieldTemplate
        id="field-2"
        label="隐藏字段"
        children={<input aria-label="隐藏输入" />}
        errors={null}
        rawErrors={[]}
        help={null}
        description={null}
        hidden
        required={false}
        displayLabel={false}
        schema={{ type: 'string' }}
      />,
    )

    expect(screen.getByLabelText('隐藏输入')).toBeInTheDocument()
  })

  it('ObjectFieldTemplate 支持根对象直接渲染和可折叠对象切换', async () => {
    const user = userEvent.setup()
    const ObjectFieldTemplate = templates.ObjectFieldTemplate!

    render(
      <ObjectFieldTemplate
        title="根对象"
        description={null}
        properties={[{ content: <div key="root-content">根内容</div> }]}
        idSchema={{ $id: 'root' }}
        uiSchema={{}}
      />,
    )

    expect(screen.getByText('根内容')).toBeInTheDocument()

    cleanup()
    render(
      <ObjectFieldTemplate
        title="高级配置"
        description="可选字段"
        properties={[{ content: <div key="nested-content">内层字段</div> }]}
        idSchema={{ $id: 'advanced' }}
        uiSchema={{ 'ui:options': { collapsed: true } }}
      />,
    )

    expect(screen.queryByText('内层字段')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '高级配置' }))
    expect(screen.getByText('内层字段')).toBeInTheDocument()
    expect(screen.getByText('可选字段')).toBeInTheDocument()
  })

  it('标题、描述和基础输入模板会透传事件并处理空值', async () => {
    const TitleFieldTemplate = templates.TitleFieldTemplate!
    const DescriptionFieldTemplate = templates.DescriptionFieldTemplate!
    const BaseInputTemplate = templates.BaseInputTemplate!
    const onChange = vi.fn()
    const onBlur = vi.fn()
    const onFocus = vi.fn()

    render(
      <div>
        <TitleFieldTemplate id="title-id" title="标题" />
        <DescriptionFieldTemplate id="desc-id" description="描述文本" />
        <BaseInputTemplate
          id="base-input"
          type="number"
          value=""
          disabled={false}
          readonly={false}
          autofocus={false}
          onBlur={onBlur}
          onFocus={onFocus}
          onChange={onChange}
          options={{ emptyValue: undefined }}
          schema={{ type: 'number' }}
          rawErrors={['错误']}
        />
      </div>,
    )

    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('描述文本')).toBeInTheDocument()

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith('12')
    input.focus()
    expect(onFocus).toHaveBeenCalled()
    input.blur()
    expect(onBlur).toHaveBeenCalled()
  })

  it('文本、密码、数字和布尔 Widget 会触发对应值变更', async () => {
    const user = userEvent.setup()
    const onTextChange = vi.fn()
    const onPasswordChange = vi.fn()
    const onNumberChange = vi.fn()
    const onCheckboxChange = vi.fn()
    const TextWidget = widgets.TextWidget!
    const PasswordWidget = widgets.PasswordWidget!
    const NumberWidget = widgets.NumberWidget!
    const CheckboxWidget = widgets.CheckboxWidget!

    render(
      <div>
        <TextWidget id="text-widget" value="" onChange={onTextChange} onBlur={vi.fn()} onFocus={vi.fn()} />
        <PasswordWidget id="password-widget" value="" onChange={onPasswordChange} onBlur={vi.fn()} onFocus={vi.fn()} />
        <NumberWidget
          id="number-widget"
          value={1}
          schema={{ minimum: 1, maximum: 9 }}
          onChange={onNumberChange}
          onBlur={vi.fn()}
          onFocus={vi.fn()}
        />
        <CheckboxWidget id="checkbox-widget" value={false} label="启用功能" onChange={onCheckboxChange} />
      </div>,
    )

    const textInput = document.getElementById('text-widget') as HTMLInputElement
    const passwordInput = document.getElementById('password-widget') as HTMLInputElement
    await user.type(textInput, 'abc')
    expect(onTextChange).toHaveBeenCalled()

    await user.type(passwordInput, 'xyz')
    expect(onPasswordChange).toHaveBeenCalled()

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8' } })
    expect(onNumberChange).toHaveBeenCalledWith(undefined)
    expect(onNumberChange).toHaveBeenCalledWith(8)

    await user.click(screen.getByRole('switch'))
    expect(onCheckboxChange).toHaveBeenCalledWith(true)
  })

  it('多行文本和枚举 Widget 支持输入与选项切换', async () => {
    const user = userEvent.setup()
    const onTextareaChange = vi.fn()
    const onSelectChange = vi.fn()
    const TextareaWidget = widgets.TextareaWidget!
    const SelectWidget = widgets.SelectWidget!

    render(
      <div>
        <TextareaWidget
          id="textarea-widget"
          value=""
          onChange={onTextareaChange}
          onBlur={vi.fn()}
          onFocus={vi.fn()}
          options={{ rows: 6 }}
        />
        <SelectWidget
          id="select-widget"
          value="manual"
          options={{
            enumOptions: [
              { value: 'manual', label: '手动' },
              { value: 'cron', label: '定时' },
            ],
          }}
          onChange={onSelectChange}
        />
      </div>,
    )

    await user.type(screen.getByRole('textbox'), 'hello')
    expect(onTextareaChange).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '定时' }))
    expect(onSelectChange).toHaveBeenCalledWith('cron')
  })
})
