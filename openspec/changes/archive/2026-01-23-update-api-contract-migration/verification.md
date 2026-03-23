# 联调与回归清单（迁移说明）

## 1. Dataset 相关接口与页面调用路径
### 后端接口（新架构）
- `GET /api/v1/data-center/datasets`：数据集列表（分页）
- `GET /api/v1/data-center/datasets/<id>`：数据集详情（可带 `include_fields`）
- `POST /api/v1/data-center/datasets`：创建数据集（physical/virtual/file）
- `PUT /api/v1/data-center/datasets/<id>`：更新数据集
- `DELETE /api/v1/data-center/datasets/<id>`：删除数据集
- `GET /api/v1/data-center/datasets/statistics`：数据集统计（active/syncing/synced/failed/pending）
- `POST /api/v1/data-center/datasets/preview`：预览字段（表级）

### 前端页面（新架构）
- `frontend/src/pages/Datasets.tsx`
- `frontend/src/pages/GlassDatasets.tsx`
- `frontend/src/pages/GlassDatasetDetail.tsx`
- `frontend/src/pages/GlassDatasetRegister.tsx`
- `frontend/src/pages/SqlLabRegister.tsx`
- `frontend/src/pages/FileDatasetRegister.tsx`
- `frontend/src/pages/ExtractionTaskConfig/StepDatasetFields.tsx`

### 旧架构依赖检查
- 前端仓库内未发现对 `/api/*` 的直接调用（仅保留服务端旧蓝图入口，返回 410）。
- 若存在外部系统依赖旧 `/api/*`，需由运维/业务侧确认并同步迁移。

## 2. 契约要点（统一规范）
### ApiResponse
- 结构：`{ code, message, data, trace_id }`
- 成功：`code = 0`
- 失败：`code = -1`（HTTP 状态码按语义返回）

### Dataset 对象
- 必填：`id`, `dataset_code`, `dataset_name`, `dataset_type`, `sync_status`, `created_at`, `updated_at`
- 可选：`source_id`, `source_type`, `physical_table`, `sql_query`, `file_metadata`, `description`, `owner`, `last_sync_at`, `sync_error`, `field_count`, `fields`
- 枚举：
  - `dataset_type`: `physical | virtual | file`
  - `business_type`: `partition_key | dimension | measure`
  - `sensitivity_level`: `public | internal | pii | confidential | secret`
  - `sync_status`: `active | syncing | synced | failed | pending`

## 3. 兼容性变更与迁移说明
- 旧端点 **直接下线**，统一返回 410：
  - `/api/tasks/*`
  - `/api/feishu/*`
- 新端点统一 `/api/v1`：
  - Superset 订阅：`/api/v1/superset/*`
  - 飞书回调与群列表：`/api/v1/feishu/*`

## 4. 契约回归清单（至少 10 个核心接口）
### 已执行结果（本地 docker，2026-01-23，接入现有 PostgreSQL 容器数据）
- [x] `GET /api/v1/data-center/datasets`（200，返回已有数据集列表）
- [x] `GET /api/v1/data-center/datasets/<id>`（200，`include_fields=true`）
- [ ] `POST /api/v1/data-center/datasets`（physical）（未执行：需有效数据源）
- [ ] `POST /api/v1/data-center/datasets`（virtual）（未执行：需有效数据源与 SQL）
- [ ] `POST /api/v1/data-center/datasets`（file）（未执行：需上传文件）
- [ ] `PUT /api/v1/data-center/datasets/<id>`（未执行：需有数据）
- [ ] `DELETE /api/v1/data-center/datasets/<id>`（未执行：需有数据）
- [x] `GET /api/v1/data-center/datasets/statistics`（200，字段齐全）
- [x] `GET /api/v1/data-center/datasources`（200，返回已有数据源列表）
- [ ] `GET /api/v1/data-center/datasources/<id>`（未执行：未挑选单条验证）
- [x] `GET /api/v1/superset/tasks`（200，返回任务列表或空列表）
- [ ] `POST /api/v1/superset/tasks`（未执行：需有效飞书群）
- [x] `POST /api/v1/feishu/events`（challenge 200）
- [x] `GET /api/v1/feishu/chats`（200，空列表）
- [x] `GET /api/tasks`（410）
- [x] `GET /api/feishu/chats`（410）

### 执行前置
- 本地启动 docker compose
- 将现有 `bi_gateway_postgres` 容器加入 `dw_bi_webhook_gateway_default` 网络并设置别名 `postgres_test`，以匹配 `DATABASE_URL` 的主机名
