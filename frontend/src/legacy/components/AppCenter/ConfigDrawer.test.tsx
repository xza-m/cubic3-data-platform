import { createContext, useContext, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDefinition, AppInstance } from '../../api/appCenter'
import ConfigDrawer from './ConfigDrawer'

const configDrawerMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('@/components/business', () => ({
  useToast: () => ({ toast: configDrawerMocks.toast }),
  PageModal: ({
    open,
    title,
    ariaLabel,
    description,
    children,
    footer,
  }: {
    open: boolean
    title?: string
    ariaLabel?: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
  }) => (
    open ? (
      <div role="dialog" aria-label={ariaLabel || title || '实例配置弹窗'}>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
        {children}
        {footer}
      </div>
    ) : null
  ),
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string
    onChange?: (value?: string) => void
  }) => (
    <textarea
      aria-label="代码编辑器"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

vi.mock('../Selectors/DataSourceSelector', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value?: number
    onChange?: (value: number) => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={() => onChange?.(11)}>
      {value ? `数据源:${value}` : '选择数据源'}
    </button>
  ),
}))

vi.mock('../Selectors/DatasetSelector', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value?: number
    onChange?: (value: number) => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={() => onChange?.(22)}>
      {value ? `数据集:${value}` : '选择数据集'}
    </button>
  ),
}))

vi.mock('@rjsf/validator-ajv8', () => ({
  default: {},
}))

vi.mock('@rjsf/core', () => ({
  default: ({
    formData = {},
    onChange,
    widgets,
  }: {
    formData?: Record<string, unknown>
    onChange: (event: { formData: Record<string, unknown> }) => void
    widgets: Record<string, (props: Record<string, unknown>) => ReactNode>
  }) => {
    const DataSourceWidget = widgets.datasource_id
    const DatasetWidget = widgets.dataset_id
    const StringTagsWidget = widgets.string_tags

    return (
      <div data-testid="rjsf-form">
        <DataSourceWidget
          value={formData.datasource_id}
          onChange={(value: number) => onChange({ formData: { ...formData, datasource_id: value } })}
        />
        <DatasetWidget
          value={formData.dataset_id}
          onChange={(value: number) => onChange({ formData: { ...formData, dataset_id: value } })}
        />
        <StringTagsWidget
          value={formData.allowed_user_ids}
          onChange={(value: string[]) => onChange({ formData: { ...formData, allowed_user_ids: value } })}
        />
      </div>
    )
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    id,
    value,
    onChange,
    disabled,
    readOnly,
    placeholder,
    type = 'text',
  }: {
    id?: string
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    disabled?: boolean
    readOnly?: boolean
    placeholder?: string
    type?: string
  }) => (
    <input
      id={id}
      type={type}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
    />
  ),
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({
    id,
    value,
    onChange,
    disabled,
    readOnly,
    placeholder,
    rows,
    className,
  }: {
    id?: string
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    disabled?: boolean
    readOnly?: boolean
    placeholder?: string
    rows?: number
    className?: string
  }) => (
    <textarea
      id={id}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      rows={rows}
      className={className}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
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
  }: {
    id?: string
    checked: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? '已启用' : '已禁用'}
    </button>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const SelectContext = createContext<{
    value?: string
    onValueChange?: (value: string) => void
  } | null>(null)

  function useSelectContext() {
    const context = useContext(SelectContext)
    if (!context) {
      throw new Error('缺少 SelectContext')
    }
    return context
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: ReactNode
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

function makeApp(overrides: Partial<AppDefinition> = {}): AppDefinition {
  return {
    id: 1,
    code: 'report_push',
    name: '报表推送',
    category: 'report',
    description: '报表推送应用',
    config_schema: {
      type: 'object',
      properties: {
        datasource_id: { type: 'number' },
        dataset_id: { type: 'number' },
        allowed_user_ids: {
          type: 'array',
          items: { type: 'string' },
        },
        trigger_on_event: {
          type: 'object',
          properties: {
            event_code: { type: 'string' },
          },
        },
      },
    },
    icon: 'chart-bar',
    author: '平台团队',
    version: '1.0.0',
    enabled: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
    ...overrides,
  }
}

function makeInstance(overrides: Partial<AppInstance> = {}): AppInstance {
  return {
    id: 2,
    app_code: 'report_push',
    name: '每日播报',
    description: '每天早上推送',
    config: {
      datasource_id: 3,
      dataset_id: 5,
      allowed_user_ids: ['alice'],
    },
    schedule_type: 'cron',
    schedule_config: { cron: '0 9 * * *' },
    owner: 'alice',
    enabled: true,
    last_execution_at: null,
    next_execution_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
    ...overrides,
  }
}

describe('ConfigDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建实例时支持智能表单输入并提交配置', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <ConfigDrawer
        open
        app={makeApp()}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('创建实例 - 报表推送')).toBeInTheDocument()
    expect(screen.getByText('(智能表单)')).toBeInTheDocument()
    expect(screen.getByTestId('rjsf-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/实例名称/), '日报推送实例')
    await user.type(screen.getByLabelText('描述'), '给业务团队推送日报')
    await user.click(screen.getByRole('button', { name: '选择数据源' }))
    await user.click(screen.getByRole('button', { name: '选择数据集' }))
    fireEvent.change(screen.getByPlaceholderText('每行输入一个值（留空表示不限制）'), {
      target: { value: 'alice\nbob' },
    })
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        app_code: 'report_push',
        name: '日报推送实例',
        description: '给业务团队推送日报',
        config: {
          datasource_id: 11,
          dataset_id: 22,
          allowed_user_ids: ['alice', 'bob'],
        },
        schedule_type: 'manual',
        schedule_config: {},
        enabled: true,
      })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('支持模式切换，并在代码模式 JSON 非法时阻止切回智能表单与提交', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <ConfigDrawer
        open
        app={makeApp()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /切换模式/ }))
    expect(screen.getByText('(JSON文本)')).toBeInTheDocument()
    expect(screen.getByText('配置说明')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /切换模式/ }))
    expect(screen.getByText('(代码编辑器)')).toBeInTheDocument()

    const editor = screen.getByLabelText('代码编辑器')
    fireEvent.change(editor, { target: { value: '{broken' } })

    await user.click(screen.getByRole('button', { name: /切换模式/ }))
    expect(configDrawerMocks.toast).toHaveBeenCalledWith({
      title: 'JSON 格式错误，无法切换到智能表单',
      variant: 'destructive',
    })

    await user.type(screen.getByLabelText(/实例名称/), '非法配置实例')
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(configDrawerMocks.toast).toHaveBeenCalledWith({
      title: '配置 JSON 格式错误',
      variant: 'destructive',
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('定时调度下校验 Cron JSON 格式', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <ConfigDrawer
        open
        app={makeApp()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.type(screen.getByLabelText(/实例名称/), 'Cron 任务')
    await user.click(screen.getByRole('button', { name: '定时调度' }))
    const cronInput = screen.getByPlaceholderText('{"cron": "0 9 * * *"}')
    fireEvent.change(cronInput, { target: { value: '{bad-json' } })
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(screen.getByText('Cron 配置 JSON 格式错误')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('无 schema 的应用默认使用 JSON 文本模式，并在提交失败时提示错误', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue({
      response: { data: { message: '保存失败' } },
    })

    render(
      <ConfigDrawer
        open
        app={makeApp({
          code: 'data_agent',
          category: 'agent',
          config_schema: {},
        })}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('(JSON文本)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('消息驱动（无需调度）')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /填充示例/ }))
    expect(configDrawerMocks.toast).toHaveBeenCalledWith({
      title: '已填充示例配置，请根据实际情况修改',
    })
    expect(screen.getByDisplayValue(/"knowledge"/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /切换模式/ }))
    expect(screen.getByText('(代码编辑器)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /切换模式/ }))
    expect(screen.getByText('(JSON文本)')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/实例名称/), '智能问数代理')
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        app_code: 'data_agent',
        name: '智能问数代理',
        description: '',
        config: expect.objectContaining({
          knowledge: { datasource_id: 1 },
        }),
        schedule_type: 'manual',
        schedule_config: {},
        enabled: true,
      })
    })
    expect(configDrawerMocks.toast).toHaveBeenCalledWith({
      title: '保存失败',
      variant: 'destructive',
    })
  })

  it('编辑模式会回填实例信息，并支持取消关闭', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <ConfigDrawer
        open
        app={makeApp({ category: 'agent' })}
        instance={makeInstance()}
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByText('编辑实例')).toBeInTheDocument()
    expect(screen.getByDisplayValue('每日播报')).toBeInTheDocument()
    expect(screen.getByDisplayValue('每天早上推送')).toBeInTheDocument()
    expect(screen.getByDisplayValue('消息驱动（无需调度）')).toBeInTheDocument()
    expect(screen.getByText('(智能表单)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
