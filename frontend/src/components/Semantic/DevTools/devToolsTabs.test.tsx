import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createContext, useContext, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaygroundTab } from './PlaygroundTab'
import { SchemaSyncTab } from './SchemaSyncTab'
import { YamlEditorTab } from './YamlEditorTab'

const devToolsTabMocks = vi.hoisted(() => ({
  compileDsl: vi.fn(),
  listCubes: vi.fn(),
  describeCube: vi.fn(),
  querySemantic: vi.fn(),
  runSchemaSync: vi.fn(),
  toast: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    language,
  }: {
    value?: string
    onChange?: (value?: string) => void
    language?: string
  }) => (
    <textarea
      aria-label={`${language || 'plain'}-editor`}
      value={value || ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: devToolsTabMocks.toast }),
}))

vi.mock('@/api/semantic', () => ({
  compileDsl: devToolsTabMocks.compileDsl,
  listCubes: devToolsTabMocks.listCubes,
  describeCube: devToolsTabMocks.describeCube,
  querySemantic: devToolsTabMocks.querySemantic,
  runSchemaSync: devToolsTabMocks.runSchemaSync,
}))

vi.mock('@/api/client', () => ({
  default: {
    get: devToolsTabMocks.apiGet,
    put: devToolsTabMocks.apiPut,
    post: devToolsTabMocks.apiPost,
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
    ...props
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children?: ReactNode
    htmlFor?: string
    className?: string
  }) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}))

const SelectContext = createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    children?: ReactNode
  }) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({
    children,
    id,
  }: {
    children?: ReactNode
    id?: string
  }) => <div data-testid={id ? `${id}-trigger` : undefined}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const context = useContext(SelectContext)
    return <span>{context.value || placeholder || ''}</span>
  },
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children?: ReactNode
  }) => {
    const context = useContext(SelectContext)
    return (
      <button type="button" onClick={() => context.onValueChange?.(value)}>
        {children}
      </button>
    )
  },
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
  }) => (
    <input
      value={value || ''}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('@/components/Semantic/workbench', () => ({
  SemanticEmptyState: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => (
    <div data-testid="semantic-empty-state">
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}))

function renderWithProviders(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DevTools tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('SchemaSyncTab 支持空态、无漂移结果和带过滤的检测结果', async () => {
    const firstReport = {
      data: {
        total_cubes: 2,
        checked_cubes: 2,
        skipped_cubes: [],
        drift_count: 0,
        drifts: [],
        checked_at: '2026-03-26 10:00:00',
      },
    }
    const secondReport = {
      data: {
        total_cubes: 3,
        checked_cubes: 3,
        skipped_cubes: ['archived_cube'],
        drift_count: 2,
        checked_at: '2026-03-26 11:00:00',
        drifts: [
          {
            cube: 'answer_records',
            table: 'dw.answer_records',
            kind: 'missing_column',
            column: 'subject_name',
            detail: '物理表缺少 subject_name',
            severity: 'warn',
            object_type: 'cube',
            object_name: 'answer_records',
          },
          {
            cube: 'learning_overview',
            table: 'dw.learning_overview',
            kind: 'join_invalid',
            column: 'student_id',
            detail: 'join target 不存在',
            severity: 'error',
            object_type: 'view',
            object_name: 'learning_overview',
          },
        ],
      },
    }

    devToolsTabMocks.runSchemaSync
      .mockResolvedValueOnce(firstReport)
      .mockResolvedValueOnce(secondReport)

    renderWithProviders(<SchemaSyncTab highlightObjectName="learning_overview" />)

    expect(screen.getByText('点击“立即检测”执行真实 Schema Drift 检测')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '立即执行 Schema 漂移检测' }))

    expect(await screen.findByText('当前未发现 Schema 漂移')).toBeInTheDocument()
    expect(screen.getByText('共检查 2 个对象，跳过 0 个。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '立即执行 Schema 漂移检测' }))

    expect(await screen.findByText('join_invalid / student_id')).toBeInTheDocument()
    expect(screen.getByText('优先检查 View 定义和发布结果')).toBeInTheDocument()
    expect(screen.getByText('确认当前漂移是否需要同步更新')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /警告/ }))

    expect(screen.getByText('missing_column / subject_name')).toBeInTheDocument()
    expect(screen.queryByText('join_invalid / student_id')).not.toBeInTheDocument()
  })

  it('YamlEditorTab 支持 recipe 元信息、脏状态、校验和保存', async () => {
    const onDirtyChange = vi.fn()
    devToolsTabMocks.apiGet.mockResolvedValue({
      data: { content: 'name: learning_path\nkind: recipe\n' },
    })
    devToolsTabMocks.apiPost.mockResolvedValue({
      data: {
        valid: false,
        diagnostics: [
          { level: 'warn', message: '字段缺失' },
          { level: 'ok', message: '格式正确' },
        ],
      },
    })
    devToolsTabMocks.apiPut.mockResolvedValue({ data: {} })

    renderWithProviders(
      <YamlEditorTab
        fileType="recipes"
        fileName="learning_path"
        onDirtyChange={onDirtyChange}
        recipeMeta={{
          tags: ['学习', '转化'],
          exampleCount: 2,
          relatedCubes: ['answer_records'],
        }}
      />,
    )

    expect(await screen.findByText('recipes/learning_path.yml')).toBeInTheDocument()
    expect(screen.getByTestId('recipe-yaml-summary')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'answer_records' })).toHaveAttribute(
      'href',
      '/semantic/cubes?q=answer_records',
    )

    await waitFor(() => {
      expect(screen.getByLabelText('yaml-editor')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('yaml-editor'), {
      target: { value: 'name: learning_path\nkind: recipe\nversion: 2\n' },
    })

    expect(screen.getByText('有未保存修改')).toBeInTheDocument()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: '校验' }))
    expect(await screen.findByText('字段缺失')).toBeInTheDocument()
    expect(screen.getByText('格式正确')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存 YAML 修改' }))

    await waitFor(() => {
      expect(devToolsTabMocks.apiPut).toHaveBeenCalledWith('/semantic/files/recipes/learning_path', {
        content: 'name: learning_path\nkind: recipe\nversion: 2\n',
      })
    })
    expect(devToolsTabMocks.toast).toHaveBeenCalledWith({
      title: '保存成功',
      description: 'recipes/learning_path.yml 已更新',
    })
    expect(screen.getByText('未修改')).toBeInTheDocument()
  })

  it('YamlEditorTab 在未选择文件时展示空态', () => {
    renderWithProviders(<YamlEditorTab fileType={null} />)

    expect(screen.getByTestId('semantic-empty-state')).toHaveTextContent('请选择可编辑对象')
    expect(screen.getByText('当前页支持 Cube / View / Recipe 的在线 YAML 编辑，并显示定义文件、校验结果和保存动作。')).toBeInTheDocument()
  })

  it('PlaygroundTab 支持统一配置滚动区、共享 DSL/SQL 面板以及编译执行结果', async () => {
    devToolsTabMocks.listCubes.mockResolvedValue({
      data: {
        cubes: [{ name: 'answer_records', title: '答题记录' }],
      },
    })
    devToolsTabMocks.describeCube.mockResolvedValue({
      data: {
        name: 'answer_records',
        title: '答题记录',
        description: '',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        dimensions: {
          subject_name: { title: '学科', type: 'string' },
          answer_date: { title: '答题日期', type: 'time' },
        },
        measures: {
          total_count: { title: '总次数', type: 'count', certified: true, description: '总答题数' },
        },
        segments: {},
        joins: {
          student: { target_cube: 'student', type: 'many_to_one' },
        },
      },
    })
    devToolsTabMocks.compileDsl.mockResolvedValue({
      data: {
        sql: 'select subject_name, count(*) from answer_records',
        primary_cube: 'answer_records',
        joined_cubes: ['student'],
      },
    })
    devToolsTabMocks.querySemantic.mockResolvedValue({
      data: {
        sql: 'select subject_name, count(*) from answer_records',
        primary_cube: 'answer_records',
        joined_cubes: ['student'],
        columns: ['subject_name', 'total_count'],
        data: [['数学', 10]],
        row_count: 1,
        execution_time_ms: 23,
        retryable: false,
        message: '执行成功',
      },
    })

    renderWithProviders(<PlaygroundTab preferredCube="answer_records" />)

    expect(await screen.findByText('DSL JSON')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('checkbox', { name: /总次数/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /学科/ }))
    await userEvent.click(screen.getByRole('button', { name: 'answer_date' }))

    await userEvent.type(screen.getByPlaceholderText('起始日期 (yyyyMMdd)'), '20250101')
    await userEvent.type(screen.getByPlaceholderText('结束日期 (yyyyMMdd)'), '20250331')
    await userEvent.click(screen.getByRole('button', { name: '月' }))
    await userEvent.type(
      screen.getByPlaceholderText('逗号分隔 Cube 名称，如 answer_records, student, school'),
      'answer_records, student',
    )

    await waitFor(() => {
      expect((screen.getByLabelText('json-editor') as HTMLTextAreaElement).value).toContain('"join_path": [')
    })
    expect(screen.getByText('JOIN 路径')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '编译' }))

    const sqlEditor = (await screen.findByLabelText('sql-editor')) as HTMLTextAreaElement
    expect(devToolsTabMocks.compileDsl).toHaveBeenCalledWith({
      measures: ['answer_records.total_count'],
      dimensions: ['answer_records.subject_name'],
      time_dimensions: [
        {
          dimension: 'answer_records.answer_date',
          granularity: 'month',
          date_range: ['20250101', '20250331'],
        },
      ],
      join_path: ['answer_records', 'student'],
      limit: 100,
    })
    expect(sqlEditor.value).toContain('select subject_name, count(*) from answer_records')

    await userEvent.click(screen.getByRole('button', { name: '编译并执行' }))

    expect(await screen.findByText('执行结果')).toBeInTheDocument()
    expect(screen.getByText('1 行 · 23 ms')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('数学')).toBeInTheDocument()
  })

  it('PlaygroundTab 在单 Cube 模式下支持编译失败和执行失败提示', async () => {
    devToolsTabMocks.listCubes.mockResolvedValue({
      data: {
        cubes: [{ name: 'answer_records', title: '答题记录' }],
      },
    })
    devToolsTabMocks.describeCube.mockResolvedValue({
      data: {
        name: 'answer_records',
        title: '答题记录',
        description: '',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
      },
    })
    devToolsTabMocks.compileDsl.mockRejectedValue(new Error('编译器炸了'))
    devToolsTabMocks.querySemantic.mockRejectedValue(new Error('执行器炸了'))

    renderWithProviders(<PlaygroundTab preferredCube="answer_records" />)

    await screen.findByText('DSL JSON')

    await userEvent.click(screen.getByRole('button', { name: '编译' }))
    await waitFor(() => {
      expect(devToolsTabMocks.toast).toHaveBeenCalledWith({
        title: '编译失败',
        description: '编译器炸了',
        variant: 'destructive',
      })
    })

    await userEvent.click(screen.getByRole('button', { name: '编译并执行' }))
    await waitFor(() => {
      expect(devToolsTabMocks.toast).toHaveBeenCalledWith({
        title: '执行失败',
        description: '执行器炸了',
        variant: 'destructive',
      })
    })

    expect(screen.getByText('编译失败')).toBeInTheDocument()
  })
})
