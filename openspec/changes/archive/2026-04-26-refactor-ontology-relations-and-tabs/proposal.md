# Change: 本体工作台 · 关系页可视化补齐 + 对象点击改为多 Tab

## Why

R3 切换到 v2 主线时，`tmp/ontology-workbench-redesign/` 线下 demo 的两类核心 UX
没有完整迁过来：

1. **`/semantic/ontology/relations` 关系页**仅有一张表格，缺少 demo 里的"左
   SVG 关系图 + 右关系列表"双面板视图。
   - 仓库实际写过 SVG 关系图（`frontend/src/v2/pages/semantic/relations/RelationCanvas.tsx`），
     但它接的是 `/api/v1/semantic/graph`（cube join），与 ontology relations
     不是同一个数据源、不在同一个路由内。
   - 用户认知里"业务对象之间的关系"应当像 ER 图一样能可视化看到，目前体感
     退化成了纯列表，丢失了 demo 的"看一眼就懂结构"的信息密度。

2. **`/semantic/ontology/objects` 列表页**点击对象走 `<PeekPanel>` 右侧抽屉，
   不是 demo 里的"顶部 Tab Strip 多对象并行编辑"。
   - AppShell 的 TabStrip 基础设施已就位（`AppShell.openTab` / `closeTab` /
     `<TabStrip>`），但 Objects 没有接入。
   - 体感上每次都"抽屉开 → 关闭 → 再打开下一个"，无法并行对比多个对象，
     也无法在多个对象之间快速切换。

R5 闭幕时已经把 active changes 收敛到 0，本变更是 R6 启动的第一项
体验补齐，目标是让用户在 v2 主线的本体工作台里直接获得 demo 同等的导航
密度和图谱可视化。

## What Changes

- **MODIFIED** Ontology Relations Page：从单表格升级为左 SVG 图 + 右关系列表
  双面板，节点/行选中态联动；保留搜索与新建关系操作。
- **ADDED** Ontology Relation Graph Component：抽出独立可复用 SVG 关系图
  组件，输入 `objects` + `relations`，自带十环默认布局、拖拽、选中、
  localStorage 位置持久化；作为 ontology 视角与 cube 视角共享的 SVG 渲染
  工具的第一步。
- **MODIFIED** Ontology Objects Page：点击对象不再弹 `<PeekPanel>` 抽屉，
  改为通过 `useAppShell().openTab` 打开顶部 Tab，行为等价于路由
  `/semantic/ontology/objects/:name`，支持多对象并行 + Tab 关闭。
- **MODIFIED** Frontend UI Verification Workflow：补齐 v2 关系页双面板视图与
  对象多 Tab 交互的端到端验证项；既有 PeekPanel 仍保留给其他页面。

## Impact

- Affected specs: `frontend-ui`
- Affected code:
  - `frontend/src/v2/pages/semantic/ontology/Relations.tsx`（重构为左图右表）
  - `frontend/src/v2/pages/semantic/ontology/_shared/OntologyRelationGraph.tsx`（新建组件）
  - `frontend/src/v2/pages/semantic/ontology/Objects.tsx`（删除 PeekPanel 路径，改为 openTab）
  - `frontend/src/v2/pages/semantic/ontology/Relations.test.tsx`（新增）
  - `frontend/src/v2/pages/semantic/ontology/Objects.test.tsx`（新增 / 增量）
  - `frontend/src/v2/i18n/zh.json` & `en.json`（新增图统计、空态、a11y label）
  - `frontend/tests/e2e-v2/p32-ontology-relations-and-tabs.spec.ts`（新增 E2E）
- 不影响：后端 API、`/semantic/relations` 的 cube join 画布、其他模块的
  PeekPanel 用法（Datasets / Datasources / ExtractionTasks 等）。
