# Change: 固化语义中心前端信息架构与页面抽象

## Why
当前语义中心的后端能力已经相对清晰，基本可以归纳为四条稳定主线：

- 定义域：`Cube / View / Recipe / Domain / Catalog` 的定义、校验与摘要
- 建模域：`Cube` 草稿生成、单模型编辑、领域目录、领域关系建模、领域发布
- 运行域：DSL 编译、SQL 生成、查询执行
- 治理域：发布状态、来源绑定、Schema Drift、注册表摘要

但前端仍然带有明显的“历史演进痕迹”：

- 页面职责主要按已有路由和局部需求演进，而不是按后端能力域冻结
- 同一对象在列表、编辑、画布、调试之间的边界虽已初步建立，但尚未形成统一的页面抽象
- `View / Recipe / Drift / 文件编辑` 等能力仍缺少稳定挂载点，容易被继续做成零散页面或临时面板
- 共享 workbench 组件已经出现，但还没有上升为开发阶段可直接复用的字段清单、组件清单和任务分解

如果继续按页面逐个打补丁，会放大以下问题：

- 前端页面与后端能力域错位
- 同类状态和摘要在不同页面重复实现
- `Cube / Domain / DevTools` 的边界再次模糊
- 后续开发很难判断“一个能力应该放到哪一页、哪一层组件、哪一个 hook”

## What Changes
- **ADDED** Backend Capability Mapping：将语义中心后端能力正式映射为 `定义 / 建模 / 运行 / 治理` 四个前端理解域
- **ADDED** Semantic Workbench Page Types：冻结语义中心五类页面模型：`Overview / Inventory / Studio / Canvas / Developer Workbench`
- **ADDED** Semantic Page Field Blueprint：为 `Overview / CubeList / CubeStudio / DomainList / DomainModelingEntry / DomainCanvas / DevTools` 提供字段清单、组件清单与职责边界
- **ADDED** Shared Semantic View Models：定义前端共享模型，如 `SemanticObjectSummary`、`SemanticGovernanceState`、`SemanticStructureSummary`、`WorkbenchContext`
- **MODIFIED** Semantic IA Strategy：不再以“接口即页面”或“资源即一级导航”为原则，而是以“用户任务 + 页面类型 + 后端能力域”组织语义中心
- **MODIFIED** View / Recipe Exposure：`View` 与 `Recipe` 作为语义对象和工具能力挂载在现有工作台内，不新增一级导航入口

## Deliverables
- 开发可执行的提案、设计文档和任务拆分
- 一份字段清单与组件清单蓝图文档，指导前端实现
- 一份页面线框说明与前端 backlog 文档，指导设计评审与开发排期
- 更新后的 spec delta，用于约束语义中心后续页面开发

## Progress
- 已完成：共享语义模型、统一 view model hooks、`Overview / CubeList / DomainList / CubeStudio / DomainModelingEntry / DomainCanvas / DevTools` 的页面类型收敛
- 已完成：字段清单、组件清单与 `frontend-ui / semantic-modeling` spec delta
- 已完成：`View` 作为详情与工具挂载能力、`Recipe` 作为 `DevTools` 定义文件能力挂载完成，不新增一级导航
- 已完成：页面类型最小验收标准、路由跳转与职责边界校验
- 已完成：Phase 1 的 `Cube 管理 / 领域目录` 首轮落地，Phase 3 的 `CubeStudio` “自动优先、人工补充”收口，Phase 4 的 `DomainCanvas` 关系建模基线，以及 Phase 5 的 `DevTools` 工作台收口，包括资源树优先级、YAML 首屏、`Recipe` few-shot 元数据和不可编辑对象空状态
- 已完成：Phase 6 的共享测试与平台级页面收口，`Overview / Inventory / Studio / Canvas / Developer Workbench` 五类页面已补齐单测、视觉回归与 UI 组合校验

## Impact
- Affected specs:
  - `frontend-ui`
  - `semantic-modeling`
- Affected code:
  - `frontend/src/pages/Semantic/Overview.tsx`
  - `frontend/src/pages/Semantic/CubeList.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/DevTools.tsx`
  - `frontend/src/components/Semantic/*`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/lib/semantic-status.ts`
  - `frontend/src/hooks/*`
  - `app/interfaces/api/v1/semantic.py`
  - `app/application/semantic/*.py`
