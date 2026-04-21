# 数据中心线上联调第一阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让数据中心成为以后端现有能力为唯一真相、以 Pencil 为默认视觉基线的正式前端入口，打通数据源、数据集与 `physical / virtual / file` 三类注册闭环，彻底移除 mock 数据和假交互。

**Architecture:** 复用现有 `React Query + API wrapper + 现有路由` 的真实链路，在原有数据中心路由上原地替换页面，不新增平行新页或前端适配层。只抽取跨页面复用的页面壳、禁用态、异步任务提示、预览面板和注册流程外壳，`virtual` 注册继续通过查询编辑器与保存为虚拟数据集对话框闭环，后端暂不支持的 Pencil 模块统一走明确禁用态。

**Tech Stack:** React 18、TypeScript、React Router、TanStack Query、Vitest、Testing Library、Playwright、Tailwind CSS、shadcn/ui

---

## 原则约束

- `KISS`：优先复用已有页面与 API，不新增前端 BFF、状态机框架或双轨路由。
- `YAGNI`：第一阶段只交付数据中心真实闭环，不提前实现治理看板、血缘、质量规则等后端尚未稳定的能力。
- `SOLID`：页面负责组合与路由，通用组件负责展示，数据获取继续留在页面级 hook / query 中，避免展示组件直接请求接口。
- `DRY`：抽取统一页面壳、禁用卡片、异步提示、预览面板和注册流程外壳，避免在 5 个页面重复写同一套加载/空态/禁用逻辑。
- `TDD`：每个任务先补失败测试，再做最小实现，再跑回归。

## 文件结构与职责锁定

### 新增文件

- `frontend/src/components/business/DataCenterPageShell.tsx`
  统一数据中心页面标题、说明、主操作区、错误区、空态区的布局壳。
- `frontend/src/components/business/CapabilityGateCard.tsx`
  统一承载“当前阶段未接入后端能力”的禁用模块展示。
- `frontend/src/components/business/AsyncTaskNotice.tsx`
  统一展示连接测试、目录同步、元数据同步等动作的 `pending / success / error / queued` 提示。
- `frontend/src/components/business/PreviewPanel.tsx`
  统一展示数据预览区的 `loading / empty / error / table` 四态，供数据集详情和注册流程复用。
- `frontend/src/components/business/RegisterFlowShell.tsx`
  统一三步/四步注册流程的头部、步骤条和底部动作区。
- `frontend/src/components/business/DataCenterPageShell.test.tsx`
  覆盖页面壳与禁用卡片的展示契约。
- `frontend/src/components/business/PreviewPanel.test.tsx`
  覆盖预览面板的加载态、空态、错误态和表格态。

### 重点修改文件

- `frontend/src/components/business/index.ts`
  统一导出新增组件，避免页面层直接深路径引用。
- `frontend/src/pages/Datasources.tsx`
  数据源列表、创建/编辑、连接测试、目录同步、禁用治理区。
- `frontend/src/pages/Datasets.tsx`
  数据集列表、统计摘要、筛选、注册入口、失败态与禁用治理入口。
- `frontend/src/pages/DatasetDetail.tsx`
  数据集详情、真实预览区、字段摘要、禁用治理模块。
- `frontend/src/pages/DatasetRegister.tsx`
  物理表注册流程，复用统一流程壳和预览区。
- `frontend/src/pages/FileDatasetRegister.tsx`
  文件数据集注册流程，复用统一流程壳和预览区。
- `frontend/src/pages/QueryCenter/Editor.tsx`
  `virtual` 注册入口、真实数据源上下文恢复、保存为虚拟数据集入口防呆。
- `frontend/src/components/business/SaveAsDatasetDialog.tsx`
  虚拟数据集多步注册对话框、失败保留输入、字段降级路径。
- `frontend/src/App.tsx`
  如执行中发现 `/data-center` 或 `/queries` 入口语义仍与 Phase 1 不一致，只做最小路由收口。

### 测试与文档文件

- `frontend/src/pages/Datasources.page.test.tsx`
- `frontend/src/pages/Datasets.page.test.tsx`
- `frontend/src/pages/DatasetDetail.page.test.tsx`
- `frontend/src/pages/DatasetRegister.page.test.tsx`
- `frontend/src/pages/FileDatasetRegister.page.test.tsx`
- `frontend/src/pages/QueryCenter/Editor.page.test.tsx`
- `frontend/src/components/business/SaveAsDatasetDialog.test.tsx`
- `frontend/tests/e2e-node/platform-data-inventory.spec.ts`
- `frontend/README.md`
- `docs/DOC_ALIGNMENT_REPORT.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`

> 文档只在“默认入口、联调路径、验证路径、架构边界”发生变化时更新；不要因为样式调整而扩散无关文档修改。

## 依赖与执行顺序

1. 先用测试把“后端真实能力矩阵”锁住，再动 UI。
2. 共享组件先落地，再改数据源页，后改数据集页和注册流。
3. `virtual` 注册最后收口，因为它依赖查询编辑器和保存为虚拟数据集对话框。
4. 最终以仓库根目录 `make verify-detect` / `make verify-changed` / `make verify-frontend` 做交付验证。

## 任务清单

### Task 1: 锁定数据中心真实契约与共享壳层基线

**Files:**
- Create: `frontend/src/components/business/DataCenterPageShell.tsx`
- Create: `frontend/src/components/business/CapabilityGateCard.tsx`
- Create: `frontend/src/components/business/AsyncTaskNotice.tsx`
- Create: `frontend/src/components/business/PreviewPanel.tsx`
- Create: `frontend/src/components/business/RegisterFlowShell.tsx`
- Create: `frontend/src/components/business/DataCenterPageShell.test.tsx`
- Create: `frontend/src/components/business/PreviewPanel.test.tsx`
- Modify: `frontend/src/components/business/index.ts`

- [ ] **Step 1: 先写共享组件失败测试**

```tsx
it('在禁用能力卡片中展示原因且不暴露可点击主动作', () => {
  render(
    <DataCenterPageShell title="数据中心">
      <CapabilityGateCard
        title="血缘关系"
        reason="当前阶段未接入后端能力"
      />
    </DataCenterPageShell>,
  )

  expect(screen.getByText('血缘关系')).toBeInTheDocument()
  expect(screen.getByText('当前阶段未接入后端能力')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /立即查看/ })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 运行聚焦测试确认当前基线不满足**

Run: `cd frontend && npx vitest run src/components/business/DataCenterPageShell.test.tsx src/components/business/PreviewPanel.test.tsx`

Expected: FAIL，提示新增组件或导出尚不存在。

- [ ] **Step 3: 实现最小共享组件与统一导出**

```tsx
export function CapabilityGateCard({ title, reason }: Props) {
  return (
    <PageCard data-testid="capability-gate-card">
      <h3>{title}</h3>
      <p>{reason}</p>
      <span>当前阶段未接入后端能力</span>
    </PageCard>
  )
}
```

实现要求：
- `DataCenterPageShell` 只负责标题区、说明区、操作区和页面状态槽位，不内置 API 请求。
- `PreviewPanel` 必须同时支持 `loading / empty / error / ready` 四态。
- `RegisterFlowShell` 只抽布局，不把业务校验塞进组件内部。
- `index.ts` 统一导出新增组件。

- [ ] **Step 4: 跑测试确认共享基线通过**

Run: `cd frontend && npx vitest run src/components/business/DataCenterPageShell.test.tsx src/components/business/PreviewPanel.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交共享组件基线**

```bash
git add frontend/src/components/business/DataCenterPageShell.tsx \
  frontend/src/components/business/CapabilityGateCard.tsx \
  frontend/src/components/business/AsyncTaskNotice.tsx \
  frontend/src/components/business/PreviewPanel.tsx \
  frontend/src/components/business/RegisterFlowShell.tsx \
  frontend/src/components/business/DataCenterPageShell.test.tsx \
  frontend/src/components/business/PreviewPanel.test.tsx \
  frontend/src/components/business/index.ts
git commit -m "feat: add data center shared page primitives"
```

### Task 2: 收口数据源页到后端真实能力

**Files:**
- Modify: `frontend/src/pages/Datasources.tsx`
- Modify: `frontend/src/pages/Datasources.page.test.tsx`
- Modify: `frontend/tests/e2e-node/platform-data-inventory.spec.ts`

- [ ] **Step 1: 先补数据源页失败测试**

```tsx
it('对未接入的治理模块展示禁用态，并保留真实连接测试与目录同步动作', async () => {
  renderPage()

  expect(await screen.findByText('教学 PostgreSQL')).toBeInTheDocument()
  expect(screen.getByText('当前阶段未接入后端能力')).toBeInTheDocument()

  await user.click(screen.getByTitle('同步目录'))
  expect(syncDataSourceCatalog).toHaveBeenCalledWith(1)
})
```

同时更新 `platform-data-inventory.spec.ts` 的标题与断言，不再使用“恢复为旧卡片版资产管理布局”这类历史语义。

- [ ] **Step 2: 运行数据源页测试确认失败**

Run: `cd frontend && npx vitest run src/pages/Datasources.page.test.tsx`

Expected: FAIL，缺少禁用模块或新的页面壳断言。

- [ ] **Step 3: 用共享壳层重构数据源页**

```tsx
return (
  <DataCenterPageShell
    title="数据源管理"
    description="管理已接入的数据源与目录同步状态"
    actions={<FormButton onClick={() => setCreateVisible(true)}>新建数据源</FormButton>}
  >
    <AsyncTaskNotice state={syncState} />
    <DatasourceCards />
    <CapabilityGateCard title="质量治理" reason="当前阶段未接入后端能力" />
  </DataCenterPageShell>
)
```

实现要求：
- 保留现有真实动作：搜索、创建、编辑、删除、测试连接、同步目录。
- 连接测试和目录同步必须展示真实成功/失败/排队文案，不伪造进度条。
- 首屏只能显示 skeleton/loader，不显示假摘要数据。
- 对 Pencil 中后端未支持的治理模块，统一使用 `CapabilityGateCard`。

- [ ] **Step 4: 跑单测与专项 E2E**

Run: `cd frontend && npx vitest run src/pages/Datasources.page.test.tsx`

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/platform-data-inventory.spec.ts`

Expected: PASS；E2E 至少能看到真实列表、目录同步按钮和禁用模块说明。

- [ ] **Step 5: 提交数据源页收口**

```bash
git add frontend/src/pages/Datasources.tsx \
  frontend/src/pages/Datasources.page.test.tsx \
  frontend/tests/e2e-node/platform-data-inventory.spec.ts
git commit -m "feat: align datasource page with backend capability"
```

### Task 3: 收口数据集列表与详情页

**Files:**
- Modify: `frontend/src/pages/Datasets.tsx`
- Modify: `frontend/src/pages/DatasetDetail.tsx`
- Modify: `frontend/src/pages/Datasets.page.test.tsx`
- Modify: `frontend/src/pages/DatasetDetail.page.test.tsx`
- Modify: `frontend/tests/e2e-node/platform-data-inventory.spec.ts`

- [ ] **Step 1: 先补列表与详情失败测试**

```tsx
it('在详情页优先展示真实 sample_rows 预览，没有预览数据时展示明确空态', async () => {
  datasetDetailMocks.getDataset.mockResolvedValueOnce({
    data: {
      ...datasetFixture,
      sample_columns: ['student_id', 'score'],
      sample_rows: [{ student_id: 's1', score: 95 }],
    },
  })

  renderPage()

  expect(await screen.findByText('数据预览')).toBeInTheDocument()
  expect(screen.getByText('s1')).toBeInTheDocument()
})
```

列表页补充断言：
- SQL / 文件 / 物理表三类注册入口仍存在。
- Pencil 中未接入的治理模块只能是禁用态。
- 失败同步状态必须展示真实原因，不展示 mock 指标。

- [ ] **Step 2: 运行列表与详情测试确认失败**

Run: `cd frontend && npx vitest run src/pages/Datasets.page.test.tsx src/pages/DatasetDetail.page.test.tsx`

Expected: FAIL，缺少统一预览区或禁用治理区断言。

- [ ] **Step 3: 用共享壳层与预览面板实现列表/详情收口**

```tsx
const previewRows = dataset?.sample_rows ?? []
const previewColumns = (dataset?.sample_columns ?? []).map((column) => ({
  accessorKey: column,
  header: column,
}))

<PreviewPanel
  title="数据预览"
  columns={previewColumns}
  rows={previewRows}
  emptyMessage="当前数据集暂无可展示预览"
/>
```

实现要求：
- `Datasets.tsx` 继续复用现有真实列表、筛选、删除、同步接口，不改提交语义。
- `DatasetDetail.tsx` 优先使用 `getDataset(..., true)` 已返回的 `sample_rows / sample_columns`；若物理表详情缺少预览数据且字段足够推断，可最小化复用现有真实预览能力，但不得新增后端接口。
- 血缘、影响分析、质量评分等区块统一走 `CapabilityGateCard`。
- 编辑保存失败必须保留当前表单输入。

- [ ] **Step 4: 跑页面单测与数据中心专项 E2E**

Run: `cd frontend && npx vitest run src/pages/Datasets.page.test.tsx src/pages/DatasetDetail.page.test.tsx`

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/platform-data-inventory.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交数据集列表与详情收口**

```bash
git add frontend/src/pages/Datasets.tsx \
  frontend/src/pages/DatasetDetail.tsx \
  frontend/src/pages/Datasets.page.test.tsx \
  frontend/src/pages/DatasetDetail.page.test.tsx \
  frontend/tests/e2e-node/platform-data-inventory.spec.ts
git commit -m "feat: align dataset inventory and detail pages"
```

### Task 4: 收口物理表与文件数据集注册流程

**Files:**
- Modify: `frontend/src/pages/DatasetRegister.tsx`
- Modify: `frontend/src/pages/FileDatasetRegister.tsx`
- Modify: `frontend/src/pages/DatasetRegister.page.test.tsx`
- Modify: `frontend/src/pages/FileDatasetRegister.page.test.tsx`

- [ ] **Step 1: 先补注册流程失败测试**

```tsx
it('物理表注册流程在 preview 失败时展示 error 态，并保留已选择的数据源上下文', async () => {
  datasetRegisterMocks.previewDataset.mockRejectedValueOnce({
    response: { data: { message: 'schema offline' } },
  })

  renderPage()

  // 选择数据源 / 数据库 / 表后
  expect(await screen.findByText('元数据加载失败')).toBeInTheDocument()
  expect(screen.getByText('schema offline')).toBeInTheDocument()
})
```

文件注册页补充断言：
- 上传成功后只展示真实文件名、真实样本数据、真实“重新上传会创建新数据集”的说明。
- 上传失败或字段为空时，不允许进入下一步。

- [ ] **Step 2: 运行注册流程测试确认失败**

Run: `cd frontend && npx vitest run src/pages/DatasetRegister.page.test.tsx src/pages/FileDatasetRegister.page.test.tsx`

Expected: FAIL，缺少新的错误态/流程壳断言。

- [ ] **Step 3: 复用 RegisterFlowShell 与 PreviewPanel 重构注册流**

```tsx
<RegisterFlowShell
  title="注册数据集"
  steps={steps}
  currentStep={currentStep}
  footer={footerActions}
>
  <PreviewPanel
    title={`样本预览（前 ${previewLimit} 行）`}
    columns={previewColumns}
    rows={previewRows}
    loading={loadingPreview}
    error={previewError}
  />
</RegisterFlowShell>
```

实现要求：
- `DatasetRegister.tsx` 继续使用现有 `getDataSources / getDataSourceDatabases / getDataSourceTables / previewDataset / createDataset`。
- `FileDatasetRegister.tsx` 继续使用 `uploadTabularFile / createDataset`，不新增假进度条。
- 所有失败场景保留用户已填表单与已选上下文。
- `FieldConfigurator` 为空时只能展示明确说明，不能跳过成“默认成功”。

- [ ] **Step 4: 跑注册流程单测**

Run: `cd frontend && npx vitest run src/pages/DatasetRegister.page.test.tsx src/pages/FileDatasetRegister.page.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交注册流程收口**

```bash
git add frontend/src/pages/DatasetRegister.tsx \
  frontend/src/pages/FileDatasetRegister.tsx \
  frontend/src/pages/DatasetRegister.page.test.tsx \
  frontend/src/pages/FileDatasetRegister.page.test.tsx
git commit -m "feat: align dataset registration flows"
```

### Task 5: 闭合 SQL 虚拟数据集注册链路

**Files:**
- Modify: `frontend/src/pages/QueryCenter/Editor.tsx`
- Modify: `frontend/src/components/business/SaveAsDatasetDialog.tsx`
- Modify: `frontend/src/pages/QueryCenter/Editor.page.test.tsx`
- Modify: `frontend/src/components/business/SaveAsDatasetDialog.test.tsx`

- [ ] **Step 1: 先补 virtual 注册失败测试**

```tsx
it('从数据集列表进入 SQL 注册后，未执行 SQL 时不能打开保存为虚拟数据集', async () => {
  renderEditor('/queries/editor?source_id=9')

  await user.click(screen.getByRole('button', { name: /保存为虚拟数据集/ }))
  expect(editorPageMocks.toast).toHaveBeenCalledWith({
    title: '请先执行 SQL 并返回结果后再保存为虚拟数据集',
    variant: 'warning',
  })
})
```

对话框补充断言：
- 字段分析失败时允许降级继续，但不丢失已填名称/描述/负责人。
- 创建失败后停留在确认步骤，不自动关闭对话框。
- 成功后只跳回真实数据集列表，不返回 mock 页面。

- [ ] **Step 2: 运行 virtual 链路测试确认失败**

Run: `cd frontend && npx vitest run src/pages/QueryCenter/Editor.page.test.tsx src/components/business/SaveAsDatasetDialog.test.tsx`

Expected: FAIL，缺少新的 guard 或降级断言。

- [ ] **Step 3: 用最小改动闭合 virtual 注册**

```tsx
const canSaveAsDataset = Boolean(selectedSource && sql.trim() && currentTab?.results?.data?.length)

if (!canSaveAsDataset) {
  toast({ title: '请先执行 SQL 并返回结果后再保存为虚拟数据集', variant: 'warning' })
  return
}
```

实现要求：
- `Datasets.tsx` 的 “SQL 虚拟数据集” 入口若已正确进入 `/queries/editor`，不再重复改动。
- `Editor.tsx` 必须恢复 `sql` 与 `source_id` 上下文，保证历史回放和虚拟注册链路一致。
- `SaveAsDatasetDialog.tsx` 在失败时保留表单状态与字段配置，不清空上下文。
- 除非发现当前路由语义不一致，否则不要再次改动 `/queries` 入口。

- [ ] **Step 4: 跑 virtual 链路单测**

Run: `cd frontend && npx vitest run src/pages/QueryCenter/Editor.page.test.tsx src/components/business/SaveAsDatasetDialog.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交 virtual 注册闭环**

```bash
git add frontend/src/pages/QueryCenter/Editor.tsx \
  frontend/src/components/business/SaveAsDatasetDialog.tsx \
  frontend/src/pages/QueryCenter/Editor.page.test.tsx \
  frontend/src/components/business/SaveAsDatasetDialog.test.tsx
git commit -m "feat: close virtual dataset registration loop"
```

### Task 6: 更新文档并执行仓库级交付验证

**Files:**
- Modify: `frontend/README.md`
- Modify: `docs/DOC_ALIGNMENT_REPORT.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `frontend/tests/e2e-node/platform-data-inventory.spec.ts`

- [ ] **Step 1: 先补文档与回归断言差异清单**

```md
- 数据中心默认视觉基线已切到 Pencil 风格，但真实能力以后端接口为准
- `virtual` 注册通过 `/queries/editor` + `SaveAsDatasetDialog` 闭环
- 未接入后端的治理模块统一以禁用态显示
```

只更新真实发生变化的文档：
- `frontend/README.md`：页面入口、调试方式、专项验证入口
- `docs/DOC_ALIGNMENT_REPORT.md`：说明数据中心已从设计稿碎片态切到真实联调态
- `docs/TECH_STACK_AND_ARCHITECTURE.md`：只在边界或路由真相变化时更新

- [ ] **Step 2: 运行范围检测与最小交付入口**

Run: `make verify-detect VERIFY_FILES="frontend/src/components/business/DataCenterPageShell.tsx frontend/src/pages/Datasources.tsx frontend/src/pages/Datasets.tsx frontend/src/pages/DatasetDetail.tsx frontend/src/pages/DatasetRegister.tsx frontend/src/pages/FileDatasetRegister.tsx frontend/src/pages/QueryCenter/Editor.tsx frontend/src/components/business/SaveAsDatasetDialog.tsx frontend/tests/e2e-node/platform-data-inventory.spec.ts frontend/README.md docs/DOC_ALIGNMENT_REPORT.md docs/TECH_STACK_AND_ARCHITECTURE.md"`

Expected: 输出命中的前端验证规则，建议 `make verify-frontend`。

- [ ] **Step 3: 执行页面级、专项与仓库级验证**

Run: `cd frontend && npx vitest run src/pages/Datasources.page.test.tsx src/pages/Datasets.page.test.tsx src/pages/DatasetDetail.page.test.tsx src/pages/DatasetRegister.page.test.tsx src/pages/FileDatasetRegister.page.test.tsx src/pages/QueryCenter/Editor.page.test.tsx src/components/business/SaveAsDatasetDialog.test.tsx`

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/platform-data-inventory.spec.ts`

Run: `make verify-changed VERIFY_FILES="frontend/src/components/business/DataCenterPageShell.tsx frontend/src/pages/Datasources.tsx frontend/src/pages/Datasets.tsx frontend/src/pages/DatasetDetail.tsx frontend/src/pages/DatasetRegister.tsx frontend/src/pages/FileDatasetRegister.tsx frontend/src/pages/QueryCenter/Editor.tsx frontend/src/components/business/SaveAsDatasetDialog.tsx frontend/tests/e2e-node/platform-data-inventory.spec.ts frontend/README.md docs/DOC_ALIGNMENT_REPORT.md docs/TECH_STACK_AND_ARCHITECTURE.md"`

Expected: 所有前端相关校验通过；若出现仓库已知的无关类型错误，必须在交付说明中明确标注文件、原因和与本阶段的关系，不能直接宣称完成。

- [ ] **Step 4: 进行人工联调验收**

人工验收清单：
- 打开 `/data-center/datasources`，验证真实列表、连接测试、目录同步、禁用治理模块
- 打开 `/data-center/datasets`，验证统计、筛选、详情跳转、三类注册入口
- 打开物理表/文件注册页，验证真实预览、失败态、返回上一步后的上下文保持
- 从 `/queries/editor` 执行 SQL，验证“保存为虚拟数据集”完整链路
- 确认页面中不再存在 mock 数据、假按钮、假成功态

- [ ] **Step 5: 提交文档与最终回归结果**

```bash
git add frontend/README.md \
  docs/DOC_ALIGNMENT_REPORT.md \
  docs/TECH_STACK_AND_ARCHITECTURE.md \
  frontend/tests/e2e-node/platform-data-inventory.spec.ts
git commit -m "docs: record data center phase 1 online alignment"
```

## 完成定义

满足以下条件才算第一阶段完成：

1. 数据中心所有核心动作都绑定真实后端接口或明确禁用态。
2. `Datasources / Datasets / DatasetDetail / DatasetRegister / FileDatasetRegister / QueryEditor + SaveAsDatasetDialog` 组成的数据中心闭环可真实运行。
3. 不再存在 mock 数据、假点击、假成功提示、无响应伪交互。
4. `platform-data-inventory` 专项回归与页面级单测通过。
5. 相关文档已回写，说明当前默认入口、验证路径和能力边界。

## 风险与注意事项

- 当前仓库存在与本阶段无关的前端历史类型问题时，不要用“已知失败”掩盖本阶段回归；必须区分“新增回归”和“历史基线问题”。
- 若执行中发现某个 Pencil 模块必须新增后端接口才能成立，停止该模块实现，改为 `CapabilityGateCard`，不要擅自扩展后端契约。
- 若页面替换导致旧入口断裂，优先最小路由收口，不引入第二套平行页面。
- 若 `FieldConfigurator` 或 `SchemaBrowser` 在本阶段暴露已有缺陷，只修与数据中心闭环直接相关的问题，不借机做泛化重构。
