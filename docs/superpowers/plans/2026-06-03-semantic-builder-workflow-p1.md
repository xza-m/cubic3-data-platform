# Semantic Builder Workflow P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 P0 口径治理完成后，为语义冷启动 Builder 增加结构化步骤进度、字段候选审阅 tab、步骤级 AI actions，并把批量 AI Modeling Agent 与开发者验证工件固定为后续契约。

**Architecture:** P1 仍复用现有 `/semantic/modeling-copilot/*` API 和 `SemanticModelingCopilotSession`，只新增前端展示模型与 copy 配置。Builder stepper 根据已有 session workbench state 推导阶段；字段候选只读取 `field_candidate_trace`，不把 `source_candidates` 误当字段候选；AI actions 只把提示词写入 composer，用户确认后才发送。

**Tech Stack:** React、TypeScript、Vite、Vitest、Testing Library、lucide-react、Markdown PRD、Makefile verification。

---

## 0. Scope Check

本计划必须在 `2026-06-03-semantic-cold-start-builder-p0-alignment.md` 完成后执行。

本计划不做后端 schema/API 迁移，不实现 `DeveloperValidationPanel` UI，因为当前 `post_publish_validation` 还没有稳定的 `compiled_sql / impact_summary / release_diff` 契约。P1 只在 PRD 中固定开发者验证字段契约，等后端或 adapter 补齐后再开实现计划。

方案选择：

- 方案 A：继续 Chat-only。实现最少，但无法降低冷启动流程的认知负担，不采纳。
- 方案 B：增加 stepper、字段候选 tab、步骤级 AI actions。推荐，能在不改后端的前提下形成 Builder-first。
- 方案 C：直接做批量 AI Modeling Agent。需要队列、权限、批量发布和回滚，不符合 YAGNI，作为 P2 文档模式保留。

工程原则：

- KISS：只做前端结构和文档契约，不做后端迁移。
- YAGNI：开发者验证 UI 和批量 Agent 后置。
- SOLID：FieldCandidate 仍是候选层，不成为运行时真相。
- DRY：stepper 和 AI actions 共用 `BuilderStepId`。

## 1. File Map

新增文件：

- `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.ts`
  - Builder 步骤定义和 active step 推导。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts`
  - 覆盖步骤顺序、source candidate 不等于 field candidate、field trace 推导、publish 优先级。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.ts`
  - 每个 Builder step 对应的 AI 辅助动作。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts`
  - 防止 AI action 直接发布或绕过人工确认。
- `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`
  - 字段候选审阅展示组件。
- `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`
  - 字段候选组件单测。

修改文件：

- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
  - 给 P1 增加字段候选 tab 文案。
- `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`
  - 更新面板文案契约。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
  - 接入 stepper、字段候选 tab 和 AI action panel。
- `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
  - 覆盖 stepper、字段候选 tab 和 AI action 交互。
- `docs/prd/semantic_cold_start_builder_prd.md`
  - 增加 P2 批量 AI Modeling Agent 和开发者验证契约。
- `docs/prd/README.md`
  - 更新 PRD 说明。

## 2. Task 1: Add Builder Step Model

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { BUILDER_STEPS, getActiveBuilderStepId } from './builderSteps'
import type { SemanticModelingCopilotSession } from '@v2/api/semantic'

const baseSession: SemanticModelingCopilotSession = {
  id: 'session_builder',
  user_goal: '基于学生评论事实表建设评论数语义资产',
  entry_type: 'business_question',
  status: 'active',
  state: 'session_created',
  workbench_state: {},
}

describe('semantic builder steps', () => {
  it('defines the developer workflow in the expected order', () => {
    expect(BUILDER_STEPS.map((step) => step.label)).toEqual([
      '建设范围',
      '来源证据',
      '字段候选',
      '语义草案',
      '发布校验',
      '发布结果',
    ])
  })

  it('keeps source candidates in source evidence instead of field candidates', () => {
    const session: SemanticModelingCopilotSession = {
      ...baseSession,
      workbench_state: {
        source_candidates: [{ id: 'table:student_comment', title: '学生评论事实表' }],
      },
    }

    expect(getActiveBuilderStepId(session)).toBe('source_evidence')
  })

  it('moves to field candidates only when field candidate trace exists', () => {
    const session: SemanticModelingCopilotSession = {
      ...baseSession,
      workbench_state: {
        field_candidate_trace: {
          candidate_set_id: 'fcs_student_comment',
          candidates: [{ id: 'measure_comment_count', field: 'comment_id', role: 'measure' }],
        },
      },
    }

    expect(getActiveBuilderStepId(session)).toBe('field_candidates')
  })

  it('moves to semantic draft when a reviewable spec exists', () => {
    const session: SemanticModelingCopilotSession = {
      ...baseSession,
      workbench_state: {
        raw_spec: { spec_version: 'v1', cube: { name: 'student_comment_cube' } },
      },
    }

    expect(getActiveBuilderStepId(session)).toBe('semantic_draft')
  })

  it('prioritizes publish check when a proposal exists', () => {
    const session: SemanticModelingCopilotSession = {
      ...baseSession,
      current_proposal_id: 'proposal_1',
      workbench_state: {
        raw_spec: { spec_version: 'v1', cube: { name: 'student_comment_cube' } },
      },
    }

    expect(getActiveBuilderStepId(session)).toBe('publish_check')
  })

  it('moves to publish result after publish result exists', () => {
    const session: SemanticModelingCopilotSession = {
      ...baseSession,
      current_proposal_id: 'proposal_1',
      workbench_state: {
        publish_result: { status: 'published', proposal_id: 'proposal_1' },
      },
    }

    expect(getActiveBuilderStepId(session)).toBe('publish_result')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts
```

Expected: FAIL with `Failed to resolve import "./builderSteps"`.

- [ ] **Step 3: Add step model**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.ts`:

```typescript
import type { SemanticModelingCopilotSession } from '@v2/api/semantic'

export type BuilderStepId =
  | 'scope'
  | 'source_evidence'
  | 'field_candidates'
  | 'semantic_draft'
  | 'publish_check'
  | 'publish_result'

export interface BuilderStep {
  id: BuilderStepId
  label: string
  description: string
}

export const BUILDER_STEPS: BuilderStep[] = [
  {
    id: 'scope',
    label: '建设范围',
    description: '确认业务域、建设目标和候选数仓表。',
  },
  {
    id: 'source_evidence',
    label: '来源证据',
    description: '审阅物理表、字段、样本、血缘和已有语义资产证据。',
  },
  {
    id: 'field_candidates',
    label: '字段候选',
    description: '确认指标、维度、时间字段、实体键、聚合方式和风险。',
  },
  {
    id: 'semantic_draft',
    label: '语义草案',
    description: '审阅待发布的 Cube、Ontology、Binding 和 Policy 草案。',
  },
  {
    id: 'publish_check',
    label: '发布校验',
    description: '运行编译、样例查询、消费者验证和影响面检查。',
  },
  {
    id: 'publish_result',
    label: '发布结果',
    description: '查看语义中心发布状态、消费者可用性和审计记录。',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasReviewableSpec(session: SemanticModelingCopilotSession): boolean {
  const rawSpec = session.workbench_state?.raw_spec
  if (!isRecord(rawSpec)) return false
  return Boolean(rawSpec.cube || rawSpec.cubes || rawSpec.spec_version)
}

function hasFieldCandidateTrace(session: SemanticModelingCopilotSession): boolean {
  const state = session.workbench_state ?? {}
  const rawSpec = isRecord(state.raw_spec) ? state.raw_spec : {}
  const cube = isRecord(rawSpec.cube) ? rawSpec.cube : {}
  const cubes = Array.isArray(rawSpec.cubes) ? rawSpec.cubes : []
  const firstCube = isRecord(cubes[0]) ? cubes[0] : {}
  const traces = [
    state.field_candidate_trace,
    cube.field_candidate_trace,
    firstCube.field_candidate_trace,
  ]
  return traces.some((trace) => isRecord(trace) && typeof trace.candidate_set_id === 'string')
}

function hasSourceEvidence(session: SemanticModelingCopilotSession): boolean {
  const state = session.workbench_state ?? {}
  return Boolean(
    state.source_evidence ||
      (Array.isArray(state.evidence_summary) && state.evidence_summary.length > 0) ||
      (Array.isArray(state.source_candidates) && state.source_candidates.length > 0),
  )
}

export function getActiveBuilderStepId(session: SemanticModelingCopilotSession | null | undefined): BuilderStepId {
  if (!session) return 'scope'
  if (session.workbench_state?.publish_result) return 'publish_result'
  if (session.current_proposal_id || session.workbench_state?.publish_gate) return 'publish_check'
  if (hasReviewableSpec(session)) return 'semantic_draft'
  if (hasFieldCandidateTrace(session)) return 'field_candidates'
  if (hasSourceEvidence(session)) return 'source_evidence'
  return 'scope'
}
```

- [ ] **Step 4: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.ts frontend/src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts
git commit -m "feat: add semantic builder step model"
```

## 3. Task 2: Render Builder Stepper

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Add page test**

In an existing session test, add:

```typescript
const stepper = screen.getByTestId('semantic-builder-stepper')
expect(within(stepper).getByText('建设范围')).toBeInTheDocument()
expect(within(stepper).getByText('来源证据')).toBeInTheDocument()
expect(within(stepper).getByText('字段候选')).toBeInTheDocument()
expect(within(stepper).getByText('语义草案')).toBeInTheDocument()
expect(within(stepper).getByText('发布校验')).toBeInTheDocument()
expect(within(stepper).getByText('发布结果')).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: FAIL because `semantic-builder-stepper` is not rendered.

- [ ] **Step 3: Add stepper component**

In `ModelingAgent.tsx`, add:

```typescript
import { BUILDER_STEPS, getActiveBuilderStepId, type BuilderStepId } from './builderSteps'
```

Add this component in the file:

```tsx
function BuilderStepper({ activeStepId }: { activeStepId: BuilderStepId }) {
  const activeIndex = BUILDER_STEPS.findIndex((step) => step.id === activeStepId)
  return (
    <nav
      data-testid="semantic-builder-stepper"
      aria-label="语义冷启动进度"
      className="grid grid-cols-6 gap-1 border-b px-4 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      {BUILDER_STEPS.map((step, index) => {
        const done = index < activeIndex
        const active = step.id === activeStepId
        return (
          <div
            key={step.id}
            className="min-w-0 rounded-[8px] border px-2 py-1.5"
            style={{
              borderColor: active ? 'var(--accent)' : 'var(--border)',
              background: active ? 'var(--accent-soft)' : done ? 'var(--bg-surface-2)' : 'transparent',
            }}
          >
            <div className="truncate text-[12px] font-semibold text-1">{step.label}</div>
            <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-3">{step.description}</div>
          </div>
        )
      })}
    </nav>
  )
}
```

Render it at the top of the main chat workspace container, above the conversation stream:

```tsx
<BuilderStepper activeStepId={getActiveBuilderStepId(session)} />
```

- [ ] **Step 4: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: render semantic builder workflow stepper"
```

## 4. Task 3: Add Field Candidate Review Tab

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Write component test**

Create `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldCandidateReview, type FieldCandidateReviewItem } from './FieldCandidateReview'

const candidates: FieldCandidateReviewItem[] = [
  {
    id: 'measure_comment_count',
    field: 'comment_id',
    label: '评论数',
    role: 'measure',
    aggregation: 'count',
    semanticType: 'number',
    confidence: 0.92,
    evidence: '字段为评论主键，可按 count 聚合作为评论数。',
    risk: 'low',
  },
  {
    id: 'dimension_school',
    field: 'comment_school_name',
    label: '学校',
    role: 'dimension',
    semanticType: 'string',
    confidence: 0.88,
    evidence: '字段名和样本均指向学校名称。',
    risk: 'medium',
  },
]

describe('FieldCandidateReview', () => {
  it('renders field candidate evidence for modeling engineers', () => {
    render(<FieldCandidateReview candidates={candidates} />)

    expect(screen.getByText('字段候选审阅')).toBeInTheDocument()
    expect(screen.getByText('评论数')).toBeInTheDocument()
    expect(screen.getByText('comment_id')).toBeInTheDocument()
    expect(screen.getByText('measure')).toBeInTheDocument()
    expect(screen.getByText('count')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText(/评论主键/)).toBeInTheDocument()

    const school = screen.getByText('学校').closest('[data-testid="field-candidate-row"]')
    expect(school).not.toBeNull()
    expect(within(school!).getByText('medium')).toBeInTheDocument()
  })

  it('renders an empty state when no candidates exist yet', () => {
    render(<FieldCandidateReview candidates={[]} />)

    expect(screen.getByText('等待字段候选')).toBeInTheDocument()
    expect(screen.getByText(/先确认来源证据/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
```

Expected: FAIL with `Failed to resolve import "./FieldCandidateReview"`.

- [ ] **Step 3: Add component**

Create `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`:

```tsx
import { Chip, type ChipTone } from '@v2/components/ui'

export interface FieldCandidateReviewItem {
  id: string
  field: string
  label: string
  role: 'measure' | 'dimension' | 'time' | 'entity' | 'unknown' | string
  aggregation?: string
  semanticType?: string
  confidence?: number
  evidence?: string
  risk?: 'low' | 'medium' | 'high' | string
}

function formatConfidence(value?: number): string {
  if (typeof value !== 'number') return '待确认'
  return `${Math.round(value * 100)}%`
}

function riskTone(risk?: string): ChipTone {
  if (risk === 'high') return 'danger'
  if (risk === 'medium') return 'warning'
  if (risk === 'low') return 'success'
  return 'neutral'
}

export function FieldCandidateReview({ candidates }: { candidates: FieldCandidateReviewItem[] }) {
  if (candidates.length === 0) {
    return (
      <section
        data-testid="field-candidate-review"
        className="rounded-[10px] border px-3 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="text-[13px] font-semibold text-1">等待字段候选</div>
        <p className="mt-1 text-[12px] leading-5 text-3">
          先确认来源证据，AI 会基于字段、样本、血缘和已有语义资产生成候选。
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid="field-candidate-review"
      className="rounded-[10px] border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[13px] font-semibold text-1">字段候选审阅</div>
        <p className="mt-1 text-[11.5px] leading-5 text-3">
          逐项确认字段角色、聚合方式、语义类型、证据和风险，确认后再生成语义草案。
        </p>
      </div>
      <div className="max-h-[520px] overflow-y-auto scroll-thin">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            data-testid="field-candidate-row"
            className="grid grid-cols-[minmax(120px,1.2fr)_88px_88px_72px] gap-2 border-b px-3 py-2 last:border-b-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-1">{candidate.label}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-3">{candidate.field}</div>
              {candidate.evidence ? <div className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-3">{candidate.evidence}</div> : null}
            </div>
            <div className="flex items-start pt-0.5">
              <Chip>{candidate.role}</Chip>
            </div>
            <div className="pt-1 text-[12px] text-2">{candidate.aggregation || candidate.semanticType || '待确认'}</div>
            <div className="flex flex-col items-end gap-1 pt-0.5">
              <span className="text-[12px] font-semibold text-1">{formatConfidence(candidate.confidence)}</span>
              <Chip tone={riskTone(candidate.risk)}>{candidate.risk || 'unknown'}</Chip>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run component test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Update builder copy for the new tab**

In `builderCopy.ts`, change:

```typescript
subtitle: '建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录',
```

to:

```typescript
subtitle: '建设摘要 / 字段候选 / 语义草案 / 来源证据 / 可用性验证 / 审计记录',
```

Add this key:

```typescript
fields: '字段候选',
```

Update `builderCopy.test.ts` to assert:

```typescript
expect(BUILDER_ARTIFACT_LABELS.subtitle).toContain('字段候选')
expect(BUILDER_ARTIFACT_LABELS.fields).toBe('字段候选')
```

- [ ] **Step 6: Add field candidate tab to page**

In `ModelingAgent.tsx`, import:

```typescript
import { FieldCandidateReview, type FieldCandidateReviewItem } from './components/FieldCandidateReview'
```

Change:

```typescript
type ArtifactTab = 'Review' | 'Spec' | 'Source' | 'Preview' | 'Trace'
```

to:

```typescript
type ArtifactTab = 'Review' | 'Fields' | 'Spec' | 'Source' | 'Preview' | 'Trace'
```

Change labels:

```typescript
const ARTIFACT_TAB_LABELS: Record<ArtifactTab, string> = {
  Review: BUILDER_ARTIFACT_LABELS.review,
  Fields: BUILDER_ARTIFACT_LABELS.fields,
  Spec: BUILDER_ARTIFACT_LABELS.spec,
  Source: BUILDER_ARTIFACT_LABELS.source,
  Preview: BUILDER_ARTIFACT_LABELS.preview,
  Trace: BUILDER_ARTIFACT_LABELS.trace,
}
```

Change tab order and grid columns:

```tsx
<div className="mt-3 grid grid-cols-6 gap-1 text-[11px]">
  {(['Review', 'Fields', 'Spec', 'Source', 'Preview', 'Trace'] as ArtifactTab[]).map((tab) => {
```

Add the field tab render before Spec:

```tsx
{activeTab === 'Fields' ? (
  <FieldCandidateReview candidates={fieldCandidateItemsForSession(session)} />
) : null}
```

Add this helper in `ModelingAgent.tsx` near other field candidate helpers:

```typescript
function fieldCandidateItemsForSession(session: SemanticModelingCopilotSession | null): FieldCandidateReviewItem[] {
  if (!session) return []
  const trace = fieldCandidateTraceForReview(session, undefined)
  const candidates = Array.isArray(trace?.candidates) ? trace.candidates : []
  return candidates.map((item, index) => ({
    id: stringValue(item.id) || `candidate_${index}`,
    field: stringValue(item.field) || stringValue(item.name) || `field_${index + 1}`,
    label: stringValue(item.label) || stringValue(item.field) || `字段 ${index + 1}`,
    role: stringValue(item.role) || 'unknown',
    aggregation: stringValue(item.aggregation) || stringValue(item.agg),
    semanticType: stringValue(item.semantic_type) || stringValue(item.type),
    confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    evidence: stringValue(item.evidence) || stringValue(item.reason),
    risk: stringValue(item.risk) || stringValue(item.risk_level),
  }))
}
```

- [ ] **Step 7: Update page tests**

In the artifact panel test, update subtitle expectation:

```typescript
expect(within(artifacts).getByText('建设摘要 / 字段候选 / 语义草案 / 来源证据 / 可用性验证 / 审计记录')).toBeInTheDocument()
expect(within(artifacts).getByRole('button', { name: '字段候选' })).toBeInTheDocument()
```

Add field candidate tab test:

```typescript
it('字段候选 tab 展示候选字段明细', () => {
  activeSessionFixture = {
    ...ANALYZED_SESSION,
    workbench_state: {
      ...ANALYZED_SESSION.workbench_state,
      raw_spec: {
        ...ANALYZED_SESSION.workbench_state.raw_spec,
        cube: {
          ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<string, unknown>),
          field_candidate_trace: {
            candidate_set_id: 'fcs_student_comment',
            candidates: [
              {
                id: 'measure_comment_count',
                field: 'comment_id',
                label: '评论数',
                role: 'measure',
                aggregation: 'count',
                confidence: 0.92,
                evidence: '字段为评论主键，可按 count 聚合作为评论数。',
                risk: 'low',
              },
            ],
          },
        },
      },
    },
  }
  renderAt('/semantic/modeling-copilot/session_1')

  const artifacts = screen.getByTestId('artifact-panel')
  fireEvent.click(within(artifacts).getByRole('button', { name: '字段候选' }))

  expect(within(artifacts).getByTestId('field-candidate-review')).toBeInTheDocument()
  expect(within(artifacts).getByText('字段候选审阅')).toBeInTheDocument()
  expect(within(artifacts).getByText('评论数')).toBeInTheDocument()
  expect(within(artifacts).getByText('comment_id')).toBeInTheDocument()
  expect(within(artifacts).getByText('92%')).toBeInTheDocument()
})
```

- [ ] **Step 8: Run tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.ts frontend/src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: add field candidate review tab"
```

## 5. Task 4: Add Step-Scoped AI Actions

**Files:**

- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`

- [ ] **Step 1: Write action tests**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { getBuilderAiActions } from './builderAiActions'

describe('builder AI actions', () => {
  it('offers scoped actions for each builder step', () => {
    expect(getBuilderAiActions('scope').map((item) => item.label)).toEqual(['推荐候选表', '解释建设范围'])
    expect(getBuilderAiActions('field_candidates').map((item) => item.label)).toEqual(['生成字段候选', '解释字段风险'])
    expect(getBuilderAiActions('publish_check').map((item) => item.label)).toEqual(['修复发布阻塞', '生成消费者验证问题'])
  })

  it('keeps AI as assistant instead of publisher', () => {
    const allCopy = getBuilderAiActions('publish_check')
      .flatMap((item) => [item.label, item.prompt])
      .join('\n')

    expect(allCopy).not.toContain('直接发布')
    expect(allCopy).toContain('生成消费者验证问题')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts
```

Expected: FAIL with `Failed to resolve import "./builderAiActions"`.

- [ ] **Step 3: Add AI action module**

Create `frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.ts`:

```typescript
import type { BuilderStepId } from './builderSteps'

export interface BuilderAiAction {
  id: string
  label: string
  prompt: string
}

const ACTIONS: Record<BuilderStepId, BuilderAiAction[]> = {
  scope: [
    {
      id: 'recommend_sources',
      label: '推荐候选表',
      prompt: '请基于当前建设目标推荐候选数仓表，并说明覆盖度、粒度和风险。',
    },
    {
      id: 'explain_scope',
      label: '解释建设范围',
      prompt: '请解释当前语义资产包的业务域、建设目标、核心指标和需要补充的信息。',
    },
  ],
  source_evidence: [
    {
      id: 'summarize_evidence',
      label: '总结来源证据',
      prompt: '请总结当前来源表的字段、样本、血缘、使用记录和已有语义资产证据。',
    },
    {
      id: 'compare_sources',
      label: '比较候选来源',
      prompt: '请比较候选来源表的粒度、字段覆盖、数据质量和语义建设风险。',
    },
  ],
  field_candidates: [
    {
      id: 'generate_field_candidates',
      label: '生成字段候选',
      prompt: '请基于来源证据生成字段候选，标注指标、维度、时间字段、实体键、聚合方式、置信度和风险。',
    },
    {
      id: 'explain_field_risk',
      label: '解释字段风险',
      prompt: '请解释低置信度字段、疑似错分字段、聚合风险和需要人工确认的口径。',
    },
  ],
  semantic_draft: [
    {
      id: 'generate_semantic_draft',
      label: '生成语义草案',
      prompt: '请基于已确认字段候选生成 Cube、Ontology、Binding 和 Policy 草案，并列出 diff。',
    },
    {
      id: 'complete_business_terms',
      label: '补齐业务口径',
      prompt: '请补齐指标定义、过滤条件、命名建议、同义词和业务对象说明。',
    },
  ],
  publish_check: [
    {
      id: 'fix_publish_blockers',
      label: '修复发布阻塞',
      prompt: '请解释发布校验阻塞项，给出最小修改建议，不要替我发布。',
    },
    {
      id: 'generate_consumer_questions',
      label: '生成消费者验证问题',
      prompt: '请生成 Data Agent、BI、数据分析可共用的样例问题，用于验证语义中心发布后的可用性。',
    },
  ],
  publish_result: [
    {
      id: 'summarize_release',
      label: '总结发布结果',
      prompt: '请总结本次发布到语义中心的资产、影响面、消费者验证状态和后续治理建议。',
    },
  ],
}

export function getBuilderAiActions(stepId: BuilderStepId): BuilderAiAction[] {
  return ACTIONS[stepId]
}
```

- [ ] **Step 4: Add action panel to page**

In `ModelingAgent.tsx`, import:

```typescript
import { getBuilderAiActions, type BuilderAiAction } from './builderAiActions'
```

Add component:

```tsx
function BuilderAiActionPanel({
  activeStepId,
  onUseAction,
}: {
  activeStepId: BuilderStepId
  onUseAction: (action: BuilderAiAction) => void
}) {
  const actions = getBuilderAiActions(activeStepId)
  return (
    <section
      data-testid="builder-ai-actions"
      className="rounded-[10px] border px-3 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <div className="text-[12px] font-semibold text-1">AI 建模助手</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <Button key={action.id} size="sm" variant="default" onClick={() => onUseAction(action)}>
            <Sparkles size={12} /> {action.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
```

Add handler inside `ModelingAgent`:

```typescript
const handleUseBuilderAiAction = useCallback((action: BuilderAiAction) => {
  setDraft(action.prompt)
}, [])
```

Compute active step once:

```typescript
const activeBuilderStepId = getActiveBuilderStepId(session)
```

Render the panel below the stepper:

```tsx
<BuilderAiActionPanel activeStepId={activeBuilderStepId} onUseAction={handleUseBuilderAiAction} />
```

- [ ] **Step 5: Add page tests**

Add in existing session test:

```typescript
const aiActions = screen.getByTestId('builder-ai-actions')
expect(within(aiActions).getByText('AI 建模助手')).toBeInTheDocument()
expect(within(aiActions).getByRole('button', { name: /生成语义草案|生成字段候选|推荐候选表/ })).toBeInTheDocument()
```

Add click test:

```typescript
it('点击步骤 AI 动作会把提示词写入输入框，等待用户确认发送', () => {
  activeSessionFixture = {
    ...ANALYZED_SESSION,
    workbench_state: {
      ...ANALYZED_SESSION.workbench_state,
      field_candidate_trace: {
        candidate_set_id: 'fcs_student_comment',
        candidates: [{ id: 'measure_comment_count', field: 'comment_id', role: 'measure' }],
      },
    },
  }
  renderAt('/semantic/modeling-copilot/session_1')

  fireEvent.click(screen.getByRole('button', { name: /生成字段候选/ }))

  expect(screen.getByLabelText('建模目标')).toHaveValue(
    '请基于来源证据生成字段候选，标注指标、维度、时间字段、实体键、聚合方式、置信度和风险。',
  )
  expect(sendMessage).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.ts frontend/src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: add step-scoped semantic AI actions"
```

## 6. Task 5: Document P2 Modes And Developer Validation Contract

**Files:**

- Modify: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/prd/README.md`

- [ ] **Step 1: Add product modes and contract to PRD**

In `docs/prd/semantic_cold_start_builder_prd.md`, insert this section after `## 7. AI 介入点`:

```markdown
## 8. 产品模式

### 8.1 默认模式：Builder 内嵌 AI

默认模式面向单个语义资产包冷启动。数据建模工程师在结构化 Builder 中确认建设范围、来源证据、字段候选、语义草案、发布校验和发布结果。AI 作为每一步的助手，生成候选、解释证据、修复阻塞和补齐验证问题，但不会直接发布语义真相。

适用场景：

- 单张事实表或少量表的语义冷启动。
- 新指标、新业务对象、新绑定的人工审阅发布。
- 已有消费者问题回流后的语义补齐。

### 8.2 高级模式：批量 AI Modeling Agent

高级模式面向一个业务域的批量建设。AI Modeling Agent 可以扫描业务域、拆分资产包、生成候选语义模型、运行校验并形成 Proposal Queue。人负责审阅、接受、退回和发布。

Agent 可做：

- 扫描业务域和候选表。
- 规划语义资产包拆分。
- 批量生成字段候选和语义草案。
- 对低风险项形成批量确认建议。
- 生成发布校验和消费者验证队列。

Agent 不可做：

- 不直接发布到语义中心。
- 不绕过字段候选审阅。
- 不覆盖已发布资产而不生成 diff。
- 不绕过发布门禁、审计和回滚记录。

## 9. 开发者验证契约

开发者验证面向数据开发工程师和语义资产 Owner，用于在发布前后回放可执行证据。P1 只固定契约，不实现 UI；当后端或 adapter 能稳定提供下列字段后，再新增开发者验证面板。

建议契约：

```json
{
  "compiled_sql": "SELECT COUNT(*) AS comment_count FROM dw.dwd_comment",
  "sample_question": "最近 7 天学生评论数按学校汇总",
  "impact_summary": "影响 1 个 Cube、1 个 Ontology、2 个消费者样例",
  "release_diff": "新增 student_comment_cube.measure.comment_count"
}
```

接入原则：

- `compiled_sql` 来自语义编译器或发布校验，不从前端拼接。
- `impact_summary` 来自发布影响分析，不从 UI 文案推断。
- `release_diff` 来自 Proposal / Release diff，不读取临时 raw spec 字符串。
- 没有真实契约前，前端不新增 DeveloperValidationPanel，避免长期空占位。
```

Then renumber the current headings:

```markdown
## 8. 成功指标
```

to:

```markdown
## 10. 成功指标
```

and:

```markdown
## 9. 首期验收
```

to:

```markdown
## 11. 首期验收
```

- [ ] **Step 2: Update PRD index**

In `docs/prd/README.md`, update the semantic builder entry to include:

```markdown
  - 覆盖默认 Builder 内嵌 AI 与 P2 批量 AI Modeling Agent 两种产品模式；发布仍以语义中心为唯一目标
  - 开发者验证面板需等待 `compiled_sql / impact_summary / release_diff` 契约稳定后再实现
```

- [ ] **Step 3: Run docs verification**

Run:

```bash
make verify-docs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/prd/semantic_cold_start_builder_prd.md docs/prd/README.md
git commit -m "docs: define semantic builder p2 modes"
```

## 7. Task 6: P1 Verification

**Files:**

- No source file changes expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/builderSteps.test.ts src/v2/pages/semantic/modeling-copilot/builderAiActions.test.ts src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx src/v2/pages/semantic/modeling-copilot/builderCopy.test.ts src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run changed validation**

Run:

```bash
make verify-changed
```

Expected: PASS.

- [ ] **Step 3: Browser check session**

Open:

```text
http://localhost:81/semantic/modeling-copilot/modeling_session_fa9f94cb46ad4c0f955c3b714229ccab
```

Check:

- Builder stepper appears above the main conversation.
- Right panel includes `字段候选` tab.
- Field candidate tab shows either candidate details or “等待字段候选”.
- AI 建模助手 buttons fill the composer and do not auto-send.

- [ ] **Step 4: Save screenshots**

Save:

```text
/tmp/cubic3-semantic-builder-p1-stepper.png
/tmp/cubic3-semantic-builder-p1-fields.png
```

Expected: screenshots show stepper and field candidate tab.

## 8. Self-Review Checklist

Spec coverage:

- Builder stepper: Tasks 1 and 2.
- Source candidates are not field candidates: Task 1.
- FieldCandidate is a candidate layer only: Task 3.
- Step AI assists but does not publish: Task 4.
- Batch AI Modeling Agent and developer validation are documented but not prematurely implemented: Task 5.

Type consistency:

- `BuilderStepId` is defined only in `builderSteps.ts`.
- `builderAiActions.ts` imports `BuilderStepId` from `builderSteps.ts`.
- `FieldCandidateReview` uses `ChipTone` with `neutral` fallback, never `default`.
- `fieldCandidateItemsForSession` returns `[]` for null session before calling `fieldCandidateTraceForReview`.
- `ArtifactTab` adds `Fields` only in P1.
