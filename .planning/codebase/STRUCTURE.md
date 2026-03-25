# 目录结构映射

## 顶层布局

- `app/`：后端主代码，包含 API、应用层、领域层、基础设施和依赖注入。
- `frontend/`：独立 React SPA，包含页面、组件、Hook、API 封装和前端测试。
- `docs/`：当前知识库与架构基线，优先级高于 `docs/archive/`。
- `migrations/`：数据库迁移脚本。
- `schema/`、`sql/`：SQL 和数据库相关脚本，具体用途以文件内容为准。
- `tests/`：后端测试与集成验证。
- `scripts/`：仓库级校验、文档检查和辅助脚本。
- `nginx/`、`Dockerfile`、`docker-compose.yml`、`deploy.sh`：部署和交付入口。
- `.planning/codebase/`：本次映射输出目录，仅放结构和架构地图。

## 后端目录

- `app/__init__.py`：Flask App Factory，注册路由、事件处理、请求上下文和角色初始化。
- `app/interfaces/api/v1/`：HTTP API 入口，按业务域拆分 blueprint。
- `app/application/`：用例层。新增业务动作优先放这里，再由 API 调用。
- `app/domain/`：领域模型、端口、领域服务、语义 DSL。
- `app/infrastructure/`：仓储实现、外部服务适配、缓存、队列、事件、语义 YAML 资产。
- `app/di/container.py`：依赖装配和生命周期管理。
- `app/shared/`：通用响应、异常、工具函数、枚举。
- `app/interfaces/channels/`：外部信道适配入口，和 API 层是不同职责。
- `app/executors/`：执行器与后台任务相关逻辑，部分路径在当前代码里仍保留为过渡结构。

## 前端目录

- `frontend/src/main.tsx`：前端应用入口。
- `frontend/src/App.tsx`：总路由入口，定义受保护路由和业务域路由。
- `frontend/src/api/`：按业务域划分的 API 封装。
- `frontend/src/pages/`：页面级路由实现，按业务域继续拆分子目录。
- `frontend/src/components/ui/`：基础 UI primitives。
- `frontend/src/components/business/`：可复用业务组件。
- `frontend/src/components/Semantic/`：语义中心专用组件。
- `frontend/src/components/Layout/`：全局壳层组件。
- `frontend/src/hooks/`：通用 Hook 和语义中心 Hook。
- `frontend/src/lib/`、`frontend/src/utils/`、`frontend/src/types/`：前端工具、状态辅助和类型定义。

## 语义中心目录

- 后端语义文件仓储在 `app/infrastructure/semantic/`。
- 领域建模与查询服务在 `app/application/semantic/`。
- 前端语义工作台在 `frontend/src/pages/Semantic/` 和 `frontend/src/components/Semantic/`。
- 语义中心是双边目录：后端负责定义、编译、发布和注册，前端负责工作台交互、画布、调试和校验提示。

## 页面与功能区

- `frontend/src/pages/Dashboard.tsx`：平台总览。
- `frontend/src/pages/Datasources.tsx`、`frontend/src/pages/Datasets.tsx`：数据中心。
- `frontend/src/pages/QueryCenter/`：查询中心、模板、历史、可视化构建和计划查询。
- `frontend/src/pages/DataChat.tsx`：智能问数入口。
- `frontend/src/pages/AppCenter/`：应用市场、实例与执行监控。
- `frontend/src/pages/ConfigCenter/`：渠道和订阅管理。
- `frontend/src/pages/Login.tsx`：登录和认证入口。

## 命名与组织习惯

- 后端 API 统一采用 `v1` 命名空间，如 `app/interfaces/api/v1/datasets.py`。
- 业务域内常见命名是 `commands`、`queries`、`handlers`、`schemas`，表示 CQRS 风格的用例拆分。
- 领域实体通常放在 `app/domain/entities/`，语义专用实体放在 `app/domain/semantic/`。
- 前端页面文件通常是 `PascalCase.tsx`，测试文件通常以 `.page.test.tsx` 结尾。
- 前端 API 模块通常按资源名命名，如 `datasources.ts`、`datasets.ts`、`semantic.ts`。
- 语义 YAML 文件按对象类型拆分到 `catalogs/`、`cubes/`、`domains/`、`views/`、`recipes/`。

## 常见改动位置

- 改接口路径或请求/响应格式：优先改 `app/interfaces/api/v1/*`，同步调整 `frontend/src/api/*`。
- 改数据源或数据集行为：看 `app/application/datasource/`、`app/application/dataset/`、`app/infrastructure/repositories/`。
- 改查询中心：看 `app/application/query/`、`app/interfaces/api/v1/queries.py`、`app/interfaces/api/v1/sql_lab.py`、`frontend/src/pages/QueryCenter/`。
- 改异步任务：看 `app/infrastructure/tasks/`、`app/infrastructure/queue.py`、`run_worker.py`、`start_rq_worker.sh`。
- 改语义中心：看 `app/application/semantic/`、`app/infrastructure/semantic/`、`app/interfaces/api/v1/semantic.py`、`frontend/src/pages/Semantic/`。
- 改应用中心：看 `app/interfaces/api/v1/apps.py`、`app/interfaces/api/v1/app_instances.py`、`app/interfaces/api/v1/app_executions.py` 和前端 `frontend/src/pages/AppCenter/`。
- 改登录或认证：看 `app/interfaces/api/v1/auth.py`、`app/interfaces/api/middleware/auth.py`、`frontend/src/pages/Login.tsx`。
- 改部署和启动：看 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`、`frontend/README.md`、`Makefile`、`docker-compose.yml`、`nginx/`。

## 维护约定

- 当前基线优先于历史归档；不要把 `docs/archive/` 当作默认现状。
- `.planning/codebase/` 只存映射输出，不应混入产品实现。
- 不确定某段代码所属边界时，优先按“请求入口 -> 用例层 -> 领域层 -> 基础设施层”顺序判断。
- 如果一个改动同时影响前后端，先定位后端 API 契约，再回头改前端消费面。
