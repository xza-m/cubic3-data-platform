# Semantic Modeling Workbench Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单资产 Builder 与批量冷启动入口收敛为统一“语义建设工作台”，让候选资产上下文、字段候选审阅和发布校验入口共享同一套产品心智。

**Architecture:** 首期做前端可验证收敛：新增 `/semantic/modeling-workbench` 统一入口和 Build Project/Candidate 路由上下文，保留旧 `/semantic/modeling-copilot/*` 路由兼容跳转。中栏从聊天流转为字段候选主画布，右栏保留 AI 解释、证据和发布检查入口；真实 release-preview 契约由配套后端计划实现。

**Tech Stack:** React 18、React Router、TypeScript、Vitest、Testing Library、Playwright、现有 `@v2/components/ui` 和 `lucide-react`。

---

## Scope Check

本计划只覆盖前端产品形态收敛。发布校验后端契约、gateway SQL dry-run、compiled SQL 和 release diff 在 `docs/superpowers/plans/2026-06-04-semantic-release-validation-contract.md` 中独立实现。

## 产品方案收敛

- 产品主名：语义建设工作台。
- 首期统一路由：`/semantic/modeling-workbench`，避免覆盖当前已经存在的 `/semantic/workbench` 诊断工作台。
- 快速模式：`/semantic/modeling-workbench/quick`，自动创建轻量 Build Project，队列只有一个候选资产。
- 批量候选详情：`/semantic/modeling-workbench/:projectId/candidate/:candidateId`，从批量队列进入时必须携带 candidate context。
- 旧路由兼容：`/semantic/modeling-copilot/new` 跳到 `/semantic/modeling-workbench/quick`；`/semantic/modeling-copilot/batch` 跳到 `/semantic/modeling-workbench`。
- 页面三栏：左栏项目与队列，中栏字段候选主画布，右栏 AI 解释与发布检查。

## File Structure

- Create `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.ts`：统一 Build Project / Candidate 路由上下文、状态读写和默认项目 ID。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts`：上下文纯函数单测。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`：统一入口页面，编排批量项目视图、快速模式和候选详情视图。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`：统一入口页面级测试。
- Modify `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`：从弹窗跳 `/new` 改为跳统一 candidate 路由并携带 state。
- Modify `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx`：验证候选上下文没有丢失。
- Modify `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`：从右侧卡片列表升级为可编辑、可采纳的字段候选主表格。
- Modify `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`：覆盖采纳、忽略、改写、风险和空态。
- Modify `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`：把字段候选区移入中栏主画布，右栏保留 AI/证据/发布检查。
- Modify `frontend/src/v2/routes.tsx`：新增统一工作台路由，旧路由兼容跳转。
- Modify `frontend/src/v2/layout/navigation.ts`：语义构建分组只保留“语义建设”一个主入口。
- Modify `frontend/src/v2/layout/navigation.test.ts`：验证 layout fullBleed 和导航收敛。
- Modify `frontend/src/v2/i18n/zh.json`、`frontend/src/v2/i18n/en.json`：同步导航和页面文案。
- Modify `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`：新增统一入口 smoke，更新旧入口兼容断言。
- Modify `docs/prd/README.md`、`docs/prd/semantic_cold_start_builder_prd.md`：记录统一入口与过渡路由边界。

## Execution Notes

- 当前用户偏好是后续统一拆 commit。若在当前脏工作区执行，不运行任务内的 `git add` / `git commit` 步骤，只把它们当作专用 worktree checkpoint。
- 如果使用 subagent 模式，每个 task 应在独立 worktree 中执行并提交 checkpoint，主线程 review 后再合并。
- 不修改 `cache/`。
- 不回滚当前已有的 P1/P2 未提交改动。

---

### Task 1: Workbench Route Context Model

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BATCH_PROJECT_ID,
  createWorkbenchCandidateTarget,
  normalizeWorkbenchProjectId,
  readWorkbenchCandidateState,
} from './workbenchContext'

describe('workbenchContext', () => {
  it('normalizes project ids for stable URLs', () => {
    expect(normalizeWorkbenchProjectId(' 学情 分析 ')).toBe('xue-qing-fen-xi')
    expect(normalizeWorkbenchProjectId('')).toBe(DEFAULT_BATCH_PROJECT_ID)
    expect(normalizeWorkbenchProjectId('batch_2026')).toBe('batch-2026')
  })

  it('builds a candidate route target with full context in location state', () => {
    const target = createWorkbenchCandidateTarget(
      {
        id: 'fact-learning-activity',
        title: '学情分析事实主题候选',
        target: 'semantic_center',
        source: 'dwd_learning_activity_df',
        grain: '一条学习行为事件',
        confidence: 0.88,
        risk: 'low',
        status: 'ready_for_review',
        primaryAction: 'open_builder',
        evidence: ['表画像显示行为时间字段完整。'],
      },
      { projectId: '学情分析', mode: 'batch' },
    )

    expect(target.pathname).toBe('/semantic/modeling-workbench/xue-qing-fen-xi/candidate/fact-learning-activity')
    expect(target.state).toEqual({
      workbenchMode: 'batch',
      projectId: 'xue-qing-fen-xi',
      candidateId: 'fact-learning-activity',
      candidateTitle: '学情分析事实主题候选',
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      risk: 'low',
      evidence: ['表画像显示行为时间字段完整。'],
    })
  })

  it('reads only valid candidate state', () => {
    const state = readWorkbenchCandidateState({
      workbenchMode: 'batch',
      projectId: 'batch-project',
      candidateId: 'dim-school',
      candidateTitle: '学校维度候选',
      target: 'semantic_center',
      source: 'dim_school_df',
      grain: '一所学校',
      risk: 'low',
      evidence: ['主键稳定。'],
    })

    expect(state?.candidateId).toBe('dim-school')
    expect(readWorkbenchCandidateState({ candidateId: 'missing-project' })).toBeNull()
    expect(readWorkbenchCandidateState(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts
```

Expected: FAIL with module resolution error for `./workbenchContext`.

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.ts`:

```ts
import type { BatchModelingQueueItem, BatchModelingRiskLevel, BatchModelingTarget } from './batchModeling'

export const DEFAULT_BATCH_PROJECT_ID = 'batch-project'

export type WorkbenchMode = 'quick' | 'batch'

export interface WorkbenchCandidateState {
  workbenchMode: WorkbenchMode
  projectId: string
  candidateId: string
  candidateTitle: string
  target: BatchModelingTarget
  source: string
  grain: string
  risk: BatchModelingRiskLevel
  evidence: string[]
}

export interface WorkbenchRouteTarget {
  pathname: string
  state: WorkbenchCandidateState
}

export function normalizeWorkbenchProjectId(value: string | null | undefined): string {
  const source = (value || '').trim()
  if (!source) return DEFAULT_BATCH_PROJECT_ID
  return source
    .normalize('NFKD')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/[\u4e00-\u9fa5]/g, (char) => PINYIN_SLUGS[char] || char)
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || DEFAULT_BATCH_PROJECT_ID
}

export function createWorkbenchCandidateTarget(
  item: BatchModelingQueueItem,
  options: { projectId?: string | null; mode?: WorkbenchMode } = {},
): WorkbenchRouteTarget {
  const projectId = normalizeWorkbenchProjectId(options.projectId)
  return {
    pathname: `/semantic/modeling-workbench/${projectId}/candidate/${item.id}`,
    state: {
      workbenchMode: options.mode || 'batch',
      projectId,
      candidateId: item.id,
      candidateTitle: item.title,
      target: item.target,
      source: item.source,
      grain: item.grain,
      risk: item.risk,
      evidence: item.evidence,
    },
  }
}

export function readWorkbenchCandidateState(value: unknown): WorkbenchCandidateState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<WorkbenchCandidateState>
  if (
    !state.workbenchMode ||
    !state.projectId ||
    !state.candidateId ||
    !state.candidateTitle ||
    state.target !== 'semantic_center' ||
    !state.source ||
    !state.grain ||
    !state.risk ||
    !Array.isArray(state.evidence)
  ) {
    return null
  }
  return {
    workbenchMode: state.workbenchMode,
    projectId: state.projectId,
    candidateId: state.candidateId,
    candidateTitle: state.candidateTitle,
    target: state.target,
    source: state.source,
    grain: state.grain,
    risk: state.risk,
    evidence: state.evidence.map(String),
  }
}

const PINYIN_SLUGS: Record<string, string> = {
  学: 'xue',
  情: 'qing',
  分: 'fen',
  析: 'xi',
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.ts frontend/src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts
git commit -m "feat: add semantic modeling workbench context"
```

Expected: commit created with only the two files above.

---

### Task 2: Batch Candidate Opens Unified Workbench

**Files:**
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx`

- [ ] **Step 1: Write the failing test**

Update the first test in `BatchModelingAgent.test.tsx` so the link points to the unified workbench candidate route:

```ts
it('选择队列项后展示确认浮层并保留候选上下文', () => {
  render(
    <MemoryRouter>
      <BatchModelingAgent />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
  fireEvent.click(screen.getAllByRole('button', { name: '进入单资产 Builder' })[0])

  const confirmation = screen.getByRole('dialog', { name: '学情分析事实主题候选' })

  expect(within(confirmation).getByText('已选择批量候选资产')).toBeInTheDocument()
  expect(within(confirmation).getByText('学情分析事实主题候选')).toBeInTheDocument()
  expect(
    within(confirmation).getByText('进入语义建设工作台后继续完成字段候选、口径确认、沙盒校验和发布门禁。'),
  ).toBeInTheDocument()

  const link = within(confirmation).getByRole('link', { name: '打开语义建设工作台' })
  expect(link).toHaveAttribute(
    'href',
    '/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity',
  )
  expect(confirmation).toHaveFocus()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
```

Expected: FAIL because the current link still points to `/semantic/modeling-copilot/new`.

- [ ] **Step 3: Update BatchModelingAgent**

Modify `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'

import { Button } from '@v2/components/ui'

import { BatchModelingWorkbench } from './components/BatchModelingWorkbench'
import type { BatchModelingQueueItem } from './batchModeling'
import { createWorkbenchCandidateTarget } from './workbenchContext'

export default function BatchModelingAgent() {
  const [selectedItem, setSelectedItem] = useState<BatchModelingQueueItem | null>(null)
  const confirmationRef = useRef<HTMLElement | null>(null)
  const confirmationTitleId = 'batch-modeling-agent-confirmation-title'
  const workbenchTarget = useMemo(
    () => (selectedItem ? createWorkbenchCandidateTarget(selectedItem, { mode: 'batch' }) : null),
    [selectedItem],
  )

  useEffect(() => {
    if (!selectedItem) return
    confirmationRef.current?.focus()
  }, [selectedItem])

  return (
    <div className="relative min-h-full">
      <BatchModelingWorkbench onOpenBuilder={setSelectedItem} />

      {selectedItem && workbenchTarget ? (
        <aside
          ref={confirmationRef}
          className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-32px))] rounded-[8px] border bg-[var(--bg-surface)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
          style={{ borderColor: 'var(--border)' }}
          role="dialog"
          aria-modal="false"
          aria-labelledby={confirmationTitleId}
          tabIndex={-1}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-semibold text-3">已选择批量候选资产</p>
              <h2 id={confirmationTitleId} className="m-0 mt-1 break-words text-[15px] font-semibold text-1">
                {selectedItem.title}
              </h2>
            </div>
            <Button aria-label="取消" className="shrink-0" size="sm" variant="ghost" onClick={() => setSelectedItem(null)}>
              <X size={13} aria-hidden />
            </Button>
          </div>

          <p className="m-0 mt-3 text-[12px] leading-5 text-2">
            进入语义建设工作台后继续完成字段候选、口径确认、沙盒校验和发布门禁。
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="default" onClick={() => setSelectedItem(null)}>
              取消
            </Button>
            <Link className="btn btn-sm btn-primary" to={workbenchTarget}>
              打开语义建设工作台
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
git commit -m "feat: route batch candidates into semantic workbench"
```

Expected: commit created with only the two files above.

---

### Task 3: Unified Workbench Shell

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./ModelingAgent', () => ({
  default: () => <div>单资产 Builder 内容</div>,
}))

vi.mock('./BatchModelingAgent', () => ({
  default: () => <div>批量建设队列内容</div>,
}))

import SemanticModelingWorkbench from './SemanticModelingWorkbench'

function renderWorkbench(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/semantic/modeling-workbench" element={<SemanticModelingWorkbench />} />
        <Route path="/semantic/modeling-workbench/quick" element={<SemanticModelingWorkbench />} />
        <Route path="/semantic/modeling-workbench/:projectId/candidate/:candidateId" element={<SemanticModelingWorkbench />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SemanticModelingWorkbench', () => {
  it('renders batch project queue at the unified entry', () => {
    renderWorkbench('/semantic/modeling-workbench')

    expect(screen.getByRole('heading', { name: '语义建设工作台' })).toBeInTheDocument()
    expect(screen.getByText('批量建设队列内容')).toBeInTheDocument()
  })

  it('renders quick mode with single asset builder', () => {
    renderWorkbench('/semantic/modeling-workbench/quick')

    expect(screen.getByText('快速单资产模式')).toBeInTheDocument()
    expect(screen.getByText('单资产 Builder 内容')).toBeInTheDocument()
  })

  it('renders candidate context when opened from batch queue', () => {
    renderWorkbench('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', {
      workbenchMode: 'batch',
      projectId: 'batch-project',
      candidateId: 'fact-learning-activity',
      candidateTitle: '学情分析事实主题候选',
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      risk: 'low',
      evidence: ['表画像显示行为时间字段完整。'],
    })

    expect(screen.getByText('学情分析事实主题候选')).toBeInTheDocument()
    expect(screen.getByText('dwd_learning_activity_df')).toBeInTheDocument()
    expect(screen.getByText('表画像显示行为时间字段完整。')).toBeInTheDocument()
    expect(screen.getByText('单资产 Builder 内容')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
```

Expected: FAIL because the component file does not exist.

- [ ] **Step 3: Create the workbench shell**

Create `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`:

```tsx
import { useLocation, useParams } from 'react-router-dom'
import { Bot, Layers3, ListChecks, ShieldCheck } from 'lucide-react'

import { Chip } from '@v2/components/ui'

import BatchModelingAgent from './BatchModelingAgent'
import ModelingAgent from './ModelingAgent'
import { readWorkbenchCandidateState } from './workbenchContext'

export default function SemanticModelingWorkbench() {
  const location = useLocation()
  const params = useParams()
  const state = readWorkbenchCandidateState(location.state)
  const isQuickMode = location.pathname.endsWith('/quick')
  const hasCandidateRoute = Boolean(params.projectId && params.candidateId)

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg-app)] text-1">
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[12px] font-semibold uppercase text-3">Semantic Modeling Workbench</p>
            <h1 className="m-0 mt-1 text-[22px] font-semibold leading-tight">语义建设工作台</h1>
          </div>
          <Chip tone="accent">发布目标：语义中心</Chip>
        </div>
      </header>

      {hasCandidateRoute || isQuickMode ? (
        <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px] overflow-hidden">
          <aside className="min-h-0 overflow-auto border-r p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-3" aria-hidden />
              <h2 className="m-0 text-[14px] font-semibold">建设上下文</h2>
            </div>
            <div className="mt-4 space-y-3 text-[12px] text-2">
              <ContextLine label="模式" value={isQuickMode ? '快速单资产模式' : '批量候选审阅'} />
              <ContextLine label="项目" value={state?.projectId || params.projectId || 'quick-project'} />
              <ContextLine label="候选" value={state?.candidateTitle || params.candidateId || '快速单资产模式'} />
              <ContextLine label="来源" value={state?.source || '由 Builder 选择来源'} />
              <ContextLine label="粒度" value={state?.grain || '等待确认'} />
            </div>
          </aside>

          <section className="min-h-0 overflow-auto">
            <ModelingAgent />
          </section>

          <aside className="min-h-0 overflow-auto border-l p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-3" aria-hidden />
              <h2 className="m-0 text-[14px] font-semibold">AI 证据与发布检查</h2>
            </div>
            <div className="mt-4 space-y-3 text-[12px] text-2">
              <div className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 font-semibold text-1">
                  <ListChecks className="h-4 w-4 text-3" aria-hidden />
                  候选证据
                </div>
                <ul className="m-0 mt-2 space-y-1 pl-4 leading-5">
                  {(state?.evidence?.length ? state.evidence : ['等待字段候选和来源证据。']).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 font-semibold text-1">
                  <ShieldCheck className="h-4 w-4 text-3" aria-hidden />
                  发布门禁
                </div>
                <p className="m-0 mt-2 leading-5">发布前必须完成 Spec、compiled SQL、release diff 和 gateway SQL dry-run 检查。</p>
              </div>
            </div>
          </aside>
        </main>
      ) : (
        <BatchModelingAgent />
      )}
    </div>
  )
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-3">{label}</div>
      <div className="mt-1 break-words text-[13px] text-1">{value}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
git commit -m "feat: add unified semantic modeling workbench shell"
```

Expected: commit created with only the two files above.

---

### Task 4: Routes, Navigation, and I18n Convergence

**Files:**
- Modify: `frontend/src/v2/routes.tsx`
- Modify: `frontend/src/v2/layout/navigation.ts`
- Modify: `frontend/src/v2/layout/navigation.test.ts`
- Modify: `frontend/src/v2/i18n/zh.json`
- Modify: `frontend/src/v2/i18n/en.json`

- [ ] **Step 1: Write the failing navigation test**

Update the semantic layout tests in `frontend/src/v2/layout/navigation.test.ts`:

```ts
it('语义中心 modeling-workbench 子路由切到 fullBleed', () => {
  const semantic = NAV_MODULES.find((m) => m.id === 'semantic')!

  expect(findLayout('/semantic/modeling-workbench', semantic)).toEqual({
    secondarySidebar: false,
    inspector: false,
    hideBreadcrumbs: true,
  })
  expect(findLayout('/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity', semantic)).toEqual({
    secondarySidebar: false,
    inspector: false,
    hideBreadcrumbs: true,
  })
})

it('语义构建导航收敛为一个语义建设入口', () => {
  const semantic = NAV_MODULES.find((module) => module.id === 'semantic')
  const buildItems = semantic?.subnav?.filter((item) => item.section === '语义构建') ?? []

  expect(buildItems.map((item) => item.label)).toEqual(['语义建设'])
  expect(buildItems.map((item) => item.path)).toEqual(['/semantic/modeling-workbench'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/layout/navigation.test.ts
```

Expected: FAIL because navigation still has `语义冷启动` and `批量冷启动`.

- [ ] **Step 3: Update routes**

Modify the semantic imports in `frontend/src/v2/routes.tsx`:

```tsx
const SemanticModelingWorkbench = lazy(() => import('@v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench'))
```

Modify the semantic route block:

```tsx
{/* 顶层语义建设工作台：统一承载快速单资产与批量冷启动 */}
<Route path="modeling-workbench" element={wrap(<SemanticModelingWorkbench />)} />
<Route path="modeling-workbench/quick" element={wrap(<SemanticModelingWorkbench />)} />
<Route path="modeling-workbench/:projectId/candidate/:candidateId" element={wrap(<SemanticModelingWorkbench />)} />

{/* 旧建模助手路径兼容：保留深链，但产品入口收敛到语义建设工作台 */}
<Route path="modeling-copilot/new" element={<Navigate to="/semantic/modeling-workbench/quick" replace />} />
<Route path="modeling-copilot/batch" element={<Navigate to="/semantic/modeling-workbench" replace />} />
<Route path="modeling-copilot/:sessionId" element={wrap(<SemanticModelingCopilot />)} />
```

- [ ] **Step 4: Update navigation**

Modify the semantic module in `frontend/src/v2/layout/navigation.ts`:

```ts
layout: {
  byPathPrefix: [
    {
      prefix: '/semantic/modeling-workbench',
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    },
    {
      prefix: '/semantic/modeling-copilot',
      secondarySidebar: false,
      inspector: false,
      hideBreadcrumbs: true,
    },
  ],
},
subnav: [
  {
    section: t('nav.semantic.section.build', '语义构建'),
    label: t('nav.semantic.sub.modelingWorkbench', '语义建设'),
    path: '/semantic/modeling-workbench',
    implemented: true,
  },
  ...
]
```

Remove the old `modelingBuilder` and `batchColdStart` subnav entries from the semantic module.

- [ ] **Step 5: Update i18n**

Modify `frontend/src/v2/i18n/zh.json`:

```json
{
  "nav.semantic.sub.modelingWorkbench": "语义建设"
}
```

Modify `frontend/src/v2/i18n/en.json`:

```json
{
  "nav.semantic.sub.modelingWorkbench": "Semantic modeling"
}
```

Keep existing `nav.semantic.sub.modelingBuilder` and `nav.semantic.sub.batchColdStart` keys if other code still references them; do not delete keys in this task.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/layout/navigation.test.ts src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/routes.tsx frontend/src/v2/layout/navigation.ts frontend/src/v2/layout/navigation.test.ts frontend/src/v2/i18n/zh.json frontend/src/v2/i18n/en.json
git commit -m "feat: converge semantic modeling navigation"
```

Expected: commit created with only route, navigation and i18n changes.

---

### Task 5: Field Candidate Review as Main Table

**Files:**
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the existing tests in `FieldCandidateReview.test.tsx` with:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FieldCandidateReview, type FieldCandidateReviewAction } from './FieldCandidateReview'

describe('FieldCandidateReview', () => {
  it('以主表格展示字段候选并支持采纳', () => {
    const onAction = vi.fn()
    render(
      <FieldCandidateReview
        candidates={[
          {
            id: 'candidate_1',
            field: 'comment_id',
            label: '评论数',
            role: 'measure',
            aggregation: 'count',
            confidence: 0.92,
            evidence: '证据文本',
            risk: 'medium',
            action: 'pending',
          },
        ]}
        onAction={onAction}
      />,
    )

    const table = screen.getByRole('table', { name: '字段候选审阅' })
    expect(within(table).getByText('评论数')).toBeInTheDocument()
    expect(within(table).getByText('comment_id')).toBeInTheDocument()
    expect(within(table).getByText('measure')).toBeInTheDocument()
    expect(within(table).getByText('count')).toBeInTheDocument()
    expect(within(table).getByText('92%')).toBeInTheDocument()
    expect(within(table).getByText('中风险')).toBeInTheDocument()

    fireEvent.click(within(table).getByRole('button', { name: '采纳 评论数' }))

    expect(onAction).toHaveBeenCalledWith({
      candidateId: 'candidate_1',
      action: 'accept',
    } satisfies FieldCandidateReviewAction)
  })

  it('支持改写语义名并忽略候选', () => {
    const onAction = vi.fn()
    render(
      <FieldCandidateReview
        candidates={[
          {
            id: 'candidate_2',
            field: 'school_name',
            label: '学校',
            role: 'dimension',
            confidenceLabel: 'high',
            evidence: '维表主键稳定。',
            risk: 'low',
            action: 'pending',
          },
        ]}
        onAction={onAction}
      />,
    )

    fireEvent.change(screen.getByLabelText('改写 学校'), { target: { value: '学校名称' } })
    fireEvent.click(screen.getByRole('button', { name: '改写 学校' }))
    fireEvent.click(screen.getByRole('button', { name: '忽略 学校' }))

    expect(onAction).toHaveBeenNthCalledWith(1, {
      candidateId: 'candidate_2',
      action: 'rename',
      value: '学校名称',
    })
    expect(onAction).toHaveBeenNthCalledWith(2, {
      candidateId: 'candidate_2',
      action: 'ignore',
    })
  })

  it('展示空态', () => {
    render(<FieldCandidateReview candidates={[]} />)

    expect(screen.getByText('等待字段候选')).toBeInTheDocument()
    expect(screen.getByText('先确认来源证据，再生成字段候选表。')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
```

Expected: FAIL because the component renders a card list and does not expose table actions.

- [ ] **Step 3: Implement the table component**

Replace `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx` with:

```tsx
import { useState } from 'react'

import { Button, Chip, Input, type ChipTone } from '@v2/components/ui'

export type FieldCandidateActionType = 'accept' | 'ignore' | 'rename'

export interface FieldCandidateReviewAction {
  candidateId: string
  action: FieldCandidateActionType
  value?: string
}

export interface FieldCandidateReviewItem {
  id: string
  field: string
  label?: string
  role?: string
  aggregation?: string
  semanticType?: string
  confidence?: number
  confidenceLabel?: string
  evidence?: string
  risk?: string
  action?: 'pending' | 'accepted' | 'ignored' | 'renamed'
}

interface FieldCandidateReviewProps {
  candidates: FieldCandidateReviewItem[]
  onAction?: (action: FieldCandidateReviewAction) => void
}

export function FieldCandidateReview({ candidates, onAction }: FieldCandidateReviewProps) {
  return (
    <section data-testid="field-candidate-review" className="flex min-h-0 flex-col text-[12px]" aria-label="字段候选审阅">
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">Field Candidates</div>
        <h2 className="m-0 mt-1 text-[16px] font-semibold leading-tight text-1">字段候选审阅</h2>
      </div>

      {candidates.length === 0 ? (
        <div className="m-4 rounded-[8px] border px-3 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
          <div className="font-semibold text-1">等待字段候选</div>
          <p className="mt-1 leading-5 text-3">先确认来源证据，再生成字段候选表。</p>
        </div>
      ) : (
        <div className="min-h-0 overflow-auto">
          <table className="w-full min-w-[920px] border-collapse" aria-label="字段候选审阅">
            <thead className="sticky top-0 bg-[var(--bg-surface)] text-left text-[11px] uppercase text-3">
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-3 py-2 font-semibold">语义名</th>
                <th className="px-3 py-2 font-semibold">物理字段</th>
                <th className="px-3 py-2 font-semibold">角色</th>
                <th className="px-3 py-2 font-semibold">聚合/类型</th>
                <th className="px-3 py-2 font-semibold">置信度</th>
                <th className="px-3 py-2 font-semibold">风险</th>
                <th className="px-3 py-2 font-semibold">证据</th>
                <th className="px-3 py-2 text-right font-semibold">动作</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <FieldCandidateReviewRow key={candidate.id} candidate={candidate} onAction={onAction} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FieldCandidateReviewRow({
  candidate,
  onAction,
}: {
  candidate: FieldCandidateReviewItem
  onAction?: (action: FieldCandidateReviewAction) => void
}) {
  const label = candidate.label || candidate.field
  const [renameValue, setRenameValue] = useState(label)
  const confidence = formatConfidence(candidate.confidence, candidate.confidenceLabel)
  const semanticLabel = candidate.aggregation || candidate.semanticType || '待确认'
  const risk = candidate.risk?.trim() || 'unknown'

  return (
    <tr className="border-b align-top" style={{ borderColor: 'var(--border)' }}>
      <td className="px-3 py-3">
        <Input aria-label={`改写 ${label}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
      </td>
      <td className="break-all px-3 py-3 font-mono text-[11.5px] text-2">{candidate.field}</td>
      <td className="px-3 py-3">
        <Chip tone="accent">{candidate.role || 'unknown'}</Chip>
      </td>
      <td className="px-3 py-3">
        <Chip>{semanticLabel}</Chip>
      </td>
      <td className="px-3 py-3">{confidence ? <Chip tone="success">{confidence}</Chip> : <span className="text-3">待评估</span>}</td>
      <td className="px-3 py-3">
        <Chip tone={riskTone(risk)}>{riskLabel(risk)}</Chip>
      </td>
      <td className="max-w-[280px] px-3 py-3 leading-5 text-2">{candidate.evidence || '等待证据'}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="default" onClick={() => onAction?.({ candidateId: candidate.id, action: 'accept' })}>
            采纳 {label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction?.({ candidateId: candidate.id, action: 'rename', value: renameValue.trim() || label })}>
            改写 {label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction?.({ candidateId: candidate.id, action: 'ignore' })}>
            忽略 {label}
          </Button>
        </div>
      </td>
    </tr>
  )
}

function formatConfidence(value: number | undefined, label: string | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return label?.trim() || null
  const normalized = value > 1 ? value : value * 100
  return `${Math.round(normalized)}%`
}

function riskLabel(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('high')) return '高风险'
  if (normalized.includes('medium')) return '中风险'
  if (normalized.includes('low')) return '低风险'
  return '待评估'
}

function riskTone(value: string): ChipTone {
  const normalized = value.toLowerCase()
  if (normalized.includes('high')) return 'danger'
  if (normalized.includes('medium')) return 'warning'
  if (normalized.includes('low')) return 'success'
  return 'neutral'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
git commit -m "feat: promote field candidates to review table"
```

Expected: commit created with only field candidate component changes.

---

### Task 6: Modeling Agent Layout Uses Field Candidate Main Canvas

**Files:**
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `ModelingAgent.test.tsx` near existing field candidate assertions:

```tsx
it('把字段候选审阅作为主工作区而不是右侧附属列表', async () => {
  render(<ModelingAgent />)

  expect(await screen.findByTestId('field-candidate-main-canvas')).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '字段候选审阅' })).toBeInTheDocument()
  expect(screen.getByText('AI 证据与发布检查')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: FAIL because the component does not expose `field-candidate-main-canvas`.

- [ ] **Step 3: Wire the main canvas**

In `ModelingAgent.tsx`, compute field candidates once in the main component render body:

```tsx
const fieldCandidates = fieldCandidateItemsForSession(session)
```

Replace the central chat-only work area with this structure while keeping existing message composer below it:

```tsx
<section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
  <div data-testid="field-candidate-main-canvas" className="min-h-0 overflow-auto border-r" style={{ borderColor: 'var(--border)' }}>
    <FieldCandidateReview candidates={fieldCandidates} />
  </div>
  <aside className="min-h-0 overflow-auto p-4">
    <h2 className="m-0 text-[14px] font-semibold">AI 证据与发布检查</h2>
    <ArtifactPanel session={session} compact />
  </aside>
</section>
```

Keep the existing `ArtifactPanel` implementation for source evidence, spec, preview, publish gate and post-publish validation. Remove the duplicate `FieldCandidateReview` tab from `ArtifactPanel` so the same candidates are not rendered twice.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: make field candidates the modeling main canvas"
```

Expected: commit created with only ModelingAgent changes.

---

### Task 7: E2E Smoke and Docs Alignment

**Files:**
- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
- Modify: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/prd/README.md`

- [ ] **Step 1: Update the e2e smoke**

In `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`, update the batch smoke route:

```ts
await gotoV2(page, '/semantic/modeling-workbench')
await expect(page.getByRole('heading', { name: '语义建设工作台' })).toBeVisible()
await expect(page.getByRole('heading', { name: '批量语义冷启动' })).toBeVisible()
await page.getByRole('button', { name: '生成批量建设队列' }).click()
await page.getByRole('button', { name: '进入单资产 Builder' }).first().click()
await expect(page.getByRole('dialog', { name: '学情分析事实主题候选' })).toBeVisible()
await expect(page.getByRole('link', { name: '打开语义建设工作台' })).toHaveAttribute(
  'href',
  '/semantic/modeling-workbench/batch-project/candidate/fact-learning-activity',
)
```

Add a legacy route smoke:

```ts
await gotoV2(page, '/semantic/modeling-copilot/batch')
await expect(page).toHaveURL(/\/semantic\/modeling-workbench$/)
```

- [ ] **Step 2: Run e2e smoke**

Run:

```bash
cd frontend && npm run e2e:modeling-agent-smoke
```

Expected: PASS.

- [ ] **Step 3: Run repository validation routing**

Run:

```bash
make verify-detect
```

Expected: PASS and recommends semantic/frontend/doc verification targets.

- [ ] **Step 4: Run semantic and docs verification**

Run:

```bash
make verify-semantic
make verify-docs
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts docs/prd/semantic_cold_start_builder_prd.md docs/prd/README.md
git commit -m "docs: align semantic modeling workbench rollout"
```

Expected: commit created with only e2e and PRD alignment changes.

---

## Self-Review

- Spec coverage: unified entry, old route compatibility, candidate context, field candidate main canvas, AI side panel, navigation, i18n, smoke and docs are each covered by Tasks 1-7.
- Placeholder scan: no red-flag placeholder wording or unspecified implementation step remains.
- Type consistency: `WorkbenchCandidateState`, `WorkbenchMode`, `WorkbenchRouteTarget`, `FieldCandidateReviewAction`, and route paths are defined before later tasks reference them.

## Verification Matrix

- Focused unit: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/workbenchContext.test.ts src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx src/v2/layout/navigation.test.ts`
- Page unit: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
- E2E: `cd frontend && npm run e2e:modeling-agent-smoke`
- Repository: `make verify-detect && make verify-semantic && make verify-docs && git diff --check`
