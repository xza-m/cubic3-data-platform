---
doc_type: architecture-doc
status: maintained
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-03-26
---

# 前端架构

本文档说明当前前端如何组织路由、页面域、共享壳层和验证策略。

## 1. 总体形态

当前前端是独立 `React SPA`，入口位于 `frontend/src/main.tsx`，路由总入口位于 `frontend/src/App.tsx`。
系统通过受保护路由进入统一 `AppLayout`，再按业务域挂载页面。

这意味着前端当前的首要职责是“工作台体验和任务流组织”，而不是服务端模板拼接。

## 2. 路由域

当前主路由可以按业务域理解：

- `/dashboard`
- `/data-center/*`
- `/extraction-*`
- `/data-chat`
- `/queries/*`
- `/apps/*`
- `/executions`
- `/config/*`
- `/semantic/*`

这与后端 `api/v1` 的能力边界大体对应，有利于前后端在概念上保持一致。

## 3. 页面组织

页面代码主要位于 `frontend/src/pages/`，并进一步按域拆分：

- `AppCenter/`
- `ConfigCenter/`
- `QueryCenter/`
- `Semantic/`
- 根层通用页面，如 `Dashboard.tsx`、`Datasources.tsx`、`Datasets.tsx`

当前最复杂的前端域是 `Semantic/`，它不是简单列表页集合，而是工作台式页面群：

- `CubeList`
- `RelationCanvas`
- `DomainList`
- `ModelingRedirect`
- `DomainCanvas`
- `DevTools`
- `ViewDetail`

当前主路由中，`/semantic/workbench`、`/semantic/cubes`、`/semantic/domains`、`/semantic/modeling`、`/semantic/domains/:id`、`/semantic/views/:name` 构成在线主 IA；`/semantic/cubes/new`、`/semantic/cubes/:name/edit` 已统一回流到 `/semantic/workbench`，`/semantic/cubes/:name` 只保留到编辑页的兼容重定向，旧 `Overview`、`Playground`、`CubeDetail` 等页面不再作为在线主入口。

这套页面模型已经稳定为“按任务类型组织”，而不是只按资源对象组织；其中 `/semantic/workbench` 当前采用三栏工作台：左栏负责资源与字段索引，中栏承载建模主任务，右栏承载属性检查与模型元信息。

## 4. 共享壳层与组件分层

当前前端大致分为三层：

- 页级路由：`src/pages/`
- 业务组件：`src/components/business/`、`src/components/Semantic/`、`src/components/Chat/` 等
- 基础 UI primitives：`src/components/ui/`

`AppLayout` 负责全局工作台壳层，受保护路由与 Toast 等通用能力在应用根部统一装配。

## 5. 数据访问

当前前端的数据访问原则是：

- 通过 `src/api/client.ts` 统一配置 API 客户端
- 通过页面和业务组件按域消费 API
- 以 `TanStack Query` 管理远端状态和查询缓存

这意味着新增 API 接入时，优先复用既有客户端和查询模式，不要在页面里散写请求细节。

## 6. 语义中心前端特点

语义中心当前是最明显的“前端架构输入”区域，已有稳定特征包括：

- 管理页、编辑页、画布页、调试页分工清楚
- 历史路由通过重定向兼容到当前页面模型
- 验证链路单独沉淀为专项脚本，而不是只依赖通用 UI 校验

这也是为什么语义中心相关改动通常需要额外运行 `verify:semantic-layout` 或 `verify:semantic`。

## 7. 验证策略

仓库根目录已提供统一包装入口：

- `make lint`
- `make typecheck`
- `make test`
- `make smoke`
- `make verify`
- `make verify-semantic`

这些入口负责把前端已有的 `npm` 脚本与后端 `pytest` 验证收敛到同一套命令面，减少协作者和 agent 对局部脚本的猜测成本；同时按四层暴露清晰失败信号，而不是把 lint、类型、回归和运行验证混在一起。

当前前端至少存在四层验证：

- 层 1：`make lint`
- 层 2：`make typecheck`
- 层 3：`make test`
- 层 4：`make smoke`

若需要进一步下钻，仓库还提供定向子目标：

- `make test-unit`
- `make test-integration`
- `make test-regression`
- `make test-regression-semantic`
- `make smoke-semantic`

前端架构变更不应只验证单页能打开，而应至少覆盖受影响域的类型检查、单测、E2E 或专项 smoke。

## 8. 变更规则

涉及前端架构变更时，至少同步检查这些文档：

- [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)
- [system-overview.md](system-overview.md)
- [../semantic_verification.md](../semantic_verification.md)
- [../../frontend/README.md](../../frontend/README.md)

如果变更改变了页面模型、共享壳层或语义中心任务流，优先更新本目录，而不是只在 PRD 或设计草案里描述。
