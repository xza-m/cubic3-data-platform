import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  SemanticActionBar,
  SemanticEmptyState,
  SemanticInspectorPanel,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatCard,
  SemanticStatusBanner,
  SemanticSurface,
  SemanticWorkbenchHeader,
} from './workbench'

describe('SemanticStatusBanner', () => {
  it('渲染阻塞项、提示和主操作', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <MemoryRouter>
        <SemanticStatusBanner
          summary={{
            status: 'blocked',
            title: '当前存在阻塞项',
            description: '需要先处理字段与发布风险。',
            blockers: ['Join 条件缺失'],
            hints: ['先进入 Inspector 处理关系。'],
            stats: [{ label: '阻塞数', value: 1 }],
          }}
          primaryAction={{ label: '立即处理', onClick }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('semantic-status-banner')).toBeInTheDocument()
    expect(screen.getByText('当前存在阻塞项')).toBeInTheDocument()
    expect(screen.getByText('Join 条件缺失')).toBeInTheDocument()
    expect(screen.getByText('先进入 Inspector 处理关系。')).toBeInTheDocument()

    await user.click(screen.getByTestId('semantic-primary-action'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('semantic workbench shells', () => {
  it('SemanticPageHeader 渲染返回入口、状态、元信息和操作区', () => {
    render(
      <MemoryRouter>
        <SemanticPageShell className="page-shell">
          <SemanticPageHeader
            backHref="/semantic/cubes"
            backLabel="返回 Cube 管理"
            title="Cube 详情"
            description="用于查看模型详情"
            status="ready"
            eyebrow="语义工作台"
            badges={<span>Beta</span>}
            meta={<span>元信息</span>}
            actions={<button type="button">立即发布</button>}
          />
        </SemanticPageShell>
      </MemoryRouter>,
    )

    expect(screen.getByText('语义工作台')).toBeInTheDocument()
    expect(screen.getByText('就绪')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回 Cube 管理' })).toHaveAttribute('href', '/semantic/cubes')
    expect(screen.getByRole('heading', { name: 'Cube 详情' })).toBeInTheDocument()
    expect(screen.getByText('用于查看模型详情')).toBeInTheDocument()
    expect(screen.getByText('元信息')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即发布' })).toBeInTheDocument()
  })

  it('SemanticWorkbenchHeader 渲染导航标签、次级操作和主操作', () => {
    render(
      <MemoryRouter>
        <SemanticWorkbenchHeader
          active="tools"
          actionHref="/semantic/workbench?tab=create"
          actionLabel="新建工具"
          actionTestId="create-semantic-tool"
          secondaryActions={<button type="button">查看文档</button>}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '语义层' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '领域建模' })).toHaveAttribute('href', '/semantic/modeling')
    expect(screen.getByRole('link', { name: '开发工具' })).toHaveAttribute('href', '/semantic/workbench')
    expect(screen.getByRole('link', { name: 'Cube 列表' })).toHaveAttribute('href', '/semantic/cubes')
    expect(screen.getByRole('button', { name: '查看文档' })).toBeInTheDocument()
    expect(screen.getByTestId('create-semantic-tool')).toHaveAttribute('href', '/semantic/workbench?tab=create')
    expect(screen.getByText('新建工具')).toBeInTheDocument()
  })

  it('SemanticSurface、SemanticStatCard、SemanticActionBar、SemanticInspectorPanel 和 SemanticEmptyState 渲染容器语义', async () => {
    const user = userEvent.setup()
    const onPrimaryAction = vi.fn()

    render(
      <MemoryRouter>
        <div>
          <SemanticSurface
            title="质量概览"
            description="展示当前语义模型质量状态"
            eyebrow="治理"
            actions={<button type="button">刷新</button>}
            className="surface-shell"
            bodyClassName="surface-body"
            testId="semantic-surface"
          >
            <SemanticStatCard
              label="模型数"
              value={12}
              description="当前已建模 Cube 数量"
              tone="positive"
              icon={<span>icon</span>}
            />
          </SemanticSurface>

          <SemanticActionBar
            title="下一步动作"
            description="优先处理阻塞问题"
            status="error"
            primaryAction={{ label: '去处理', href: '/semantic/issues', testId: 'semantic-next-action' }}
            secondaryActions={<button type="button">稍后处理</button>}
          />

          <SemanticInspectorPanel
            title="Inspector"
            description="查看当前节点上下文"
            actions={<button type="button">刷新 Inspector</button>}
            testId="semantic-inspector"
          >
            <div>Inspector 正文</div>
          </SemanticInspectorPanel>

          <SemanticEmptyState
            title="暂无模型"
            description="先创建一个 Cube 再继续。"
            action={<button type="button">新建 Cube</button>}
          />
        </div>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('semantic-surface')).toHaveClass('surface-shell')
    expect(screen.getByText('质量概览')).toBeInTheDocument()
    expect(screen.getByText('展示当前语义模型质量状态')).toBeInTheDocument()
    expect(screen.getByText('治理')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
    expect(screen.getByText('模型数')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('当前已建模 Cube 数量')).toBeInTheDocument()
    expect(screen.getByText('icon')).toBeInTheDocument()

    expect(screen.getByText('错误')).toBeInTheDocument()
    expect(screen.getByText('下一步动作')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '稍后处理' })).toBeInTheDocument()
    expect(screen.getByTestId('semantic-next-action')).toHaveAttribute('href', '/semantic/issues')

    expect(screen.getByTestId('semantic-inspector')).toBeInTheDocument()
    expect(screen.getByText('查看当前节点上下文')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新 Inspector' })).toBeInTheDocument()
    expect(screen.getByText('Inspector 正文')).toBeInTheDocument()

    expect(screen.getByText('暂无模型')).toBeInTheDocument()
    expect(screen.getByText('先创建一个 Cube 再继续。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建 Cube' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '稍后处理' }))
    expect(onPrimaryAction).toHaveBeenCalledTimes(0)
  })
})
