---
doc_type: architecture-doc
status: maintained
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-04-25
---

# 前端架构

本文档说明当前前端如何组织路由、页面域、共享壳层和验证策略。

## 1. 总体形态

当前前端是独立 `React SPA`，入口位于 `frontend/src/main.tsx`，该入口只挂载 v2 应用。
v2 Provider 装配位于 `frontend/src/v2/App.tsx`，路由总入口位于 `frontend/src/v2/routes.tsx`。
系统通过受保护路由进入统一 `AppShell`，再按业务域挂载页面。

这意味着前端当前的首要职责是“工作台体验和任务流组织”，而不是服务端模板拼接。

## 2. 路由域

当前主路由可以按业务域理解：

- `/dashboard`
- `/data-center/*`
- `/data-center/sync/*`
- `/data-chat`
- `/queries/*`
- `/apps/*`
- `/executions`
- `/config/*`
- `/semantic/*`

这与后端 `api/v1` 的能力边界大体对应，有利于前后端在概念上保持一致。

IA 决策（两条正式约定）：

- 数据中心（`/data-center/*`）采用页内一级 Tab 组织二级语义（连接 / 资产 / 同步 / 影响），不开启二级侧栏；Tab 定义集中在 `frontend/src/v2/pages/data/_shared/data-center-tabs.ts`。
- `/config/*` 收敛为统一「配置中心」模块（导航 id 为 `config`），权限管理 / 权限审计 / 网关观测 / 渠道 / 订阅共享同一个二级侧栏壳，按 section 分组展示；不再为渠道、订阅、访问网关各注册一个一级模块。模块定义见 `frontend/src/v2/layout/navigation.ts`。

全局搜索：CommandPalette 输入 300ms 防抖后调用后端 `GET /api/v1/search?q=&types=cube,domain,metric` 聚合搜索（蓝图见 `app/interfaces/api/v1/search.py`），不再在客户端整列表拉取后过滤。

## 3. 页面组织

页面代码主要位于 `frontend/src/v2/pages/`，并进一步按域拆分：

- `apps/`
- `config/`
- `data/`
- `queries/`
- `semantic/`
- 根层通用页面，如 `Dashboard.tsx`、`Login.tsx`、`NotFound.tsx`

当前最复杂的前端域是 `Semantic/`，它不是简单列表页集合，而是工作台式页面群：

- `OntologyWorkbench`
- `Cubes`
- `RelationCanvas`
- `Domains`
- `DomainCanvas`
- `DevTools`
- `ViewDetail`

当前主路由中，`/semantic/ontology`、`/semantic/cubes`、`/semantic/domains`、`/semantic/domains/:id`、`/semantic/views/:name`、`/semantic/relations` 与 `/semantic/workbench` 构成在线 IA。
其中 `/semantic/ontology` 是业务语义工作台主入口，`/semantic/workbench` 当前是语义诊断 / DevTools 页面；`/semantic/cubes/new` 与 `/semantic/cubes/:name/edit` 是真实 v2 页面，不再统一回流到旧工作台。
语义中心以当前 IA 路由为准；旧 `Overview`、`Playground`、`Canvas`、`VisualModel` 等路径不再注册兼容重定向。

这套页面模型已经稳定为“按任务类型组织”，而不是只按资源对象组织；其中业务对象、指标、关系和治理都收口在 `/semantic/ontology` 的对象中心 IA。

## 4. 共享壳层与组件分层

当前前端大致分为三层：

- 页级路由：`src/v2/pages/`
- 业务 hooks：`src/v2/hooks/`
- API 封装：`src/v2/api/`
- 壳层组件：`src/v2/layout/`
- 基础 UI primitives：`src/v2/components/ui/`

`AppShell` 负责全局工作台壳层，受保护路由、Toast、QueryClient、主题、可访问性偏好和前端观测在 v2 应用根部统一装配。

## 5. 数据访问

当前前端的数据访问原则是：

- 通过 `src/v2/api/client.ts` 统一配置 API 客户端
- 通过 `src/v2/hooks/*` 封装 query key、缓存和 mutation invalidation
- 页面只消费 hooks，不直接调用 axios
- 以 `TanStack Query` 管理远端状态和查询缓存

这意味着新增 API 接入时，优先复用既有客户端和查询模式，不要在页面里散写请求细节。

## 6. 语义中心前端特点

语义中心当前是最明显的“前端架构输入”区域，已有稳定特征包括：

- 管理页、编辑页、画布页、调试页分工清楚
- 历史路由通过重定向兼容到当前页面模型
- 验证链路单独沉淀为 v2 E2E smoke 与语义专项 smoke，而不是只依赖通用 UI 校验

这也是为什么语义中心相关改动通常需要额外运行 `make verify-semantic`。

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
- `make smoke-semantic`

前端架构变更不应只验证单页能打开，而应至少覆盖受影响域的类型检查、单测、E2E 或专项 smoke。

## 8. 变更规则

涉及前端架构变更时，至少同步检查这些文档：

- [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)
- [system-overview.md](system-overview.md)
- [../semantic_verification.md](../semantic_verification.md)
- [../../frontend/README.md](../../frontend/README.md)

如果变更改变了页面模型、共享壳层或语义中心任务流，优先更新本目录，而不是只在 PRD 或设计草案里描述。
路由或 API 接入变化还应同步更新 [../quality/frontend-v2-route-api-audit.md](../quality/frontend-v2-route-api-audit.md)。
