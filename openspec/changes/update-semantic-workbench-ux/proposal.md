# Change: 迭代语义中心工作台体验与页面闭环

## Why
当前语义中心已经具备 `Overview / Cube / Domain / Modeling / DevTools` 的完整路由与工作台骨架，但页面体验仍停留在“能力已接通、操作链路未收敛”的阶段：

- `Cube` 管理页更像资源浏览器，首屏无法快速判断哪些对象需要优先处理
- `Cube Studio` 已有步骤感，但真实编辑仍以单页堆叠为主，阶段任务不够清晰
- 领域目录已完成 `catalog -> domain` 基础结构，但治理信息、风险透视和进入建模的闭环仍偏弱
- 领域建模页已有专业画布能力，但视觉焦点、Join 编辑链路和发布前检查的优先级仍不够稳定
- 开发工具页具备轻量 IDE 骨架，但资源树、上下文条和结果扫描体验仍不够成熟
- 语义中心内部虽然已经形成 workbench 语言，但页面之间在筛选、状态、Inspector 和动作条上的复用仍不足

如果继续按页面零散补功能，会持续放大交互不一致、信息层级分散和维护成本上升的问题。

## What Changes
- **ADDED** Semantic Workbench Experience Baseline：定义语义中心统一的工作台体验基线，包括页头、状态条、主工作区、Inspector 与首要动作的组织方式
- **ADDED** Cube Management Triage Workflow：将 Cube 管理页提升为“待处理对象优先”的工作列表，而不是仅做资源浏览
- **ADDED** Cube Studio Staged Workflow：将 Cube 新建 / 编辑页收敛为分阶段建模流程，前置关键校验并弱化长表单感
- **ADDED** Domain Catalog Governance Lens：为领域目录补充目录治理、风险透视与建模回流路径
- **ADDED** Domain Canvas Professional Modeling Experience：强化领域建模页的画布中心、节点层级、连线语义和 Join 编辑闭环
- **ADDED** DevTools Lightweight IDE Refinement：明确资源树、Workspace 和结果反馈的 IDE 语义与上下文结构
- **ADDED** Shared Semantic Center UI Modules：新增语义中心内部复用组件，统一筛选、摘要、问题列表和上下文条

## Progress
- `Phase 1 / CubeList`: 已完成
  - 已将页面改为“主表格 + 右侧预览”的工作列表
  - 已接入搜索、快筛、状态/绑定/领域筛选和 URL 状态
  - 已拆分 `SemanticToolbar`、`SemanticPreviewPanel`、`CubeToolbar`、`CubeTable`、`CubePreviewPanel`
  - 已完成单测、类型检查、浏览器级 `cube-browse` 验证和前端构建
- `Phase 2 / CubeStudio`: 已完成
  - 已拆分为 `StepRail / TaskPanel / Inspector` 三栏结构
  - 已落地 `基础信息 / 来源绑定 / 维度指标 / 语义规则 / 校验预览 / 保存发布` 六步工作流
  - 已新增 `SemanticIssueList`，将阻塞项和提醒项集中到校验步骤
  - 已补页面级单测、类型检查、`cube_draft_smoke` 冒烟验证和前端构建
- `Phase 3 / DomainCanvas`: 已完成
  - 已落地 `SemanticWorkbenchContextBar`、`DomainCubeLibrary`、`DomainGraphLegend`、`DomainInspectorPanel`
  - 已将建模页收敛为“状态条 + 上下文条 + 左库 / 中画布 / 右 Inspector”的稳定工作台骨架
  - 已补充空画布引导、发布前检查、异常 lens 与 Join Inspector 编辑链路
  - 已完成页面单测、状态逻辑单测、类型检查、`domain_creation_smoke` / `domain_publish_smoke` 验证和前端构建
- `Phase 4 / DevTools`: 已完成
  - 已新增 `SemanticResourceTree`、`SemanticWorkspaceHeader`、`SemanticEditorEmptyState`
  - 已将页面收敛为“上下文条 + 资源树 + Workspace + 差异化 tabs”的轻量 IDE 骨架
  - 已移除 `YamlEditorTab` 内部第二套文件树，保留单一资源切换入口
  - 已补页面级单测、类型检查、`devtools-browse` 浏览器链路和前端构建
- `Phase 5 / DomainList`: 已完成
  - 已补目录级治理信号、治理透镜和右侧“目录摘要 / 当前领域摘要”切换
  - 已统一目录页的上下文条、状态条和 utility copy，保留 `catalog -> domain` 轻量模型
  - 已修复该页多处 URL 状态连续写入覆盖的问题，治理透镜、目录切换和领域选择改为批量更新 query
  - 已补页面级单测、类型检查和前端构建
- `Final Verification`: 已完成
  - `npm run verify:semantic-layout` 通过，桌面视觉基线、Cube / Domain / DevTools 浏览器链路均已闭环
  - `npm run verify:semantic` 通过，旧 Python smoke 已对齐当前路由、文案和拖拽协议
  - `openspec validate update-semantic-workbench-ux --strict` 通过
  - 单测、类型检查、前端构建均已通过
  - 已补独立测试入口：Playwright 和 Python smoke 统一通过 `127.0.0.1:3100` 自举本地 `Vite`，不再依赖外部现成前端服务
- `Post-review Polish`: 已完成
  - 已将 `Dashboard` 和 `Login` 从旧的营销化/模板化表达收敛为更克制的工作台入口
  - 已压缩 `DomainCanvas` 顶部条带，移除重复上下文层级，把更多垂直空间还给画布
  - 已收紧 `DevTools` 的对象上下文表达，移除页级重复信息，并补足 `YamlEditor` 的加载态
  - 已更新语义中心视觉快照基线，并补强 `cube-browse` / `devtools-browse` smoke 夹具，使空环境也能完成回归
- `Phase 6 / Semantic Page Standard`: 已完成
  - 已将 `Cube 管理页` 收敛出的“轻页头 + 单条上下文 + 主工作面板 + 条件显示预览/Inspector”模式整理为语义中心标准
  - 已将该模式回写到 OpenSpec 设计文档，作为后续语义页默认实现规范
  - 已按该标准统一 `Overview / DomainList / DomainModelingEntry / DevTools`，并为 `CubeStudio / DomainCanvas` 补齐一致的上下文条与页头节奏
  - 已去除语义页内重复的 badge 云、英文眉标题和多层解释性 UI，收敛为单一工作台层级

## Impact
- Affected specs: `semantic-modeling`, `frontend-ui`
- Affected code:
  - `frontend/src/components/Semantic/workbench.tsx`
  - `frontend/src/pages/Semantic/Overview.tsx`
  - `frontend/src/pages/Semantic/CubeList.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/DevTools.tsx`
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx`
  - `frontend/src/components/business/DataTable.tsx`
  - `frontend/src/lib/semantic-status.ts`
  - `frontend/src/hooks/useUrlState.ts`
