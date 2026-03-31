import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type {
  BaseInputTemplateProps,
  DescriptionFieldProps,
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  TitleFieldProps,
  WidgetProps,
} from '@rjsf/utils'
import { templates, widgets } from './rjsf-theme'

const rjsfRegistry = {} as FieldTemplateProps['registry']

function makeFieldTemplateProps(
  overrides: Partial<FieldTemplateProps> = {},
): FieldTemplateProps {
  return {
    id: 'field-id',
    label: '字段',
    children: <input aria-label="字段输入" />,
    errors: null,
    rawErrors: [],
    help: null,
    description: null,
    hidden: false,
    required: false,
    readonly: false,
    disabled: false,
    displayLabel: true,
    schema: { type: 'string' } as FieldTemplateProps['schema'],
    onChange: vi.fn(),
    onKeyChange: vi.fn(),
    onDropPropertyClick: vi.fn(),
    registry: rjsfRegistry,
    ...overrides,
  }
}

function makeObjectFieldTemplateProps(
  overrides: Partial<ObjectFieldTemplateProps> = {},
): ObjectFieldTemplateProps {
  return {
    title: '对象',
    description: null,
    properties: [],
    onAddClick: vi.fn(),
    schema: { type: 'object' } as ObjectFieldTemplateProps['schema'],
    idSchema: { $id: 'root' } as ObjectFieldTemplateProps['idSchema'],
    registry: rjsfRegistry,
    ...overrides,
  }
}

function makeTitleFieldProps(overrides: Partial<TitleFieldProps> = {}): TitleFieldProps {
  return {
    id: 'title-id',
    title: '标题',
    schema: { type: 'string' } as TitleFieldProps['schema'],
    registry: rjsfRegistry,
    ...overrides,
  }
}

function makeDescriptionFieldProps(
  overrides: Partial<DescriptionFieldProps> = {},
): DescriptionFieldProps {
  return {
    id: 'desc-id',
    description: '描述文本',
    schema: { type: 'string' } as DescriptionFieldProps['schema'],
    registry: rjsfRegistry,
    ...overrides,
  }
}

function makeBaseInputTemplateProps(
  overrides: Partial<BaseInputTemplateProps> = {},
): BaseInputTemplateProps {
  return {
    id: 'base-input',
    name: 'base-input',
    label: '基础输入',
    type: 'number',
    value: '',
    disabled: false,
    readonly: false,
    autofocus: false,
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    onChange: vi.fn(),
    options: { emptyValue: undefined },
    schema: { type: 'number' } as BaseInputTemplateProps['schema'],
    rawErrors: ['错误'],
    registry: rjsfRegistry,
    ...overrides,
  }
}

function makeWidgetProps(overrides: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'widget-id',
    name: 'widget-name',
    schema: { type: 'string' } as WidgetProps['schema'],
    options: {},
    value: '',
    label: '控件',
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    onChange: vi.fn(),
    registry: rjsfRegistry,
    ...overrides,
  }
}

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
        {...makeFieldTemplateProps({
          id: 'field-1',
          label: '名称',
          children: <input aria-label="名称输入" />,
          errors: <span>字段错误</span>,
          rawErrors: ['字段错误'],
          help: <span>帮助</span>,
          description: <span>说明</span>,
          required: true,
          schema: { type: 'string' } as FieldTemplateProps['schema'],
        })}
      />,
    )

    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('字段错误')).toBeInTheDocument()
    expect(screen.getByText('帮助')).toBeInTheDocument()
    expect(screen.getByText('说明')).toBeInTheDocument()

    rerender(
      <FieldTemplate
        {...makeFieldTemplateProps({
          id: 'field-2',
          label: '隐藏字段',
          children: <input aria-label="隐藏输入" />,
          hidden: true,
          displayLabel: false,
          schema: { type: 'string' } as FieldTemplateProps['schema'],
        })}
      />,
    )

    expect(screen.getByLabelText('隐藏输入')).toBeInTheDocument()
  })

  it('ObjectFieldTemplate 支持根对象直接渲染和可折叠对象切换', async () => {
    const user = userEvent.setup()
    const ObjectFieldTemplate = templates.ObjectFieldTemplate!

    render(
      <ObjectFieldTemplate
        {...makeObjectFieldTemplateProps({
          title: '根对象',
          description: null,
          properties: [{ name: 'root-content', hidden: false, content: <div key="root-content">根内容</div> }],
          idSchema: { $id: 'root' } as ObjectFieldTemplateProps['idSchema'],
          uiSchema: {},
        })}
      />,
    )

    expect(screen.getByText('根内容')).toBeInTheDocument()

    cleanup()
    render(
      <ObjectFieldTemplate
        {...makeObjectFieldTemplateProps({
          title: '高级配置',
          description: '可选字段',
          properties: [
            { name: 'nested-content', hidden: false, content: <div key="nested-content">内层字段</div> },
          ],
          idSchema: { $id: 'advanced' } as ObjectFieldTemplateProps['idSchema'],
          uiSchema: { 'ui:options': { collapsed: true } },
        })}
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
        <TitleFieldTemplate {...makeTitleFieldProps()} />
        <DescriptionFieldTemplate {...makeDescriptionFieldProps()} />
        <BaseInputTemplate
          {...makeBaseInputTemplateProps({
            onBlur,
            onFocus,
            onChange,
          })}
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
        <TextWidget
          {...makeWidgetProps({
            id: 'text-widget',
            name: 'text-widget',
            value: '',
            onChange: onTextChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            label: '文本',
            schema: { type: 'string' } as WidgetProps['schema'],
          })}
        />
        <PasswordWidget
          {...makeWidgetProps({
            id: 'password-widget',
            name: 'password-widget',
            value: '',
            onChange: onPasswordChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            label: '密码',
            schema: { type: 'string' } as WidgetProps['schema'],
          })}
        />
        <NumberWidget
          {...makeWidgetProps({
            id: 'number-widget',
            name: 'number-widget',
            value: 1,
            schema: { minimum: 1, maximum: 9 } as WidgetProps['schema'],
            options: {},
            onChange: onNumberChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            label: '数字',
          })}
        />
        <CheckboxWidget
          {...makeWidgetProps({
            id: 'checkbox-widget',
            name: 'checkbox-widget',
            value: false,
            label: '启用功能',
            onChange: onCheckboxChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            schema: { type: 'boolean' } as WidgetProps['schema'],
          })}
        />
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
          {...makeWidgetProps({
            id: 'textarea-widget',
            name: 'textarea-widget',
            value: '',
            onChange: onTextareaChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            options: { rows: 6 },
            label: '多行文本',
            schema: { type: 'string' } as WidgetProps['schema'],
          })}
        />
        <SelectWidget
          {...makeWidgetProps({
            id: 'select-widget',
            name: 'select-widget',
            value: 'manual',
            options: {
              enumOptions: [
                { value: 'manual', label: '手动' },
                { value: 'cron', label: '定时' },
              ],
            },
            onChange: onSelectChange,
            onBlur: vi.fn(),
            onFocus: vi.fn(),
            label: '调度类型',
            schema: { enum: ['manual', 'cron'] } as WidgetProps['schema'],
          })}
        />
      </div>,
    )

    await user.type(screen.getByRole('textbox'), 'hello')
    expect(onTextareaChange).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '定时' }))
    expect(onSelectChange).toHaveBeenCalledWith('cron')
  })
})
