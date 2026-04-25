# Change: 异步数据导出（add-query-export）

## Why

Round 3 为 `/queries/visual` 承接了原型 `QueryBuilder.tsx` 的字段/筛选/SQL 生成 UI，但刻意**只承接了同步执行语义**（复用 `/api/v1/queries/execute`）。真正的"自助数据导出"能力仍缺失：

- 同步执行有严格 `LIMIT 1000` 的前端硬约束，**大结果集用户无法导出**
- 同步执行超时即请求失败，**长查询无重试/恢复路径**
- 原型代码（现已归档在 `docs/archive/legacy-prototypes/QueryBuilder.tsx.txt`）里调用的 `/api/v1/queries/export` 端点**后端从未实现** —— 这是一笔明确的技术欠账
- 项目对 K12 教研/BI 方向有真实的大文件导出诉求（学情宽表、学科题库全量），单次可达数十万行

Round 4 正式交付这个能力；本 change 先落"设计层"与"契约层"，实现工作放入后续迭代。

## What Changes

### 后端

1. **新端点** `POST /api/v1/queries/export`：接受与 `/execute` 相同的字段集（source_id / sql_query / visual_spec），创建 export 任务并返回任务 ID；立即返回不阻塞
2. **新端点** `GET /api/v1/queries/exports/{export_id}`：查询任务状态（pending / running / success / failed / expired），含结果文件下载 URL 和过期时间
3. **新端点** `GET /api/v1/queries/exports`：当前用户的导出任务分页列表，按 `created_at desc`
4. **新端点** `POST /api/v1/queries/exports/{export_id}/cancel`：取消未启动或运行中的任务
5. **新领域实体** `QueryExport`（`app/domain/entities/query_export.py`）：记录任务元数据 + 生命周期
6. **新 RQ job** `app/infrastructure/tasks/jobs/query_export_job.py`：消费 `QueryExport.PENDING`，用 AdapterFactory 拉数据 → 写 CSV/Parquet → 调用现有 `FileDeliveryService` 上传 OSS 或回落本地
7. **新 service** `app/application/services/queries/query_export_service.py`：协调验证 / 幂等 / 提交 RQ / 写记录
8. **新迁移** 一张 `query_exports` 表：`id / user_id / source_id / sql_query / status / row_count / file_size_bytes / file_url / storage_backend / expires_at / error_message / cancelled_at / created_at / updated_at`
9. **存储**：MVP 复用 extraction 模块已用的 `FileDeliveryService`（OSS 优先 / 本地 `data/exports/` 回落），**不新增存储后端**
10. **权限**：仅数据源 `source_id` 已有 SELECT 权限的用户可导出；任务仅可被发起人本人查看/取消
11. **配额**：单用户每日最多 20 个活跃导出任务；**BREAKING** 无（新端点）

### 前端

1. **新页** `/queries/exports`：我的导出任务列表（status / row_count / file_size / 操作列：下载 / 取消 / 重建）
2. **QueryVisual 扩展**：在"在查询控制台打开"旁新增 **"导出为文件"** 按钮，点击即提交 export 任务 + toast 提示，含"查看进度"跳 `/queries/exports`
3. **QueryConsole 扩展**：手写 SQL 也可一键导出（复用同一 service hook）
4. **导航**：左侧 "查询中心" 分组下新增"我的导出"入口
5. **i18n**：新增 `queryExport.*` namespace（预估 ~30 key）

### 不做（Non-goals）

- **不**新增 ClickHouse/MaxCompute 原生导出通道（先全走 adapter + CSV，待 perf 证据后再优化）
- **不**做团队共享的导出库（只有"我的导出"）
- **不**做导出模板/计划任务（可由订阅中心 / schedule 覆盖）
- **不**做列级 mask 定制（沿用 dataset 的 sensitivity_level / mask_rule 规则）
- **不**在本 change 改 `/queries/visual` 同步执行语义（二者并存）

## Capabilities

### New Capabilities

- `query-export`: 用户自助将 SQL 查询结果导出为文件（CSV / 后续可扩展 Parquet / Excel），异步处理、生命周期管理、可下载/可取消

### Modified Capabilities

无。新能力与现有 query execute 是并排关系，不修改既有 requirement。

## Impact

- **新 API**：`/api/v1/queries/export` 系列 4 个端点
- **新数据表**：`query_exports`（一张表，一条迁移）
- **新前端路由**：`/queries/exports`（一个列表页）+ 现有 `/queries`、`/queries/visual` 新增按钮
- **依赖**：无新外部依赖；复用现有 Redis / RQ / FileDeliveryService / AdapterFactory
- **运维**：需要监控 `query_export` RQ queue 的 depth & failure rate；`data/exports/` 本地目录需定期清理（可复用 extraction 的清理机制）
- **影响范围**：纯新增；现有用户不受影响。老的 `/queries/visual` 同步执行路径保留，无变更
