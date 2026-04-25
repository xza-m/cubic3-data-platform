# 异步数据导出 · 实现任务清单

> 状态：**已实现**（2026-04-23）。本清单跟踪的 10 大类 56 项子任务全部完成。
> 验收闸门：后端 31 个新单测 + 4 个新集成用例、前端 4 个新 RTL 单测、4 个新 P31 E2E 用例（含 smoke/p30 回归）均通过；tsc / lint / vitest / playwright --list / i18n coverage ≥ 98% / `openspec validate --strict` 全绿。详见 [docs/features/query-export.md](../../../docs/features/query-export.md)。

## 状态说明

- `[ ]` 待完成
- `[/]` 进行中
- `[x]` 已完成

---

## 1. 数据层（P0）

### 1.1 领域实体
- [x] 1.1.1 `app/domain/entities/query_export.py` 定义 `QueryExport` 实体
- [x] 1.1.2 `app/shared/enums.py` 或独立枚举：`QueryExportStatus`（pending / running / success / failed / cancelling / cancelled / expired）
- [x] 1.1.3 `app/domain/ports/repositories/query_export_repository.py` 定义 repository 接口

### 1.2 ORM & 迁移
- [x] 1.2.1 `app/infrastructure/models/query_export.py` SQLAlchemy ORM
- [x] 1.2.2 `migrations/versions/YYYYMMDD_add_query_exports.py`：创建 `query_exports` 表（11 个字段 + 索引 `(user_id, created_at desc)`、`(status, created_at)` 用于 scheduler 扫描）
- [x] 1.2.3 `app/infrastructure/repositories/query_export_repository.py` 实现 repository

---

## 2. 后端应用层（P0）

### 2.1 Service
- [x] 2.1.1 `app/application/services/queries/query_export_service.py`
  - [x] `submit(user_id, source_id, sql_query) -> QueryExport`：验证 + 配额 + 创建记录 + enqueue
  - [x] `get(user_id, export_id) -> QueryExport`：含 ownership 校验（非本人 404）
  - [x] `list(user_id, page, page_size, status_filter) -> PaginatedList[QueryExport]`
  - [x] `cancel(user_id, export_id) -> QueryExport`：状态机转移 + RQ job 取消
  - [x] `check_quota(user_id) -> None`：超限抛 `QuotaExceededError`

### 2.2 Commands / Queries（CQRS）
- [x] 2.2.1 `app/application/queries/commands/submit_export.py` · `SubmitExportCommand`
- [x] 2.2.2 `app/application/queries/commands/cancel_export.py` · `CancelExportCommand`
- [x] 2.2.3 `app/application/queries/handlers/submit_export_handler.py`
- [x] 2.2.4 `app/application/queries/handlers/cancel_export_handler.py`

### 2.3 Pydantic schema
- [x] 2.3.1 `app/interfaces/api/v1/schemas/query_export.py`：request / response schema

---

## 3. 后端基础设施（P0）

### 3.1 RQ Job
- [x] 3.1.1 `app/infrastructure/tasks/jobs/query_export_job.py`
  - [x] 加载 QueryExport 记录 → 置 running
  - [x] 取 DataSource + adapter
  - [x] 流式执行 SQL（chunk=50000）
  - [x] 逐 chunk 写 CSV（含 sensitive 字段 mask）
  - [x] 文件大小/行数上限校验
  - [x] 上传 FileDeliveryService（OSS / 本地）
  - [x] 生成 URL + 置 success
  - [x] 异常处理 → failed + error_message

### 3.2 取消机制
- [x] 3.2.1 job 每个 chunk 结束时检查数据库 `status`，若 `cancelling` 则 abort（关闭 cursor / 删除部分写入的文件）

### 3.3 Scheduler · 过期清理
- [x] 3.3.1 在 `app/infrastructure/scheduler.py` 注册 cron：每小时扫 `status='success' AND expires_at < now()`
- [x] 3.3.2 删 OSS / 本地文件 → 置 `status='expired'` + `file_url=null`

### 3.4 DI 装配
- [x] 3.4.1 `app/di/container.py`：装 repository / service / handlers

---

## 4. 后端接口层（P0）

### 4.1 REST endpoints
- [x] 4.1.1 `POST /api/v1/queries/export` · `submit_export`
- [x] 4.1.2 `GET /api/v1/queries/exports/:export_id` · `get_export`
- [x] 4.1.3 `GET /api/v1/queries/exports` · `list_exports`
- [x] 4.1.4 `POST /api/v1/queries/exports/:export_id/cancel` · `cancel_export`
- [x] 4.1.5 `POST /api/v1/queries/exports/:export_id/rerun` · `rerun_export`（follow-up）
- [x] 4.1.6 `GET /api/v1/queries/exports/:export_id/download` · 本地回落的下载代理（仅本地后端使用）

### 4.2 权限与异常映射
- [x] 4.2.1 `PermissionDenied` → 403，`EXPORT_NOT_FOUND` → 404，`QUOTA_EXCEEDED` → 429，`INVALID_SQL` → 400

### 4.3 OpenAPI / 文档
- [x] 4.3.1 在 `docs/api/queries.md` 追加新端点 specs
- [x] 4.3.2 更新后端 API 覆盖率规则（`scripts/backend_coverage_rules.json`）

---

## 5. 前端 API / hooks（P0）

### 5.1 API 客户端
- [x] 5.1.1 `frontend/src/v2/api/queries.ts` 扩展：
  - [x] `submitExport(payload) -> { export_id, status }`
  - [x] `getExport(export_id) -> QueryExport`
  - [x] `listExports(params) -> PaginatedList<QueryExport>`
  - [x] `cancelExport(export_id) -> QueryExport`
- [x] 5.1.2 导出 `QueryExport` / `QueryExportStatus` 类型

### 5.2 React Query hooks
- [x] 5.2.1 `frontend/src/v2/hooks/queries.ts` 扩展：
  - [x] `useSubmitExport()` mutation（成功 toast + invalidate `queries:exports`）
  - [x] `useExport(export_id)` query（状态非终态时 `refetchInterval: 5000`）
  - [x] `useExports(params)` query
  - [x] `useCancelExport()` mutation
- [x] 5.2.2 单元测试（RTL + msw fixture）

---

## 6. 前端页面（P0）

### 6.1 导出列表页
- [x] 6.1.1 `frontend/src/v2/pages/queries/exports/QueryExports.tsx`
  - [x] 表格列：状态徽章 / SQL 截断 / source / row_count / file_size / created_at / 到期时间 / 操作列
  - [x] 操作：下载（file_url 可用时）/ 取消（pending/running）/ 重建（expired）
  - [x] 空状态 / loading / error
  - [x] 状态过滤 tabs（all / pending / running / success / failed / expired）
- [x] 6.1.2 `frontend/src/v2/pages/queries/exports/_shared/export-content.tsx`（Peek / 详情共享渲染）

### 6.2 路由挂载
- [x] 6.2.1 `frontend/src/v2/routes.tsx`：lazy import + `<Route path="exports" />`
- [x] 6.2.2 `frontend/src/v2/layout/navigation.ts`：查询中心分组下加"我的导出"

### 6.3 QueryVisual 集成
- [x] 6.3.1 `frontend/src/v2/pages/queries/visual/QueryVisual.tsx`：SqlPreview 旁加 "导出为文件" 按钮
- [x] 6.3.2 点击 → `useSubmitExport` → toast "任务已提交" + 行动 "查看进度"
- [x] 6.3.3 `SqlPreview.tsx` 新 prop `onExport?: () => void` + testid `v2-sql-preview-export`

### 6.4 QueryConsole 集成
- [x] 6.4.1 在 QueryConsole 顶栏"执行"按钮旁加"导出"按钮（secondary）
- [x] 6.4.2 共享同一个 mutation hook

### 6.5 i18n
- [x] 6.5.1 新增 `queryExport.*` namespace（list 页 / 状态徽章 / 操作按钮 / 错误提示），预估 ~30 key
- [x] 6.5.2 `npm run i18n:extract` → `npm run i18n:populate` → `npm run i18n:coverage` ≥ 98%

---

## 7. 测试（P0）

### 7.1 后端
- [x] 7.1.1 `tests/unit/application/queries/test_query_export_service.py`：submit / quota / cancel 状态机
- [x] 7.1.2 `tests/integration/test_query_export_api.py`：4 个端点 happy path + 权限 + 404
- [x] 7.1.3 `tests/unit/infrastructure/test_query_export_job.py`：chunk 写入 / 行数限制 / 取消 / 敏感 mask
- [x] 7.1.4 更新覆盖率规则

### 7.2 前端单元
- [x] 7.2.1 `QueryExports.test.tsx` RTL：空状态 / 列表渲染 / 取消调用
- [x] 7.2.2 hooks 单测

### 7.3 E2E
- [x] 7.3.1 `tests/e2e-v2/p31-query-export.spec.ts`：
  - [x] 从 QueryVisual 点"导出为文件" → toast → 跳 /queries/exports
  - [x] 列表页轮询状态：pending → success（mock 两段 payload 模拟状态跳变）
  - [x] 取消按钮交互

---

## 8. 运维与观测（P1）

- [x] 8.1 Prometheus metrics：`query_export.enqueued_total` / `query_export.finished_total{status}` / `query_export.duration_ms`
- [x] 8.2 Grafana dashboard：queue depth / failure rate / p95 duration / file size histogram
- [x] 8.3 Alertmanager：queue depth > 100 / failure rate > 10% / OSS upload 失败 > 5% 连续 10 分钟
- [x] 8.4 Runbook：`docs/ops/query-export-runbook.md`

---

## 9. 文档（P1）

- [x] 9.1 `docs/features/query-export.md`：用户视角（怎么用 / 限制 / FAQ）
- [x] 9.2 `docs/architecture/query-export.md`：架构图 + 序列图
- [x] 9.3 `docs/quality/backend-coverage.md` / `frontend-coverage.md`：新文件覆盖率纳入
- [x] 9.4 更新 `README.md` / `CLAUDE.md` 的 "核心能力" 清单
