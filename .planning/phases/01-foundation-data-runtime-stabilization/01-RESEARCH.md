# Phase 1: 基础接入与运行底座稳定化 - Research

**Date:** 2026-03-25
**Status:** Complete

## Objective

回答一个问题：为了把 Phase 1 规划好，我必须先看清哪些现有资产、技术约束和风险点。

## Current Baseline

- 数据源与数据集主链路已经存在，但仍偏“能演示”而非“稳定可用”：
  - `frontend/src/pages/Datasources.tsx`
  - `frontend/src/pages/Datasets.tsx`
  - `frontend/src/pages/DatasetRegister.tsx`
  - `frontend/src/pages/FileDatasetRegister.tsx`
  - `frontend/src/components/business/SaveAsDatasetDialog.tsx`
- 后端已有数据源与数据集 API 边界，且基本符合薄接口层模式：
  - `app/interfaces/api/v1/datasources.py`
  - `app/interfaces/api/v1/datasets.py`
  - `app/interfaces/api/v1/files.py`
- 现有执行底座已经具备：
  - 长耗时任务：`RQ + Redis`，见 `run_worker.py`、`app/infrastructure/tasks/task_queue.py`
  - 平台内定时调度：`APScheduler`，见 `app/infrastructure/scheduler.py`、`app/application/services/app_center/scheduler_service.py`
- 表目录本身已经有缓存模型，不必从零造目录表：
  - `app/infrastructure/cache/table_cache_service.py`
  - `app/domain/entities/table_cache.py`

## Key Findings

### 1. `PostgreSQL + MaxCompute` 已经是现有实现里的可行基线

- 数据源页现有表单已经区分 `maxcompute` 与其他关系库，但 MaxCompute 仍复用“用户名/密码”心智，不够稳定。
- `CreateDatasourceHandler` 已支持把 `access_key_id/access_key_secret` 规范化为适配器需要的 `access_id/access_key`。
- 这意味着 Phase 1 不需要新增第三方底座，只需要把前后端字段命名、错误提示和同步状态做清楚。

### 2. “数据源目录刷新”最轻实现是复用现有缓存层，而不是新增目录表

- `GetTablesHandler` 已基于 `TableCacheService` 支持 `force_refresh`。
- `TableCacheService` 已提供：
  - 缓存读取
  - 强制刷新
  - 过期缓存批量刷新
  - 指定数据源缓存清理
- 因此更合理的实现是：
  - 继续复用 `datasource_table_cache`
  - 在 `data_sources.extra_config` 中补目录刷新摘要，如 `catalog_sync.status / last_run_at / last_error / tracked_databases`
  - 用 APScheduler 固定周期触发刷新，用 RQ 承接实际工作

### 3. 数据集三种类型已经有雏形，但运行模型不对齐

- 物理表数据集：
  - `DatasetRegister.tsx + /datasets/preview`
  - 目前只拿到字段识别，不带 `LIMIT 20` 样本数据
- SQL 虚拟数据集：
  - 真实入口是 `QueryEditor -> SaveAsDatasetDialog`
  - 不是完全空白，不应该再造第二套注册页
- 文件数据集：
  - 已有 `FileDatasetRegister.tsx + /files/upload`
  - 后端现在只支持 CSV，且文案、`accept` 属性、解析函数都写死了
- 结论：Phase 1 应该保留三条现有入口，但统一状态模型、错误分类和样本预览契约。

### 4. 当前“同步”还是同步 HTTP 处理，不符合已确认的交互决策

- `SyncSchemaHandler` 直接在 HTTP 请求里执行。
- 当前只支持 `physical` 数据集同步，不支持 `virtual` / `file`。
- 但用户已经锁定：
  - 首次同步、手动重同步、定时同步都要后台化
  - 自动同步范围要覆盖已注册数据集
- Phase 1 因此必须把“数据集刷新”拆成异步 job，并按类型分策略。

### 5. 错误分类基础存在，但对前端还不够稳定

- 项目已有统一异常与错误处理：
  - `app/shared/exceptions.py`
  - `app/interfaces/api/middleware/error_handler.py`
- 但当前不是所有错误路径都会稳定返回 `details` 或可区分的 `reason_code`。
- 若不补这个契约，前端很难满足“列表摘要 + 详情完整原因”的 Phase 1 决策。

### 6. 测试入口已经足够，不需要新发明验证框架

- 仓库统一验证入口由 `Makefile` 和 `docs/quality/testing.md` 固定。
- 当前已有直接可复用的数据中心测试资产：
  - `tests/unit/application/datasource/test_handler_coverage.py`
  - `tests/unit/application/dataset/test_handler_coverage.py`
  - `tests/integration/test_datasource_api.py`
  - `tests/integration/test_dataset_api.py`
  - `frontend/src/pages/Datasources.page.test.tsx`
  - `frontend/src/pages/Datasets.page.test.tsx`
  - `frontend/tests/e2e-node/platform-data-inventory.spec.ts`
- 缺口主要在注册流程页测试、文件类型扩展回归，以及新 sync 入口的 smoke 覆盖。

## Recommended Implementation Shape

### Backend

- 继续复用 `APScheduler + RQ`：
  - APScheduler 只负责固定周期触发
  - RQ 负责实际执行 datasource / dataset sync job
- 数据源目录刷新状态不新增专用表，统一落到 `data_sources.extra_config.catalog_sync`
- 数据集继续使用现有 `sync_status / last_sync_at / sync_error`
- 数据集刷新策略按类型拆分：
  - `physical`：Schema + 字段识别 + 样本预览
  - `virtual`：SQL 结果字段重解析
  - `file`：基于已存文件重新识别字段，不做原文件覆盖
- 失败分类统一通过 `error_code + details.reason_code` 暴露给前端

### Frontend

- 不新造 SQL 虚拟数据集页面，保留 `QueryEditor -> SaveAsDatasetDialog`
- `Datasources.tsx` 增加目录刷新摘要、手动同步按钮、MaxCompute 专用字段标签
- `Datasets.tsx` 增加状态摘要、失败摘要、最近同步信息
- `DatasetRegister.tsx` 与 `FileDatasetRegister.tsx` 增加统一的 `LIMIT 20` 样本预览块
- 文件注册页升级为 `CSV + Excel`，但明确“不覆盖原数据集，只能新建”

### Docs / Runtime

- `OPS-01` 在 Phase 1 里只收敛为“现有容器拓扑继续可用，worker 与 scheduler 角色有清晰说明”
- 不引入一键部署、不重做 compose 结构
- 需要回写的重点文档会是：
  - `docs/QUICK_START.md`
  - `docs/STARTUP_GUIDE.md`
  - `docs/runbooks/local-dev.md`
  - `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - `frontend/README.md`

## Risks And Planning Consequences

### 风险 1：目录刷新与数据集刷新容易混成一条大链路

- 后果：后端计划会过大，前端状态也会混乱。
- 规划结论：拆成两个 backend plan。

### 风险 2：三类数据集如果强行完全统一，会把 Phase 1 变成重构项目

- 后果：范围失控，影响 Query Center 现有工作流。
- 规划结论：统一骨架，不统一入口。

### 风险 3：若继续在 HTTP 请求里执行 sync，会直接违背已锁定的交互决策

- 后果：MaxCompute 或大表场景下体验和可靠性都不足。
- 规划结论：Phase 1 必须把 sync job 后台化。

### 风险 4：如果不补 page test / e2e / smoke，Phase 1 会停留在“文档上稳定”

- 后果：执行阶段无法形成真正的回归门槛。
- 规划结论：专门留一份 plan 做回归与运行契约收口。

## Recommended Plan Split

### Wave 1

- `01-01` 数据源目录刷新与调度底座
- `01-02` 数据集三类型后端对齐与错误分类

### Wave 2

- `01-03` 数据中心前端状态与注册流程对齐

### Wave 3

- `01-04` 回归、运行契约与文档收口

## Validation Architecture

- 快速反馈优先使用现有定向入口：
  - 后端 handler / API：`PYTHONPATH=. python -m pytest --no-cov tests/unit/application/datasource/test_handler_coverage.py tests/unit/application/dataset/test_handler_coverage.py tests/integration/test_datasource_api.py tests/integration/test_dataset_api.py`
  - 前端数据中心定向回归：`make test-regression-platform-data`
- 阶段级收口：
  - `make verify-backend`
  - `make verify-frontend`
  - 文档改动后补 `make verify-docs`
- 仍需人工验证的部分：
  - 真实 `MaxCompute` 凭证联通
  - 平台固定周期同步在内网环境中的实际触发

## Research Complete

- 当前代码资产足以支撑 Phase 1，不需要新增第二套异步或调度基础设施。
- 真正的规划重点不是“发明新系统”，而是沿现有入口补齐状态、错误、后台执行和回归门槛。

---

*Research completed: 2026-03-25*
