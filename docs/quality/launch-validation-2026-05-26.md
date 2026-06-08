---
doc_type: validation
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-07
---

# 2026-05-26 上线前 Review 与回归记录

本文记录 `codex/launch-readiness-ux-fixes` 分支在 2026-05-26 对已合并 MR 后的二次 review、运行态问题修复和回归证据。

## 验证环境

| 项目 | 值 |
|---|---|
| 分支 | `codex/launch-readiness-ux-fixes` |
| 本地入口 | `http://localhost:81` |
| 运行栈 | Docker Compose：nginx、backend、postgres、redis、rq_worker |
| 数据库 | Docker compose 内置 PostgreSQL：`postgresql://postgres:postgres@postgres:5432/cubic3_data_platform` |

## 自动化验证结果

| 命令 | 结果 | 说明 |
|---|---|---|
| `make verify-alembic` | passed | 4 个 revision，单 head：`0004_instance_heartbeats`。 |
| `PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/test_misc_coverage.py tests/integration/app_instances/test_health.py` | passed | `22 passed`，覆盖 scheduler app context 与实例心跳降级路径。 |
| `make verify-backend` | passed | `1906 passed` 单元测试；`397 passed, 2 skipped` 集成测试；`27 passed` 后端 API smoke。 |
| `make verify-frontend` | passed | ESLint、token、i18n、TS build、`663 passed` 前端单测、`47 passed` v2 smoke。 |
| `make verify-docs` | passed | 201 个 Markdown 文件通过文档健康检查。 |
| `docker compose config --quiet` | passed | compose 配置可解析；仅提示本地未配置 OSS 环境变量。 |
| `DOMAIN_SMOKE_BASE_URL=http://127.0.0.1:81 SEMANTIC_SMOKE_USE_EXISTING_SERVER=1 make smoke-semantic` | passed | 领域创建/发布、治理问题、数据资产底座真实 E2E、建模助手 smoke 全通过。 |

## 真实运行态验证

| 检查 | 结果 | 说明 |
|---|---|---|
| `docker compose ps` | passed | backend、nginx、postgres、redis、2 个 rq_worker 均为 Up。 |
| `curl -sf http://127.0.0.1:81/health` 与 `/api/v1/health` | passed | 均返回 `data.status=ok`。 |
| Docker PG Alembic 状态 | passed | `alembic_version=0004_instance_heartbeats`，`agent_inference_runtime_runs` 与 `instance_heartbeats` 均已存在。 |
| Browser 回归 | passed | `/dashboard` 不再出现 `Start learning/Courses/Interactive demos`；`/extraction/runs` 不再出现 `Run #undefined`；未落回登录页。 |
| 后端日志复查 | passed | 重启后 1 分钟内无 `ERROR/Traceback/Working outside/value too long/instance_heartbeats_table_not_found`。 |

## 本轮发现与修复

- 修复 `0003_agent_inference_runtime_tables` revision id 超过 `alembic_version.version_num varchar(32)` 导致真实 PG 升级失败的问题，缩短为 `0003_agent_runtime_tables`。
- 新增 `0004_instance_heartbeats`，补齐应用实例健康计算依赖的心跳表，并在表缺失降级路径中 rollback，避免 Postgres session 进入 aborted 状态。
- 固定 Docker Compose 本地环境的 `DATABASE_URL`，避免宿主机同名变量把 backend/worker 串到外部 `legacy-bi-postgres`。
- 为 APScheduler 固定平台任务保留 Flask app context，修复 `query_export_cleanup` 在后台线程中 `Working outside of application context` 的运行态错误。
- 清理 Dashboard 学习区英文壳文案，统一为中文产品表达。
- 修复抽取执行页关闭态 PeekPanel 暴露 `Run #undefined` 的问题，并补充 Playwright 回归断言。

## 剩余风险

- `docker compose config` 仍提示 OSS 相关环境变量未设置。本地验证不覆盖 OSS 文件交付；上线环境需要按部署配置补齐。
- Codex live smoke 仍是 opt-in：当前基线已切到 Codex SDK；未设置 `AGENT_CODEX_LIVE=1` 时，SDK live smoke 按设计跳过。

## 工程原则复盘

- KISS：针对真实故障点做最小修复，未重写迁移体系、调度体系或页面结构。
- YAGNI：未引入新的元数据表或调度框架，只补齐当前代码已依赖的 `instance_heartbeats`。
- SOLID：调度模块负责封装 scheduler 线程上下文，具体 job 保持业务清理职责。
- DRY：Docker 本地数据库配置统一收敛到 compose 内置 PG，避免 backend 与 worker 分叉配置。
