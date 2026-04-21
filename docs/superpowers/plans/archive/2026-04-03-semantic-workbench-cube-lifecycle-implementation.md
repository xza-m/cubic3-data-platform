# Semantic Workbench Cube Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把语义中心重构为“工作台负责开发流、Cube 管理负责资产流”的新模型，完成 AI 建模入口迁移、已发布修订链路、路由收口与测试更新。

**Architecture:** 前端以 `/semantic/workbench` 为唯一开发主场，在同一路由内承接起始态、草稿态和开发态；`/semantic/cubes` 回归资产管理页，只展示正式资产并提供“发起修订”入口。后端补齐最小 revision 契约，让已发布 Cube 通过修订草稿回流工作台，同时保持现有 `YAML / PY / 预览` 能力与 `make verify-semantic` 验证链路可持续使用。

**Tech Stack:** React 18、TypeScript、React Router 6、TanStack Query、Vitest、Playwright、Flask Blueprint、Pydantic、仓库根目录 `make verify-semantic`

---

## File Structure

### Frontend routing and page shells

- Modify: `frontend/src/App.tsx`
  - 收口 `/semantic/cubes/new`、`/semantic/cubes/:name/edit` 与 `/semantic/workbench` 的入口关系
- Modify: `frontend/src/components/Layout/AppLayout.tsx`
  - 保持导航文案不变，但确保预加载入口与新页面保持一致
- Modify: `frontend/src/pages/Semantic/DevTools.tsx`
  - 从“开发工具页”升级为“语义工作台”
- Modify: `frontend/src/pages/Semantic/CubeList.tsx`
  - 从“可新建 + 可编辑列表”升级为“资产管理页”
- Modify or deprecate: `frontend/src/pages/Semantic/RelationCanvas.tsx`
  - 从默认新建主入口降为兼容壳层或被工作台内部组件替代

### Frontend workbench decomposition

- Create: `frontend/src/components/Semantic/Workbench/WorkbenchStartPanel.tsx`
  - AI 建模起始页：数据源、表/数据集选择、生成初稿
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchResumePanel.tsx`
  - 最近草稿、最近发布、待处理失败项
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
  - 微调 AI 推荐的指标、维度、日期属性和基本信息
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchHeader.tsx`
  - 顶部上下文条与对象级主动作 `发布`
- Create: `frontend/src/hooks/semantic-ia/useSemanticWorkbench.ts`
  - 聚合起始态、对象态、默认 tab 与 URL 同步逻辑
- Modify: `frontend/src/components/Semantic/DevTools/PlaygroundTab.tsx`
  - 作为 `预览` Tab 继续承接 DSL/编译/执行能力
- Modify: `frontend/src/components/Semantic/DevTools/YamlEditorTab.tsx`
  - 保持“校验/保存”职责，但挂到新工作台容器
- Modify: `frontend/src/components/Semantic/DevTools/PythonPreviewTab.tsx`
  - 保持只读挂载
- Modify: `frontend/src/components/Semantic/DevTools/SemanticEditorEmptyState.tsx`
  - 适配“工作台默认先建模”的空态引导

### Frontend API and asset-management actions

- Modify: `frontend/src/api/semantic.ts`
  - 增加 revision 请求与新工作台状态类型
- Modify: `frontend/src/hooks/semantic-ia/useCubeList.ts`
  - 切换为“资产优先”默认筛选和详情动作
- Modify: `frontend/src/components/Semantic/CubeList/CubePreviewPanel.tsx`
  - 增加 `发起修订`、`废弃`、`查看` 三类动作
- Modify: `frontend/src/components/Semantic/CubeList/cubeListUtils.ts`
  - 调整生命周期文案、默认排序与动作链接

### Backend revision contract

- Modify: `app/interfaces/api/v1/semantic.py`
  - 新增 `POST /api/v1/semantic/cubes/<cube_name>/revisions`
- Modify: `app/application/semantic/cube_modeling_service.py`
  - 增加 `create_revision_draft()`，基于已发布 Cube 生成修订草稿
- Modify if needed: `app/domain/semantic/entities.py`
  - 如果需要显式标记修订来源，在不破坏现有 YAML 的前提下补最小字段

### Tests

- Modify: `frontend/src/pages/Semantic/DevTools.page.test.tsx`
- Modify: `frontend/src/pages/Semantic/CubeList.page.test.tsx`
- Modify: `frontend/src/pages/Semantic/RelationCanvas.page.test.tsx`
- Create: `frontend/src/pages/Semantic/semanticWorkbench.page.test.tsx`
- Modify: `frontend/tests/e2e-node/devtools-browse.spec.ts`
- Modify: `frontend/tests/e2e-node/cube-browse.spec.ts`
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
- Modify: `frontend/tests/e2e/cube_draft_smoke.py`
- Modify: `tests/unit/application/semantic/test_cube_modeling_service.py`
- Modify: `tests/integration/test_semantic_api.py`
- Modify if route coverage changes: `tests/unit/interfaces/api/v1/test_route_coverage.py`

### Docs

- Modify: `docs/semantic_verification.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md`
- Modify if main route wording changes: `frontend/README.md`

## Task 1: Add backend revision draft contract

**Files:**
- Modify: `app/interfaces/api/v1/semantic.py`
- Modify: `app/application/semantic/cube_modeling_service.py`
- Modify: `tests/unit/application/semantic/test_cube_modeling_service.py`
- Modify: `tests/integration/test_semantic_api.py`

- [ ] **Step 1: Write the failing backend tests for revision draft**

```python
def test_create_revision_draft_from_active_cube_returns_draft_copy():
    cube = CubeDefinition(name="answer_records", title="答题记录", status="active", ...)
    repo.save(cube)

    draft = service.create_revision_draft("answer_records")

    assert draft.name == "answer_records"
    assert draft.status == "draft"
    assert draft.title == "答题记录"
```

```python
def test_create_revision_route_returns_created_payload(client):
    response = client.post("/api/v1/semantic/cubes/answer_records/revisions")

    assert response.status_code == 201
    assert response.json["data"]["status"] == "draft"
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run: `pytest tests/unit/application/semantic/test_cube_modeling_service.py tests/integration/test_semantic_api.py -v`

Expected: FAIL because `create_revision_draft` and `/revisions` route do not exist yet.

- [ ] **Step 3: Implement the minimal revision draft service and route**

```python
def create_revision_draft(self, name: str) -> CubeDefinition:
    cube = self._must_get_cube(name)
    if cube.status != "active":
        raise ApplicationException("只有已发布 Cube 才能发起修订")
    revision = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "draft"})
    self._cube_repo.save(revision)
    self._after_save(revision)
    return revision
```

```python
@bp.route('/cubes/<cube_name>/revisions', methods=['POST'])
def create_cube_revision(cube_name):
    cube = modeling_service.create_revision_draft(cube_name)
    return created(data=cube.model_dump(mode="json"))
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `pytest tests/unit/application/semantic/test_cube_modeling_service.py tests/integration/test_semantic_api.py -v`

Expected: PASS with route and service green.

- [ ] **Step 5: Commit**

```bash
git add app/interfaces/api/v1/semantic.py app/application/semantic/cube_modeling_service.py tests/unit/application/semantic/test_cube_modeling_service.py tests/integration/test_semantic_api.py
git commit -m "feat: add cube revision draft api"
```

## Task 2: Extend frontend semantic API and workbench state model

**Files:**
- Modify: `frontend/src/api/semantic.ts`
- Create: `frontend/src/hooks/semantic-ia/useSemanticWorkbench.ts`
- Modify: `frontend/src/hooks/semantic-ia/index.ts`
- Modify: `frontend/src/pages/Semantic/DevTools.page.test.tsx`
- Create: `frontend/src/pages/Semantic/semanticWorkbench.page.test.tsx`

- [ ] **Step 1: Write failing tests for workbench state selection and revision action**

```tsx
it('默认进入建模 tab 并把生成草稿作为当前工作对象', async () => {
  renderWorkbench('/semantic/workbench')
  expect(await screen.findByText('AI 辅助建模')).toBeInTheDocument()
})

it('已发布 Cube 发起修订后跳回工作台开发态', async () => {
  semanticApiMocks.createCubeRevision.mockResolvedValue({ data: { name: 'answer_records', status: 'draft' } })
  // click revision CTA and assert navigate('/semantic/workbench?...')
})
```

- [ ] **Step 2: Run frontend unit tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx src/pages/Semantic/semanticWorkbench.page.test.tsx`

Expected: FAIL because `useSemanticWorkbench` and revision API are not wired.

- [ ] **Step 3: Implement API types and hook**

```ts
export const createCubeRevision = (name: string) =>
  apiClient.post<CubeDraftPayload>(`/semantic/cubes/${name}/revisions`)
```

```ts
export function useSemanticWorkbench() {
  return {
    mode: currentCube ? 'workspace' : 'start',
    defaultTab: currentCube?.status === 'active' ? 'preview' : 'modeling',
  }
}
```

- [ ] **Step 4: Run frontend unit tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx src/pages/Semantic/semanticWorkbench.page.test.tsx`

Expected: PASS with new hook and API surface available.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/semantic.ts frontend/src/hooks/semantic-ia/useSemanticWorkbench.ts frontend/src/hooks/semantic-ia/index.ts frontend/src/pages/Semantic/DevTools.page.test.tsx frontend/src/pages/Semantic/semanticWorkbench.page.test.tsx
git commit -m "feat: add semantic workbench state model"
```

## Task 3: Rebuild `/semantic/workbench` as AI-first development flow

**Files:**
- Modify: `frontend/src/pages/Semantic/DevTools.tsx`
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchHeader.tsx`
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchStartPanel.tsx`
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchResumePanel.tsx`
- Create: `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
- Modify: `frontend/src/components/Semantic/DevTools/PlaygroundTab.tsx`
- Modify: `frontend/src/components/Semantic/DevTools/YamlEditorTab.tsx`
- Modify: `frontend/src/components/Semantic/DevTools/PythonPreviewTab.tsx`
- Modify: `frontend/src/components/Semantic/DevTools/SemanticEditorEmptyState.tsx`
- Modify: `frontend/src/pages/Semantic/DevTools.page.test.tsx`
- Modify: `frontend/src/components/Semantic/DevTools/devToolsTabs.test.tsx`

- [ ] **Step 1: Write failing UI tests for start screen and tab priority**

```tsx
it('工作台首屏显示 AI 辅助建模主任务区与继续工作区', async () => {
  renderPage('/semantic/workbench')
  expect(await screen.findByText('AI 辅助建模')).toBeInTheDocument()
  expect(screen.getByText('最近草稿')).toBeInTheDocument()
})

it('生成草稿后默认打开建模 tab，发布对象默认打开预览 tab', async () => {
  expect(screen.getByTestId('workbench-tab-modeling')).toHaveAttribute('data-state', 'active')
})
```

- [ ] **Step 2: Run unit tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx src/components/Semantic/DevTools/devToolsTabs.test.tsx`

Expected: FAIL because current page still renders resource tree first.

- [ ] **Step 3: Implement the new workbench shell**

```tsx
return currentCube ? (
  <SemanticWorkbenchShell
    header={<WorkbenchHeader cube={currentCube} />}
    tabs={['modeling', 'sync', 'editor', 'python']}
  />
) : (
  <WorkbenchStartPanel onGenerateDraft={handleGenerateDraft} />
)
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx src/components/Semantic/DevTools/devToolsTabs.test.tsx`

Expected: PASS with new start state and tab ordering.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Semantic/DevTools.tsx frontend/src/components/Semantic/Workbench frontend/src/components/Semantic/DevTools/PlaygroundTab.tsx frontend/src/components/Semantic/DevTools/YamlEditorTab.tsx frontend/src/components/Semantic/DevTools/PythonPreviewTab.tsx frontend/src/components/Semantic/DevTools/SemanticEditorEmptyState.tsx frontend/src/pages/Semantic/DevTools.page.test.tsx frontend/src/components/Semantic/DevTools/devToolsTabs.test.tsx
git commit -m "feat: rebuild semantic workbench as ai modeling flow"
```

## Task 4: Migrate cube draft creation from `/semantic/cubes/new` into workbench

**Files:**
- Modify: `frontend/src/pages/Semantic/RelationCanvas.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Semantic/RelationCanvas.page.test.tsx`
- Modify: `frontend/tests/e2e/cube_draft_smoke.py`
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`

- [ ] **Step 1: Write failing tests for route redirection and workbench-based draft creation**

```tsx
it('旧的 /semantic/cubes/new 会回流到 /semantic/workbench', async () => {
  renderRoutes('/semantic/cubes/new')
  await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench', expect.anything()))
})
```

```python
goto_semantic(page, "/semantic/workbench")
page.get_by_role("heading", name="语义工作台").wait_for()
page.get_by_test_id("cube-generate-draft").click()
```

- [ ] **Step 2: Run affected tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/RelationCanvas.page.test.tsx`

Run: `cd frontend && node ./scripts/run-semantic-smoke.mjs tests/e2e/cube_draft_smoke.py`

Expected: FAIL because smoke still targets `/semantic/cubes/new`.

- [ ] **Step 3: Implement route fallback and create-flow migration**

```tsx
<Route path="cubes/new" element={<Navigate to="/semantic/workbench" replace />} />
<Route path="cubes/:name/edit" element={<Navigate to={`/semantic/workbench?cube=${name}`} replace />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/RelationCanvas.page.test.tsx`

Run: `cd frontend && node ./scripts/run-semantic-smoke.mjs tests/e2e/cube_draft_smoke.py`

Expected: PASS with smoke entering workbench instead of legacy create page.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Semantic/RelationCanvas.tsx frontend/src/App.tsx frontend/src/pages/Semantic/RelationCanvas.page.test.tsx frontend/tests/e2e/cube_draft_smoke.py frontend/tests/e2e-node/semantic.visual.spec.ts
git commit -m "refactor: move cube draft entry into semantic workbench"
```

## Task 5: Refactor Cube Management into asset management only

**Files:**
- Modify: `frontend/src/pages/Semantic/CubeList.tsx`
- Modify: `frontend/src/hooks/semantic-ia/useCubeList.ts`
- Modify: `frontend/src/components/Semantic/CubeList/CubePreviewPanel.tsx`
- Modify: `frontend/src/components/Semantic/CubeList/cubeListUtils.ts`
- Modify: `frontend/src/pages/Semantic/CubeList.page.test.tsx`
- Modify: `frontend/tests/e2e-node/cube-browse.spec.ts`

- [ ] **Step 1: Write failing tests for asset-only page behavior**

```tsx
it('Cube 管理页不再展示新建 Cube，而是展示发起修订', async () => {
  expect(screen.queryByRole('link', { name: '新建 Cube' })).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '发起修订' })).toBeInTheDocument()
})

it('默认筛选停在已发布', async () => {
  expect(statusSelect).toHaveValue('active')
})
```

- [ ] **Step 2: Run unit and browser tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/CubeList.page.test.tsx`

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/cube-browse.spec.ts`

Expected: FAIL because page still shows `新建 Cube` and draft-oriented actions.

- [ ] **Step 3: Implement asset-management UI**

```tsx
const defaultStatus = 'active'
const primaryAction = cube.status === 'active' ? '发起修订' : '查看'
```

```tsx
await createCubeRevisionMutation.mutateAsync(selectedCube.name)
navigate(`/semantic/workbench?cube=${selectedCube.name}&mode=revision`)
```

- [ ] **Step 4: Run unit and browser tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/CubeList.page.test.tsx`

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/cube-browse.spec.ts`

Expected: PASS with asset-only behavior and revision jump.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Semantic/CubeList.tsx frontend/src/hooks/semantic-ia/useCubeList.ts frontend/src/components/Semantic/CubeList/CubePreviewPanel.tsx frontend/src/components/Semantic/CubeList/cubeListUtils.ts frontend/src/pages/Semantic/CubeList.page.test.tsx frontend/tests/e2e-node/cube-browse.spec.ts
git commit -m "refactor: make cube list an asset management page"
```

## Task 6: Update visual regression, docs, and final verification

**Files:**
- Modify: `frontend/tests/e2e-node/devtools-browse.spec.ts`
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
- Modify: `docs/semantic_verification.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: Write failing assertions for new wording and navigation**

```ts
await gotoSemantic(page, '/semantic/workbench')
await expect(page.getByText('AI 辅助建模')).toBeVisible()
await expect(page.getByRole('tab', { name: '建模' })).toBeVisible()
```

- [ ] **Step 2: Run targeted regression to verify it fails against old snapshots and old route expectations**

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/devtools-browse.spec.ts tests/e2e-node/semantic.visual.spec.ts`

Expected: FAIL because screenshots and labels still reflect the old DevTools shell.

- [ ] **Step 3: Update docs and screenshots after UI settles**

```md
- `语义工作台`：AI 建模、微调、预览、发布
- `Cube 管理`：已发布资产、已废弃资产、发起修订
```

- [ ] **Step 4: Run repository verification commands**

Run: `make verify-semantic`

Expected: PASS including backend/frontend baselines, semantic regression, and semantic smoke.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-node/devtools-browse.spec.ts frontend/tests/e2e-node/semantic.visual.spec.ts docs/semantic_verification.md docs/TECH_STACK_AND_ARCHITECTURE.md docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md frontend/README.md
git commit -m "docs: align semantic lifecycle workflow and verification"
```

## Notes

- 如果 `frontend/src/pages/Semantic/DevTools.tsx` 继续膨胀，应在实现中优先拆到 `frontend/src/components/Semantic/Workbench/` 下，避免新的工作台再次演化为大一统文件。
- 当前计划假设“修订草稿”可复用现有 `draft` 状态，不单独新增持久化枚举；若实现中发现必须区分来源，可在后续小步补充 `revision_of` 之类的最小字段。
- `RelationCanvas` 可以在过渡期保留为兼容壳层，但不应继续承担默认创建入口。
- 若视觉回归截图变化较大，需在实现尾声统一重录 `semantic.visual.spec.ts` 对应快照，避免中途频繁更新基线。
