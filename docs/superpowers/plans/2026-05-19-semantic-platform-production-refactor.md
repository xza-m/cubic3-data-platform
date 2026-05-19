# Semantic Platform Production Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把语义平台方案 B 拆成可执行工程任务，先完成 B1「生产资产底座与发布安全」，再进入 B2「Copilot 状态机与召回质量」和 B3「Runtime 治理、执行与观测」。

**Architecture:** PostgreSQL SQL-only Semantic Asset Registry 作为生产事实源；YAML 仅保留为测试 fixture、示例 seed 和调试导出；发布生成 immutable revision、release record 和 active runtime snapshot；Runtime 只读 published snapshot。

**Tech Stack:** Flask、SQLAlchemy、Alembic、PostgreSQL、pytest、Makefile、React/Vite、Playwright、现有治理审计与 QueryExecution 基础设施。

---

## 0. 当前执行状态（2026-05-19）

B1 已进入实现阶段，当前 worktree 为 `codex/semantic-prod-refactor-b1`。

已完成或已有自动化证据的部分：

- Alembic 单一初始化 baseline 已补 Registry / Release / Snapshot 表和 active snapshot 唯一索引。
- SQL Registry 领域模型、ORM、repository、service、runtime snapshot service 已落地。
- 发布事务已补 repository 内 `release_no` 生成、`previous_release_id` 锁内重算、PostgreSQL advisory lock、published 幂等复用、failed attempt、真实 governance audit repository 同事务写入和 rollback 新 release 语义。
- Agent official router / mapper / compiler / AgentPlanHandler 已接入 active SQL runtime snapshot gate，并直接从 manifest `spec` 还原 runtime catalog，不再用 YAML 作为 official fallback。
- `SemanticTestFixtureManager` 已覆盖 Registry / Release / Snapshot / Copilot session / Proposal 清理。
- nginx 生产构建已切到 `npm run build:v2` 和 `dist-v2`，并用 `.dockerignore` 排除测试产物。
- `make verify-semantic-prod` 已串起 `verify-alembic -> test-semantic-prod-registry -> semantic-baseline-dry-run -> nginx build -> verify-semantic -> live opt-in -> cleanup`。

仍处于 B1 剩余项：

- 真实预生产库 `SEMANTIC_BASELINE_DATABASE_URL` fingerprint 未跑。
- Publish Gate 已有 schema / binding / runtime / policy 外部 checker 接入点和失败测试；具体生产 sensitivity profile 与 checker wiring 需要 B2/B3 继续细化。
- `make verify-semantic-prod` 完整目标里的 domain smoke 和 live smoke 需要可用前后端 / 凭据环境补跑。
- 真实 PostgreSQL 并发冲突已有 opt-in 集成测试入口；当前本地未提供 `SEMANTIC_POSTGRES_DATABASE_URL`，上线前由 `verify-semantic-prod-strict` fail-fast 强制补跑。

当前已跑验证：

- `make test-unit-backend`
- `make test-agent-runtime`
- `make test-semantic-prod-registry`
- `make test-modeling-agent`
- `make verify-alembic`
- `make verify-docs`
- `make semantic-baseline-dry-run smoke-semantic-live semantic-fixture-cleanup`
- `docker compose build nginx`
- `cd frontend && npm run e2e:modeling-agent-smoke`

## 1. 来源与边界

主设计输入：

- `docs/prd/semantic_platform_production_refactor_spec.md`
- `docs/semantic_verification.md`
- `docs/quality/testing.md`
- `docs/runbooks/local-dev.md`
- `app/domain/semantic/`
- `app/application/semantic/`
- `app/infrastructure/semantic/`
- `migrations/versions/0001_initial_schema.py`
- `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`

本计划的执行范围：

- B1 细化到可以直接实现和验收。
- B2 / B3 只拆到接口边界、依赖和后续子计划入口，等 B1 合并后再展开逐任务实施计划。
- 不引入 SQL / YAML 双写，不做 YAML 离线迁移输入。
- 不让 Runtime fallback 到 draft、proposal 或 YAML。
- 不把完整审批流、多租户和完整血缘平台纳入 B1。

## 2. 关键假设

- 当前仍处在生产上线前，之前已选择 Alembic 方案 1：统一收敛为一个初始化 baseline。
- 若确认没有任何共享环境已经实际执行当前 `0001_initial_schema.py`，B1 默认继续扩展 `0001_initial_schema.py`，保持单一初始化版本。
- 若执行前发现任一共享环境已经应用当前 `0001_initial_schema.py`，不得重写已应用迁移，改用追加迁移 `0002_semantic_registry_release_runtime.py`，并在 Spec 中记录偏离原因。
- 现有 Copilot session / proposal SQL 仓储可作为 B2 的状态机落点，但 B1 不强行重写 Copilot 交互。
- 现有治理审计表可以复用，但发布事务里的 audit 写入必须和 release/snapshot 同事务。
- 学生评论 `student_comment` 是 B1 之后的主要 golden case 资产。

## 3. 方案取舍

### 3.1 Alembic 迁移策略

推荐方案 A：继续单一初始化迁移。

- 做法：把 Registry / Release / Snapshot 表补进 `migrations/versions/0001_initial_schema.py`，并更新 Alembic contract test。
- 适用：生产上线前，当前 baseline 尚未被任何共享环境正式应用。
- 优点：空库初始化路径最简单，生产首发没有历史迁移债。
- 风险：如果已有环境执行过旧 0001，重写会造成版本戳与实际 schema 漂移。
- 缓解：实现前跑 baseline 检查；发现已应用旧版本时切到方案 B。

备选方案 B：追加 `0002_semantic_registry_release_runtime.py`。

- 做法：保留当前 `0001_initial_schema.py`，新建 0002 添加 Registry / Release / Snapshot。
- 适用：任何共享环境已经应用当前 0001。
- 优点：不改写已应用迁移，风险更低。
- 缺点：不满足“完全单一初始化”的理想形态，后续生产首发前需要再决定是否 squash。

本计划默认采用方案 A，并把方案 B 作为安全降级路径。

### 3.2 Registry 写入策略

推荐方案 A：SQL-only Registry。

- 做法：生产写入只走 `SqlAssetRegistryRepository`；YAML adapter 仅可由测试 fixture 显式注入。
- 优点：KISS，单事实源，checksum、release、rollback 和 audit 都能闭环。
- 风险：历史 YAML fixture 可能被误当作生产资产。
- 缓解：增加 no-yaml-write assertion 和 runtime published-only negative tests。

不采用方案 B：SQL / YAML bridge 双写。

- 原因：双写会引入 drift、冲突解决和不一致 checksum；当前本地 YAML 都是测试文件，不承担离线迁移输入职责。

### 3.3 工程原则落点

- KISS：B1 只做资产事实源、发布事务、snapshot 和验证入口，不同时重做 Copilot 前端。
- YAGNI：不提前做完整多租户审批流、完整血缘平台和通用 profile 管理后台。
- SOLID：Registry、Release、RuntimeSnapshot、PublishGate、FixtureManager 拆成独立领域对象、端口和服务。
- DRY：所有专项验证收敛到 `make verify-semantic-prod`，清理逻辑收敛到 `SemanticTestFixtureManager`。

## 4. 目标文件结构

新增或修改以下文件：

```text
app/domain/semantic/asset_registry.py
app/domain/semantic/ports/asset_registry_repository.py
app/domain/semantic/ports/runtime_snapshot_repository.py
app/infrastructure/semantic/models.py
app/infrastructure/semantic/sql_asset_registry_repository.py
app/application/semantic/asset_registry_service.py
app/application/semantic/publish_gate_service.py
app/application/semantic/semantic_release_service.py
app/application/semantic/runtime_snapshot_service.py
app/application/semantic/runtime_manifest_catalog.py
scripts/checks/semantic_alembic_baseline.py
tests/support/semantic_fixture_manager.py
tests/unit/domain/semantic/test_asset_registry.py
tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py
tests/unit/application/semantic/test_asset_registry_service.py
tests/unit/application/semantic/test_publish_gate_service.py
tests/unit/application/semantic/test_semantic_release_service.py
tests/unit/application/semantic/test_runtime_snapshot_service.py
tests/unit/scripts/test_semantic_alembic_baseline.py
tests/unit/support/test_semantic_fixture_manager.py
tests/integration/semantic/test_semantic_registry_release_flow.py
tests/integration/semantic/test_semantic_runtime_published_only.py
Makefile
docs/prd/semantic_platform_production_refactor_spec.md
docs/semantic_verification.md
docs/quality/testing.md
```

可能需要按现有依赖注入补充：

```text
app/di/container.py
app/interfaces/api/v1/semantic*.py
app/application/query_execution/agent_execute_service.py
app/application/semantic/semantic_runtime_binding_service.py
```

## 5. B1 详细实施任务

### B1-00 现状保护与基线确认

- [ ] 运行 `git status --short`，只记录当前任务相关改动，不清理历史无关未跟踪文件。
- [ ] 执行 Alembic 使用状态检查，确认是否可继续方案 A。
- [ ] 记录本地数据库、Docker 栈、前端 dev server 是否运行，避免验证时误用旧进程。
- [ ] 在 Spec 的 B1 表格把 B1-01 标记为 `IN_PROGRESS`。

命令：

```bash
git status --short
python scripts/checks/alembic_head_guard.py
PYTHONPATH=. python -m pytest --no-cov tests/unit/scripts/test_alembic_initial_schema_contract.py -q
```

期望：

```text
[alembic-guard] PASS
1 passed
```

自检：

- 得出什么：确认当前迁移拓扑是否仍可作为单一初始化 baseline。
- 没想透什么：是否已有共享环境执行过当前 0001，需要执行前用实际环境记录补证。
- 下一步深入哪里：迁移表结构和 ORM。

### B1-01 Alembic 初始化与 baseline runbook

- [ ] 在 `tests/unit/scripts/test_alembic_initial_schema_contract.py` 增加 Registry / Release / Snapshot 表名断言。
- [ ] 新增 `tests/unit/scripts/test_semantic_alembic_baseline.py`，覆盖 fingerprint 缺表、缺列、索引缺失和 stamp 保护逻辑。
- [ ] 默认把以下表加入 `migrations/versions/0001_initial_schema.py`：
  - `semantic_assets`
  - `semantic_asset_revisions`
  - `semantic_asset_dependencies`
  - `semantic_releases`
  - `semantic_release_assets`
  - `semantic_runtime_snapshots`
- [ ] 添加 partial unique index：`uq_semantic_runtime_snapshots_active_namespace`。
- [ ] 新增 `scripts/checks/semantic_alembic_baseline.py`。
- [ ] 在 `docs/semantic_verification.md` 写入空库和存量库 baseline 演练入口。

降级条件：

- 如果检查发现任一共享环境已经应用当前 0001，停止修改 0001，改为新增 `migrations/versions/0002_semantic_registry_release_runtime.py`。
- 降级后更新本计划和 Spec，说明方案 A 切换到方案 B 的原因。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/scripts/test_alembic_initial_schema_contract.py \
  tests/unit/scripts/test_semantic_alembic_baseline.py -q
make verify-alembic
```

期望：

```text
tests/unit/scripts/test_alembic_initial_schema_contract.py ... passed
tests/unit/scripts/test_semantic_alembic_baseline.py ... passed
[alembic-guard] PASS
```

自检：

- 得出什么：空库初始化 schema 和存量 baseline 保护脚本有自动化守护。
- 没想透什么：真实存量库 fingerprint 需要在预生产库实际跑一次。
- 下一步深入哪里：ORM 与领域模型。

### B1-02 Registry 领域模型与 ORM

- [ ] 新增 `app/domain/semantic/asset_registry.py`。
- [ ] 定义 `SemanticAsset`、`SemanticAssetRevision`、`SemanticAssetDependency`、`SemanticRelease`、`SemanticReleaseAsset`、`RuntimeSnapshot`、`RuntimeAsset`。
- [ ] 固化 enum / Literal：asset type、asset status、revision status、release status、snapshot status、source kind。
- [ ] 实现 canonical checksum 工具函数，算法必须与 Spec 一致。
- [ ] 在 `app/infrastructure/semantic/models.py` 增加对应 ORM。
- [ ] 保持现有 `SemanticModelingAgentSessionORM` 和 `SemanticModelingProposalORM` 不破坏。

关键断言：

```python
sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
```

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/domain/semantic/test_asset_registry.py -q
```

期望：

```text
tests/unit/domain/semantic/test_asset_registry.py ... passed
```

自检：

- 得出什么：资产、版本、依赖、release 和 snapshot 的领域对象稳定。
- 没想透什么：是否需要把所有 enum 暴露给前端契约，B1 可先不做。
- 下一步深入哪里：repository port 与 SQL repository。

### B1-03 Repository ports 与 SQL repository

- [ ] 新增 `app/domain/semantic/ports/asset_registry_repository.py`。
- [ ] 新增 `app/domain/semantic/ports/runtime_snapshot_repository.py`。
- [ ] 新增 `app/infrastructure/semantic/sql_asset_registry_repository.py`。
- [ ] 实现 `create_or_update_asset`，禁止更新 `namespace / asset_type / asset_key`。
- [ ] 实现 `append_revision`，支持同一资产同 checksum 复用与 `force_new_revision`。
- [ ] 实现 `replace_dependencies`，按 revision 全量替换依赖。
- [x] 实现 release 相关持久化：`publish_with_snapshot`、`get_active_release`、`rollback_to`。
- [ ] 实现 runtime snapshot 只读查询：`get_active_snapshot`、`resolve_asset`、`list_assets`。
- [ ] 捕获 active snapshot partial unique index 冲突并映射为 `concurrent_publish_conflict`。

负向约束：

- Runtime repository 不得依赖 `YamlCubeRepository`、`YamlViewRepository` 或任何 YAML adapter。
- Runtime repository 不得暴露 `include_draft`、`status` 等绕过 published-only 的参数。
- repository 不主动跨服务查询 Runtime；active snapshot 引用检查放在 application service。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py -q
```

期望：

```text
tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py ... passed
```

自检：

- 得出什么：SQL Registry 成为生产写入和 Runtime 读取的唯一仓储边界。
- 没想透什么：真实 PostgreSQL partial index 行为需要集成测试补证，SQLite 只能覆盖部分逻辑。
- 下一步深入哪里：应用服务和发布事务。

### B1-04 AssetRegistryService 与 YAML 边界收紧

- [x] 新增 `app/application/semantic/asset_registry_service.py`。
- [x] 实现创建资产、追加 revision、删除资产前 active snapshot 引用检查。
- [x] 将生产路径中的语义资产新增 / 更新入口切到 SQL Registry service。
- [x] 保留 YAML repository 作为测试 fixture / 示例 seed 显式注入路径。
- [x] 增加 no-yaml-write 断言，确保生产发布不会写入 `app/infrastructure/semantic/**/*.yml`。
- [x] 更新 `docs/semantic_verification.md`，说明 YAML 只用于 fixture、seed、debug export。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_asset_registry_service.py \
  tests/integration/semantic/test_semantic_registry_release_flow.py -q
```

期望：

```text
tests/unit/application/semantic/test_asset_registry_service.py ... passed
tests/integration/semantic/test_semantic_registry_release_flow.py ... passed
```

自检：

- 得出什么：生产写入不会继续落到 YAML，删除有 active snapshot 保护。
- 没想透什么：现有旧 UI 是否仍调用 YAML-backed service，需要代码扫描确认。
- 下一步深入哪里：Publish Gate。

### B1-05 Publish Gate

- [x] 新增 `app/application/semantic/publish_gate_service.py`。
- [x] 实现固定顺序 gate：approved checksum、schema、依赖 DAG、binding compile、policy、runtime compile preview。
- [x] 实现依赖图 cycle detection，返回 `dependency_cycle_detected`。
- [x] 实现 restricted 无审批返回 `approval_required`。
- [x] 实现 policy 缺失返回 `deny`。
- [x] 实现非 Proposal 来源资产必须有等价 `approval_record.approved_spec_hash`。
- [x] 对接 schema checker、binding compile、policy guard 和 runtime compile 的服务注入点，并补失败用例。
- [ ] sensitivity profile 与具体生产 checker wiring 留到 B2/B3 细化，不扩大 B1 范围。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_publish_gate_service.py -q
```

期望：

```text
tests/unit/application/semantic/test_publish_gate_service.py ... passed
```

自检：

- 得出什么：发布前阻断条件变成明确决策矩阵。
- 没想透什么：approval record 初版可先用结构化 JSON，不急着做审批流 UI。
- 下一步深入哪里：Release 事务与 rollback。

### B1-06 Release 事务、snapshot 激活与 rollback

- [x] 新增 `app/application/semantic/semantic_release_service.py`。
- [x] 新增 `app/application/semantic/runtime_snapshot_service.py`。
- [x] 实现 `publish_with_snapshot` 的同事务 8 步：
  - namespace release 序列锁
  - create release
  - write release assets
  - supersede old active snapshot
  - create active snapshot
  - mark release published
  - update assets current_release_id
  - write governance audit trace
- [x] 审计写入失败时整体回滚，不能留下 published release 或 active snapshot。
- [x] 同一 `idempotency_key` 的 published release 直接返回已有结果。
- [x] 同一 `idempotency_key` 的 failed release 返回 `failed_retry_with_new_idempotency_key`。
- [x] 失败证据在新事务中写入 `status=failed` release attempt，最多保留一条同 key failed attempt 并更新 failure reason。
- [x] rollback 创建新 release 和新 snapshot，不重新激活旧 snapshot。
- [x] `previous_release_id` 在 repository 锁内重算，避免并发发布链路读到 stale predecessor。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_semantic_release_service.py \
  tests/unit/application/semantic/test_runtime_snapshot_service.py \
  tests/integration/semantic/test_semantic_registry_release_flow.py -q
```

期望：

```text
tests/unit/application/semantic/test_semantic_release_service.py ... passed
tests/unit/application/semantic/test_runtime_snapshot_service.py ... passed
tests/integration/semantic/test_semantic_registry_release_flow.py ... passed
```

自检：

- 得出什么：发布、幂等、失败证据和 rollback 的事务语义闭环。
- 没想透什么：真实并发冲突仍需用 PostgreSQL 集成环境补跑。
- 下一步深入哪里：Runtime published-only。

### B1-07 Runtime published-only 最小 gate

- [x] Runtime plan / compile 读取 active snapshot，而不是 draft / proposal / YAML。
- [x] snapshot 缺失时 plan 返回 `semantic_runtime_not_ready`。
- [x] execute 在 snapshot 缺失、policy deny 或 approval_required 时不创建 job。
- [x] 未知 manifest `schema_version` 返回 `semantic_runtime_manifest_unsupported`。
- [x] draft revision 存在但未发布时，Runtime 返回 no match 或 blocked。
- [x] YAML fixture 存在同名资产时，Runtime 不读取、不 fallback。
- [x] AgentPlanHandler / compiler preview 在 official 模式传递并记录 `snapshot_id` 和 `release_id`。

命令：

```bash
make test-agent-runtime
```

期望：

```text
15 passed
```

自检：

- 得出什么：Runtime 和 Build-time 语义边界被测试锁住。
- 没想透什么：旧 semantic router 是否还有 YAML fallback 暗门，需要全仓 `rg` 扫描确认。
- 下一步深入哪里：测试资产 namespace 与 cleanup。

### B1-08 SemanticTestFixtureManager

- [ ] 新增 `tests/support/semantic_fixture_manager.py`。
- [ ] 实现 `namespace(prefix)`、`register_asset`、`cleanup_namespace`、`assert_no_manual_asset_pollution`。
- [ ] cleanup 覆盖 Registry、Release、Snapshot、Copilot session、Proposal 和 YAML fixture 输出。
- [ ] cleanup 顺序按外键逆序。
- [ ] cleanup 失败返回未清理资产清单，不吞错。
- [ ] 支持连续两次 smoke 后资产数量不增长。

命令：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/support/test_semantic_fixture_manager.py \
  tests/integration/semantic/test_semantic_registry_release_flow.py -q
```

期望：

```text
tests/unit/support/test_semantic_fixture_manager.py ... passed
tests/integration/semantic/test_semantic_registry_release_flow.py ... passed
```

自检：

- 得出什么：mock、live、golden case 的测试资产生命周期统一。
- 没想透什么：真实 live smoke 中断后的补清理命令需要在 runbook 里写清楚。
- 下一步深入哪里：前端 build 污染与 Makefile 总入口。

### B1-09 前端生产 build 污染修复

- [x] 扫描 `frontend/src/v2/lib/*.test.ts` 等本地临时测试文件，确认是否会进入 nginx production build context。
- [x] 若测试文件需要保留为本地测试，移动到仓库既有测试目录或改名到不会被生产 build 收集的位置。
- [x] 更新 `frontend/package.json` 脚本，确保本地测试仍可运行。
- [x] 补充 `.dockerignore` 或 nginx build 规则，避免临时测试资产进入生产镜像。
- [x] 用生产构建证明修复有效。

命令：

```bash
cd frontend && npm run build:v2
docker compose build nginx
```

期望：

```text
✓ built
nginx  Built
```

自检：

- 得出什么：本地测试和生产镜像边界清楚。
- 没想透什么：Docker 构建是否依赖本机缓存，需要必要时加 `--no-cache` 复验。
- 下一步深入哪里：Makefile 验证入口。

### B1-10 Makefile 验证入口

- [x] 增加或演进 `make smoke-semantic-live`。
- [x] 增加 `make verify-semantic-prod`。
- [x] 增加 `make test-semantic-prod-registry` 并挂入生产候选闸门。
- [x] `verify-semantic-prod` 顺序固定为：
  - `make verify-alembic`
  - `make test-semantic-prod-registry`
  - semantic baseline script dry-run
  - `docker compose build nginx`
  - `make verify-semantic`
  - `make smoke-semantic-live`
  - test fixture cleanup
- [x] live smoke 默认 opt-in，避免普通 CI 污染环境。
- [x] docs 同步说明哪些目标是默认必跑，哪些是发布候选必跑。

命令：

```bash
make verify-detect VERIFY_FILES="Makefile docs/semantic_verification.md"
make verify-semantic-prod
```

期望：

```text
[semantic-prod] PASS
cleanup summary: ...
```

自检：

- 得出什么：生产候选验收有单一入口。
- 没想透什么：live smoke 所需环境变量和密钥不能写死，需要在 runbook 明确。
- 下一步深入哪里：文档回填和 B1 完整验证。

### B1-11 文档回填与最终验收

- [x] 更新 `docs/semantic_verification.md`。
- [x] 更新 `docs/quality/testing.md`。
- [x] 如修改启动、脚本或运行方式，检查 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`、`frontend/README.md`。
- [x] 如修改系统边界、运行拓扑或语义持久化方式，更新 `docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/`。
- [x] 在 `docs/prd/semantic_platform_production_refactor_spec.md` 回填 B1 任务状态和验收证据。
- [ ] 自己做一次 code review，重点看不可维护风险、事务边界、YAML 暗门、Runtime draft 误读和测试污染。

最小验证：

```bash
make verify-docs
make verify-alembic
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/domain/semantic/test_asset_registry.py \
  tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py \
  tests/unit/application/semantic/test_asset_registry_service.py \
  tests/unit/application/semantic/test_publish_gate_service.py \
  tests/unit/application/semantic/test_semantic_release_service.py \
  tests/unit/application/semantic/test_runtime_snapshot_service.py \
  tests/unit/scripts/test_semantic_alembic_baseline.py \
  tests/unit/support/test_semantic_fixture_manager.py \
  tests/integration/semantic/test_semantic_registry_release_flow.py \
  tests/integration/semantic/test_semantic_runtime_published_only.py
make verify-semantic-prod
```

期望：

```text
make verify-docs 通过
make verify-alembic 通过
pytest 通过
make verify-semantic-prod 通过并输出 cleanup summary
```

自检：

- 得出什么：B1 可以作为生产候选基础提交 review。
- 没想透什么：真实预生产库 baseline 和 live golden case 仍依赖环境资源。
- 下一步深入哪里：B2 Copilot 状态机详细计划。

## 6. B2 后续拆分入口

B2 在 B1 合并后另起子计划，建议文件名：

```text
docs/superpowers/plans/2026-05-xx-semantic-copilot-state-and-recall.md
```

初始任务拆分：

- [ ] B2-01 `app/domain/semantic/copilot_state.py`：状态枚举、转移表、终态规则、错误码。
- [ ] B2-02 `SemanticModelingAgentSessionORM` 扩展：`state`、`state_version`、event log 表或 payload 结构。
- [ ] B2-03 session repository CAS 更新：`expected_state_version` 不一致返回 `state_conflict`。
- [ ] B2-04 proposal action model：`proposal_revision_no`、`approved_proposal_revision_no`、spec 修改清空 approved 字段。
- [ ] B2-05 `save_proposal_spec` 后端负责递增 revision 并清空批准字段，不能依赖前端自觉。
- [ ] B2-06 apply / publish 幂等键绑定 `proposal_revision_no` 和 approved checksum。
- [ ] B2-07 `MetadataRecallService` 从现有 `source_candidate_recall_service.py` 抽出无状态接口。
- [ ] B2-08 scoring profile 支持 domain 覆盖、分数归一化和 explainability。
- [ ] B2-09 学生评论 golden case 和 badcase 回放。
- [ ] B2-10 P34 前端 E2E 增加 `state_conflict`、stale approval 和 retry UX。

B2 最小验证：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/domain/semantic/test_copilot_state.py \
  tests/unit/application/semantic/test_modeling_proposal_service.py \
  tests/unit/application/semantic/test_source_candidate_recall_service.py \
  tests/integration/test_semantic_modeling_copilot_api.py
cd frontend && npm run e2e:modeling-agent-smoke
```

## 7. B3 后续拆分入口

B3 在 B1/B2 后另起子计划，建议文件名：

```text
docs/superpowers/plans/2026-05-xx-semantic-runtime-governance-observability.md
```

初始任务拆分：

- [ ] B3-01 Agent Runtime trace 全链路记录 `snapshot_id / release_id / asset_id / binding_id / policy_decision / ticket_id`。
- [ ] B3-02 `/api/v1/agent/semantic/plan` 固化 preview-only 契约。
- [ ] B3-03 `/api/v1/agent/semantic/execute` 只有 allow 才创建 QueryExecution job。
- [ ] B3-04 deny / approval_required / allow 三类治理路径自动化测试。
- [ ] B3-05 manifest `schema_version` 兼容策略和未知版本错误。
- [ ] B3-06 semantic health endpoint：DB、Alembic、Registry、Snapshot、QueryExecution、Governance。
- [ ] B3-07 audit trace 查询 API 或页面。
- [ ] B3-08 结构化日志和发布 / Runtime 成功率指标。
- [ ] B3-09 live smoke 和 golden case 纳入生产候选验证。
- [ ] B3-10 上线 checklist、回滚手册和运维 runbook。

B3 最小验证：

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/test_agent_plan_handler.py \
  tests/integration/test_agent_semantic_api.py \
  tests/integration/query_execution \
  tests/integration/governance/test_audit_traces.py
make verify-semantic-prod
```

## 8. 建议 commit 拆分

- [ ] `docs(semantic): split production refactor implementation plan`
- [ ] `chore(db): extend semantic production registry baseline`
- [ ] `feat(semantic): add asset registry domain and sql repository`
- [ ] `feat(semantic): add publish gate and release snapshots`
- [ ] `feat(semantic): enforce runtime published-only boundary`
- [ ] `test(semantic): add fixture namespace cleanup manager`
- [ ] `chore(frontend): keep local tests out of production nginx build`
- [ ] `chore(semantic): add production semantic verification targets`
- [ ] `docs(semantic): document production verification and rollout`

## 9. Review 清单

- [ ] 是否仍有生产路径写 YAML。
- [ ] Runtime 是否有任何 draft / proposal / YAML fallback。
- [ ] release / snapshot / audit 是否同事务。
- [ ] active snapshot 是否由数据库唯一约束保证。
- [x] rollback 是否创建新 release，而不是复活旧 snapshot。
- [ ] failed idempotency key 是否要求生成新 key。
- [ ] approved checksum 是否随 proposal revision 正确失效。
- [ ] `state_conflict` 是否在 B2 子计划中有测试。
- [ ] local test 文件是否被排除在 production build context 外。
- [x] `verify-semantic-prod` 是否总是 cleanup 并输出清理摘要。

## 10. 阶段性剩余风险

- 真实预生产库 baseline fingerprint 需要环境验证，纯本地单测无法替代；已用 `semantic-prod-env-required` / `verify-semantic-prod-strict` 防止上线前静默跳过。
- PostgreSQL partial unique index 和 advisory lock 并发行为需要真实 PostgreSQL 集成环境补跑；已新增 `test-semantic-postgres-concurrency`，本地无 PG URL 时只允许普通候选入口 skip，严格入口会失败。
- 旧语义服务仍可能存在非 Runtime 的 YAML fixture 入口；B1 已锁住 official Runtime no-fallback，后续 API 写入切换需要继续扫描。
- Live smoke 和 golden case 依赖真实数据源、权限和环境变量，默认 CI 不能直接代表上线验收。
- B2 之前 Copilot 仍不是完整状态机；B1 只能保证 publish/runtime 底座安全。
