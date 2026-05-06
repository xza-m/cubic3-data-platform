---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-04-25
---

# CUBIC3

> 3 Layers: Source, Semantic, Application

CUBIC3（仓库名 `cubic3-data-platform`）是一个面向企业数据场景的数据应用平台。当前代码基线已经演进为 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的分层架构，覆盖数据接入、数据集管理、SQL 查询、智能问数、语义建模、应用编排与消息推送。

## 当前文档基线

以下文档已按当前实现对齐：

- [README.md](README.md)
- [docs/readme.md](docs/readme.md)
- [docs/TECH_STACK_AND_ARCHITECTURE.md](docs/TECH_STACK_AND_ARCHITECTURE.md)
- [docs/QUICK_START.md](docs/QUICK_START.md)
- [docs/STARTUP_GUIDE.md](docs/STARTUP_GUIDE.md)
- [docs/quality/testing.md](docs/quality/testing.md)
- [docs/quality/backend-coverage.md](docs/quality/backend-coverage.md)
- [docs/quality/frontend-coverage.md](docs/quality/frontend-coverage.md)
- [docs/quality/frontend-v2-route-api-audit.md](docs/quality/frontend-v2-route-api-audit.md)
- [docs/quality/review.md](docs/quality/review.md)
- [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md)
- [frontend/README.md](frontend/README.md)
- [docs/DOC_ALIGNMENT_REPORT.md](docs/DOC_ALIGNMENT_REPORT.md)
- [docs/KNOWLEDGE_BASE_GOVERNANCE.md](docs/KNOWLEDGE_BASE_GOVERNANCE.md)
- [docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md](docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md)

以下文档保留为历史迁移/修复记录，不作为当前实现基线：

- [docs/archive/legacy/MIGRATION_GUIDE.md](docs/archive/legacy/MIGRATION_GUIDE.md)
- [docs/archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md](docs/archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md)
- [docs/archive/legacy/FRONTEND_FIX_SUMMARY.md](docs/archive/legacy/FRONTEND_FIX_SUMMARY.md)
- `docs/archive/legacy/METADATA_SYNC_*.md`

## 知识库入口

如果你把 `docs/` 当作项目级知识库使用，建议从这些入口开始：

- [文档中心](docs/readme.md)
- [测试与验证约束](docs/quality/testing.md)
- [后端覆盖率看板](docs/quality/backend-coverage.md)
- [前端覆盖率看板](docs/quality/frontend-coverage.md)
- [v2 路由与 API 契约审计](docs/quality/frontend-v2-route-api-audit.md)
- [评审规则](docs/quality/review.md)
- [本地开发运行手册](docs/runbooks/local-dev.md)
- [知识库治理规范](docs/KNOWLEDGE_BASE_GOVERNANCE.md)
- [知识库维护 SOP](docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md)
- [架构设计目录](docs/architecture/README.md)
- [PRD 目录](docs/prd/README.md)
- [设计参考目录](docs/reference-design/README.md)
- [历史归档目录](docs/archive/README.md)
- [历史专题目录](docs/archive/legacy/README.md)

## 核心能力

### Source Layer

- 数据源管理：支持 PostgreSQL、MySQL、ClickHouse、MaxCompute 等数据源接入
- 数据集管理：注册物理表、文件数据集和 SQL 生成的数据集
- 元数据刷新：同步表结构并维护字段级元数据
- 数据提取：支持任务化抽取、运行记录与结果交付

Phase 1 当前已验证的数据中心主链路基线为：

- 数据源：`PostgreSQL`、`MaxCompute`
- 数据集：`physical`、`virtual`、`file`
- 文件格式：`CSV / XLS / XLSX`
- 运行目标：现有容器体系可支撑联调与验证，不承诺一键部署收口

### Semantic Layer

- Cube 建模：基于物理表草拟 Cube 并保存为 YAML 定义
- 领域建模：用目录、领域和 Join 关系组织业务语义
- View / Recipe 管理：沉淀可复用的语义视图和分析配方
- 语义查询：通过语义定义生成可执行查询
- 业务语义层：引入 `BusinessObject / BusinessProperty / BusinessMetric / Glossary`，作为内部 `Ontology` 实现的最小业务语义骨架
- 对齐检查与投影预览：通过内部对齐检查能力（`Semantic Mapper`）做只读投影、一致性检测和 stale 告警
- 执行预览：通过内部执行预览能力（`Execution Compiler Preview`）生成伪 SQL / 计划预览，验证业务语义是否具备落地执行可能
- 指标联邦追踪：支持 `BusinessMetric -> Measure/Cube` 正向追踪与 `Measure -> BusinessMetric` 反向追踪，形成最小 Metric Federation 闭环
- 关系/动作投影预览：支持 `BusinessRelation -> Join Path` 与 `BusinessAction -> Event Fact Cube` 的最小预览与 stale 校验
- 语义路由预演：通过内部 `Semantic Router / Planner` 的增强骨架，支持对象 / 关系 / 动作 / 业务指标的多意图命中，输出 `cube / knowledge / hybrid / tool / blocked` 路由，并给出 `planning_mode`、多步 planning steps 与可回溯计划
- 语义路由执行：`/api/v1/semantic-router/execute-plan` 已打通最小真实执行，可将稳定 plan 直接下发到内部统一执行运行时
- 计划协议稳定化：`/api/v1/semantic-router/plan` 现已补齐 `dependencies / expected_outputs / execution_targets / step_key` 等字段，前端不再自行拼接 planning 语义
- 统一执行预览：内部 `Execution Compiler` 已支持统一预览 `SQL / Retrieval / Tool Call` 三类执行目标，形成最小统一执行预览与运行时入口
- 最小统一执行运行时：`/api/v1/execution-compiler/execute` 已打通 `SQL / Retrieval / Tool` 三类最小真实执行，其中 `Tool` 当前只开放只读工具链
- 语义权限：支持最小权限元数据（内部实现为 `Policy Metadata`）的定义与查询，并将对象 / 动作 / 业务指标的可见性挂接到语义执行层
- 业务语义工作台首期版本：前端已提供 `/semantic/ontology`，覆盖对象、属性、关系、动作、业务指标、术语、语义权限的最小建模、投影预览、指标联邦追踪，以及业务语义与 `Cube` 的最小双向回看入口
- 权限产品化收口：`业务语义工作台` 中的权限页已支持 `Policy Impact` 治理影响总览、影响范围说明和真实治理挂点预演，可直接看到 `viewer_roles` 在语义路由与执行预览上的 `allow / blocked` 结果
- 治理执行留痕：`/api/v1/execution-compiler/execute` 现已返回统一 `governance_trace`，`业务语义工作台` 权限页可直接查看最近治理执行结果、命中策略与执行状态
- 语义路由产品化收口：`业务语义工作台` 中的对象 / 关系 / 动作 / 业务指标页已接入“运行时路由预演”，可直接查看 `route_type`、`planning_mode`、多意图命中结果、planning steps 与 traceability，而无需离开当前语义上下文
- 运行时执行收口：`业务语义工作台` 的运行时面板现可手动触发 `execute-plan`，直接查看最近执行结果、执行状态、审计记录和执行回溯，不再停留在纯预演阶段
- 执行预览产品化收口：`业务语义工作台` 已在业务指标与权限页接入统一执行预览，可直接查看编译产物、Bindings、Traceability 与执行计划
- 发布链与资产生命周期间：`业务语义工作台` 已补入统一的“发布资产 / 影响分析 / 历史记录”面板，支持调用 `/api/v1/ontology/<entity>/<name>/publish|impact|history`
- 发布失败内联反馈：`业务语义工作台` 的生命周期面板已支持展示最近一次发布失败原因，用户无需只依赖 toast 判断阻断点
- 治理审计查询：已补入 `/api/v1/ontology/policies/<name>/audit` 与 `/api/v1/governance/audit-traces/<id>`，用于查看策略命中记录与单条治理审计详情
- 治理审计列表：已补入 `/api/v1/governance/audit-traces`，支持按 `policy / target_type / target_name / decision / route_type` 查询最近治理命中记录
- 业务语义工作台治理筛选：权限页的“最近审计记录”现已支持按 `决策` 与 `路由` 筛选，便于聚焦订单域的放行、阻断与直连执行链
- 问数主链收口：`/api/v1/conversations/<id>/messages` 现优先尝试走语义路由与统一执行运行时，仅在未命中或执行失败时回退 Agent / 传统 LLM
- 问数语义回溯后端能力：`/api/v1/conversations/<id>/messages` 会在对话上下文中返回语义执行来源信息；当前 v2 前端 `/data-chat` 仍是占位页，尚未恢复完整智能问数 UI。
- 业务语义优先发布校验：激活带 `certified=true` 的 Measure 时，若未关联任何 `BusinessMetric.measure_refs`，将阻止发布并返回明确错误
- 业务语义资产发布校验：业务指标、关系、动作、权限在发布前会校验依赖对象是否已激活、是否具备最小分析投影依据；发布失败会直接阻断，而不是先激活再靠人工补救
- 订单域模板基线：`/api/v1/ontology/templates/order-domain` 与 `业务语义工作台` 已支持预览并一键应用订单域模板，用于快速生成首个标准对象/属性/关系/动作/指标/术语/权限样板，并作为后续第二域复制基线

### Application Layer

- 工作台：首页通过 `/api/v1/dashboard/overview` 聚合真实统计、近期查询和健康指标
- 查询中心：SQL 编辑、模板、收藏、历史、异步查询
- 智能问数：多轮对话、上下文记忆、图表可视化
- 应用中心：应用定义、实例管理、执行监控
- 配置中心：渠道、订阅、投递规则
- 飞书集成：SSO、消息通知、长连接事件处理

当前前端主入口已经收口为：

- 工作台：`/dashboard`
- 查询分析中心：`/queries`
- 建模助手 Agent：`/semantic/modeling-agent/new`
- 业务语义工作台：`/semantic/ontology`
- 语义诊断工作台：`/semantic/workbench`

查询中心的 `/queries/history`、`/queries/visual`、`/queries/my`、`/queries/scheduled`、`/queries/exports` 是当前有效子路由；旧的 `/queries/editor`、`/queries/templates` 以及语义中心旧别名路由只保留兼容重定向，不再作为主 IA。

当前后端新增了与双层语义架构对应的 API 前缀：

- `/api/v1/ontology`
- `/api/v1/semantic-mapper`
- `/api/v1/semantic-router`
- `/api/v1/execution-compiler`
- `/api/v1/semantic/modeling-agent`

其中当前已落地的 Phase 2 增强包括：

- `/api/v1/ontology/metrics/<name>/links`
- `/api/v1/semantic-mapper/measure-backlinks`
- `/api/v1/semantic-mapper/cube-backlinks`

当前已落地的 Phase 3 最小增强包括：

- `/api/v1/ontology/relations`
- `/api/v1/ontology/actions`

当前已落地的 Phase 4 最小增强包括：

- `/api/v1/semantic-router/route`
- `/api/v1/semantic-router/plan`
- `/api/v1/semantic-router/execute-plan`

当前已落地的 Phase 5 最小增强包括：

- `/api/v1/execution-compiler/compile-preview`：支持 `sql / retrieval / tool`
- `/api/v1/execution-compiler/plan-preview`：返回统一执行计划预览结构
- `/api/v1/execution-compiler/execute`：支持 `sql / retrieval / tool` 最小真实执行，并统一返回 `governance_trace / audit_trace_id`

当前已落地的建模助手 Agent 最小增强包括：

- `/api/v1/semantic/modeling-agent/spec-draft`
- `/api/v1/semantic/modeling-agent/draft-from-spec`
- `/api/v1/semantic/modeling-agent/validate`
- `/api/v1/semantic/modeling-agent/agent-ready-check`
- `/api/v1/semantic/modeling-agent/apply`
- `/api/v1/semantic/modeling-agent/publish`
- `/api/v1/semantic/domains/<domain_id>/context-preview`

当前已落地的 Phase 6 最小增强包括：

- `/api/v1/ontology/policies`
- `/api/v1/ontology/policies/<name>/impact`
- `/api/v1/ontology/policies/<name>/audit`
- `/api/v1/ontology/<entity>/<name>/publish`
- `/api/v1/ontology/<entity>/<name>/impact`
- `/api/v1/ontology/<entity>/<name>/history`
- `/api/v1/governance/audit-traces`
- `/api/v1/governance/audit-traces/<id>`
- 执行预览支持按 `viewer_roles` 返回 `allow / blocked`
- 语义路由支持基于对象 / 动作 / 业务指标的最小语义权限阻断

## 当前技术架构

### 前端

- React 18 + TypeScript 5
- Vite 5 + React Router 6
- TanStack Query 5
- Radix UI primitives + 自定义业务组件
- Tailwind 风格的工具类样式与业务组件封装
- Monaco Editor、Recharts、`@xyflow/react`、ELK

### 后端

- Flask 3 App Factory
- Flask-SQLAlchemy + Flask-Migrate
- `dependency-injector` 统一依赖装配
- `application / domain / infrastructure / interfaces` 分层
- 新增 `domain/ontology`、`application/ontology`、`application/semantic_mapper`、`application/semantic_router`、`application/execution_compiler`
- RQ + Redis 异步任务
- APScheduler 定时任务
- Pydantic 环境配置校验

### 基础设施

- PostgreSQL：平台元数据存储
- Redis：缓存、任务队列、异步执行协调
- Nginx：生产静态资源与反向代理
- OpenAI 兼容 LLM、飞书、Superset、OSS 集成

## 代码结构

```text
.
├── app/
│   ├── application/            # 应用层：commands / queries / handlers / services
│   ├── domain/                 # 领域层：实体、端口、领域服务、语义模型（含 semantic / ontology）
│   ├── infrastructure/         # 基础设施：仓储、适配器、缓存、任务、事件总线
│   ├── interfaces/api/v1/      # REST API
│   ├── di/                     # 依赖注入容器
│   └── config_schema.py        # Pydantic 配置定义
├── Makefile                    # 根目录统一验证入口
├── frontend/
│   ├── src/api/                # 前端 API 封装
│   ├── src/components/         # UI primitives 与业务组件
│   ├── src/pages/              # 页面级路由
│   └── vite.config.ts          # 开发端口与 API 代理
├── docs/                       # 项目文档
├── schema/                     # SQL / 扩展脚本
├── docker-compose.yml          # 本地 Docker 编排
└── deploy.sh                   # 生产部署脚本
```

## 快速开始

如果你希望先把本地依赖和基础环境一次性准备好，优先执行：

```bash
make setup
```

### 方式一：Docker 体验完整栈

1. 复制环境变量模板并按需修改：

```bash
cp env.sample .env
```

2. 启动服务：

```bash
docker compose up --build -d
```

3. 访问入口：

- 前端：`http://localhost:81`
- 后端 API：`http://localhost:5000`
- API 文档：`http://localhost:5000/api/docs`
- 健康检查：`http://localhost:5000/health`

### 方式二：本地开发

后端：

```bash
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

前端：

```bash
cd frontend
npm run dev
```

Worker：

```bash
python run_worker.py
```

说明：

- Web 进程负责 API 与 `APScheduler` 固定周期调度注册
- `run_worker.py` 负责消费目录同步、数据集同步等长耗时 RQ 任务

默认情况下，Vite 开发服务器运行在 `http://localhost:3000`。如果你没有启动 Nginx，而是直接让前端代理到 Flask，请显式设置：

```bash
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

## 常用命令

```bash
# 初始化本地依赖
make setup

# 层 1：静态检查
make lint

# 层 2：类型与接口检查
make typecheck

# 层 3：自动化测试
make test
make test-unit
make test-integration

# 层 4：运行验证
make smoke

# 默认总入口
make verify

# 按当前改动检测或执行最低必跑集合
make verify-detect
make verify-changed

# 检查当前改动是否遗漏关键文档更新
make docs-impact

# 按范围进入可交付状态
make verify-backend
make verify-frontend
make verify-docs

# 语义中心专项校验
make verify-semantic
make smoke-semantic

# 可选：coverage 专项验证（不在默认闸门里）
make coverage            # 聚合：== coverage-backend（frontend 已退役 skip）
make coverage-backend    # 跑完整 pytest + ratchet 防倒退校验
make coverage-report     # 生成前后端数字报告，不设阈值，仅供查看

# 本地闸门（GitLab CI 基建未就位时的替代入口）
# local-ci 是 verify-frontend 去掉 smoke/integration 的严格子集，
# local-smoke 是 smoke-frontend 的别名 —— 两者复用同一套原子 target，
# 避免与 verify-frontend 出现定义漂移。
make local-ci        # lint + tokens + i18n + tsc + vitest + v2 build，~1-2 min，无需 docker
make local-smoke     # == smoke-frontend（Playwright v2 e2e:smoke），前端需已运行在 http://127.0.0.1:3000
```

### 本地 Git Hooks（pre-commit / pre-push）

仓库根目录放了一套基于 `husky` 的本地闸门，用来在 GitLab CI 上线前兜底：

- `pre-commit`: 只对 staged 的 `*.{ts,tsx,css}` 跑 `lint-staged`（eslint/stylelint `--fix`），目标 `< 5s`。
- `pre-push`: 跑 `cd frontend && npm run ci:pre-push`，等价于 `lint + vitest + v2 build`，目标 `< 90s`。
- 紧急逃生门：`git commit --no-verify` / `git push --no-verify`。

首次签出仓库后执行 `cd frontend && npm install` 会自动执行 `prepare` 脚本将
`core.hooksPath` 指向 `.husky/`，hooks 随之生效；如需手动开启：

```bash
git config core.hooksPath .husky
```

### 覆盖率门槛（Round 4 · D+28 校准）

- **后端**：真实水位 `96.49%`（2026-04-22 全量 `pytest tests` 基线，1916 tests passed）。`pytest.ini` 基线 `--cov-fail-under=95`；`scripts/backend_coverage_rules.json` 采用「已达高位 + 防倒退」策略 —— 总阈值 `95%`（现值 - 1.5pp buffer）、`module_threshold = 80%`（防止任何模块严重倒退，当前最低 `infrastructure.users 85.49%`），`core_modules` 列出 20 个核心模块各自按现值向下留 buffer 的下限。谁把这些覆盖率压下去 `make coverage-backend` 就报错。详见 [docs/quality/backend-coverage.md](docs/quality/backend-coverage.md)。
  - **注意**：`coverage.xml` 是 stale artifact；如果没跑过 `make coverage-backend` 或 `PYTHONPATH=. pytest tests`，磁盘上的 `coverage.xml` 可能是只跑部分 suite 的旧快照，会给出误导性的低数字。任何覆盖率分析前请先生成新鲜的全量 `coverage.xml`。
- **前端**：原先的 90% 总门槛 + 21 个核心页 100% 规则在 v2 cutover 中已随 `src/pages/*` 一起作废（规则里 21 个核心页路径全部不存在）。前端覆盖率守护现在由 `frontend/vitest.config.ts` 的**子树阈值**接管：`src/v2/components/**`、`src/v2/hooks/**`、`src/v2/lib/**` 三个子树各要求 `statements/branches/functions/lines` 均 ≥ `80%`，每次 `make test-frontend` / `npm run test:unit` / pre-push hook 都会卡这个门槛。`make coverage-frontend` 现在只打印退役说明并 skip，`scripts/checks/frontend_coverage_guard.py` 和 `scripts/frontend_coverage_rules.json` 已删除。详见 [docs/quality/frontend-coverage.md](docs/quality/frontend-coverage.md)。
- **看数字不卡阈值**：`make coverage-report` 会跑一次前后端完整 coverage 并打印数值，用于 sprint 末决定是否把某个模块下限再抬一档。

# 查看 Docker 日志
docker compose logs -f

# 单独查看后端或 Worker
docker compose logs -f backend
docker compose logs -f rq_worker

## 关键入口

- Flask App Factory：`app/__init__.py`
- DI 容器：`app/di/container.py`
- 后端启动入口：`wsgi.py`
- Worker 启动脚本：`run_worker.py`
- 前端挂载入口：`frontend/src/main.tsx`
- v2 路由入口：`frontend/src/v2/routes.tsx`
- v2 API 客户端：`frontend/src/v2/api/client.ts`

## 参考文档

- [docs/readme.md](docs/readme.md)
- [docs/TECH_STACK_AND_ARCHITECTURE.md](docs/TECH_STACK_AND_ARCHITECTURE.md)
- [docs/QUICK_START.md](docs/QUICK_START.md)
- [docs/STARTUP_GUIDE.md](docs/STARTUP_GUIDE.md)
- [docs/DOC_ALIGNMENT_REPORT.md](docs/DOC_ALIGNMENT_REPORT.md)
- [docs/semantic_verification.md](docs/semantic_verification.md)

## 说明

仓库中仍保留部分历史文档和迁移记录，用于追溯演进过程。若文档描述与代码冲突，请以当前实现和上面的“当前文档基线”为准。

## 校验入口约定

为降低 agent 和协作者对“应该跑什么”的猜测成本，仓库根目录已固定以下入口：

- `make setup`
- `make lint`
- `make typecheck`
- `make test`
- `make smoke`
- `make verify`
- `make verify-detect`
- `make verify-changed`
- `make docs-impact`
- `make review`

其中 `make verify-detect` 负责按当前变更匹配规则并给出推荐入口，`make verify-changed` 负责按检测结果执行最低必跑集合，`make docs-impact` 负责检查高风险改动是否遗漏关键知识库文档更新。语义中心保留专项入口 `make verify-semantic`，用于需要跑语义布局校验和语义 smoke 的改动。
