---
doc_type: feature
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-04-23
---

# 异步数据导出 · 用户指南

## 为什么需要

查询工作台的同步执行只能返回 ≤ 10,000 行，超过会超时；业务上下载 10w ~ 100w 行的数据明细场景必须走异步流。新功能满足：

1. 提交 SQL 后立即返回 `export_id`，前端不阻塞。
2. 后台流式跑 SQL，每 50,000 行一个 chunk，不吃进程内存。
3. 生成 CSV 后优先上传 OSS 给预签名下载链接；OSS 不可用时回落到平台本地下载代理。
4. 结果文件保留 7 天后自动过期清理，数据库记录永久保留供审计。

## 使用路径

### 1. 发起导出

- **可视化构建页（推荐）** `/queries/visual`：选数据集 → 勾字段/加筛选 → SQL 预览面板右上角「导出为文件」。
- 发起后会 toast 提示 `任务已提交`，并自动跳转到 `/queries/exports`。

### 2. 查看进度

- `/queries/exports` 我的导出列表页会按状态展示每一行任务：
  - `pending`：已入库，等待 worker 消费
  - `running`：worker 正在跑
  - `success`：文件可下载
  - `failed`：执行失败，errorMessage 会显示在状态下方
  - `cancelling` / `cancelled`：用户主动取消
  - `expired`：文件已过期被清理
- 列表对 `pending / running / cancelling` 状态自动 5s 轮询。

### 3. 下载

- OSS 成功的任务：直接点「下载」，走 OSS 预签名 URL（浏览器直连对象存储）。
- 本地回落任务：点「下载」走后端 `/api/v1/queries/exports/:id/download` 代理。

### 4. 取消

- `pending` / `running` 状态可点「取消」：
  - `pending` → 直接置为 `cancelled`，并把 RQ job 从队列移除
  - `running` → 先置 `cancelling`，worker 下一 chunk boundary 响应后置 `cancelled`

## 配额与限制

| 维度 | 阈值 | 超限返回 |
| --- | --- | --- |
| 单用户每日任务数 | 20 | HTTP 429 / `EXPORT_QUOTA_EXCEEDED` (`reason=daily`) |
| 单用户并发任务数 | 3 | HTTP 429 / `EXPORT_QUOTA_EXCEEDED` (`reason=concurrent`) |
| 单任务行数上限 | 1,000,000 | 任务被置 `failed` + `EXPORT_LIMIT_EXCEEDED` |
| 单任务文件上限 | 2 GB | 同上 |
| 文件保留期 | 7 天 | `scheduler` 每小时清理一次 |

## 敏感字段处理

`chunked_csv_writer.py` 支持行级 mask 规则（`mobile` / `id_card` / `email` / `name` / `amount` / `full_mask`）。MVP 版本的 job 尚未启用自动推断敏感列的逻辑（仅预留接口），请通过建模层的 `dataset_fields.mask_rule` 做 SQL 层脱敏，或在后续迭代中扩展 `query_export_job` 的 `mask_columns` 参数。

## 后端端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/queries/export` | 提交任务，返回 `202` + `export_id` |
| `GET` | `/api/v1/queries/exports` | 当前用户任务分页列表（可按 `status` 过滤） |
| `GET` | `/api/v1/queries/exports/:export_id` | 查单个任务（非创建人 404） |
| `POST` | `/api/v1/queries/exports/:export_id/cancel` | 请求取消 |
| `GET` | `/api/v1/queries/exports/:export_id/download` | 本地回落下载代理（仅创建人） |

详细 schema 见 [openspec/changes/archive/2026-04-24-add-query-export/specs/query-export/spec.md](../../openspec/changes/archive/2026-04-24-add-query-export/specs/query-export/spec.md)。

## 运维

- 过期清理：Flask-APScheduler 注册的 `query_export_cleanup` cron，每小时 :05 执行一次，实现在 [app/infrastructure/tasks/jobs/query_export_cleanup_job.py](../../app/infrastructure/tasks/jobs/query_export_cleanup_job.py)。
- Worker 队列：默认 `default`，沿用 `run_worker.py`；大规模部署可以按需拆独立 RQ worker 监听 `default` 或专用队列。
- OSS 配置：`OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_ENDPOINT` / `OSS_BUCKET_NAME` 缺任意一项，都会自动回落本地下载代理。

## FAQ

**Q. 为什么 QueryConsole 没有「导出」按钮？**
A. MVP 先在 QueryVisual 接入，QueryConsole 的导出入口是 follow-up，参见 `openspec/changes/archive/2026-04-24-add-query-export/tasks.md § 6.4`（留作下一个 sprint）。

**Q. 导出任务失败后会自动重试吗？**
A. 不会。SQL 失败通常是业务错误（权限/语法/数据源连接），自动重试反而掩盖问题。用户需手动重新提交。

**Q. 我能导出别人的任务结果吗？**
A. 不能。所有查询 / 下载 / 取消接口都会校验 `user_id == 创建人`，非本人统一返回 404（避免枚举攻击）。
