# 架构映射

## 系统形态

- 当前主线是 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的分层数据平台。
- 前端只负责工作台体验与路由组织，入口在 `frontend/src/main.tsx` 和 `frontend/src/App.tsx`。
- 后端只负责 API、任务编排、集成适配和持久化，入口在 `app/__init__.py`。
- 当前实现不以 Jinja 页面渲染为主；这是基线事实，优先级高于历史文档。

## 主要层次

- `app/interfaces/api/v1/`：HTTP 边界，按业务域拆成多个 blueprint。
- `app/application/`：用例层，承接 commands、queries、handlers 和跨域编排。
- `app/domain/`：领域层，放实体、端口、领域服务、语义 DSL 和领域事件。
- `app/infrastructure/`：基础设施层，放仓储、外部适配器、缓存、任务队列、语义 YAML 仓储。
- `app/di/container.py`：依赖注入装配点，把 repository、service、handler 统一组装。

## 请求流

- 浏览器请求先进入前端路由，再由 `frontend/src/api/client.ts` 统一访问 `/api/v1`。
- 开发模式下，`frontend/vite.config.ts` 默认把 `/api` 代理到 `http://localhost:81`，也可显式改到 Flask。
- Docker 模式下，Nginx 直接托管 `frontend/dist`，并把 `/api` 转发到 Flask。
- Flask 在 `app/__init__.py` 中注册 `health`、`api/docs` 与各个 `app/interfaces/api/v1/*` blueprint。

## 业务数据流

- 一般 CRUD 路径是 `API -> application handler/service -> repository -> PostgreSQL`。
- 典型例子包括数据源、数据集、查询、应用中心、配置中心等 API。
- `app/interfaces/api/v1/datasources.py` 和 `app/interfaces/api/v1/datasets.py` 体现了“请求体校验 -> command/query -> handler -> response”的基本模式。
- `app/interfaces/api/v1/queries.py` 和 `app/interfaces/api/v1/sql_lab.py` 体现了查询资产与 SQL 执行的双路径。

## 异步与后台流

- 任务队列基于 `Redis + RQ`，封装在 `app/infrastructure/tasks/task_queue.py`。
- Worker 入口有 `run_worker.py`、`start_rq_worker.sh` 和 `app/infrastructure/tasks/rq_worker.py`，语义上是同一类后台执行角色。
- `app/__init__.py` 会按 `web` / `worker` 两种角色初始化应用；`worker` 不注册 Web 路由，但会装配数据库、DI、事件处理器和执行器。
- 提取任务、SQL 异步查询、应用执行、飞书消息处理都可能借助队列或后台线程；其中飞书事件回调在 `app/interfaces/api/v1/feishu.py` 里使用后台线程做非阻塞落库。
- 当前后台执行不是独立工作流引擎；更接近“RQ 任务 + 事件处理 + 状态回写”的轻量模型。

## 语义资产流

- 语义中心是独立边界，不只是普通 CRUD。
- 语义文件仓储位于 `app/infrastructure/semantic/`，包含 `catalogs/`、`cubes/`、`domains/`、`views/`、`recipes/`。
- 语义 API 在 `app/interfaces/api/v1/semantic.py`，将服务注入到 `create_semantic_blueprint(...)` 后暴露。
- `app/application/semantic/semantic_definition_service.py` 负责 Cube/View 定义、展开、校验和缓存失效。
- `app/application/semantic/cube_modeling_service.py` 负责从真实数据源生成 Cube 草稿并回写 registry。
- `app/application/semantic/domain_modeling_service.py` 和 `app/application/semantic/domain_canvas_service.py` 负责目录、领域、Join 和画布视图。
- `app/application/semantic/view_publish_service.py` 负责把 View 逻辑发布成 virtual dataset，并把发布元数据写入 dataset 的 `file_metadata.semantic_publish`。
- `app/application/semantic/semantic_query_service.py` 负责语义 DSL 编译与执行，必要时通过 `SemanticRuntimeBindingService` 解析真实数据源、方言和 adapter。

## 关键抽象

- `app/application/semantic/semantic_service.py` 是兼容门面，主要是把旧调用方收敛到专用服务。
- `app/application/semantic/semantic_runtime_binding_service.py` 是 Cube 到真实数据源、方言、adapter、schema inspector 的绑定层。
- `app/domain/semantic/entities.py`、`join_graph.py`、`compiler.py`、`dialects.py` 共同定义语义 DSL、编译和关联约束。
- `app/domain/ports/...` 和 `app/domain/semantic/ports/...` 是仓储与外部能力的抽象边界，基础设施层只实现这些端口。
- `app/shared/response.py`、`app/shared/exceptions.py`、`app/interfaces/api/middleware/auth.py`、`app/interfaces/api/middleware/error_handler.py` 是 HTTP 协议与错误处理的通用约定。

## 重要边界

- 前端是独立 SPA，不应再把页面实现理解为服务端模板问题。
- 后端按 `web` / `worker` 角色复用同一套 App Factory，不要在 blueprint 里私自组装基础设施。
- 语义资产以文件仓储为主，数据库只保存平台元数据、发布结果和运行态状态。
- 异步链路优先维持“简单队列 + 状态回写”，没有明确需求时不要升级为更重的流程引擎。

## 参考路径

- `README.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/backend.md`
- `docs/architecture/frontend.md`
- `frontend/src/api/client.ts`
- `app/__init__.py`
- `app/di/container.py`
- `app/interfaces/api/v1/semantic.py`
- `app/infrastructure/semantic/`
