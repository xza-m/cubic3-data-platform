---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-24
---

# ADR-005 HTTP API 采用按业务域分组的 `/api/v1` 契约边界

## 状态

当前有效

## 背景

当前后端 HTTP 接口已经按业务域拆分到 `app/interfaces/api/v1/` 下的多个 blueprint，例如：

- `datasources`
- `datasets`
- `extraction`
- `conversations`
- `queries`
- `sql_lab`
- `apps`
- `app_instances`
- `app_executions`
- `channels`
- `subscriptions`
- `semantic`

前端路由和导航也已经按业务域组织，而不是按 service 类名或数据库表名组织。

## 决策

当前平台保持“按业务域分组的 `/api/v1` 契约边界”：

- 每个主业务域拥有明确的 URL 前缀和 blueprint
- 前端优先依赖这些域边界，而不是内部 service / repository 细节
- 复杂域可以在同一前缀下继续细分子资源，例如 `/api/v1/semantic/*`

这意味着 HTTP 契约层的首要抽象不是技术实现细节，而是用户可理解的业务域。

## 理由

- 业务域边界更稳定，能降低前后端联调和导航理解成本
- blueprint 与前端路由域大体对齐，有利于统一概念模型
- 复杂域在同一前缀下收口，比把能力散到多个不相关前缀更容易维护

## 结果与约束

正面结果：

- 前端和后端对模块的命名与边界更一致
- API 变更影响面更容易评估
- 复杂域如语义中心可以在单一入口下逐步扩展

约束：

- 新接口优先补入现有业务域，而不是随意创建零散前缀
- 不能把某个域的便利接口直接挂到无关 blueprint，只因为实现上更顺手
- 旧前缀兼容和临时迁移接口不应长期保留为主入口
- 如果业务域边界发生调整，应同时同步前端导航、API 文档和架构文档

## 相关文档

- [../backend.md](../backend.md)
- [../frontend.md](../frontend.md)
- [../../TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
