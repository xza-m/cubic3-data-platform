---
doc_type: adr
status: current
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-05-05
---

# ADR-004 语义中心采用固定的工作台页面模型，而非资源优先导航

## 状态

当前有效

## 背景

语义中心 v2 前端路由和导航已经形成稳定结构：

- `/semantic/ontology`
- `/semantic/cubes`
- `/semantic/domains`
- `/semantic/domains/:id`
- `/semantic/views/:name`
- `/semantic/workbench`

同时，后端语义能力也已经收敛为定义、建模、治理、编译调试几类稳定任务链，而不是零散资源 CRUD。既有语义中心设计稿已经明确提出，不应继续按 `Cube / View / Recipe / Catalog` 这种资源优先方式扩张一级导航。

## 决策

语义中心当前采用固定的工作台页面模型，优先按“用户任务 + 页面类型”组织，而不是按“资源对象类型”组织。

当前主页面模型为：

- `Ontology Workbench`
- `Inventory`
- `Canvas`
- `Diagnostics`

当前具体页面映射为：

- `Ontology Workbench` -> `/semantic/ontology` 及其对象、指标、关系、治理子路由
- `Modeling Assistant` -> `/semantic/modeling-workbench` 与 `/semantic/modeling-workbench/quick`
- `Inventory` -> `/semantic/cubes`、`/semantic/views/:name`
- `Canvas` -> `/semantic/domains`、`/semantic/domains/:id`、`/semantic/relations`
- `Diagnostics` -> `/semantic/workbench`

`/semantic/cubes/new`、`/semantic/cubes/:name/edit` 当前是 v2 真实页面。`/semantic/tools`、`/semantic/overview`、`/semantic/modeling` 等旧入口只保留兼容重定向。`View`、`Recipe`、`Schema Drift` 等能力继续挂靠在现有页面模型中，不单独升格为一级导航。
Phase 2 同时固定对象落点：`Cube` 是分析执行真相源，`Ontology` 是业务语义真相源；`Domain` 收窄为业务上下文和资产组织对象；`View` 在展示和摘要层按“特殊 Cube”收敛；`Recipe` 保持轻量消费对象，不与正式建模入口竞争。

## 理由

- 用户核心任务是建模、治理、排查和发布，不是逐类浏览资源对象
- `Ontology Workbench` 负责业务语义对象聚合，`Inventory` 负责正式资产浏览，`Diagnostics` 负责诊断与 SQL 预览，职责比“列表里新建 + 工具页里再编辑”更清楚
- 现有路由和页面骨架已经符合工作台心智，继续强化比重新拆一级导航成本更低

## 结果与约束

正面结果：

- 语义中心页面扩展有了稳定抽象层
- 页面职责更容易与后端能力域对齐
- 可以在不增加一级导航数量的前提下继续迭代工作台体验
- 已发布 Cube 可以通过“发起修订 -> 回流工作台”进入下一轮开发，而不必把生产对象和草稿对象长期混在同一列表里

约束：

- 新的语义能力优先落到当前 `Modeling Assistant / Ontology Workbench / Inventory / Canvas / Diagnostics` 页面模型中，而不是直接新增一级资产中心
- `/semantic/modeling` 是旧兼容入口，当前重定向到 `/semantic/domains`
- `/semantic/ontology` 是业务语义主入口；`/semantic/workbench` 是语义诊断入口
- `/semantic/modeling-workbench` 是语义建设冷启动顶层任务流，不归属 `/semantic/cubes/new`；旧 `/semantic/modeling-copilot/new`、`/semantic/modeling-copilot/batch` 与 `/semantic/modeling-copilot/:sessionId` 仅保留兼容重定向
- `Domain.cubes[]` / 业务上下文资产画布只作为 `Cube <-> Domain` 资产归属和候选范围事实；`Cube.domain_id` 只允许作为兼容投影字段存在
- Domain 不作为指标、关系、动作或 Join 的第三套真相源；正式业务语义以 `Ontology` 为准，分析执行以 `Cube` 为准
- 业务上下文资产画布不再维护关系边，Domain 数据模型、YAML 与 API 不再保留 `joins` / `join_count`；执行 Join 只在 `Cube.joins` 中建模，业务关系只在 `Ontology BusinessRelation` 中建模
- `View`、`Recipe` 的展示和操作优先作为详情、预览或工具挂载点处理
- Phase 2 不引入“同一领域重复实例化同一个 Cube 且使用不同 Join 条件”的高级建模能力
- 如果未来确实要新增一级页面，必须证明现有页面模型无法承接

## 相关文档

- [../frontend.md](../frontend.md)
- [../system-overview.md](../system-overview.md)
- [../../semantic_verification.md](../../semantic_verification.md)
