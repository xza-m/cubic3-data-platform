---
doc_type: adr
status: current
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-03-26
---

# ADR-004 语义中心采用固定的工作台页面模型，而非资源优先导航

## 状态

当前有效

## 背景

语义中心当前前端路由和导航已经形成稳定结构：

- `/semantic/overview`
- `/semantic/cubes`
- `/semantic/cubes/new`
- `/semantic/cubes/:name/edit`
- `/semantic/domains`
- `/semantic/modeling`
- `/semantic/domains/:id`
- `/semantic/tools`

同时，后端语义能力也已经收敛为定义、建模、治理、编译调试几类稳定任务链，而不是零散资源 CRUD。既有语义中心设计稿已经明确提出，不应继续按 `Cube / View / Recipe / Catalog` 这种资源优先方式扩张一级导航。

## 决策

语义中心当前采用固定的工作台页面模型，优先按“用户任务 + 页面类型”组织，而不是按“资源对象类型”组织。

当前主页面模型为：

- `Overview`
- `Inventory`
- `Studio`
- `Canvas`
- `Developer Workbench`

当前具体页面映射为：

- `Overview` -> `/semantic/overview`
- `Inventory` -> `/semantic/cubes`、`/semantic/domains`
- `Studio` -> `/semantic/cubes/new`、`/semantic/cubes/:name/edit`
- `Canvas` -> `/semantic/modeling`、`/semantic/domains/:id`
- `Developer Workbench` -> `/semantic/tools`

`View`、`Recipe`、`Schema Drift` 等能力继续挂靠在现有页面模型中，不单独升格为一级导航。
Phase 2 同时固定对象落点：`Cube` 与 `Domain` 仍然是正式建模对象；`View` 在展示和摘要层按“特殊 Cube”收敛；`Recipe` 保持轻量消费对象，不与正式建模入口竞争。

## 理由

- 用户核心任务是建模、治理、排查和发布，不是逐类浏览资源对象
- 现有路由和页面骨架已经符合工作台心智，继续强化比重新拆一级导航成本更低
- 让 `Cube` 和 `Domain` 回到治理入口，让 `Studio` 和 `Canvas` 承担重操作，职责更清楚

## 结果与约束

正面结果：

- 语义中心页面扩展有了稳定抽象层
- 页面职责更容易与后端能力域对齐
- 可以在不增加一级导航数量的前提下继续迭代工作台体验

约束：

- 新的语义能力优先落到现有五类页面模型中，而不是直接新增一级页
- `semantic/modeling` 作为建模入口页，属于 `Canvas` 流程，不应演化成独立大模块
- `Domain.cubes[]` / 领域画布是 `Cube <-> Domain` 关系的真相来源；`Cube.domain_id` 只允许作为兼容投影字段存在
- `View`、`Recipe` 的展示和操作优先作为详情、预览或工具挂载点处理
- Phase 2 不引入“同一领域重复实例化同一个 Cube 且使用不同 Join 条件”的高级建模能力
- 如果未来确实要新增一级页面，必须证明现有页面模型无法承接

## 相关文档

- [../frontend.md](../frontend.md)
- [../system-overview.md](../system-overview.md)
- [../../semantic_verification.md](../../semantic_verification.md)
