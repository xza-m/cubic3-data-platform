# Semantic Modeling Workbench P0 Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛当前语义建设工作台的产品心智、两层语义建设展示和发布预演状态，让 P0 成为可理解、可验证、可发布到语义中心的单资产工作台。

**Architecture:** P0 不改公开会话 API，不迁移数据库 schema，不新增后期治理能力；复用现有 `/semantic/modeling-workbench`、`SemanticModelingCopilotService.update_spec`、`release-preview` 和 `FieldCandidateReview`。重点在前端 copy/status/model adapter 与少量后端用户可见状态文案，保证 Cube + 轻本体锚定、语义中心编译、Gateway 执行验证三条状态分开表达。

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright, Flask, pytest, Makefile, existing semantic modeling APIs.

---

## Scope Check

本计划只做 P0 收敛：

- 产品主名统一为 `语义建设工作台`。
- 批量入口文案从 `批量语义冷启动` 收敛为 `批量语义建设`。
- `Copilot` 不作为用户可见主心智；保留代码内部 `SemanticModelingCopilot*` 命名，避免大范围迁移。
- 下线 `Builder 过渡工作区` 文案，中栏正式表达为 `字段候选主画布`。
- 显示 Cube 层与轻本体锚定层，但不做完整本体图谱编辑器。
- 发布预演拆成 `语义中心发布 / 语义编译 / Gateway 执行面验证 / 消费者验证`。
- Gateway 405 或未配置显示为执行面未接通，不显示成语义资产失败。

不纳入 P0：

- Build Project 后端持久化。
- 真实批量扫描物理表和字段画像。
- 完整本体治理、术语生命周期、复杂审批。
- Gateway 新接口实现；P0 只修正平台工作台如何展示 gateway 失败。

工程原则：

- **KISS**：优先改 copy/status/adapter，不做路由或 API 大迁移。
- **YAGNI**：完整 ontology studio 和后期治理后置。
- **SOLID**：语义中心编译、Gateway 执行验证、消费者验证各自独立。
- **DRY**：copy/status 通过集中 helper 约束，测试守住不漂移。

## File Structure

新增文件：

- `frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.ts`
  - 从 `raw_spec` / `semantic_canvas` 提取 P0 页面需要展示的 Cube 层与轻本体锚定摘要。
- `frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts`
  - 覆盖 Cube、ontology object、ontology metrics、bindings、空态。
- `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.ts`
  - 把 release-preview 原始 status 映射为产品可读的四组状态。
- `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts`
  - 覆盖 semantic compile passed、gateway not configured、gateway 405 failed、consumer pending。

修改文件：

- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
  - 删除用户可见 `Copilot` 主心智和 `正式 Data Agent runtime` 口径。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`
  - 增加 P0 forbidden copy 守护。
- `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`
  - `批量语义冷启动` 改为 `批量语义建设`；动作文案 `进入单资产 Builder` 改为 `进入资产建设画布`。
- `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`
  - 更新批量文案断言。
- `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
  - 页面标题和说明改为 P0 心智。
- `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`
  - 更新标题、边界文案、按钮断言。
- `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
  - 下线 `Builder 过渡工作区`，正式展示字段候选主画布与轻本体锚定摘要入口。
- `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`
  - 更新工作台 shell 断言，确认不再出现过渡文案。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
  - 接入 `semanticLayerSummary` 和 `releaseValidationStatus`，调整 topbar/post-publish/release-preview 文案。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
  - 更新 P0 UI、发布预演、post publish、forbidden copy 断言。
- `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
  - 更新 `/semantic/modeling-workbench` smoke 断言。
- `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts`
  - 更新 live smoke 文案断言，保留 compiled SQL 断言。
- `app/application/semantic/modeling_copilot_service.py`
  - 修正用户可见 agent message、review label、post publish label，避免把 Data Agent 说成发布终点。
- `tests/unit/application/semantic/test_modeling_copilot_service.py`
  - 增加/更新后端文案状态测试。
- `docs/prd/semantic_cold_start_builder_prd.md`
  - 将 P0/P1 切分写清楚，P0 为当前工作台收敛。
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - 若文案仍称 P2 MVP 或 Copilot 主入口，更新为迁移期内部命名。

---

### Task 1: P0 Copy Contract

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`

- [ ] **Step 1: Write the failing copy tests**

Replace the forbidden-copy test in `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts` with:

```ts
it('不把 Copilot、冷启动或 Data Agent 表达成产品主心智', () => {
  const allCopy = JSON.stringify(builderCopy)

  expect(allCopy).not.toContain('发布给 Data Agent')
  expect(allCopy).not.toContain('正式 Data Agent runtime')
  expect(allCopy).not.toContain('正式 Data Agent 可消费')
  expect(BUILDER_EMPTY_STATE.title).toBe('从数仓数据建设可发布的语义资产')
  expect(BUILDER_ACTION_COPY.publishButton).toBe('发布到语义中心')
  expect(BUILDER_ARTIFACT_LABELS.panel).toBe('资产审阅')
})
```

In `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts`, update title/action expectations:

```ts
it('生成面向语义中心的批量建设计划', () => {
  const plan = buildBatchModelingPlan(BATCH_MODELING_DEFAULT_SCOPE)

  expect(plan.title).toBe('学情分析批量语义建设')
  expect(plan.target).toBe('semantic_center')
  expect(plan.guardrails).toContain('批量模式只生成待审阅候选队列，不直接发布语义中心。')
  expect(plan.guardrails).toContain('Data Agent、BI、数据分析只消费语义中心已发布资产，不作为本模式发布目标。')
})

it('候选资产主动作进入资产建设画布', () => {
  const plan = buildBatchModelingPlan(BATCH_MODELING_DEFAULT_SCOPE)

  expect(getBatchQueuePrimaryAction(plan.queueItems[0])).toBe('进入资产建设画布')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts
```

Expected: FAIL because current code still emits `语义冷启动` / `进入单资产 Builder` / old title.

- [ ] **Step 3: Update copy implementation**

Update `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts` values:

```ts
export const BUILDER_EMPTY_STATE = {
  title: '从数仓数据建设可发布的语义资产',
  subtitle:
    '选择数据来源，审阅字段候选、轻本体锚定与语义草案；发布到语义中心后，Data Agent、BI、数据分析等消费者按同一快照验证。',
}

export const BUILDER_EXAMPLES: Array<{ title: string; sub: string }> = [
  {
    title: '基于学生评论事实表建设评论数语义资产',
    sub: '业务指标建设 · 从事实表到指标口径',
  },
  {
    title: '从 dwd_order_fact 建设订单退款率指标',
    sub: '已知数仓表 · 生成字段候选和语义草案',
  },
  {
    title: '补齐班级活跃度的业务对象与指标口径',
    sub: '消费者验证未通过 · 回流语义中心建设',
  },
]
```

Update `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`:

```ts
return {
  title: `${domain}批量语义建设`,
  target: 'semantic_center',
  riskLevel,
  scope: normalizedScope,
  scanPlan: buildScanPlan(normalizedScope),
  guardrails: [
    '批量模式只生成待审阅候选队列，不直接发布语义中心。',
    '每个候选资产进入建设画布后，仍需完成字段证据、口径确认、语义编译和发布门禁。',
    'Data Agent、BI、数据分析只消费语义中心已发布资产，不作为本模式发布目标。',
  ],
  queueItems: buildQueueItems(normalizedScope, needsScope, riskLevel),
}
```

and:

```ts
export function getBatchQueuePrimaryAction(item: BatchModelingQueueItem): string {
  const labels: Record<BatchQueuePrimaryAction, string> = {
    open_builder: '进入资产建设画布',
    regenerate: '退回重生成',
    defer: '暂缓',
    merge: '合并建议',
  }

  return labels[item.primaryAction]
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts
git commit -m "fix: converge semantic modeling p0 copy"
```

---

### Task 2: Workbench Shell Removes Transition State

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`

- [ ] **Step 1: Write failing shell tests**

In `SemanticModelingWorkbench.test.tsx`, replace assertions for `Builder 过渡工作区` with:

```tsx
expect(screen.getByText('字段候选主画布')).toBeInTheDocument()
expect(screen.getByText('Cube 层与本体锚定')).toBeInTheDocument()
expect(screen.queryByText('Builder 过渡工作区')).not.toBeInTheDocument()
expect(screen.queryByText('当前沿用单资产 Builder')).not.toBeInTheDocument()
```

In `components/BatchModelingWorkbench.test.tsx`, update title expectations:

```tsx
expect(screen.getByRole('heading', { name: '批量语义建设' })).toBeInTheDocument()
expect(screen.queryByText('P2 批量 AI 建模助手')).not.toBeInTheDocument()
expect(screen.queryByText('批量语义冷启动')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx
```

Expected: FAIL because current UI still renders `Builder 过渡工作区` and `批量语义冷启动`.

- [ ] **Step 3: Update workbench shell**

In `SemanticModelingWorkbench.tsx`, replace the middle section header block with:

```tsx
<div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
  <div className="flex items-center gap-2 text-[13px] font-semibold text-1">
    <Database size={15} aria-hidden />
    字段候选主画布
  </div>
  <p className="m-0 mt-1 text-[12px] leading-5 text-3">
    审阅字段候选、Cube 口径和轻本体锚定；AI 只提供证据解释和修复建议。
  </p>
</div>
```

In the right aside of `SemanticModelingWorkbench.tsx`, add this section above `候选证据`:

```tsx
<section className="mt-4 rounded-[8px] border bg-[var(--bg-surface-2)] p-3" style={{ borderColor: 'var(--border)' }}>
  <div className="text-[12px] font-semibold text-2">Cube 层与本体锚定</div>
  <p className="m-0 mt-1 text-[12px] leading-5 text-3">
    P0 在建设画布内完成 Cube 建模和轻本体术语绑定；完整本体治理在语义中心治理面处理。
  </p>
</section>
```

In `components/BatchModelingWorkbench.tsx`, update the header:

```tsx
<p className="text-[12px] font-semibold uppercase text-3">AI 建模助手</p>
<h1 className="m-0 mt-1 text-[22px] font-semibold leading-tight">批量语义建设</h1>
<p className="m-0 mt-2 max-w-[760px] text-[13px] leading-6 text-2">
  按业务域生成待审阅候选队列，再逐个进入资产建设画布收敛字段证据、Cube 口径、本体锚定和发布门禁。
</p>
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx
git commit -m "fix: remove semantic workbench transition state"
```

---

### Task 3: Light Semantic Layer Summary

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `semanticLayerSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractSemanticLayerSummary } from './semanticLayerSummary'

describe('extractSemanticLayerSummary', () => {
  it('提取 Cube 层和轻本体锚定摘要', () => {
    const summary = extractSemanticLayerSummary({
      cube: {
        name: 'student_comment_cube',
        source: 'public.dwd_student_comment',
        dimensions: {
          school_id: { title: '学校' },
          published_at: { title: '发布时间' },
        },
        measures: {
          comment_count: { title: '评论数' },
        },
      },
      ontology: {
        object: { name: 'student_comment', title: '学生评论' },
        metrics: [{ name: 'student_comment_count', title: '学生评论数', measure_refs: ['student_comment_cube.comment_count'] }],
      },
    })

    expect(summary.cube.name).toBe('student_comment_cube')
    expect(summary.cube.source).toBe('public.dwd_student_comment')
    expect(summary.cube.dimensionCount).toBe(2)
    expect(summary.cube.measureCount).toBe(1)
    expect(summary.ontology.objectName).toBe('学生评论')
    expect(summary.ontology.metricNames).toEqual(['学生评论数'])
    expect(summary.bindingCount).toBe(1)
  })

  it('空 spec 返回待补齐状态', () => {
    const summary = extractSemanticLayerSummary({})

    expect(summary.cube.status).toBe('missing')
    expect(summary.ontology.status).toBe('missing')
    expect(summary.bindingCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts
```

Expected: FAIL with unresolved module.

- [ ] **Step 3: Add summary helper**

Create `semanticLayerSummary.ts`:

```ts
export interface SemanticLayerSummary {
  cube: {
    status: 'ready' | 'missing'
    name: string
    source: string
    dimensionCount: number
    measureCount: number
  }
  ontology: {
    status: 'ready' | 'missing'
    objectName: string
    metricNames: string[]
  }
  bindingCount: number
}

export function extractSemanticLayerSummary(rawSpec: unknown): SemanticLayerSummary {
  const spec = isRecord(rawSpec) ? rawSpec : {}
  const cube = isRecord(spec.cube) ? spec.cube : {}
  const ontology = isRecord(spec.ontology) ? spec.ontology : {}
  const objectPayload = isRecord(ontology.object) ? ontology.object : {}
  const metrics = Array.isArray(ontology.metrics) ? ontology.metrics.filter(isRecord) : []
  const dimensions = isRecord(cube.dimensions) ? Object.keys(cube.dimensions) : []
  const measures = isRecord(cube.measures) ? Object.keys(cube.measures) : []
  const metricNames = metrics
    .map((metric) => String(metric.title || metric.name || '').trim())
    .filter(Boolean)
  const bindingCount = metrics.reduce((count, metric) => {
    const refs = Array.isArray(metric.measure_refs) ? metric.measure_refs : []
    return count + refs.length
  }, 0)
  const cubeName = String(cube.name || '').trim()
  const objectName = String(objectPayload.title || objectPayload.name || '').trim()

  return {
    cube: {
      status: cubeName ? 'ready' : 'missing',
      name: cubeName,
      source: String(cube.source || cube.table || '').trim(),
      dimensionCount: dimensions.length,
      measureCount: measures.length,
    },
    ontology: {
      status: objectName || metricNames.length ? 'ready' : 'missing',
      objectName,
      metricNames,
    },
    bindingCount,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
```

- [ ] **Step 4: Render summary in ModelingAgent**

In `ModelingAgent.tsx`, import:

```ts
import { extractSemanticLayerSummary } from './semanticLayerSummary'
```

Inside the component after `const session = sessionQ.data ?? null;`, add:

```ts
const semanticLayerSummary = extractSemanticLayerSummary(session?.workbench_state?.raw_spec)
```

In the asset review summary area, add a compact section:

```tsx
<section className="rounded-[8px] border bg-[var(--bg-surface-2)] p-3" style={{ borderColor: 'var(--border)' }}>
  <div className="text-[12px] font-semibold text-2">两层语义建设</div>
  <div className="mt-2 grid gap-2 text-[12px] leading-5 text-2">
    <div>
      <span className="font-semibold text-1">Cube 层：</span>
      {semanticLayerSummary.cube.status === 'ready'
        ? `${semanticLayerSummary.cube.name} · ${semanticLayerSummary.cube.dimensionCount} 维度 · ${semanticLayerSummary.cube.measureCount} 度量`
        : '待生成 Cube 草案'}
    </div>
    <div>
      <span className="font-semibold text-1">本体锚定：</span>
      {semanticLayerSummary.ontology.status === 'ready'
        ? `${semanticLayerSummary.ontology.objectName || '业务对象'} · ${semanticLayerSummary.ontology.metricNames.length} 个指标术语 · ${semanticLayerSummary.bindingCount} 个绑定`
        : '待复用或新增业务术语'}
    </div>
  </div>
</section>
```

Add a test in `ModelingAgent.test.tsx`:

```tsx
it('展示 Cube 层和轻本体锚定摘要', () => {
  activeSessionFixture = {
    ...ANALYZED_SESSION,
    workbench_state: {
      ...ANALYZED_SESSION.workbench_state,
      raw_spec: {
        cube: {
          name: 'student_comment_cube',
          source: 'public.dwd_student_comment',
          dimensions: { school_id: {}, published_at: {} },
          measures: { comment_count: {} },
        },
        ontology: {
          object: { title: '学生评论' },
          metrics: [{ title: '学生评论数', measure_refs: ['student_comment_cube.comment_count'] }],
        },
      },
    },
  }

  renderModelingAgent()

  expect(screen.getByText('两层语义建设')).toBeInTheDocument()
  expect(screen.getByText(/student_comment_cube · 2 维度 · 1 度量/)).toBeInTheDocument()
  expect(screen.getByText(/学生评论 · 1 个指标术语 · 1 个绑定/)).toBeInTheDocument()
})
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.ts frontend/src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: show cube and ontology anchors in modeling workbench"
```

---

### Task 4: Release Preview Status Model

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts`

- [ ] **Step 1: Write failing status tests**

Create `releaseValidationStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildReleaseValidationGroups } from './releaseValidationStatus'
import type { ReleasePreview } from './releasePreview'

const basePreview: ReleasePreview = {
  target: 'semantic_center',
  compiledSql: 'SELECT 1',
  releaseDiff: { added: ['cube.student_comment'], changed: [], removed: [] },
  impactSummary: { affectedAssets: ['cube.student_comment'], affectedConsumers: ['Data Agent', 'BI'], riskLevel: 'low' },
  semanticCompile: { status: 'passed', message: '语义中心编译预演通过。' },
  gatewayValidation: { status: 'failed', message: 'Gateway SQL dry-run 调用失败：gateway SQL dry-run failed: 405' },
  consumerValidation: { status: 'pending', samples: [] },
}

describe('buildReleaseValidationGroups', () => {
  it('把 gateway 405 表达为执行面未接通，不污染语义编译状态', () => {
    const groups = buildReleaseValidationGroups(basePreview)

    expect(groups.semanticCenter.statusLabel).toBe('语义中心可发布')
    expect(groups.semanticCompile.statusLabel).toBe('已通过')
    expect(groups.gateway.statusLabel).toBe('执行面未接通')
    expect(groups.gateway.description).toContain('不影响语义中心发布结果')
    expect(groups.consumer.statusLabel).toBe('等待执行面验证')
  })

  it('gateway passed 时消费者可继续验证', () => {
    const groups = buildReleaseValidationGroups({
      ...basePreview,
      gatewayValidation: { status: 'passed', message: 'dry-run passed' },
      consumerValidation: { status: 'passed', samples: [] },
    })

    expect(groups.gateway.statusLabel).toBe('已通过')
    expect(groups.consumer.statusLabel).toBe('已通过')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts
```

Expected: FAIL with unresolved module.

- [ ] **Step 3: Add status helper**

Create `releaseValidationStatus.ts`:

```ts
import type { ReleasePreview } from './releasePreview'

export interface ReleaseValidationGroup {
  title: string
  statusLabel: string
  description: string
}

export interface ReleaseValidationGroups {
  semanticCenter: ReleaseValidationGroup
  semanticCompile: ReleaseValidationGroup
  gateway: ReleaseValidationGroup
  consumer: ReleaseValidationGroup
}

export function buildReleaseValidationGroups(preview: ReleasePreview): ReleaseValidationGroups {
  const gatewayMessage = preview.gatewayValidation.message || ''
  const gatewayDisconnected =
    preview.gatewayValidation.status === 'not_configured' ||
    /405|未配置|not configured|method not allowed/i.test(gatewayMessage)

  return {
    semanticCenter: {
      title: '语义中心发布',
      statusLabel: preview.semanticCompile.status === 'passed' ? '语义中心可发布' : '待修复',
      description: '发布目标是语义中心；Data Agent、BI、数据分析只消费发布快照。',
    },
    semanticCompile: {
      title: '语义编译',
      statusLabel: statusLabel(preview.semanticCompile.status),
      description: preview.semanticCompile.message || '语义中心编译预演状态。',
    },
    gateway: {
      title: 'Gateway 执行面验证',
      statusLabel: gatewayDisconnected ? '执行面未接通' : statusLabel(preview.gatewayValidation.status),
      description: gatewayDisconnected
        ? 'Gateway SQL dry-run 当前未接通，不影响语义中心发布结果；当前 SQL 尚未完成物理执行验证。'
        : preview.gatewayValidation.message || 'Gateway SQL dry-run 状态。',
    },
    consumer: {
      title: '消费者验证',
      statusLabel:
        preview.consumerValidation.status === 'pending' && preview.gatewayValidation.status !== 'passed'
          ? '等待执行面验证'
          : statusLabel(preview.consumerValidation.status),
      description: '消费者验证基于语义中心发布快照和执行面验证结果。',
    },
  }
}

function statusLabel(status: string): string {
  if (status === 'passed') return '已通过'
  if (status === 'failed') return '未通过'
  if (status === 'not_configured') return '未配置'
  return '待校验'
}
```

- [ ] **Step 4: Render grouped statuses**

In `ModelingAgent.tsx`, import helper:

```ts
import { buildReleaseValidationGroups } from './releaseValidationStatus'
```

Inside the release preview panel component, compute:

```ts
const validationGroups = buildReleaseValidationGroups(preview)
```

Replace the existing single `发布预演 未通过` summary with four group rows:

```tsx
{Object.values(validationGroups).map((group) => (
  <div key={group.title} className="rounded-[8px] border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] font-semibold text-1">{group.title}</span>
      <Chip tone={group.statusLabel === '已通过' || group.statusLabel === '语义中心可发布' ? 'success' : 'warning'}>
        {group.statusLabel}
      </Chip>
    </div>
    <p className="m-0 mt-1 text-[12px] leading-5 text-3">{group.description}</p>
  </div>
))}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.ts frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: split semantic release validation statuses"
```

---

### Task 5: Backend User-Facing Status Copy

**Files:**

- Modify: `app/application/semantic/modeling_copilot_service.py`
- Modify: `tests/unit/application/semantic/test_modeling_copilot_service.py`
- Modify: `tests/integration/test_semantic_modeling_copilot_api.py`

- [ ] **Step 1: Write failing backend copy tests**

Add to `tests/unit/application/semantic/test_modeling_copilot_service.py` after the existing publish tests:

```py
def test_published_review_copy_targets_semantic_center_not_data_agent():
    service, _, _, _ = _service()
    session = service.create_session({
        "user_goal": "建设评论数语义资产",
        "entry_type": "business_question",
        "principal_id": "alice",
    })
    updated = service.update_spec(
        session["id"],
        {
            "cube": {"name": "student_comment_cube", "source": "public.dwd_student_comment"},
            "ontology": {
                "object": {"name": "student_comment", "title": "学生评论"},
                "metrics": [{"name": "student_comment_count", "measure_refs": ["student_comment_cube.comment_count"]}],
            },
        },
        principal_id="alice",
    )
    accepted = service.accept_cube_draft(updated["id"], {}, principal_id="alice")
    saved = service.save_proposal(accepted["id"], {}, principal_id="alice")
    published = service.publish_proposal(saved["id"], {}, principal_id="alice")

    text = str(published)
    assert "已发布到语义中心" in text
    assert "正式 Data Agent" not in text
    assert "Data Agent 可消费" not in text
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_copilot_service.py -k "published_review_copy_targets_semantic_center" -q
```

Expected: FAIL because current service still emits `正式 Data Agent` / `Data Agent 可消费`.

- [ ] **Step 3: Update backend copy**

In `app/application/semantic/modeling_copilot_service.py`, replace user-facing strings:

```py
state["agent_message"] = (
    f"语义 {proposal_id} 已发布到语义中心。Cube 与轻本体锚定已进入发布快照；"
    "Data Agent、BI、数据分析等消费者可基于同一快照继续验证。"
)
```

Replace post-publish available state:

```py
return {"state": "available", "label": "语义中心已发布", "reasons": []}
```

Replace published status label mapping:

```py
if published:
    return "published", "已发布到语义中心"
```

Replace summary text:

```py
"summary": "语义中心发布快照已生成",
"description": "消费者可基于语义中心发布快照继续验证。" if published else "发布成功后进入语义中心发布快照。",
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_copilot_service.py tests/integration/test_semantic_modeling_copilot_api.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/application/semantic/modeling_copilot_service.py tests/unit/application/semantic/test_modeling_copilot_service.py tests/integration/test_semantic_modeling_copilot_api.py
git commit -m "fix: align semantic modeling backend status copy"
```

---

### Task 6: P0 E2E, Docs, Verification

**Files:**

- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts`
- Modify: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`

- [ ] **Step 1: Update E2E assertions**

In `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`, replace workbench title assertions:

```ts
await expect(page.getByRole('heading', { name: '批量语义建设' })).toBeVisible()
await expect(page.getByText('目标：语义中心')).toBeVisible()
await expect(page.getByText('字段候选主画布')).toBeVisible()
await expect(page.getByText('Cube 层与本体锚定')).toBeVisible()
await expect(page.getByText('Builder 过渡工作区')).toHaveCount(0)
```

In `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts`, replace the post-publish visible text assertion:

```ts
await expect(page.getByText(/已发布到语义中心|语义中心已发布/).first()).toBeVisible()
await expect(page.getByText(/正式 Data Agent/)).toHaveCount(0)
```

- [ ] **Step 2: Update docs**

In `docs/prd/semantic_cold_start_builder_prd.md`, set:

```yaml
status: accepted
last_reviewed: 2026-06-05
```

Add this section before current acceptance:

```md
## P0 / P1 范围切分

P0 聚焦当前工作台收敛：统一语义建设工作台心智，展示 Cube 层与轻本体锚定，拆分语义编译、Gateway 执行面验证和消费者验证状态。P0 不建设完整本体治理。

P1 聚焦前期冷启动规模化：持久化 Build Project，接入真实批量扫描，生成可审阅 Asset Package 队列，并在字段候选主画布中连续处理多个候选资产。

完整本体关系图、术语生命周期、跨域术语冲突、复杂审批和发布后消费治理属于语义中心治理面，不纳入本次 P0/P1。
```

In `docs/TECH_STACK_AND_ARCHITECTURE.md`, ensure the semantic workbench section says:

```md
语义建设工作台位于 `/semantic/modeling-workbench`，是语义中心的建设入口；内部历史 API 仍使用 `/api/v1/semantic/modeling-copilot/sessions/*` 作为迁移期会话契约，不代表产品主名。
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/batchModeling.test.ts src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/semanticLayerSummary.test.ts src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
pytest tests/unit/application/semantic/test_modeling_copilot_service.py tests/integration/test_semantic_modeling_copilot_api.py tests/unit/application/semantic/test_release_validation_preview.py -q
make verify-semantic
```

Expected: all PASS.

- [ ] **Step 4: Browser smoke**

Start or reuse `http://localhost:81`, then open:

```text
http://localhost:81/semantic/modeling-workbench
http://localhost:81/semantic/modeling-workbench/quick
```

Expected visible checks:

- `批量语义建设`
- `目标：语义中心`
- `字段候选主画布`
- `Cube 层与本体锚定`
- no `Builder 过渡工作区`
- no `正式 Data Agent`

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts docs/prd/semantic_cold_start_builder_prd.md docs/TECH_STACK_AND_ARCHITECTURE.md
git commit -m "test: verify semantic modeling p0 convergence"
```

## Self-Review

Spec coverage:

- Product naming convergence: Task 1, Task 2, Task 6.
- No transition workbench: Task 2.
- Cube + light ontology: Task 3.
- Release status split: Task 4.
- Backend user-facing copy: Task 5.
- E2E and docs: Task 6.

Placeholder scan:

- This plan contains no `TBD`, `TODO`, or unspecified test commands.

Type consistency:

- `extractSemanticLayerSummary` returns `SemanticLayerSummary`.
- `buildReleaseValidationGroups` consumes existing `ReleasePreview`.
- P0 does not rename `SemanticModelingCopilot*` API types.
