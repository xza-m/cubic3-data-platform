# Batch AI Modeling Agent P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为语义冷启动 Builder 增加 P2 批量模式，使建模工程师可以按业务域生成一组待审阅的语义资产候选队列，并从队列进入单资产 Builder 继续收敛。

**Architecture:** P2 先做前端可验证闭环：用纯函数生成批量建设队列，用独立工作台承载 scope intake、扫描计划、Proposal Queue 和风险边界，再通过新路由 `/semantic/modeling-copilot/batch` 接入现有 fullBleed 语义构建模块。真实后台批量 Agent、批量发布和语义中心持久化暂不实现，避免把“冷启动辅助”误做成自动发布系统。

**Tech Stack:** React 18、React Router、Vitest、Testing Library、Playwright、现有 `@v2/components/ui` 组件与 `lucide-react` 图标。

---

## 边界与原则

- **产品边界**：发布目标是语义中心；Data Agent、BI、数据分析都是语义中心消费者。P2 批量模式只生成待审阅建设队列，不直接发布。
- **KISS**：先用确定性前端模型表达产品心智和队列状态，不引入后台异步任务。
- **YAGNI**：不做真实 AI 调用、不做批量发布、不做异步任务表和后台状态机。
- **SOLID**：批量队列推导放在 `batchModeling.ts`，页面只负责交互编排，组件只负责呈现。
- **DRY**：沿用 `modeling-copilot` 目录、现有 `Button/Chip` 与路由 fullBleed 规则，不复制 AppShell 布局。

## 文件结构

- Create `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`：批量模式类型、默认 scope、队列推导函数和状态文案。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`：领域模型单测。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`：批量工作台 UI。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`：工作台交互单测。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`：页面入口与跳转编排。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx`：页面级测试。
- Modify `frontend/src/v2/routes.tsx`：新增 `/semantic/modeling-copilot/batch` 静态路由，放在 `:sessionId` 之前。
- Modify `frontend/src/v2/layout/navigation.ts`：在 `语义构建` 增加 `批量冷启动` 子导航。
- Modify `frontend/src/v2/layout/navigation.test.ts`：覆盖批量路由 fullBleed 与导航项。
- Modify `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`：增加批量模式 smoke，验证生成队列且没有直接发布按钮。
- Modify `docs/prd/semantic_cold_start_builder_prd.md`：补 P2 MVP 实现边界。
- Modify `docs/prd/README.md`：同步 PRD 索引说明。

## 执行约定

- 本轮按用户要求保留未提交 diff，不执行 `git add` / `git commit`。
- 每个实现任务完成后先跑该任务聚焦单测；全部完成后跑 `make verify-detect`、`make verify-semantic`、`make verify-docs`、`git diff --check` 和 `cd frontend && npm run e2e:modeling-agent-smoke`。
- 子任务不能改动 `cache/`，不能回滚既有 P1 未提交改动。

---

### Task 1: 批量建模领域模型

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`

- [ ] **Step 1: 写失败单测**

在 `batchModeling.test.ts` 中覆盖默认 scope、队列生成、风险状态和“无直接发布动作”。

```ts
import { describe, expect, it } from 'vitest'
import {
  BATCH_MODELING_DEFAULT_SCOPE,
  buildBatchModelingPlan,
  batchQueueStatusLabel,
  getBatchQueuePrimaryAction,
} from './batchModeling'

describe('batch modeling plan', () => {
  it('uses semantic center as the target and keeps publish out of batch mode', () => {
    const plan = buildBatchModelingPlan(BATCH_MODELING_DEFAULT_SCOPE)

    expect(plan.target).toBe('semantic_center')
    expect(plan.guardrails).toContain('批量模式只生成待审阅候选队列，不直接发布语义中心。')
    expect(plan.queueItems.some((item) => item.primaryAction === 'publish')).toBe(false)
  })

  it('generates reviewable queue items from business domain scope', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '学情分析',
      sourceCount: 24,
      strategy: 'balanced',
      includeExistingSemantics: true,
    })

    expect(plan.title).toBe('学情分析批量语义冷启动')
    expect(plan.queueItems.length).toBeGreaterThanOrEqual(3)
    expect(plan.queueItems[0]).toMatchObject({
      status: 'ready_for_review',
      primaryAction: 'open_builder',
    })
  })

  it('marks high volume exploratory scope as higher risk', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '跨域经营',
      sourceCount: 96,
      strategy: 'exploratory',
      includeExistingSemantics: false,
    })

    expect(plan.riskLevel).toBe('high')
    expect(plan.queueItems.some((item) => item.status === 'needs_scope')).toBe(true)
    expect(batchQueueStatusLabel('high_risk')).toBe('高风险待拆分')
    expect(getBatchQueuePrimaryAction(plan.queueItems[0])).toBe('进入单资产 Builder')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`

Expected: FAIL，提示 `batchModeling` 模块不存在。

- [ ] **Step 3: 写最小实现**

在 `batchModeling.ts` 中实现纯函数与文案映射。

```ts
export type BatchModelingStrategy = 'conservative' | 'balanced' | 'exploratory'
export type BatchModelingTarget = 'semantic_center'
export type BatchModelingRiskLevel = 'low' | 'medium' | 'high'
export type BatchQueueStatus = 'ready_for_review' | 'needs_scope' | 'high_risk' | 'deferred'
export type BatchQueuePrimaryAction = 'open_builder' | 'regenerate' | 'defer' | 'merge'

export interface BatchModelingScope {
  businessDomain: string
  sourceCount: number
  strategy: BatchModelingStrategy
  includeExistingSemantics: boolean
}

export interface BatchModelingQueueItem {
  id: string
  title: string
  source: string
  grain: string
  confidence: number
  risk: BatchModelingRiskLevel
  status: BatchQueueStatus
  primaryAction: BatchQueuePrimaryAction
  evidence: string[]
}

export interface BatchModelingPlan {
  title: string
  target: BatchModelingTarget
  riskLevel: BatchModelingRiskLevel
  scope: BatchModelingScope
  scanPlan: string[]
  guardrails: string[]
  queueItems: BatchModelingQueueItem[]
}

export const BATCH_MODELING_DEFAULT_SCOPE: BatchModelingScope = {
  businessDomain: '学情分析',
  sourceCount: 18,
  strategy: 'balanced',
  includeExistingSemantics: true,
}

export function buildBatchModelingPlan(scope: BatchModelingScope): BatchModelingPlan {
  const riskLevel = resolveRiskLevel(scope)
  const needsScope = scope.sourceCount > 60 || scope.strategy === 'exploratory'
  const domain = scope.businessDomain.trim() || BATCH_MODELING_DEFAULT_SCOPE.businessDomain

  return {
    title: `${domain}批量语义冷启动`,
    target: 'semantic_center',
    riskLevel,
    scope: { ...scope, businessDomain: domain },
    scanPlan: buildScanPlan(scope),
    guardrails: [
      '批量模式只生成待审阅候选队列，不直接发布语义中心。',
      '每个候选资产进入单资产 Builder 后，仍需完成字段证据、口径确认、沙盒校验和发布门禁。',
      'Data Agent、BI、数据分析只消费语义中心已发布资产，不作为本模式发布目标。',
    ],
    queueItems: buildQueueItems(domain, needsScope, riskLevel),
  }
}

export function batchQueueStatusLabel(status: BatchQueueStatus): string {
  const labels: Record<BatchQueueStatus, string> = {
    ready_for_review: '可审阅',
    needs_scope: '需补范围',
    high_risk: '高风险待拆分',
    deferred: '已暂缓',
  }
  return labels[status]
}

export function getBatchQueuePrimaryAction(item: BatchModelingQueueItem): string {
  const labels: Record<BatchQueuePrimaryAction, string> = {
    open_builder: '进入单资产 Builder',
    regenerate: '退回重生成',
    defer: '暂缓',
    merge: '合并建议',
  }
  return labels[item.primaryAction]
}

function resolveRiskLevel(scope: BatchModelingScope): BatchModelingRiskLevel {
  if (scope.sourceCount > 60 || scope.strategy === 'exploratory') return 'high'
  if (scope.sourceCount > 24 || !scope.includeExistingSemantics) return 'medium'
  return 'low'
}

function buildScanPlan(scope: BatchModelingScope): string[] {
  return [
    `扫描 ${scope.sourceCount} 张候选物理表画像、字段画像与血缘使用。`,
    scope.includeExistingSemantics ? '对齐已有语义对象、指标和 Cube，避免重复建设。' : '不复用已有语义资产，仅生成待审阅候选建议。',
    '按业务域聚类出事实主题、维度主题、指标候选与高风险缺口。',
  ]
}

function buildQueueItems(
  domain: string,
  needsScope: boolean,
  riskLevel: BatchModelingRiskLevel,
): BatchModelingQueueItem[] {
  return [
    {
      id: 'fact-learning-activity',
      title: `${domain}事实主题候选`,
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      confidence: riskLevel === 'high' ? 0.72 : 0.88,
      risk: riskLevel,
      status: needsScope ? 'needs_scope' : 'ready_for_review',
      primaryAction: 'open_builder',
      evidence: ['表画像显示行为时间、学生、课程和学校字段完整。', '血缘使用中已被学情报表消费。'],
    },
    {
      id: 'dim-school',
      title: `${domain}学校维度候选`,
      source: 'dim_school_df',
      grain: '一所学校',
      confidence: 0.91,
      risk: 'low',
      status: 'ready_for_review',
      primaryAction: 'open_builder',
      evidence: ['维表主键稳定，字段中文名与业务术语一致。', '已有语义中心对象可作为复用参考。'],
    },
    {
      id: 'metric-active-student',
      title: `${domain}活跃学生指标候选`,
      source: 'dws_learning_student_activity_di',
      grain: '按天、学生聚合',
      confidence: 0.79,
      risk: riskLevel === 'low' ? 'medium' : riskLevel,
      status: riskLevel === 'high' ? 'high_risk' : 'ready_for_review',
      primaryAction: riskLevel === 'high' ? 'regenerate' : 'open_builder',
      evidence: ['存在多种活跃口径，需要业务 owner 确认。', '可从最近 7 天查询需求回推时间过滤口径。'],
    },
  ]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`

Expected: PASS。

---

### Task 2: 批量建模工作台组件

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`

- [ ] **Step 1: 写失败单测**

测试 scope 表单、生成队列、边界文案和进入 Builder 操作。

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BatchModelingWorkbench } from './BatchModelingWorkbench'

describe('BatchModelingWorkbench', () => {
  it('generates proposal queue without direct publish action', () => {
    render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('业务域'), { target: { value: '学情分析' } })
    fireEvent.change(screen.getByLabelText('候选表数量'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

    expect(screen.getByText('学情分析批量语义冷启动')).toBeInTheDocument()
    expect(screen.getByText('Proposal Queue')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /发布/ })).not.toBeInTheDocument()
  })

  it('opens selected queue item in single asset builder', () => {
    const onOpenBuilder = vi.fn()
    render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    fireEvent.click(screen.getAllByRole('button', { name: '进入单资产 Builder' })[0])

    expect(onOpenBuilder).toHaveBeenCalledWith(expect.objectContaining({ id: 'fact-learning-activity' }))
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`

Expected: FAIL，提示组件不存在。

- [ ] **Step 3: 写最小实现**

实现一个独立组件，使用现有 `Button`、`Chip`，保持 compact operation UI。

```tsx
import { useMemo, useState } from 'react'
import { ArrowRight, Layers3, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, Chip } from '@v2/components/ui'
import {
  BATCH_MODELING_DEFAULT_SCOPE,
  batchQueueStatusLabel,
  buildBatchModelingPlan,
  getBatchQueuePrimaryAction,
  type BatchModelingQueueItem,
  type BatchModelingScope,
  type BatchModelingStrategy,
} from '../batchModeling'

interface BatchModelingWorkbenchProps {
  onOpenBuilder: (item: BatchModelingQueueItem) => void
}

export function BatchModelingWorkbench({ onOpenBuilder }: BatchModelingWorkbenchProps) {
  const [scope, setScope] = useState<BatchModelingScope>(BATCH_MODELING_DEFAULT_SCOPE)
  const [submittedScope, setSubmittedScope] = useState<BatchModelingScope>(BATCH_MODELING_DEFAULT_SCOPE)
  const [hasGenerated, setHasGenerated] = useState(false)
  const plan = useMemo(() => buildBatchModelingPlan(submittedScope), [submittedScope])

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border-subtle)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium text-3">P2 · 批量 AI 建模助手</p>
            <h1 className="mt-1 text-[20px] font-semibold">批量语义冷启动</h1>
            <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-2">
              面向建模工程师的冷启动批量模式：先生成待审阅 Proposal Queue，再逐个进入单资产 Builder 收敛证据、口径和发布门禁。
            </p>
          </div>
          <Chip tone="info">目标：语义中心</Chip>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-2" />
            <h2 className="text-[14px] font-semibold">建设范围</h2>
          </div>

          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-domain">
            业务域
          </label>
          <input
            id="batch-domain"
            className="mt-2 h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-[13px]"
            value={scope.businessDomain}
            onChange={(event) => setScope((current) => ({ ...current, businessDomain: event.target.value }))}
          />

          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-source-count">
            候选表数量
          </label>
          <input
            id="batch-source-count"
            className="mt-2 h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-[13px]"
            min={1}
            max={120}
            type="number"
            value={scope.sourceCount}
            onChange={(event) =>
              setScope((current) => ({ ...current, sourceCount: Number(event.target.value || 1) }))
            }
          />

          <div className="mt-4">
            <p className="text-[12px] font-medium text-2">生成策略</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['conservative', 'balanced', 'exploratory'] as BatchModelingStrategy[]).map((strategy) => (
                <button
                  key={strategy}
                  className={`h-8 rounded-md border text-[12px] ${
                    scope.strategy === strategy
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-2'
                  }`}
                  type="button"
                  onClick={() => setScope((current) => ({ ...current, strategy }))}
                >
                  {strategyLabel(strategy)}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-[12px] text-2">
            <input
              checked={scope.includeExistingSemantics}
              type="checkbox"
              onChange={(event) =>
                setScope((current) => ({ ...current, includeExistingSemantics: event.target.checked }))
              }
            />
            对齐已有语义资产
          </label>

          <Button
            className="mt-5 w-full"
            onClick={() => {
              setSubmittedScope(scope)
              setHasGenerated(true)
            }}
          >
            <RefreshCw className="h-4 w-4" />
            生成批量建设队列
          </Button>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold">{plan.title}</h2>
                <p className="mt-1 text-[12px] text-2">AI 先扫描、聚类和排风险，人再逐个确认资产语义。</p>
              </div>
              <Chip tone={plan.riskLevel === 'high' ? 'danger' : plan.riskLevel === 'medium' ? 'warning' : 'success'}>
                {riskLabel(plan.riskLevel)}
              </Chip>
            </div>
            <ul className="mt-4 space-y-2 text-[13px] text-2">
              {plan.scanPlan.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">Proposal Queue</h2>
              <span className="text-[12px] text-3">{hasGenerated ? `${plan.queueItems.length} 个候选资产包` : '等待生成'}</span>
            </div>

            <div className="mt-4 grid gap-3">
              {plan.queueItems.map((item) => (
                <article key={item.id} className="rounded-md border border-[var(--color-border-subtle)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{item.title}</h3>
                      <p className="mt-1 text-[12px] text-3">{item.source} · {item.grain}</p>
                    </div>
                    <Chip tone={item.status === 'ready_for_review' ? 'success' : item.status === 'needs_scope' ? 'warning' : 'danger'}>
                      {batchQueueStatusLabel(item.status)}
                    </Chip>
                  </div>
                  <p className="mt-3 text-[12px] text-2">置信度 {(item.confidence * 100).toFixed(0)}%</p>
                  <ul className="mt-2 space-y-1 text-[12px] text-2">
                    {item.evidence.map((evidence) => (
                      <li key={evidence}>- {evidence}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="secondary" onClick={() => onOpenBuilder(item)}>
                      {getBatchQueuePrimaryAction(item)}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-2" />
              <h2 className="text-[14px] font-semibold">批量模式边界</h2>
            </div>
            <ul className="mt-3 space-y-2 text-[12px] leading-5 text-2">
              {plan.guardrails.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}

function strategyLabel(strategy: BatchModelingStrategy): string {
  return {
    conservative: '保守',
    balanced: '平衡',
    exploratory: '探索',
  }[strategy]
}

function riskLabel(risk: 'low' | 'medium' | 'high'): string {
  return {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  }[risk]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`

Expected: PASS。

---

### Task 3: 页面入口、路由与导航

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx`
- Modify: `frontend/src/v2/routes.tsx`
- Modify: `frontend/src/v2/layout/navigation.ts`
- Modify: `frontend/src/v2/layout/navigation.test.ts`

- [ ] **Step 1: 写页面测试**

```tsx
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BatchModelingAgent from './BatchModelingAgent'

describe('BatchModelingAgent', () => {
  it('renders batch mode and links reviewed asset back to single asset builder', () => {
    render(
      <MemoryRouter>
        <BatchModelingAgent />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))
    fireEvent.click(screen.getAllByRole('button', { name: '进入单资产 Builder' })[0])

    expect(screen.getByText('已选择批量候选资产')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开单资产 Builder' })).toHaveAttribute(
      'href',
      '/semantic/modeling-copilot/new',
    )
  })
})
```

- [ ] **Step 2: 写页面实现**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip } from '@v2/components/ui'
import { BatchModelingWorkbench } from './components/BatchModelingWorkbench'
import type { BatchModelingQueueItem } from './batchModeling'

export default function BatchModelingAgent() {
  const [selectedItem, setSelectedItem] = useState<BatchModelingQueueItem | null>(null)

  return (
    <div className="relative min-h-full">
      <BatchModelingWorkbench onOpenBuilder={setSelectedItem} />
      {selectedItem ? (
        <div className="fixed bottom-4 right-4 z-20 w-[min(420px,calc(100vw-32px))] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-3">已选择批量候选资产</p>
              <h2 className="mt-1 text-[14px] font-semibold">{selectedItem.title}</h2>
              <p className="mt-1 text-[12px] text-2">进入单资产 Builder 后继续完成字段候选、口径确认、沙盒校验和发布门禁。</p>
            </div>
            <Chip tone="info">待审阅</Chip>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
              取消
            </Button>
            <Button asChild size="sm">
              <Link to="/semantic/modeling-copilot/new">打开单资产 Builder</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: 接入路由**

在 `routes.tsx` 的 semantic lazy imports 中新增：

```ts
const SemanticBatchModelingAgent = lazy(() => import('@v2/pages/semantic/modeling-copilot/BatchModelingAgent'))
```

在 `modeling-copilot/:sessionId` 之前新增静态路由：

```tsx
<Route path="modeling-copilot/batch" element={wrap(<SemanticBatchModelingAgent />)} />
<Route path="modeling-copilot/new" element={wrap(<SemanticModelingCopilot />)} />
<Route path="modeling-copilot/:sessionId" element={wrap(<SemanticModelingCopilot />)} />
```

- [ ] **Step 4: 接入导航与测试**

在 `navigation.ts` 的 `语义构建` 分组中新增：

```ts
{
  section: t('nav.semantic.section.build', '语义构建'),
  label: t('nav.semantic.sub.batchModelingBuilder', '批量冷启动'),
  path: '/semantic/modeling-copilot/batch',
  implemented: true,
},
```

在 `navigation.test.ts` 中更新期望：

```ts
expect(buildItems.map((item) => item.label)).toEqual(['语义冷启动', '批量冷启动'])
expect(buildItems.map((item) => item.path)).toEqual([
  '/semantic/modeling-copilot/new',
  '/semantic/modeling-copilot/batch',
])

const batch = findLayout('/semantic/modeling-copilot/batch', semantic)
expect(batch.secondarySidebar).toBe(false)
expect(batch.inspector).toBe(false)
expect(batch.hideBreadcrumbs).toBe(true)
```

- [ ] **Step 5: 运行聚焦测试**

Run:

```bash
cd frontend && npm run test:unit -- \
  src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx \
  src/v2/layout/navigation.test.ts
```

Expected: PASS。

---

### Task 4: P2 smoke 与 PRD 同步

**Files:**
- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
- Modify: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/prd/README.md`

- [ ] **Step 1: 增加 Playwright smoke**

在 `p34-modeling-agent-smoke.spec.ts` 末尾新增测试：

```ts
test('P2 batch mode generates review queue without direct publish', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await gotoV2(page, '/semantic/modeling-copilot/batch')

  await expect(page.getByRole('heading', { name: '批量语义冷启动' })).toBeVisible()
  await page.getByLabel('业务域').fill('学情分析')
  await page.getByLabel('候选表数量').fill('28')
  await page.getByRole('button', { name: '生成批量建设队列' }).click()

  await expect(page.getByText('Proposal Queue')).toBeVisible()
  await expect(page.getByText('学情分析批量语义冷启动')).toBeVisible()
  await expect(page.getByRole('button', { name: /发布/ })).toHaveCount(0)

  await page.getByRole('button', { name: '进入单资产 Builder' }).first().click()
  await expect(page.getByText('已选择批量候选资产')).toBeVisible()
  await expect(page.getByRole('link', { name: '打开单资产 Builder' })).toHaveAttribute(
    'href',
    '/semantic/modeling-copilot/new',
  )
})
```

- [ ] **Step 2: 更新 PRD 边界**

在 `docs/prd/semantic_cold_start_builder_prd.md` 的 P2 章节补充：

```markdown
### P2 批量模式 MVP 落地边界（2026-06-04）

- 路由：`/semantic/modeling-copilot/batch`。
- 当前实现：前端批量建设范围 intake、扫描计划预览、Proposal Queue 和单资产 Builder 接续入口。
- 明确不做：真实后台批量 Agent、异步批量任务、批量发布、直接写入语义中心。
- 验收口径：用户能从业务域和候选表数量生成待审阅候选队列，并确认每个候选仍需进入单资产 Builder 完成人工审阅与发布门禁。
```

- [ ] **Step 3: 更新 PRD README 索引**

在 `docs/prd/README.md` 的语义冷启动条目旁补 `P2 批量模式 MVP 已有前端验证入口 /semantic/modeling-copilot/batch`。

- [ ] **Step 4: 运行 E2E smoke**

Run: `cd frontend && npm run e2e:modeling-agent-smoke`

Expected: PASS。

---

### Task 5: 统一验证与最终复核

**Files:**
- No new files unless review finds a concrete issue.

- [ ] **Step 1: 运行聚焦单测**

Run:

```bash
cd frontend && npm run test:unit -- \
  src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts \
  src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx \
  src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx \
  src/v2/layout/navigation.test.ts
```

Expected: PASS。

- [ ] **Step 2: 运行仓库检测路由**

Run: `make verify-detect`

Expected: PASS，或输出建议的固定验证入口。

- [ ] **Step 3: 运行语义域验证**

Run: `make verify-semantic`

Expected: PASS。

- [ ] **Step 4: 运行文档验证**

Run: `make verify-docs`

Expected: PASS。

- [ ] **Step 5: 检查 diff 空白与格式**

Run: `git diff --check`

Expected: 无输出。

- [ ] **Step 6: 最终产品/代码复核**

复核点：

- P2 批量模式只生成队列，不出现直接发布按钮。
- 新路由在动态 `:sessionId` 之前，避免 `/batch` 被当作 session id。
- 语义构建导航包含 `语义冷启动` 和 `批量冷启动`，两者都命中 fullBleed。
- 文档明确当前不包含真实后台批量 Agent 和批量发布。
- 未执行 `git add` / `git commit`，保留给后续统一拆 commit。
