# Phase 3: 语义运行闭环与查询可信 - Research

**Date:** 2026-03-26
**Status:** Complete

## Objective

回答一个问题：如何把语义中心的“运行闭环与查询可信”做成调试能力，而不是误做成第二个查询产品。

## Current Baseline

- 后端已经具备编译、查询、物化和漂移检测的主要服务与 API 骨架，不需要从零造运行模块：
  - `app/application/semantic/semantic_query_service.py`
  - `app/application/semantic/view_publish_service.py`
  - `app/application/semantic/schema_sync_service.py`
  - `app/interfaces/api/v1/semantic.py`
- 前端已经存在统一的 `DevTools` 工作台与运行相关标签页：
  - `frontend/src/pages/Semantic/DevTools.tsx`
  - `frontend/src/components/Semantic/DevTools/CompileDebugTab.tsx`
  - `frontend/src/components/Semantic/DevTools/SchemaSyncTab.tsx`
  - `frontend/src/components/Semantic/DevTools/PlaygroundTab.tsx`
- 详情页已经有“状态摘要 + 定义哈希 + 诊断信息”的现实基础：
  - `frontend/src/pages/Semantic/ViewDetail.tsx`
  - `frontend/src/pages/Semantic/CubeDetail.tsx`
- 语义定义和发布元数据已经能提供 `definition_hash`，不需要为 Phase 3 引入第二套运行版本中心：
  - `app/application/semantic/semantic_definition_service.py`
  - `app/application/semantic/view_publish_service.py`
- 当前验证基线已覆盖运行服务、语义 API、DevTools 页面和浏览器浏览回归：
  - `tests/unit/application/semantic/test_semantic_query_service.py`
  - `tests/unit/application/semantic/test_schema_sync.py`
  - `tests/unit/application/semantic/test_view_publish_service.py`
  - `tests/integration/test_semantic_api.py`
  - `frontend/src/pages/Semantic/DevTools.page.test.tsx`
  - `frontend/src/pages/Semantic/ViewDetail.page.test.tsx`
  - `frontend/src/pages/Semantic/CubeDetail.page.test.tsx`
  - `frontend/tests/e2e-node/devtools-browse.spec.ts`
  - `frontend/tests/e2e-node/semantic.visual.spec.ts`

## Key Findings

### 1. 运行能力已经存在，但分散在 `DevTools`、详情页和未接线的实验组件里

- `CompileDebugTab` 当前只覆盖 DSL 编译和 SQL 展示。
- `PlaygroundTab` 已经实现了编译 + 执行的交互雏形，但尚未接入 `DevTools` 主流程。
- `ViewDetail` 仍然保留物化/发布动作，`SchemaSyncTab` 则承载漂移检测。
- 这说明 Phase 3 不该新开“语义查询中心”，而应该把现有运行入口收敛到 `DevTools`。

### 2. 后端查询返回值已经接近“证据包”，但还缺统一契约

- `semantic_query_service.query()` 已返回：
  - `sql`
  - `columns`
  - `data`
  - `row_count`
  - `execution_time_ms`
  - `primary_cube`
  - `joined_cubes`
  - `hint`
  - `retryable`
- 但它还缺：
  - 稳定的错误分类字段，如 `error_code`
  - 显式的样本结果契约，如 `sample_rows`
  - 当前定义版本标识，如 `definition_hash`
- 所以 Phase 3 的关键不是发明新能力，而是把现有返回值正规化成稳定的调试证据包。

### 3. 不需要新增后端“查询历史”表，轻量历史更适合留在 `DevTools`

- 仓库已有 `QueryHistory` / `query_repository`，但它是查询中心语境，不是语义调试语境。
- 它缺少 DSL 快照、语义对象标识、定义版本标识等关键字段。
- 如果 Phase 3 为“轻量调试历史”新建后端持久化，会直接把范围推向查询产品治理。
- 更符合 `KISS / YAGNI` 的做法是：历史只服务 `DevTools` 回放，优先使用浏览器本地轻量存储。

### 4. 物化与漂移检测已经有实现基础，真正要做的是入口收敛

- 物化链路已经由 `view_publish_service` 和相关 API 支撑。
- 漂移检测已经由 `schema_sync_service` 和 `SchemaSyncTab` 支撑。
- 因此 Phase 3 不需要重新设计“发布系统”或“检测平台”，只需要：
  - 让 `DevTools` 成为唯一正式运行入口
  - 让 `ViewDetail / CubeDetail` 只保留摘要和跳转

### 5. 当前自动化缺口在组件级，而不是框架级

- `DevTools.page.test.tsx` 目前 mock 了 `CompileDebugTab` 和 `SchemaSyncTab`。
- 这意味着页面级测试能保证壳层与导航，但覆盖不到真正的运行证据包、历史与回放逻辑。
- Phase 3 需要新增组件级测试，而不是另造一套验证框架。

## Recommended Implementation Shape

### Backend

- 继续复用 `interfaces -> application -> domain -> infrastructure` 分层，不新增运行数据库表。
- 在 `semantic_query_service.py` 和 `semantic.py` 中把编译/查询输出正规化成调试证据包：
  - 编译 SQL
  - 主对象 / 关联对象
  - 样本结果
  - 行数与耗时
  - 错误分类与 hint
  - 定义版本标识
- 保持现有 API 路径，不新增“历史查询 API”。
- 版本标识优先复用现有 `definition_hash` 计算与发布元数据，不发明第二套版本号。

### Frontend

- 以 `DevTools` 为唯一正式运行入口。
- `CompileDebugTab` 负责：
  - 编译
  - 执行
  - 标准证据包展示
  - 轻量调试历史
  - 一键回放
- `SchemaSyncTab` 负责：
  - 漂移检测执行与结果查看
  - 当前对象聚焦
  - `View` 物化 / 重新发布动作
- `ViewDetail / CubeDetail` 只保留摘要和跳转，不再承担正式运行动作。

### Docs / Product Boundary

- 文档必须明确写清：
  - 语义中心运行能力只服务调试与验证
  - 真实消费发生在应用层
  - `DevTools` 是唯一正式运行入口
- 不把 Phase 3 表述成“平台内查询产品升级”。

## Risks And Planning Consequences

### 风险 1：如果为调试历史新增后端持久化，Phase 3 会过度产品化

- 后果：把“调试回放”扩大成查询历史治理、权限和存储设计。
- 规划结论：历史仅在 `DevTools` 本地轻量留存。

### 风险 2：如果继续保留详情页直接运行动作，用户心智会持续分裂

- 后果：一部分动作在详情页，一部分在 `DevTools`，运行入口不唯一。
- 规划结论：详情页只保留摘要和跳转。

### 风险 3：如果不给错误分类和版本标识，“查询可信”会停留在口号层

- 后果：用户知道失败了，但不知道失败类型，也无法确认是否复现的是同一份定义。
- 规划结论：Phase 3 必须补齐 `error_code + definition_hash` 这类可解释字段。

### 风险 4：如果把 `PlaygroundTab` 直接包装成新入口，会形成重复工作台

- 后果：`CompileDebugTab` 和 `PlaygroundTab` 并存，体验和维护双重分叉。
- 规划结论：优先复用其执行逻辑，但收敛回现有 `DevTools` 主标签。

## Recommended Plan Split

### Wave 1

- `03-01` 语义运行证据包后端契约

### Wave 2

- `03-02` `DevTools` 编译 / 执行 / 历史回放闭环
- `03-03` 物化 / 漂移摘要与详情页跳转收敛

### Wave 3

- `03-04` 语义专项回归、文档基线与交付口径收口

## Validation Architecture

- 快速反馈继续使用语义专项回归入口：
  - `make test-regression-semantic`
- 后端定向回归可复用：
  - `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_semantic_query_service.py tests/unit/application/semantic/test_schema_sync.py tests/unit/application/semantic/test_view_publish_service.py tests/integration/test_semantic_api.py`
- 前端组件级验证需要补足：
  - `frontend/src/components/Semantic/DevTools/CompileDebugTab.test.tsx`
  - `frontend/src/components/Semantic/DevTools/SchemaSyncTab.test.tsx`
- 阶段级交付入口仍然是：
  - `make verify-semantic`
  - 文档改动后补 `make verify-docs`
- 仍需人工确认的部分：
  - 真实运行环境中的语义查询绑定是否按预期命中目标数据源
  - `DevTools` 历史回放在跨刷新场景下是否保持足够可理解

## Research Complete

- Phase 3 的关键不在“增加更多运行能力”，而在“把已有运行能力收敛为一条可信的调试链”。
- 最合理的边界是：后端正规化证据包，前端把运行入口集中到 `DevTools`，详情页只保留摘要与跳转。

---

*Research completed: 2026-03-26*
