<!-- GSD:project-start source:PROJECT.md -->
## Project

**CUBIC3 企业数据应用平台**

这是一个面向企业内部场景的数据应用平台，定位在“数据应用层”而不是单一的数据接入工具或 BI 展示工具。平台围绕异构数据源查询、语义层建设、客制化数据应用，以及智能数据应用能力展开，主要服务数据建模工程师、数据分析师、数据产品经理，并逐步支持业务人员消费数据能力。

当前项目是 brownfield 演进型仓库，已有 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的平台骨架和多条业务链路。本轮工作的重点不是重新定义产品，而是在现有基础上把核心链路做稳、做通，形成内网单机部署下可持续演进的生产可用版本。

**Core Value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环。

### Constraints

- **Deployment**: 以内网单机 Docker 部署为当前交付目标 — 先让内部环境稳定可用，再考虑更复杂部署形态
- **Architecture**: 以现有项目技术栈和系统边界为准 — 当前阶段不做大规模技术迁移或架构翻新
- **Dependency**: 智能问数与 `DataAgent` 强依赖语义层完善 — 语义层稳定性直接决定上层能力可用性
- **Scope**: 优先打磨已有能力，不扩展新平台边界 — 避免在生产可用前继续增加系统复杂度
- **Quality**: 问数与 `DataAgent` 允许效果暂时不稳定 — 但必须形成从输入、编译/执行到结果返回的完整闭环
- **Operations**: 当前不追求云原生、高可用、多租户与权限治理 — 这些都属于后续阶段性扩展主题
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## 总览
- 当前主线是 `React SPA + Flask API + PostgreSQL/Redis/RQ`。
- 前端与后端均有独立入口，生产环境由 `Nginx` 托管前端静态产物并反向代理后端 API。
- 说明中的 Python 版本、部分集成能力与部署方式，有少量是从运行镜像或配置文件推断的；已在对应条目中标注。
## 语言与运行时
- `TypeScript 5`：前端主语言，见 `frontend/src/`。
- `JavaScript / JSX`：前端运行时代码与测试代码混用，见 `frontend/src/main.tsx`、`frontend/src/App.tsx`。
- `Python 3.11`：从 `Dockerfile` 的 `python:3.11-slim` 推断为当前后端运行时。
- `Node.js`：前端构建与测试运行时，版本未在仓库内单独锁定。
## 前端框架与库
- 框架：`React 18`、`React Router DOM 6`、`Vite 5`。
- 状态与数据请求：`@tanstack/react-query`、`axios`。
- UI 组件：`@radix-ui/*`、`lucide-react`、`overlayscrollbars`、`class-variance-authority`、`clsx`、`tailwind-merge`。
- 可视化与编辑：`@monaco-editor/react`、`recharts`、`@xyflow/react`、`elkjs`、`sql-formatter`。
- 表单与交互：`@rjsf/core`、`@rjsf/utils`、`@rjsf/validator-ajv8`、`react-day-picker`。
## 后端框架与库
- Web 框架：`Flask 3`，应用工厂见 `app/__init__.py`。
- ORM 与迁移：`Flask-SQLAlchemy`、`Flask-Migrate`，扩展初始化见 `app/extensions.py`。
- 依赖注入：`dependency-injector`，容器见 `app/di/container.py`。
- 配置校验：`pydantic 2`，环境装配见 `app/config_schema.py`。
- 认证：`PyJWT`。
- 异步与调度：`rq`、`redis`、`flask_apscheduler`、`apscheduler`。
- 通用能力：`requests`、`tenacity`、`PyYAML`、`pandas`、`sqlparse`、`psycopg2-binary`、`gunicorn`。
## 数据源与集成 SDK
- `pyodps`：MaxCompute 适配。
- `clickhouse-driver`：ClickHouse 适配。
- `pymysql`：MySQL 适配。
- `oss2`：对象存储交付。
- `openai`：LLM/OpenAI 兼容调用。
- `lark-oapi`：飞书长连接事件接收。
## 包管理器
- 前端使用 `npm`，依据 `frontend/package-lock.json` 与 `frontend/README.md`。
- 后端使用 `pip` + `requirements.txt`。
- 仓库内未看到 `poetry.lock`、`uv.lock` 或 `pnpm-lock.yaml` 作为主锁文件。
## 构建与测试工具
- 前端构建：`vite build`，入口脚本见 `frontend/package.json`。
- 前端类型检查：`tsc --noEmit`。
- 前端静态检查：`eslint`。
- 前端测试：`vitest`、`@playwright/test`、`@testing-library/*`。
- 后端测试：`pytest`、`pytest-cov`、`pytest-flask`、`pytest-mock`、`faker`。
- 部署与运行：`gunicorn`、`docker compose`、`Makefile`。
## 配置入口
- 后端环境模板：`env.sample`。
- 后端配置 Schema：`app/config_schema.py`。
- Flask 配置注入：`app/__init__.py`、`app/di/container.py`。
- 前端开发代理与端口：`frontend/vite.config.ts`。
- 前端脚本与依赖声明：`frontend/package.json`。
- 统一验证入口：`Makefile`。
- WSGI 入口：`wsgi.py`。
- RQ Worker 入口：`run_worker.py`。
- Docker 部署编排：`docker-compose.yml`、`Dockerfile`、`deploy.sh`。
## 实现备注
- `SQLite` 被 `app/config_schema.py` 允许作为开发/测试选项，但主部署与默认环境仍以 PostgreSQL 为准。
- `frontend/dist` 是 Docker/Nginx 场景下的静态产物，需先执行前端构建。
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## 范围与依据
- 以当前代码和基线文档为准，主要参考 `README.md`、`docs/TECH_STACK_AND_ARCHITECTURE.md`、`docs/architecture/README.md`、`frontend/README.md`、`docs/quality/testing.md`
- 历史材料放在 `docs/archive/` 和 `docs/archive/legacy/`，只用于背景，不作为当前实现规范
- 以下约定中，凡标注“推断”的内容，表示仓库现状一致但未见独立强制工具规则，属于归纳出的工作约定
## 语言与风格
- 后端以 Python 为主，前端以 TypeScript 为主，文档与注释以中文为主
- Python 文件使用 `snake_case`，类名使用 `PascalCase`，常量使用全大写；前端组件与页面文件使用 `PascalCase`，测试文件常用 `*.page.test.tsx`、`*.test.ts`
- 代码优先保持短函数、短文件、单一职责，避免把应用逻辑和基础设施逻辑混写
- 现有代码广泛使用类型注解、接口类型和显式返回值；新增代码应沿用同样的可读性标准
- 推断：仓库没有统一强制的 formatter 约束文档，但现有 Python 与 TypeScript 代码都倾向于简洁、显式、少嵌套的写法
## 分层规则
- 后端主分层是 `app/application`、`app/domain`、`app/infrastructure`、`app/interfaces`
- `app/domain` 只放实体、领域服务、端口和领域事件，不直接依赖 Flask、SQLAlchemy 适配器或外部服务实现
- 新实体禁止继承 `db.Model`：领域行为写成纯 Python 类放 `app/domain/entities/`，ORM 列定义放 `app/infrastructure/models/`（示范见 `datasource_behavior.py` + `infrastructure/models/datasource.py`）；存量 ORM 实体按需逐步迁移，不强制一次性翻新
- `app/application` 负责命令、查询、处理器和编排，通常只依赖领域端口和基础设施接口
- `app/infrastructure` 放仓储实现、缓存、队列、LLM 适配器、事件总线、语义 YAML 仓库等实现细节
- `app/interfaces/api/v1/` 只负责 HTTP 暴露和路由组装，推荐保持薄控制器风格
- 依赖装配集中在 `app/di/container.py`，App Factory 在 `app/__init__.py`
- 前端主入口是 `frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/src/api/client.ts`
## 命名与目录约定
- Flask Blueprint 通常命名为 `bp`，并放在对应接口模块内，例如 `app/interfaces/api/v1/datasets.py`
- 应用层处理器通常使用 `*Handler`，命令使用 `*Command`，查询使用 `*Query`
- 仓储接口一般放在 `app/domain/ports/repositories/`，实现放在 `app/infrastructure/repositories/`
- 前端 API 模块按业务域拆分到 `frontend/src/api/*.ts`
- 业务组件集中在 `frontend/src/components/business/`，页面级路由放在 `frontend/src/pages/`
- 语义中心相关页面、状态与测试集中在 `frontend/src/pages/Semantic/`
- 页面跳转与壳层布局由 `frontend/src/components/Layout/AppLayout.tsx` 和 `frontend/src/components/auth/ProtectedRoute.tsx` 管理
## API 设计模式
- 后端响应应优先使用 `app/shared/response.py` 的 `success()`、`error()`、`created()` 等封装，保持统一 JSON 结构
- 统一错误出口由 `app/interfaces/api/middleware/error_handler.py` 处理，自定义异常定义在 `app/shared/exceptions.py`
- 成功响应约定为 `{'code': 0, 'message': '...', 'data': ...}`，失败响应约定为 `{'code': -1, 'message': '...', 'details': ...}`，并尽量附带 `trace_id`
- 前端统一通过 `frontend/src/api/client.ts` 访问后端，默认 baseURL 为 `/api/v1`
- 前端拦截器负责注入 `auth_token`、处理 401 跳转、超时、网络错误和已知接口缺失提示
- API 模块应按业务域封装参数和返回类型，不直接在页面里散写 `axios` 调用
## 组件与页面模式
- 前端以 React SPA 为主，路由集中在 `frontend/src/App.tsx`
- 页面级组件优先懒加载，公共壳层统一走 `AppLayout`
- 通用 UI 基础组件位于 `frontend/src/components/ui/`，业务包装组件位于 `frontend/src/components/business/`
- 复用逻辑优先抽到 `frontend/src/hooks/`、`frontend/src/utils/`、`frontend/src/components/business/`
- 页面与组件测试通常使用 React Testing Library + Vitest，路由与异步数据依赖通过 `QueryClientProvider`、`MemoryRouter`、`vi.mock` 进行隔离
- 推断：仓库偏好“组合基础 UI 原语 + 业务封装”的方式，而不是直接回到 Ant Design 这类大而全组件栈
## 错误处理与可观测性
- 后端业务异常优先抛出 `app/shared/exceptions.py` 中的类型化异常，不要在控制器里吞错
- 记录日志时优先使用 `app/shared/utils/logger.py` 的结构化日志能力
- 请求上下文会注入 `request_id`，并在响应中回传 `trace_id`
- `app/__init__.py` 会在请求开始时建立请求上下文，在请求结束时清理上下文；新增代码应避免绕开这一流程
- 仓储和基础设施层遇到异常时应明确记录上下文，并在必要时回滚事务
## 文档更新期望
- 影响启动方式、端口、代理、脚本、路由、API 路径、验证入口或架构分层时，必须同步检查 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`、`docs/DOC_ALIGNMENT_REPORT.md`、`frontend/README.md`
- 影响系统边界、运行拓扑、异步任务模型、语义持久化方式时，必须同步检查 `docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/README.md`
- 影响验证入口、覆盖范围、smoke、coverage 或评审门槛时，必须同步检查 `docs/quality/testing.md`、`docs/quality/backend-coverage.md`、`docs/quality/review.md`、`docs/runbooks/local-dev.md`
- 新文档先判断归属：当前基线、架构说明、专题资料或历史归档，不要把一次性过程记录继续堆到首页
## 仓库工作流约束
- 统一验证入口以根目录 `Makefile` 为准，优先使用 `make setup`、`make lint`、`make typecheck`、`make test`、`make smoke`、`make verify`、`make verify-*`
- 改动范围不清楚时，优先用 `make verify-detect` 和 `make verify-changed` 路由到最低必跑目标
- `make lint`、`make typecheck`、`make test`、`make smoke` 的四层语义不要混用
- `make coverage` 和 `make coverage-*` 属于专项验证，不并入默认交付入口
- 仅文档改动也要检查文档健康和文档影响，必要时运行 `make verify-docs`、`make docs-impact`
- 不要手改 `docs/archive/` 里的历史结论来充当前基线；若历史结论已落地，应回写到当前基线文档
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

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
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
