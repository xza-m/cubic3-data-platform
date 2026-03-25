# Stack Research

**Domain:** 企业数据应用平台（语义层 + 异步任务 + 内部部署 + 分析 UX + AI 辅助）
**Researched:** 2026-03-25
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.x | SPA UI runtime | 2026 年的 React 基线已经转到 19.2；它保留了成熟的 SPA 生态，同时补齐了更现代的渲染与性能能力。当前仓库仍在 `frontend/package.json` 使用 React 18.2，适合分阶段升级，而不是为了“跟风”重写 UI。 |
| TypeScript | 5.x | 前端类型系统 | 数据平台页面多、状态多、语义建模和 SQL 编辑交互复杂，类型系统能显著降低回归成本。当前仓库在 `frontend/package.json` 仍是 5.3.3，建议继续沿用 TS 严格模式，但不必为了版本号做架构迁移。 |
| Vite | 8.0.x | 前端构建与开发服务器 | Vite 8 是 2026 年新的默认选择，构建速度和插件兼容性都更强。官方已明确其 Node 版本要求，适合内部平台的长期维护，但从 `frontend/package.json` 的 Vite 5 升级时要先验证 `@vitejs/plugin-react`、`@xyflow/react`、Monaco 相关插件。 |
| Flask | 3.1.x | 后端 API 框架 | 这个仓库已经是 Flask App Factory + REST API 形态，`app/__init__.py`、`wsgi.py`、`app/interfaces/api/v1/` 都说明它不是“顺手做一个 Jinja 网站”。Flask 3.1 仍然是企业内部门户和数据应用 API 的合理选择，迁移到 FastAPI 不会自动带来收益。 |
| SQLAlchemy + Flask-SQLAlchemy | 2.0.46 / 3.1.x | ORM 与数据库抽象 | SQLAlchemy 2.0 是当前现代 ORM 线，2.1 进一步把 PostgreSQL 默认驱动切到 psycopg3。对这个仓库来说，保留 SQLAlchemy 2.x 的表达式风格和仓库分层最稳妥；新代码应当朝 psycopg3 迁移，而不是继续扩展 `psycopg2-binary`。 |
| psycopg | 3.3.x | PostgreSQL 驱动 | Psycopg 3 是官方推荐的新一代 PostgreSQL Python 驱动，支持更现代的类型、连接池和异步能力。`requirements.txt` 目前还是 `psycopg2-binary==2.9.9`，适合把它视为遗留兼容项，而不是新开发默认。 |
| PostgreSQL | 18.3.x | 主元数据库 | PostgreSQL 18 是 2026 年当前主线版本，官方文档已把 18 标为 Current。对平台型数据应用来说，18.x 提供更好的性能、生成列、skip scan 和 AIO，适合作为新部署目标；如果现网还在 17.x，也可以先保守维持并安排窗口升级。 |
| Redis | 8.2.x | 缓存、队列与轻量协调 | Redis 8.2 已经 GA，适合同时承担缓存与 RQ 队列后端。对于这个仓库的工作负载，Redis 仍然是比引入 Kafka/RabbitMQ 更低运维成本的选择。 |
| RQ | 2.7.0 | 异步任务执行 | RQ 仍然足够适合当前仓库的异步查询、导出、推送、语义编译和通知类任务；`run_worker.py` 也已经按这个模式实现。它比 Celery 更轻，适合当前“内部平台 + 明确任务队列”的负载形态。 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | 5.17.9 | 服务端状态缓存与请求编排 | 适合查询中心、语义中心、应用中心这种“读多写少、状态分散”的 SPA 页面；当前 `frontend/src/api/client.ts` 的 axios 封装和 Query 配合是合理的。 |
| React Router DOM | 6.21.1 | 前端路由 | 继续用于 `frontend/src/App.tsx` 这类页面级路由组织。除非要引入框架级数据路由，否则没必要为 router 升级制造额外风险。 |
| Radix UI | 1.x | 无障碍基础组件 | 适合数据平台里大量表单、对话框、菜单、弹窗、下拉和提示；比重型组件库更容易保持统一视觉语言。 |
| Monaco Editor | 4.7.0 | SQL / YAML / DSL 编辑器 | 查询中心、语义建模和配置编辑场景都需要代码级编辑体验；当前仓库已有 `frontend/src/pages/Semantic/` 和 SQL 编辑相关页面，Monaco 是合适的标准件。 |
| Recharts | 2.10.3 | 图表展示 | 适合内部分析看板和结果可视化。若只需要基础图表，不必引入更重的可视化框架。 |
| `@xyflow/react` + ELK | 12.10.1 / 0.11.1 | 关系图、语义画布、建模编辑 | 语义中心本质上需要图形化建模和关系可视化，`frontend/src/pages/Semantic/` 已经在用这条路线，继续投资比迁移到别的画布库更划算。 |
| Flask-Migrate | 4.0.5 | 数据库迁移 | 适合 `app` 层的元数据表演进；只要 ORM 还在，迁移工具就应该保留。 |
| Pydantic | 2.x | 配置和输入校验 | 适合环境变量、任务配置、请求 DTO 和 AI/外部集成参数校验；在 `requirements.txt` 中已有依赖，建议继续作为边界校验层。 |
| PyYAML | 6.0.1 | 语义 YAML 持久化 | 语义中心依赖 YAML 资产管理时，PyYAML 是直接且够用的工具。 |
| `openai` | 1.x | AI 辅助能力边界 | 只在 DataAgent、智能问数、自动补全等验证态能力里使用；不要把它变成平台的核心耦合点。 |
| `lark-oapi` | 1.x | 飞书集成 | 适合内部平台的通知、长连接事件和协作触达；当前仓库已有这条集成路径。 |
| `sqlparse` | 0.5.0 | SQL 格式化与解析 | 适合 SQL 预览、格式化、轻量语法处理；不要把它当成完整 SQL 编译器。 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `make` | 仓库统一验证入口 | 当前仓库已经把 `make setup / lint / typecheck / test / smoke / verify-*` 做成固定契约，应继续作为协作入口，而不是改成各目录各跑各的。 |
| `npm` + `package-lock.json` | 前端依赖管理 | `frontend/README.md` 已明确当前包管理是 npm；不要在 brownfield 阶段切到 pnpm，除非你准备同步重做锁文件和 CI。 |
| `pytest` | 后端单测与集成测试 | 适合 Flask、仓储、任务、语义编译与 API 层验证。 |
| `vitest` | 前端单元测试 | 适合 React 组件、hook、页面状态与表单逻辑。 |
| `playwright` | 端到端与视觉回归 | 适合分析类 SPA 的关键路径、语义画布和查询工作台回归。 |
| `gunicorn` | 生产 WSGI 服务器 | `wsgi.py` 已暴露 Flask app，生产部署时应继续由 Gunicorn/Nginx 承接，而不是直接跑开发服务器。 |
| Docker Compose | 本地和内网部署拓扑 | 与 `docker-compose.yml`、`deploy.sh` 一起组成当前仓库的可复制部署路径。 |
| Nginx | 静态资源托管与反向代理 | 适合把 `frontend/dist` 和 Flask API 分离，保留前后端解耦。 |

## Brownfield 取舍

### 应该保留

- 保留 `React SPA` 作为主交互形态，继续围绕 `frontend/src/pages/`、`frontend/src/components/` 和 `frontend/src/api/client.ts` 演进。
- 保留 `Flask App Factory`、`app/interfaces/api/v1/`、`app/application/`、`app/domain/`、`app/infrastructure/` 这套分层，不要为了“现代化”把整个后端重写成另一个框架。
- 保留 PostgreSQL + Redis + RQ 这条主链路；它已经覆盖元数据、缓存和异步任务的主要诉求。
- 保留 `app/infrastructure/semantic/` 和 `frontend/src/pages/Semantic/`，因为语义层就是这个平台的差异化资产，不是可有可无的边角功能。
- 保留 `make` 作为统一验证入口，避免把质量门禁拆散到多个脚本和目录约定里。

### 应该扩展

- 扩展数据库驱动到 psycopg3，并逐步把新代码写在 SQLAlchemy 2.x 的现代 API 上，而不是继续复制 `psycopg2-binary` 时代的写法。
- 扩展语义中心的发布、校验、版本化、影响分析和审计链路，而不是把语义资产迁移到别的框架后重新实现一遍。
- 扩展异步任务为“显式任务 + 明确队列 + 可观测状态”，而不是把定时、重试、补偿混成临时脚本。
- 扩展 AI 辅助能力为受控边界服务，配套输入校验、调用审计和降级策略，不要让 smart querying 或 DataAgent 直接反向塑造主架构。

## Installation

```bash
# 前端
cd frontend
npm install

# 后端
python -m pip install -r requirements.txt

# 一次性准备本地环境
make setup
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React SPA + Flask API | Next.js + FastAPI | 只有在你要做公开站点、强 SEO、服务端渲染，或者需要非常多 async I/O 直连接口时才值得换。对这个内部数据平台，迁移成本大于收益。 |
| RQ + Redis | Celery + Redis / RabbitMQ | 当任务开始变成长链路工作流、需要复杂路由、chord、优先级、海量并发重试时再考虑。当前仓库的任务模型更像轻量后台作业，不需要 Celery 的完整重装甲。 |
| PostgreSQL 内置语义与平台元数据 | dbt / MetricFlow 作为主语义层 | 如果语义层主要服务于仓库外的统一数仓，而且建模和变换职责都在数据工程团队，就可以把 dbt 放到数据管线里；但这个仓库的语义中心应继续保留应用层语义资产。 |
| Flask + SQLAlchemy 2.x | FastAPI + SQLModel | 只有在你要新建一个高并发、强类型、OpenAPI-first 的独立服务时才更合适。对现有系统，保留 Flask 分层更稳。 |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `psycopg2-binary` 作为新代码默认驱动 | 它是旧时代兼容路径，和 SQLAlchemy 2.1 的默认趋势不一致；继续扩大它会把新代码锁死在旧 API 习惯里。 | `psycopg` 3.x，必要时用 `psycopg[binary]` 或 `psycopg[c]`。 |
| `Celery` 作为默认异步方案 | 对这个仓库的任务形态来说过重，配置、监控和部署面都会变大。 | 继续用 RQ；如果真有工作流编排需求，再评估 Temporal / Dagster。 |
| `Kafka` 作为后台任务队列 | 它解决的是事件流和高吞吐消息总线，不是当前这类平台后台作业的首选。 | Redis + RQ，足够轻，也更符合现有代码。 |
| `APScheduler` 作为多实例分布式调度器 | 它适合单进程或单 leader 调度，不适合作为横向扩展环境里的唯一调度中枢。 | 单独的 scheduler 进程、平台级 cron，或工作流引擎。 |
| `Jinja` 页面渲染作为主界面技术 | 当前仓库已经演进成 SPA；把页面层回退到模板渲染只会增加双栈复杂度。 | 保持 React SPA，并把 Flask 约束在 API 与服务端任务。 |
| `pnpm` / 锁文件切换 | 当前仓库已经明确使用 `npm` 和 `package-lock.json`，中途切换会带来无收益的工具链扰动。 | 继续 `npm`，除非准备同步做依赖治理。 |
| 先做 AI 主导重构 | smart querying 和 DataAgent 还在验证阶段，过早把它们当平台主干会把不稳定能力放大到核心链路。 | 把 AI 作为受控能力接入，先围绕语义中心、查询中心和审计闭环打底。 |

## Stack Patterns by Variant

**如果仍然是当前这种内部分析平台 + 语义中心 + 异步任务的形态：**
- 继续用 `React SPA + Flask API + PostgreSQL + Redis + RQ`。
- 因为它和当前仓库的 `frontend/package.json`、`requirements.txt`、`run_worker.py`、`wsgi.py`、`docker-compose.yml` 完全一致，维护成本最低。

**如果语义层成为最核心资产：**
- 把更多精力放到 `app/infrastructure/semantic/` 的模型校验、发布版本、影响分析和回滚能力上。
- 因为语义层的价值在“可控发布”，不在换框架。

**如果 AI 辅助功能从验证态进入生产态：**
- 只允许通过应用服务调用模型，不允许前端直连模型服务。
- 因为这样才能统一审计、限流、重试、降级和提示词治理。

**如果后台作业逐步发展成跨系统工作流：**
- 保留 RQ 处理轻任务，把真正的工作流编排迁到 Temporal / Dagster 一类工具。
- 因为 RQ 擅长轻量队列，不擅长复杂编排语义。

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React 19.2.x | `@vitejs/plugin-react` 4.x / `react-dom` 19.2.x | 当前仓库还在 React 18.2；升级前要跑完整的组件、表单、语义画布和 E2E 回归。 |
| Vite 8.0.x | Node.js 20.19+ / 22.12+ | Vite 8 官方已经明确 Node 要求；`frontend/vite.config.ts` 里的插件和别名配置要一起验证。 |
| Flask 3.1.x | Python 3.9+，建议 3.12 / 3.13 | Flask 官方文档已把 3.1.x 作为当前线，企业内网部署建议用仍受支持的较新 Python。 |
| SQLAlchemy 2.0.46 | psycopg 3.3.x | SQLAlchemy 2.1 起 PostgreSQL 默认驱动转向 psycopg3；新代码应当按这个方向写。 |
| psycopg 3.3.x | PostgreSQL 10-18 | Psycopg 3 官方文档已覆盖到 PostgreSQL 18；对这个仓库来说，和 PostgreSQL 18.3 组合最合理。 |
| RQ 2.7.0 | Redis >= 5 | RQ 官方 PyPI 页面明确要求 Redis >= 5；当前升级到 Redis 8.2 仍然兼容。 |
| PostgreSQL 18.3.x | 现有 SQLAlchemy 2.x / psycopg 3.x 连接栈 | 18.x 已是当前主线，适合内部生产；如果还在 17.x，先确保升级路径和索引验证。 |

## Sources

- React Blog: [React 19.2](https://react.dev/blog/2025/10/01/react-19-2) — React 19.2 作为当前官方发布线。
- React Blog: [React 19](https://react.dev/blog/2024/12/05/react-19) — React 19 的正式升级基线与迁移背景。
- Vite Blog: [Vite 8.0 is out!](https://vite.dev/blog/announcing-vite8) — Vite 8 稳定版、Rolldown 和 Node 要求。
- Flask Docs: [Welcome to Flask](https://flask.palletsprojects.com/) — Flask 3.1.x 当前文档与版本线。
- Flask Docs: [Installation](https://flask.palletsprojects.com/en/stable/installation/) — Flask 的 Python 版本支持与安装建议。
- SQLAlchemy Docs: [SQLAlchemy 2.0 Migration Guide](https://docs.sqlalchemy.org/20/changelog/migration_20.html) — SQLAlchemy 2.0 作为现代 ORM 基线。
- SQLAlchemy Docs: [What’s New in SQLAlchemy 2.1?](https://docs.sqlalchemy.org/21/changelog/migration_21.html) — PostgreSQL 默认驱动切到 psycopg3。
- Psycopg Docs: [The Psycopg 3 project](https://www.psycopg.org/psycopg3/) — psycopg3 的项目定位与能力说明。
- Psycopg Docs: [Installation](https://www.psycopg.org/psycopg3/docs/basic/install.html) — psycopg3 支持的 Python / PostgreSQL 范围。
- PostgreSQL Docs: [Current documentation](https://www.postgresql.org/docs/current/) — PostgreSQL 18.3 当前文档与支持版本。
- PostgreSQL Docs: [Release 18](https://www.postgresql.org/docs/release/18.0/) — PostgreSQL 18 的关键新特性与版本背景。
- Redis Docs: [Redis 8.2](https://redis.io/docs/latest/develop/whats-new/8-2/) — Redis 8.2 当前功能与改进。
- Redis Blog: [Redis 8.2 GA](https://redis.io/blog/redis-82-ga/) — Redis 8.2 作为 GA 版本的官方说明。
- RQ PyPI: [rq](https://pypi.org/project/rq/) — RQ 2.7.0 与 Redis 依赖要求。
- 仓库现状参考: `frontend/package.json`, `requirements.txt`, `app/__init__.py`, `app/interfaces/api/v1/`, `app/infrastructure/semantic/`, `frontend/src/pages/Semantic/`, `run_worker.py`, `wsgi.py`, `docker-compose.yml`, `deploy.sh`, `frontend/vite.config.ts`

---
*Stack research for: 企业数据应用平台（语义层 + 异步任务 + 内部部署 + 分析 UX + AI 辅助）*
*Researched: 2026-03-25*
