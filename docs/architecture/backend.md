---
doc_type: architecture-doc
status: maintained
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-24
---

# 后端架构

本文档说明当前后端的分层方式、运行角色、依赖注入和关键扩展点。

## 1. 运行入口

后端统一通过 Flask App Factory 初始化，主入口位于 `app/__init__.py`。

当前存在两种运行角色：

- `web`
  - 加载路由、调度器、请求上下文钩子、飞书长连接
- `worker`
  - 加载数据库、依赖注入、事件处理器和执行器，不注册 Web 路由

这意味着后端不是“一个 Flask 进程做所有事情”，而是“同一套应用初始化逻辑支撑多种进程角色”。

## 2. 当前分层

当前后端以 `application / domain / infrastructure / interfaces` 为主线：

- `app/domain/`
  - 放领域实体、领域端口、领域服务、领域事件、语义领域对象
- `app/application/`
  - 放用例级服务、commands、queries、handlers、跨领域协调逻辑
- `app/infrastructure/`
  - 放仓储实现、数据库、缓存、外部系统适配器、任务与语义文件仓储
- `app/interfaces/`
  - 放 HTTP API、middleware、外部信道适配入口

仍保留一些过渡性目录，例如 `app/models/`、`app/executors/`，但当前主线组织已围绕上述分层展开。

## 3. API 边界

当前主 API 挂载在 `app/interfaces/api/v1/`，主要模块包括：

- `datasources.py`
- `datasets.py`
- `extraction.py`
- `conversations.py`
- `queries.py`
- `sql_lab.py`
- `apps.py` / `app_instances.py` / `app_executions.py`
- `channels.py` / `subscriptions.py`
- `semantic.py`

这些 blueprint 在 App Factory 中统一注册，说明“资源边界”与“HTTP 边界”是显式的，而不是散落在单一大文件中。

## 4. 依赖注入

依赖注入容器位于 `app/di/container.py`，当前承担以下职责：

- 数据库引擎和 scoped session 提供
- Redis、TaskQueue、EventBus 提供
- 各类 Repository 提供
- 各类 Application Handler / Service 提供
- LLM 适配器与 Agent 服务提供
- 语义层服务与 YAML 仓储提供

这个容器是当前后端的关键装配点。新增核心能力时，优先考虑把生命周期和依赖关系收敛进容器，而不是在 blueprint 或 handler 中手工组装。

## 5. 数据与持久化

后端当前存在三类主要持久化载体：

- PostgreSQL
  - 平台元数据、业务实体、查询资产、应用与配置中心数据
- Redis
  - 缓存、任务队列、中间状态协调
- 文件型语义资产
  - 位于 `app/infrastructure/semantic/`
  - 通过 YAML 仓储管理 `catalogs/`、`cubes/`、`domains/`、`views/`、`recipes/`

这意味着语义层不是纯数据库建模，也不是纯前端本地状态，而是后端持有的文件仓储模型。

## 6. 异步任务与事件

当前异步体系以 `RQ + Redis` 为主：

- `TaskQueue` 负责入队
- Worker 进程执行任务
- `EventBus` 负责领域事件和任务化后处理
- 执行器位于 `app/executors/`

这套设计适合当前平台“任务执行 + 外部交付 + 状态回写”的场景，复杂度明显低于完整工作流引擎。

## 7. 语义层后端结构

语义层当前不是单个 service，而是一组协同服务：

- `SemanticDefinitionService`
- `CubeModelingService`
- `DomainModelingService`
- `DomainCanvasService`
- `SemanticQueryService`
- `ViewPublishService`
- `SemanticLayerService`

它们通过 `semantic.py` blueprint 暴露能力，并通过 YAML 仓储和数据集仓储协同工作。

### CubeModelingService 维度/指标自动识别

当前 `CubeModelingService._build_dimensions()` / `_build_measures()` 使用**基于规则的启发式算法**自动推断维度和指标：

- **正向命中制**: 只有字段名后缀或注释命中「可度量语义」（如 `_amount`, `_count`, `_rate`, `金额`, `数量`, `比率`）的数值字段才被标记为 Measure；其余数值字段归入 Dimension
- **反向排除**: 字段注释含 `ID`, `状态`, `类型`, `编码`, `分类` 等关键词的数值字段不会被误判为 Measure
- 分区字段自动排除

**已知局限**: 纯规则方案无法覆盖所有业务语义。**后续可引入 LLM 辅助生成**：将 `table_schema`（字段名、类型、注释）作为 prompt context 传入 LLM，让模型返回结构化的 `{dimensions: [...], measures: [...]}` JSON，再由 `CubeModelingService` 校验和落库。这一方案依赖语义层稳定性和 LLM 集成就绪后实施。

## 8. 变更规则

涉及后端架构变更时，至少同步检查这些文档：

- [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)
- [system-overview.md](system-overview.md)
- [../STARTUP_GUIDE.md](../STARTUP_GUIDE.md)
- [../DOC_ALIGNMENT_REPORT.md](../DOC_ALIGNMENT_REPORT.md)

如果改动涉及新的跨模块边界、持久化模式或执行模型，优先补充 ADR，而不是只在 PRD 或归档里解释。
