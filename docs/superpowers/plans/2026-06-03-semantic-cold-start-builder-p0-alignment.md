# Semantic Cold Start Builder P0 Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前“语义建模 Copilot”入口、文案、测试与 PRD 收口为“语义冷启动 Builder”，明确目标是发布到语义中心，而不是发布给 Data Agent。

**Architecture:** P0 保留现有 `/semantic/modeling-copilot/*` 路由、hook、API 与状态机，只改用户可见产品语言、前端 copy 契约、导航入口、右侧审阅面板标签和测试守护。语义资产真相仍在语义中心的 Registry / Release / Runtime Snapshot，Data Agent、BI、数据分析只作为发布后消费者验证。

**Tech Stack:** React、TypeScript、Vite、Vitest、Testing Library、Markdown PRD、Makefile docs verification、Browser smoke。

---

## 0. Scope Check

本计划是 P0 口径和入口治理，不实现 Builder stepper、字段候选审阅 tab、步骤级 AI action、开发者验证面板或批量 AI Modeling Agent。那些能力放在第二个计划 `docs/superpowers/plans/2026-06-03-semantic-builder-workflow-p1.md`。

方案选择：

- 方案 A：只改 PRD，不改 UI。风险是用户仍在页面上看到 Copilot / Data Agent runtime / raw_spec 终点心智，不采纳。
- 方案 B：先改入口、文案、测试和 PRD，保留运行契约。推荐，KISS 且能快速止住口径漂移。
- 方案 C：立即重命名后端 API / 数据表 / 状态机。改动面过大，不符合 YAGNI，本轮不做。

工程原则：

- KISS：只改 P0 体验语言和测试守护，不碰后端发布链路。
- YAGNI：不提前做完整 Builder 工作流和批量 Agent。
- SOLID：语义中心是发布真相，消费者验证不定义语义真相。
- DRY：新增 `builderCopy.ts` 集中维护冷启动文案，页面和测试共享同一口径。

## 1. File Map

新增文件：

- `docs/prd/semantic_cold_start_builder_prd.md`
  - P0 产品设计输入：目标用户、非目标、端到端流程、AI 介入点、验收和成功指标。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
  - 统一 Builder 空态、示例、动作、面板和消费者验证文案；只放字符串 copy，不放 icon / React 展示依赖。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`
  - 防止重新出现“发布给 Data Agent”或“正式 Data Agent runtime 是终点”的文案漂移。

修改文件：

- `docs/prd/README.md`
  - 增加语义冷启动 Builder PRD 索引。
- `frontend/src/v2/layout/navigation.ts:154-170`
  - 将语义构建入口从“建模助手 Copilot”改为“语义冷启动”。
- `frontend/src/v2/layout/navigation.test.ts:88-96`
  - 更新导航断言。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
  - 使用 Builder copy，替换空态、示例、右侧面板、动作、发布和消费者验证文案。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
  - 更新所有旧文案断言，包括文件底部空态和点击示例测试。

## 2. Task 1: Add Product PRD

**Files:**

- Create: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/prd/README.md`

- [ ] **Step 1: Write the PRD**

Create `docs/prd/semantic_cold_start_builder_prd.md` with this complete content:

```markdown
---
doc_type: prd
status: proposed
source_of_truth: design-input
owner: product-engineering
last_reviewed: 2026-06-03
---

# 语义冷启动 Builder PRD

## 1. 产品定位

语义冷启动 Builder 面向数据建模工程师，帮助他们把数仓表、字段证据、已有语义资产和业务建设目标快速转成可发布到语义中心的标准语义资产包。

最终目标不是发布给 Data Agent，而是发布到语义中心，使语义资产进入已发布状态，并可被 Data Agent、BI、数据分析、报表和业务应用复用。

## 2. 用户与任务

核心用户：

- 数据建模工程师：负责选择来源、确认字段候选、审阅 Cube / Ontology / Binding 草案。
- 语义资产 Owner：负责发布前校验、口径治理和影响确认。

协作者：

- 数据产品经理：确认业务对象、指标口径和命名。
- 分析师 / BI 开发者：验证指标能否在下游消费。
- 治理管理员：确认权限、审计和发布门禁。

下游消费者：

- Data Agent
- BI
- 数据分析
- 报表
- 业务应用
- 自动化任务

## 3. 目标

- 缩短从数仓表到第一版语义草案的时间。
- 降低字段角色、指标聚合、业务对象绑定的冷启动成本。
- 让 AI 在每一步提供建议、解释和补齐，但不直接发布语义真相。
- 发布到语义中心后，用多个消费者样例验证语义可用性。

## 4. 非目标

- 不让 LLM 直接修改已发布语义资产。
- 不把数据资产底座升级成第二套 Dataset。
- 不把 Data Agent 当作语义建设的唯一终点。
- 不在本轮迁移 `/semantic/modeling-copilot/*` 后端 API。
- 不建设完整多人审批流。

## 5. 端到端流程

```text
新建语义资产包
  -> 选择业务域 / 数仓表 / 建设目标
  -> 召回数据证据和已有语义
  -> 审阅字段候选
  -> 生成语义草案
  -> 发布校验与影响评估
  -> 发布到语义中心
  -> 消费者可用性验证
```

## 6. 页面结构

左侧：建设项目列表、最近会话、状态标记。

中间：语义建设主流程，首期仍复用现有对话输入和结构化卡片。

右侧：资产审阅、证据解释、发布检查、可用性验证、审计记录和高级 Spec。

## 7. AI 介入点

- 建设范围：推荐候选表，解释覆盖度和风险。
- 来源证据：总结字段、样本、血缘、使用记录。
- 字段候选：推荐指标、维度、时间字段、默认聚合、单位和置信度。
- 语义草案：生成 Cube / Ontology / Binding 草案。
- 口径补齐：补充定义、过滤条件、命名建议和冲突说明。
- 发布校验：解释阻塞项、生成修复建议。
- 消费者验证：生成 Data Agent、BI、数据分析样例问题和预览检查。

## 8. 成功指标

- Time to first semantic draft
- 字段候选命中率
- 人工字段修改比例
- 草案到发布转化率
- 发布校验通过率
- 发布后消费者可用性通过率
- 语义资产被消费者复用次数
- 发布后返工率

## 9. 首期验收

- 入口文案使用“语义冷启动”或“语义资产 Builder”，不再把 Copilot 当作产品主名。
- 空态表达“发布到语义中心”，并列出 Data Agent、BI、数据分析等消费者。
- 主动作从“应用语义”改为“生成语义资产”。
- 发布动作表达为“发布到语义中心”。
- 右侧面板用“资产审阅 / 建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录”描述任务。
- 页面首屏不直接暴露 `raw_spec`、`runtime`、`readiness`、`Proposal` 等实现词。
```

- [ ] **Step 2: Update PRD index**

In `docs/prd/README.md`, insert this item under `## 当前文件`:

```markdown
- [语义冷启动 Builder PRD](semantic_cold_start_builder_prd.md)
  - 聚焦数据建模工程师如何基于数仓表、字段证据和已有语义资产冷启动建设可发布到语义中心的语义资产包
  - 状态：产品设计输入，P0 先收口前端入口、文案和验证口径
```

- [ ] **Step 3: Verify docs**

Run:

```bash
make verify-docs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/prd/semantic_cold_start_builder_prd.md docs/prd/README.md
git commit -m "docs: add semantic cold start builder prd"
```

## 3. Task 2: Add Builder Copy Contract

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import * as builderCopy from './builderCopy'

const {
  BUILDER_ACTION_COPY,
  BUILDER_ARTIFACT_LABELS,
  BUILDER_EMPTY_STATE,
  BUILDER_EXAMPLES,
  CONSUMER_VALIDATION_COPY,
} = builderCopy

function collectContractSurface(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectContractSurface)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...collectContractSurface(item)])
  }
  return []
}

function allBuilderCopy(): string[] {
  return collectContractSurface(builderCopy)
}

describe('semantic cold start builder copy', () => {
  it('frames the goal as publishing to semantic center', () => {
    expect(BUILDER_EMPTY_STATE.title).toBe('从数仓数据生成可发布的语义资产')
    expect(BUILDER_EMPTY_STATE.subtitle).toContain('发布到语义中心')
    expect(BUILDER_EMPTY_STATE.subtitle).toContain('Data Agent、BI、数据分析')
  })

  it('keeps Data Agent as one consumer rather than the destination', () => {
    const allCopy = allBuilderCopy().join('\n')

    expect(allCopy).not.toContain('正式 Data Agent runtime')
    expect(allCopy).not.toContain('发布给 Data Agent')
    expect(allCopy).not.toMatch(/(?:发布|上线|投递|同步|面向)(?:给|到|至|为)?\s*Data Agent/)
    expect(allCopy).not.toMatch(/Data Agent[^\n]*(?:runtime|终点|发布|路由|目标)/)
    expect(BUILDER_ACTION_COPY.publishButton).toContain('语义中心')
    expect(CONSUMER_VALIDATION_COPY.routeLabel).toContain('语义中心')
    expect(CONSUMER_VALIDATION_COPY.summaryFallback).toContain('Data Agent、BI、数据分析')
  })

  it('keeps implementation terms out of the builder copy contract', () => {
    const allCopy = allBuilderCopy().join('\n')

    expect(allCopy).not.toContain('raw_spec')
    expect(allCopy).not.toContain('readiness')
    expect(allCopy).not.toContain('runtime')
    expect(allCopy).not.toContain('Proposal')
    expect(allCopy).not.toContain('Spec')
    expect(allCopy).not.toContain('spec')
    expect(allCopy).not.toContain('JSON')
    expect(allCopy).not.toContain('Ontology')
    expect(allCopy).not.toContain('Cube')
    expect(allCopy).not.toContain('Binding')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts
```

Expected: FAIL with `Failed to resolve import "./builderCopy"`.

- [ ] **Step 3: Add copy module**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`:

```typescript
export const BUILDER_EMPTY_STATE = {
  title: '从数仓数据生成可发布的语义资产',
  subtitle:
    '选择数据来源，审阅字段候选与语义草案，发布到语义中心后供 Data Agent、BI、数据分析等消费者使用。',
}

export const BUILDER_EXAMPLES: Array<{ title: string; sub: string }> = [
  {
    title: '基于学生评论事实表建设评论数语义资产',
    sub: '业务指标冷启动 · 从事实表到指标口径',
  },
  {
    title: '从 dwd_order_fact 冷启动订单退款率指标',
    sub: '已知数仓表 · 生成字段候选和语义草案',
  },
  {
    title: '补齐班级活跃度的业务对象与指标口径',
    sub: '消费者验证未通过 · 回流语义中心治理',
  },
]

export const BUILDER_ACTION_COPY = {
  sandboxTitle: '可先做可用性预演',
  saveTitle: '下一步：生成待发布语义资产',
  sandboxButton: '可用性预演',
  saveButton: '生成语义资产',
  publishButton: '发布到语义中心',
  saving: '生成语义资产',
  publishing: '发布到语义中心',
  updatingAdvancedSemanticConfig: '保存高级语义配置',
}

export const BUILDER_ARTIFACT_LABELS = {
  panel: '资产审阅',
  subtitle: '建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录',
  review: '建设摘要',
  semanticDraft: '语义草案',
  source: '来源证据',
  preview: '可用性验证',
  trace: '审计记录',
  advancedSemanticConfigTitle: '高级语义配置',
  advancedSemanticConfigDescription: '高级语义配置用于精确审阅和故障定位，普通建设流程优先使用字段候选与语义草案。',
  fullSemanticDraftLabel: '完整语义草案',
  askAiEdit: '让 AI 调整语义配置',
  saveAdvancedSemanticConfig: '保存高级语义配置',
}

export const CONSUMER_VALIDATION_COPY = {
  sectionTitle: '发布后消费者验证',
  routeLabel: '语义中心路由',
  summaryFallback: '发布到语义中心后，可分别运行 Data Agent、BI、数据分析等消费者验收。',
  noQuestion: '发布后生成',
}
```

- [ ] **Step 4: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts
git commit -m "feat: add semantic builder copy contract"
```

## 4. Task 3: Rename Semantic Navigation Entry

**Files:**

- Modify: `frontend/src/v2/layout/navigation.ts:154-170`
- Modify: `frontend/src/v2/layout/navigation.test.ts:88-96`

- [ ] **Step 1: Update failing navigation test**

In `frontend/src/v2/layout/navigation.test.ts`, replace:

```typescript
expect(buildItems.map((item) => item.label)).toEqual(['建模助手 Copilot'])
```

with:

```typescript
expect(buildItems.map((item) => item.label)).toEqual(['语义冷启动'])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/layout/navigation.test.ts
```

Expected: FAIL with label mismatch.

- [ ] **Step 3: Update navigation**

In `frontend/src/v2/layout/navigation.ts`, replace the modeling Copilot subnav item with:

```typescript
{
  section: t('nav.semantic.section.build', '语义构建'),
  label: t('nav.semantic.sub.modelingBuilder', '语义冷启动'),
  path: '/semantic/modeling-copilot/new',
  implemented: true,
},
```

Replace the fullBleed comment with:

```typescript
// /semantic/modeling-copilot/* 走语义冷启动 Builder fullBleed：自带项目列表、主流程与审阅面板，隐藏 secondary sidebar / inspector / 面包屑
```

- [ ] **Step 4: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/layout/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/layout/navigation.ts frontend/src/v2/layout/navigation.test.ts
git commit -m "feat: rename semantic build navigation"
```

## 5. Task 4: Reframe Empty State And Examples

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Update empty-state tests**

In `ModelingAgent.test.tsx`, update the first empty-state test to assert:

```typescript
expect(screen.getByText('从数仓数据生成可发布的语义资产')).toBeInTheDocument()
expect(screen.getByText(/发布到语义中心后供 Data Agent、BI、数据分析等消费者使用/)).toBeInTheDocument()
expect(screen.getByText('基于学生评论事实表建设评论数语义资产')).toBeInTheDocument()
```

Use this value in the composer input and mutation assertions:

```typescript
const builderGoal = '基于学生评论事实表建设评论数语义资产'
fireEvent.change(composer, { target: { value: builderGoal } })
fireEvent.click(screen.getByRole('button', { name: /发送/ }))

await waitFor(() =>
  expect(createSession).toHaveBeenCalledWith({
    user_goal: builderGoal,
    entry_type: 'business_question',
  }),
)
await waitFor(() =>
  expect(sendMessage).toHaveBeenCalledWith({
    sessionId: 'session_1',
    message: builderGoal,
  }),
)
```

At the bottom of `ModelingAgent.test.tsx`, update the two old empty-state tests to:

```typescript
it('空态渲染：未提供 sessionId 时显示语义冷启动引导卡', () => {
  renderAt('/semantic/modeling-copilot/new')

  expect(screen.getByText('从数仓数据生成可发布的语义资产')).toBeInTheDocument()
  expect(screen.getByText('基于学生评论事实表建设评论数语义资产')).toBeInTheDocument()
})

it('点击示例卡把语义冷启动文案预填到 composer', () => {
  renderAt('/semantic/modeling-copilot/new')

  fireEvent.click(screen.getByText('基于学生评论事实表建设评论数语义资产'))

  const composer = screen.getByLabelText('建模目标') as HTMLTextAreaElement
  expect(composer.value).toBe('基于学生评论事实表建设评论数语义资产')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: FAIL because current page still shows the old empty state.

- [ ] **Step 3: Use builder copy in page**

In `ModelingAgent.tsx`, add:

```typescript
import { BUILDER_EMPTY_STATE, BUILDER_EXAMPLES } from './builderCopy'
```

Keep `ElementType` and the locally used example icons in `ModelingAgent.tsx`, then replace the local `EXAMPLES` constant with:

```typescript
const EXAMPLES: Array<{ icon: ElementType; title: string; sub: string }> = [
  { icon: TrendingUp, ...BUILDER_EXAMPLES[0] },
  { icon: Table2, ...BUILDER_EXAMPLES[1] },
  { icon: AlertCircle, ...BUILDER_EXAMPLES[2] },
]
```

In `EmptyState`, replace the title and subtitle with:

```tsx
<h2 className="text-[22px] font-semibold text-1">{BUILDER_EMPTY_STATE.title}</h2>
<p className="mt-1.5 max-w-[520px] text-[13px] leading-6 text-3">
  {BUILDER_EMPTY_STATE.subtitle}
</p>
```

- [ ] **Step 4: Remove unused icon imports**

Run:

```bash
make typecheck-frontend
```

Expected: FAIL only if old example icons are now unused.

Delete unused icon imports reported by TypeScript from `ModelingAgent.tsx`. Do not delete icons still used outside `EXAMPLES`.

- [ ] **Step 5: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS or only action/panel copy tests fail, which are handled in the next tasks.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: reframe semantic builder empty state"
```

## 6. Task 5: Reframe Artifact Review Panel

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Update artifact panel tests**

In the artifact panel test, replace old assertions with:

```typescript
expect(within(artifacts).getByText('资产审阅')).toBeInTheDocument()
expect(within(artifacts).getByText('建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录')).toBeInTheDocument()
expect(within(artifacts).getByRole('button', { name: '来源证据' })).toBeInTheDocument()
expect(within(artifacts).getByRole('button', { name: /语义草案/ })).toBeInTheDocument()
expect(within(artifacts).getByRole('button', { name: /审计记录/ })).toBeInTheDocument()
```

Update tab click tests:

```typescript
fireEvent.click(within(artifacts).getByRole('button', { name: '来源证据' }))
fireEvent.click(within(artifacts).getByRole('button', { name: '可用性验证' }))
fireEvent.click(within(artifacts).getByRole('button', { name: '审计记录' }))
```

Update advanced semantic editor assertions:

```typescript
expect(within(artifacts).getByLabelText('完整语义草案')).toBeInTheDocument()
const fullSpecEditor = within(artifacts).getByLabelText('完整语义草案')
fireEvent.click(within(artifacts).getByRole('button', { name: /让 AI 调整语义配置/ }))
expect(screen.getByLabelText('建模目标')).toHaveValue('请基于当前完整语义草案调整语义配置：')
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: FAIL because the page still has old panel labels.

- [ ] **Step 3: Use artifact labels**

In `ModelingAgent.tsx`, add:

```typescript
import { BUILDER_ARTIFACT_LABELS } from './builderCopy'
```

Replace `ARTIFACT_TAB_LABELS` with:

```typescript
const ARTIFACT_TAB_LABELS: Record<ArtifactTab, string> = {
  Review: BUILDER_ARTIFACT_LABELS.review,
  Spec: BUILDER_ARTIFACT_LABELS.semanticDraft,
  Source: BUILDER_ARTIFACT_LABELS.source,
  Preview: BUILDER_ARTIFACT_LABELS.preview,
  Trace: BUILDER_ARTIFACT_LABELS.trace,
}
```

Replace panel title and subtitle with:

```tsx
<div className="text-[12px] font-semibold text-1">{BUILDER_ARTIFACT_LABELS.panel}</div>
<div className="mt-0.5 truncate text-[11px] text-3">
  {BUILDER_ARTIFACT_LABELS.subtitle}
</div>
```

- [ ] **Step 4: Update review and Spec copy**

Change review section label:

```tsx
<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">建设摘要</div>
```

Change publish status label:

```tsx
<div className="font-semibold text-1">发布到语义中心检查</div>
```

In `ArtifactSpecPanel`, use:

```tsx
<h3 className="m-0 text-[15px] font-semibold text-1">{BUILDER_ARTIFACT_LABELS.advancedSemanticConfigTitle}</h3>
<p className="mt-1 text-[12px] leading-5 text-3">
  {BUILDER_ARTIFACT_LABELS.advancedSemanticConfigDescription}
</p>
```

Use the new full semantic draft label:

```tsx
<label htmlFor="modeling-full-raw-spec" className="text-[12.5px] font-semibold text-1">
  {BUILDER_ARTIFACT_LABELS.fullSemanticDraftLabel}
</label>
```

```tsx
aria-label={BUILDER_ARTIFACT_LABELS.fullSemanticDraftLabel}
```

Use new button labels:

```tsx
<Sparkles size={12} /> {BUILDER_ARTIFACT_LABELS.askAiEdit}
```

```tsx
<Save size={12} /> {BUILDER_ARTIFACT_LABELS.saveAdvancedSemanticConfig}
```

- [ ] **Step 5: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS or only action/publish copy tests fail, which are handled in Task 6.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: reframe semantic artifact review panel"
```

## 7. Task 6: Align Actions And Consumer Validation

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Update action and publish tests**

Rename and update the save action tests:

```typescript
it('阻断确认全部清空后「生成语义资产」按钮可用 -> 调 saveProposal', async () => {
  activeSessionFixture = {
    ...ANALYZED_SESSION,
    workbench_state: {
      ...ANALYZED_SESSION.workbench_state,
      required_confirmations: [],
    },
  }
  renderAt('/semantic/modeling-copilot/session_1')

  fireEvent.click(within(screen.getByTestId('chat-next-action')).getByRole('button', { name: /生成语义资产/ }))
  await waitFor(() => expect(saveProposal).toHaveBeenCalledWith({ sessionId: 'session_1' }))
})
```

In the Cube draft test, use:

```typescript
const applyBtn = screen.getByRole('button', { name: /生成语义资产/ })
```

In the sandbox test, use:

```typescript
fireEvent.click(within(screen.getByTestId('chat-next-action')).getByRole('button', { name: /可用性预演/ }))
```

Update publish button selectors in both publish tests:

```typescript
fireEvent.click(screen.getByRole('button', { name: /发布到语义中心/ }))
```

- [ ] **Step 2: Update consumer validation test**

Rename the review test:

```typescript
it('Review 展示发布到语义中心检查与发布后消费者验证状态', () => {
```

Use consumer-neutral publish gate fixture:

```typescript
publish_gate: {
  state: 'published',
  label: '发布门禁已通过',
  steps: [
    { id: 'semantic-draft', label: '语义草案完整', status: 'passed', description: '语义草案已保存' },
    { id: 'sandbox', label: '可用性预演', status: 'passed', description: '草稿预演通过' },
    { id: 'semantic-center', label: '语义中心生效', status: 'passed', description: '发布资产已进入语义中心快照' },
  ],
},
post_publish_validation: {
  status: 'passed',
  label: '样例问答验收通过',
  sample_question: '最近 7 天学生评论数按学校汇总',
  runtime_route: 'student_comment_cube',
  result_summary: 'Data Agent 样例已命中 student_comment_cube，BI 和数据分析可继续按同一语义资产验证。',
},
```

Assert:

```typescript
expect(within(artifacts).getByText('发布到语义中心检查')).toBeInTheDocument()
expect(within(artifacts).getByText('发布后消费者验证')).toBeInTheDocument()
expect(within(artifacts).getByText(/语义中心路由/)).toBeInTheDocument()
expect(within(artifacts).getByText(/BI 和数据分析/)).toBeInTheDocument()
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: FAIL because current action labels still use old copy.

- [ ] **Step 4: Import action and validation copy**

In `ModelingAgent.tsx`, add:

```typescript
import { BUILDER_ACTION_COPY, CONSUMER_VALIDATION_COPY } from './builderCopy'
```

Change `primaryActionLabel`:

```typescript
function primaryActionLabel(input: {
  saving: boolean
  publishing: boolean
  updatingAdvancedSemanticConfig: boolean
}): string {
  if (input.saving) return BUILDER_ACTION_COPY.saving
  if (input.publishing) return BUILDER_ACTION_COPY.publishing
  if (input.updatingAdvancedSemanticConfig) return BUILDER_ACTION_COPY.updatingAdvancedSemanticConfig
  return '发送'
}
```

- [ ] **Step 5: Update ChatNextActionCard**

Change title and detail:

```typescript
const title = showApply ? BUILDER_ACTION_COPY.saveTitle : BUILDER_ACTION_COPY.sandboxTitle
const detail = showApply
  ? cubeDraftPending
    ? '会把当前 Cube 草稿保存为待发布语义资产；保存前不会进入语义中心发布快照。'
    : '会把当前语义草案保存为待发布语义资产；下一步再确认发布到语义中心。'
  : '预演只校验草稿能否支撑样例问题，不写入语义中心发布快照。'
```

Change buttons:

```tsx
<FlaskConical size={13} /> {BUILDER_ACTION_COPY.sandboxButton}
```

```tsx
<Save size={13} /> {BUILDER_ACTION_COPY.saveButton}
```

- [ ] **Step 6: Update publish receipt and validation panel**

In `ProposalReceiptCard`, change the publish button:

```tsx
<Rocket size={12} /> {BUILDER_ACTION_COPY.publishButton}
```

Change the published receipt sentence to:

```tsx
语义资产已发布到语义中心。Data Agent、BI、数据分析等消费者可以基于同一发布快照做可用性验证。
```

In `PostPublishValidationPanel`, change the section title and route:

```tsx
<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
  {CONSUMER_VALIDATION_COPY.sectionTitle}
</div>
```

```tsx
<div>样例问题：{stringValue(validation.sample_question) || CONSUMER_VALIDATION_COPY.noQuestion}</div>
<div>
  {CONSUMER_VALIDATION_COPY.routeLabel}：<code className="font-mono text-1">{runtimeRoute}</code>
</div>
<div className="leading-5 text-2">
  {stringValue(validation.result_summary) || CONSUMER_VALIDATION_COPY.summaryFallback}
</div>
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: align semantic builder publish language"
```

## 8. Task 7: Add Drift Guard Tests

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`

- [ ] **Step 1: Add page-level destination guard**

Add this test after the first empty-state test:

```typescript
it('不把 Data Agent 表达成语义建设终点', () => {
  renderAt('/semantic/modeling-copilot/new')

  expect(screen.queryByText(/发布给 Data Agent/)).not.toBeInTheDocument()
  expect(screen.queryByText(/正式 Data Agent runtime/)).not.toBeInTheDocument()
  expect(screen.getByText(/发布到语义中心后供 Data Agent、BI、数据分析等消费者使用/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "test: guard semantic builder terminology"
```

## 9. Task 8: P0 Verification

**Files:**

- No source file changes expected.

- [ ] **Step 1: Run changed validation detector**

Run:

```bash
make verify-detect
```

Expected: output recommends frontend / docs or semantic verification.

- [ ] **Step 2: Run minimum changed validation**

Run:

```bash
make verify-changed
```

Expected: PASS.

If browser smoke fails only because the local server is not running, run this focused fallback and record the smoke limitation:

```bash
cd frontend && npm run test:unit -- src/v2/layout/navigation.test.ts src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
make verify-docs
```

Expected: focused unit tests and docs verification PASS.

- [ ] **Step 3: Browser check the new page**

Open:

```text
http://localhost:81/semantic/modeling-copilot/new
```

Check:

- Navigation shows “语义冷启动”.
- Empty-state title is “从数仓数据生成可发布的语义资产”.
- Subtitle contains “发布到语义中心” and “Data Agent、BI、数据分析”.
- First screen does not show `raw_spec`, `runtime`, `readiness`, or `Proposal`.

- [ ] **Step 4: Browser check an existing session**

Open:

```text
http://localhost:81/semantic/modeling-copilot/modeling_session_fa9f94cb46ad4c0f955c3b714229ccab
```

Check:

- Right panel title is “资产审阅”.
- Tabs are “建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录”.
- Main action is “生成语义资产” or “发布到语义中心”.
- Consumer validation treats Data Agent, BI, and 数据分析 as consumers.

- [ ] **Step 5: Save screenshots**

Save screenshots:

```text
/tmp/cubic3-semantic-builder-p0-new.png
/tmp/cubic3-semantic-builder-p0-session.png
```

Expected: screenshots clearly show P0 language.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
```

Expected: only P0 files changed.

## 10. Self-Review Checklist

Spec coverage:

- Publish target is semantic center: Tasks 1, 2, 4, 6, 7.
- Data Agent is a consumer: Tasks 1, 2, 6, 7.
- Navigation and first screen align with cold start: Tasks 3, 4.
- Right panel uses product task language: Task 5.
- Existing bottom empty-state tests and publish selectors are updated: Tasks 4 and 6.

Type consistency:

- `BUILDER_EMPTY_STATE`, `BUILDER_EXAMPLES`, `BUILDER_ACTION_COPY`, `BUILDER_ARTIFACT_LABELS`, and `CONSUMER_VALIDATION_COPY` are defined only in `builderCopy.ts`.
- `ArtifactTab` stays `Review | Spec | Source | Preview | Trace` in P0.
- No new backend fields are introduced in P0.
