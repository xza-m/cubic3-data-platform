---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-19
---

# 测试与验证约束

本文档定义仓库统一验证入口、分层原则和按改动范围下钻的验证矩阵。
它回答的是“什么状态才算可交付，以及交付前必须跑哪些验证”。
目标不是把所有检查塞进 `make test`，而是让每一层失败信号都清楚可见，便于协作者和 agent 稳定执行。

进入“可开发状态”的环境准备、联调模式和本地服务就绪要求，不在这里展开，统一见 `docs/runbooks/local-dev.md`。
测试通过后，是否应接受这次改动，由 `docs/quality/review.md` 负责定义。

## 1. 职责边界

- `AGENTS.md`：只定义完成标准、验证原则和统一入口引用，不维护路径匹配或脚本实现。
- `docs/quality/testing.md`：定义人可读的验证规则，包括分类语义、升级原则、状态契约和“哪类改动至少对应哪类验证要求”。
- `docs/quality/review.md`：定义测试通过后仍可能拒绝合并的评审规则。
- `scripts/verify_rules.json`：定义机器可读规则表，是路径类别到验证要求的唯一匹配数据源。
- `scripts/checks/changed_validation.py`：读取显式文件列表，或显式提供的 `git diff` 基线，匹配规则表，输出或执行 `make verify-*`；它负责路由，不负责再发明规则。
- `Makefile`：对外暴露稳定命令面，协作者和 agent 只通过固定入口调用验证。

## 2. 设计原则

- 一级入口按层固定：`make lint`、`make typecheck`、`make test`、`make smoke`、`make verify`
- 交付入口按范围固定：`make verify-backend`、`make verify-frontend`、`make verify-docs`、`make verify-semantic`
- 生产候选入口按专项固定：`make verify-semantic-prod` 只用于语义平台生产候选，不并入默认仓库验证；上线前使用 `make verify-semantic-prod-strict`，强制要求预生产 DB、live smoke、fixture cleanup 和真实 PostgreSQL 并发补证
- coverage 单独定义为专项验证或质量门槛，不并入默认 `make verify`；是否执行 coverage 取决于当前任务类型、评审要求和质量治理目标
- 二级入口按边界或专项拆分：前端、后端、契约、平台回归、语义专项
- 路径匹配和入口选择由 `scripts/verify_rules.json` 与 `scripts/checks/changed_validation.py` 负责，文档不再维护第二套路由表
- 未配置的检查不省略，必须显式 `skip`
- `make verify-*` 用于按范围确认“可交付”，`make verify` 是跨域或不确定影响面时的仓库级收口入口
- 不把静态检查、类型检查、自动化测试、运行验证重新揉成黑箱脚本

这套约束符合：

- KISS：一级命令少且稳定
- SOLID：每层只表达一种失败语义
- DRY：统一入口只做编排，不重复实现底层检查
- YAGNI：当前没有的工具链先显式 `skip`，不虚构能力

## 3. 一级入口

| 层级 | 目标 | 失败信号 | 当前作用 |
|---|---|---|---|
| 层 1 | `make lint` | 静态规则、格式、导入、禁用模式、基础 schema | 快速失败，先挡住明显问题 |
| 层 2 | `make typecheck` | 类型系统与接口一致性 | 挡住类型或契约失配 |
| 层 3 | `make test` | 单测、集成测试、定向回归 | 挡住行为回归 |
| 层 4 | `make smoke` | 运行时关键路径 | 挡住“代码能过但系统跑不通” |
| 收口 | `make verify` | 四层串联 | 仅用于跨域、共享契约、关键链路或影响面不明时的仓库级收口 |

## 4. 交付入口族

| 目标 | 作用范围 | 当前语义 |
|---|---|---|
| `make verify-backend` | 后端改动 | 串联 backend lint/typecheck/test/smoke；未配置项显式 `skip` |
| `make verify-frontend` | 前端非语义改动 | 串联 frontend lint/typecheck/test/smoke |
| `make verify-docs` | 仅文档改动 | 运行文档健康检查 |
| `make verify-semantic` | 语义中心改动 | 在 Agent Runtime、统一查询执行面、建模助手 Agent 最小链路、backend + frontend 基线验证之上，补充语义专项 smoke |
| `make verify-semantic-prod` | 语义平台生产候选 | 在迁移拓扑、SQL Registry / Publish Gate / Release Snapshot 专项、可选存量库 fingerprint、nginx v2 生产镜像、语义专项验证、live opt-in 和 fixture cleanup 上做发布候选收口 |
| `make verify-semantic-prod-strict` | 语义平台上线前 | 先执行 `semantic-prod-env-required`，强制要求预生产 DB fingerprint、live smoke、fixture cleanup 和真实 PostgreSQL concurrency，再执行生产候选闸门 |
| `make verify` | 跨域、共享契约或影响面不明 | 串联仓库级四层入口 |

使用原则：

- 先用 `make verify-detect` 查看当前变更命中的规则与推荐目标
- 需要直接执行时用 `make verify-changed`
- 先按改动范围选择对应 `make verify-*`
- 涉及 `migrations/versions/` 的改动，至少补跑 `make verify-alembic` 和一个空库 `flask --app wsgi.py db upgrade` 演练；生产初始化历史要求以 `0001_initial_schema` 作为唯一 root，旧开发阶段 revision 不再进入生产迁移图
- 涉及跨端交互、共享契约、关键链路或无法确定影响面时，再升级到 `make verify`
- `make review` 只用于准备评审时，执行仓库级 `make verify`，并补文档健康检查与文档影响检查

## 5. 二级入口矩阵

### 4.1 层 1：静态检查

| 边界 | 目标 | 当前实现 |
|---|---|---|
| 前端 | `make lint-frontend` | `frontend` ESLint |
| 后端 | `make lint-backend` | 当前未配置，显式 `skip` |
| 聚合 | `make lint` | 串联前端、后端和静态专项检查 |
| 静态专项 | `make static-format` | 当前未配置，显式 `skip` |
| 静态专项 | `make static-imports` | 当前未配置，显式 `skip` |
| 静态专项 | `make static-patterns` | 当前未配置，显式 `skip` |
| 静态专项 | `make static-schema` | 当前未配置，显式 `skip` |

### 4.2 层 2：类型与接口检查

| 边界 | 目标 | 当前实现 |
|---|---|---|
| 前端 | `make typecheck-frontend` | TypeScript `tsc --noEmit` |
| 后端 | `make typecheck-backend` | 当前未配置 mypy / pyright，显式 `skip` |
| 契约 | `make typecheck-contracts` | 生成 `/api/docs/openapi.json` 并校验 OpenAPI Agent 契约 |
| 聚合 | `make typecheck` | 串联前端、后端和契约检查 |

### 4.3 层 3：自动化测试

| 维度 | 目标 | 当前实现 |
|---|---|---|
| 单元测试 | `make test-unit-backend` | `pytest --no-cov tests/unit` |
| 单元测试 | `make test-unit-frontend` | `vitest run` |
| 单元测试聚合 | `make test-unit` | 串联前后端单测 |
| 集成测试 | `make test-integration-backend` | `pytest --no-cov tests/integration` |
| 集成测试 | `make test-integration-frontend` | 当前未定义独立前端集成测试集合，显式 `skip` |
| 集成测试聚合 | `make test-integration` | 串联前后端集成测试 |
| 后端聚合 | `make test-backend` | 串联后端单测与后端集成测试 |
| 前端聚合 | `make test-frontend` | 串联前端单测和前端集成入口；v2 浏览器回归归入 smoke / e2e 专项 |
| v2 E2E smoke | `make smoke-frontend` | Playwright v2 smoke（`npm run e2e:smoke`） |
| Agent-first Runtime 最小链路 | `make test-agent-runtime` | official runtime 路由、Mapper Binding、QueryDSL 编译、stale measure / 非 active Cube 阻断与 Agent plan API preview-only 回归 |
| 统一查询执行面最小链路 | `make test-query-execution` | QueryExecution 领域实体、提交服务、仓储、结果对象和集成 API 回归 |
| 建模助手 Agent 最小链路 | `make test-modeling-agent` | SemanticModelingAgentSpec、草稿生成、校验、Agent-ready 检查、保存、cube-only 发布与 Domain context-preview 的后端/前端单测 |
| 语义专项 smoke | `make smoke-semantic` | 领域创建、领域发布两条有状态浏览器烟测 + P34 Modeling Copilot mock 闭环 |
| 语义生产候选 | `make verify-semantic-prod` | 迁移 / SQL Registry / baseline / nginx build / semantic verify / live opt-in / cleanup 的生产候选闸门 |
| 语义上线前严格验收 | `make verify-semantic-prod-strict` | 环境变量 fail-fast + `verify-semantic-prod` + 真实 PostgreSQL 发布并发测试 |
| 自动化测试聚合 | `make test` | 串联 `test-unit`、`test-integration` |

### 4.4 层 4：运行验证

| 边界 | 目标 | 当前实现 |
|---|---|---|
| 后端 | `make smoke-backend` | 后端关键 API smoke |
| 前端 | `make smoke-frontend` | 平台壳层浏览器 smoke |
| 可观测 | `make smoke-observability` | 当前未配置统一阈值检查，显式 `skip` |
| 聚合 | `make smoke` | 串联后端、前端、可观测验证 |
| 语义专项 smoke | `make smoke-semantic` | 领域创建、领域发布两条有状态浏览器烟测 + P34 Modeling Copilot mock 闭环 |

## 6. 常用组合入口

| 目标 | 适用场景 |
|---|---|
| `make verify-backend` | 仅后端改动的默认交付入口 |
| `make verify-frontend` | 仅前端非语义改动的默认交付入口 |
| `make verify-docs` | 仅文档改动的默认交付入口 |
| `make verify-semantic` | 语义中心改动；在 Agent Runtime、统一查询执行面、建模助手 Agent / Domain 上下文最小链路、backend + frontend 基线之外补语义专项 smoke |
| `make verify-semantic-prod` | 语义平台生产候选；会构建 nginx 生产镜像，默认跳过 live smoke，设置 `SEMANTIC_PROD_LIVE=1` 后运行真实链路 |
| `make verify-semantic-prod-strict` | 语义平台上线前严格验收；要求预生产 DB、live smoke、fixture cleanup 和真实 PostgreSQL concurrency 环境变量，不允许静默 skip |
| `make semantic-prod-readiness-report` | 上线前补证盘点；输出脱敏 JSON，说明 strict gate 的 baseline / live / cleanup / PostgreSQL 并发输入是否齐备 |
| `make verify` | 跨域、共享契约、关键链路或不确定影响面的仓库级收口入口 |
| `make verify-detect` | 输出当前变更命中的规则、升级原因和建议交付入口 |
| `make verify-changed` | 按规则检测结果执行当前改动的最低必跑交付入口 |
| `make review` | 审阅前仓库级总入口；执行 `make verify` 后再补充文档健康检查与文档影响检查 |
| `make coverage-backend` | 跑完整 pytest 覆盖率 + ratchet 防倒退校验（scripts/backend_coverage_rules.json），不并入默认四层 |
| `make coverage-frontend` | Round 4 · D+28 退役 skip；前端守护由 `frontend/vitest.config.ts` 子树阈值（80%）承接 |
| `make coverage` | 聚合入口：== `coverage-backend`，保留签名便于脚本调用 |
| `make coverage-report` | opt-in：生成前后端数字报告，不设阈值，仅供查看（~2-3 min） |

## 7. Coverage 的位置

coverage 的角色是“专项验证”或“质量门槛”，不是最基础的交付入口。

约束如下：

- coverage 不并入默认 `make verify`、`make verify-backend`、`make verify-frontend`
- coverage 主要用于补充回答“这次测试覆盖到了多少关键路径”，不替代功能验证、回归验证和 smoke
- 需要建立或复核覆盖率基线时，单独运行对应 coverage 入口
- 需要把 coverage 作为门槛时，应在专项任务、质量治理或评审要求里显式说明，而不是默认绑进所有本地交付流程
- 后续如果补充前端 coverage，也应保持同样原则：独立入口、独立报告、按需执行，不直接塞进默认 `make verify`

当前仓库已提供（Round 4 · D+28 校准）：

- `make coverage-backend`：跑完整 pytest coverage + ratchet 防倒退校验
- `make coverage-frontend`：**已退役**，改为显式 skip；前端守护由 `frontend/vitest.config.ts` 子树阈值接管
- `make coverage`：聚合入口，实际等价于 `coverage-backend`
- `make coverage-report`：生成前后端数字报告，不设阈值，便于 sprint 末校准 ratchet

### 后端（已达高位 + 防倒退）

- **真实基线**（2026-04-22 全量 `make coverage-backend`）：总覆盖率 **96.49%**，1916 tests passed，15 个模块 100%
- `pytest.ini` 基线：`--cov-fail-under=95`
- 机器规则：`scripts/backend_coverage_rules.json`
  - `total_threshold = 95.0`（现值 - 1.5pp buffer）
  - `module_threshold = 80.0`（防止严重倒退；当前低水位以新鲜 `make coverage-backend` 输出为准）
  - `core_modules`：20 个核心模块，各自按现值向下留 buffer 的下限（10 个保持 100%、其余按实测值向下取整）
- 执行：`make coverage-backend` → pytest → `scripts/checks/backend_coverage_guard.py`
- 维护节奏：sprint 末跑 `make coverage-report`，如某模块已稳定高于 `core_modules` 阈值 ≥ 10pp，手动把阈值再抬一档
- **⚠️ 注意**：磁盘上的 `coverage.xml` 可能是之前只跑部分 suite 的 stale 产物，给出误导性数字。任何覆盖率分析前请先跑 `make coverage-backend` 生成全量新鲜产物
- 详细历史快照与推进计划见 [backend-coverage.md](backend-coverage.md)

### 前端（由 vitest 子树阈值接管）

- 入口：`frontend/vitest.config.ts` 的 `coverage.thresholds`
- 范围：`src/v2/components/**`、`src/v2/hooks/**`、`src/v2/lib/**` 三个子树
- 门槛：每个子树 `statements / branches / functions / lines` 均 ≥ `80%`
- 触发：`make test-frontend` / `npm run test:unit` / `.husky/pre-push` 每次运行自动校验
- 原先的 `scripts/frontend_coverage_rules.json`、`scripts/checks/frontend_coverage_guard.py`、`tests/unit/scripts/test_frontend_coverage_guard.py` 已在 Round 4 · D+28 校准中删除，原因见 [frontend-coverage.md](frontend-coverage.md) 顶部退役说明

这些入口归类为专项验证或质量门槛，而不是默认基础入口。

## 8. 状态契约

### 8.1 默认仓库 smoke

`make smoke` 的契约是：

- 尽量快
- 尽量低副作用
- 尽量低环境要求
- 代表仓库级最小运行验证

因此它只覆盖：

- `make smoke-backend`
- `make smoke-frontend`
- `make smoke-observability`（当前未配置时显式 `skip`）

### 8.2 语义 smoke

`make smoke-semantic` 的契约与默认仓库 smoke 不同：

- 它是专项 smoke，不并入默认 `make smoke`
- 其中 `domain-smoke` / `domain-publish-smoke` 依赖前端开发服务、最新后端代码和可写语义目录
- 它默认启动临时前端端口 `http://127.0.0.1:3102`，避免与日常开发
  `3000` 端口或 Docker 映射冲突；需要复用已有服务时设置
  `SEMANTIC_SMOKE_USE_EXISTING_SERVER=1`
- 领域 smoke 依赖真实后端 JWT；默认用 `DOMAIN_SMOKE_USERNAME` /
  `DOMAIN_SMOKE_PASSWORD` 登录获取，也可显式设置 `DOMAIN_SMOKE_AUTH_TOKEN`
- 领域 smoke 会创建或更新草稿、测试数据或语义资产
- `modeling-agent-smoke` 运行 `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`，通过 Playwright mock API 覆盖 Modeling Copilot 对话闭环，不写入后端或语义目录
- `e2e:modeling-agent-smoke:live` 是发布前 opt-in 补证，运行真实后端 session / Proposal / publish 链路，不并入默认验证
- `test-query-execution` 是统一查询执行面的最小回归入口，随 `make verify-semantic` 执行，确保 Agent semantic execute 可以提交到统一执行面
- `preflight-agent-runtime` / `live-agent-runtime` 是真实环境 opt-in 补证：前者只检查 active 语义资产绑定，后者会进入真实 MaxCompute 执行验收，不并入默认 `make verify`
- 整个入口不保证 hermetic，也不承诺领域 smoke 对工作区和数据零副作用
- 它只在语义关键路径改动时作为交付门禁的一部分运行

如果你需要干净环境，优先在可回收本地环境、临时数据空间或专项测试环境里执行。

### 8.3 语义生产候选

`make verify-semantic-prod` 的契约是：

- 它不是默认开发入口，只在语义平台生产候选、Registry / Release / Runtime Snapshot / live smoke 变更时运行
- 默认执行离线 Alembic 拓扑检查；如果设置 `SEMANTIC_BASELINE_DATABASE_URL`，会额外跑存量库 fingerprint 检查
- 会先执行 `make test-semantic-prod-registry`，覆盖 SQL Registry、Publish Gate、Release / Snapshot、真实治理审计同事务和 fixture cleanup 集成流
- 会执行 `docker compose build nginx`，验证 nginx 镜像使用 v2 生产构建，且本地测试文件不进入 frontend Docker context
- 会调用 `make verify-semantic`
- `smoke-semantic-live` 默认 skip；设置 `SEMANTIC_PROD_LIVE=1` 后才执行真实后端 live smoke
- 最后执行 cleanup；默认无 `SEMANTIC_FIXTURE_NAMESPACE` 时跳过，设置 `SEMANTIC_FIXTURE_NAMESPACE` 后使用 `SEMANTIC_FIXTURE_DATABASE_URL`，未设置则 fallback 到 `SEMANTIC_BASELINE_DATABASE_URL`，再由 `scripts/checks/semantic_fixture_cleanup.py` 调用 `tests/support/semantic_fixture_manager.py` 清理测试资产

`make verify-semantic-prod-strict` 的契约是：

- 先执行 `make semantic-prod-env-required`，缺少 `SEMANTIC_BASELINE_DATABASE_URL`、`SEMANTIC_PROD_LIVE=1`、`SEMANTIC_FIXTURE_NAMESPACE`、`SEMANTIC_POSTGRES_DATABASE_URL` 或其 PostgreSQL baseline fallback 时直接失败；SQLite URL 不会通过 concurrency 门禁
- 复用 `make verify-semantic-prod`
- 再执行 `make test-semantic-postgres-concurrency`，用真实 PostgreSQL 验证 release 并发串行、active snapshot partial unique 和 advisory lock 行为
- 建议先执行 `make semantic-prod-readiness-report`，确认 strict gate 缺项和 DB URL 脱敏展示是否符合预期

如果 Docker、真实数据库或 live 凭据不可用，可以只运行其中可用的子入口，但交付说明必须明确未跑项和剩余风险；上线前不应跳过 `verify-semantic-prod-strict`。

## 9. 机器规则与范围选择

默认流程：

1. 先运行 `make verify-detect`，查看命中的规则、升级原因和建议目标
2. 确认无误后运行 `make verify-changed`，或手动执行更宽的 `make verify-*`

显式指定文件时，可传入：

```bash
make verify-detect VERIFY_FILES="README.md frontend/src/v2/routes.tsx"
make verify-changed VERIFY_FILES="app/__init__.py frontend/src/v2/routes.tsx"
```

按分支或提交基线计算 diff 时，可传入：

```bash
make verify-detect VERIFY_BASE=origin/main
make verify-changed VERIFY_BASE=origin/main
```

默认不会再自动扫描整个脏工作区；如果不提供 `VERIFY_FILES` 或 `VERIFY_BASE`，命令会直接失败，避免把无关改动误当成本次任务 diff。

当前规则引擎只负责给出“最低必跑集合”，不替代人工判断。一般情况下：

- 仅基线文档改动，通常路由到 `make verify-docs`
- 前端非语义改动，通常路由到 `make verify-frontend`
- 后端改动，通常路由到 `make verify-backend`
- 语义中心改动，通常路由到 `make verify-semantic`
- 仓库级脚本、工具链、未识别路径或非语义前后端同时改动，会升级到 `make verify`

若脚本输出与实际影响面不符，以更保守的入口为准。

## 10. 执行顺序建议

推荐顺序：

1. 先用 `make verify-detect` 或显式文件列表确认最低必跑集合
2. 调试期可先跑更细的层级或子目标，快速定位失败层
3. 修复后回到对应 `make verify-*` 或 `make verify-changed`，确认该范围已恢复到可交付状态
4. 若影响面跨域、共享契约或不明确，再运行 `make verify`
5. 若涉及文档或准备提交评审，再补 `make review`

## 11. 当前已知空位

以下能力当前还没有仓库级统一实现，因此入口会显式 `skip`：

- 后端统一 lint
- 后端统一 mypy / pyright
- formatting 统一入口
- imports 独立检查
- forbidden patterns 检查
- 基础 schema 独立校验
- 可观测阈值验证

这些空位保留命令名是为了稳定接口，不代表已经具备对应能力。
