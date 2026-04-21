<!-- docs/superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md -->

# 02 · 后端工作流

> 9 项拓展任务（B-back-1 ~ B-back-9），其中 7 项 extend-backend、2 项 new-backend。
> 与 [01 · frontend](01-frontend-workstream.md) §3 一一对应。

---

## 1. 总览

  | ID | 类型 | 主题 | 关联前端项 | 周 |
  | --- | --- | --- | --- | --- |
  | **B-back-1** | extend | 用户偏好 GET/PUT | P21 | W2 |
  | **B-back-2** | extend | App 实例 health 字段 | P22 | W2 |
  | **B-back-3** | extend | 语义 view 物化字段 + 触发 | P11 | W2 |
  | **B-back-4** | extend | 数据源测试连接结果增强 | P15 | W2 |
  | **B-back-5** | extend | 数据源 schema 浏览接口 | P16 | W2 |
  | **B-back-6** | extend | 本体对象搜索参数（q / field） | P19 | W2 |
  | **B-back-7** | extend | Cube list 派生字段（dim/measure/下游 BI 计数） | Cube 卡片 | W3 |
  | **B-back-8** | new | ScheduledQuery 实体 + CRUD + 调度 | Q-sched | W3~W4 |
  | **B-back-9** | new | SemanticDiagnoseRun 实体 + 历史接口 | Diag-history | W3~W4 |

  通用约束（写进每个 issue 的"接受标准"）：

  - **契约文档同步**：`docs/api/openapi.yaml` 同步更新，CI 校验。
  - **集成测试**：`tests/integration/` 必须新增覆盖（详见本文 §11）。
  - **错误码**：复用 `app/common/errors.py` 现有 code，不得新造同义码。
  - **分页**：列表统一 `{ items, total, page, page_size }`。
  - **命名**：snake_case，时间字段以 `_at` 后缀，状态字段以 `_status`/`status` 命名。

---

## 2. B-back-1 · 用户偏好

  **背景**：前端需要持久化主题、默认页签、列表 page_size 等用户偏好。

  **接口**

  ```http
  GET  /api/v1/users/me/preferences
  PUT  /api/v1/users/me/preferences
  ```

  **payload**

  ```json
  {
    "theme": "light | dark | system",
    "default_landing": "/dashboard",
    "list_page_size": 20,
    "table_density": "comfortable | compact",
    "extra": { ... }   // 自由 jsonb，前端按需扩展，后端不解析
  }
  ```

  **DDL**

  ```sql
  CREATE TABLE user_preferences (
    user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme        VARCHAR(16)  NOT NULL DEFAULT 'system',
    default_landing VARCHAR(128) NOT NULL DEFAULT '/dashboard',
    list_page_size INT       NOT NULL DEFAULT 20,
    table_density  VARCHAR(16) NOT NULL DEFAULT 'comfortable',
    extra        JSONB        NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
  );
  ```

  **测试**

  - GET 未配置 → 返回默认值（不 404）。
  - PUT 部分字段 → merge 而非覆盖。
  - PUT `theme=invalid` → 422。

---

## 3. B-back-2 · App 实例 health

  **背景**：实例列表 / 详情需要展示 health（绿/黄/红），dashboard 汇总也需要。

  **接口变更**

  - `GET /api/v1/app-instances` 返回新增字段 `health: 'healthy' | 'degraded' | 'unhealthy'` + `last_heartbeat_at`。
  - `GET /api/v1/app-instances/:id` 同上。

  **实现**：复用现有心跳表（`instance_heartbeats`），按最近 1 次心跳 + 阈值计算 health；
  阈值在 `app/config.py` 暴露：`HEALTH_DEGRADED_SECONDS=60` `HEALTH_UNHEALTHY_SECONDS=180`。

  **不做**：不新建 health 表；不引入实时推送（前端轮询即可）。

  **测试**：mock 心跳时间窗，断言 health 流转。

---

## 4. B-back-3 · 语义 view 物化

  **背景**：语义 view 当前仅有"创建/查询"，无物化触发与状态。

  **接口变更**

  - `GET /api/v1/semantic/views/:id` 返回 `materialized_at`, `materialize_status`（`idle/running/failed`）。
  - 新增 `POST /api/v1/semantic/views/:id/materialize` → 异步触发物化，返回 run_id。
  - 新增 `GET /api/v1/semantic/views/:id/materialize/runs?page=...` 列表。

  **DDL**

  ```sql
  ALTER TABLE semantic_views
    ADD COLUMN materialized_at    TIMESTAMPTZ,
    ADD COLUMN materialize_status VARCHAR(16) NOT NULL DEFAULT 'idle';

  CREATE TABLE semantic_view_materialize_runs (
    id           BIGSERIAL PRIMARY KEY,
    view_id      BIGINT NOT NULL REFERENCES semantic_views(id),
    status       VARCHAR(16) NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ,
    error        TEXT
  );
  ```

  **测试**：触发后立即 GET → status=running；mock worker 结束后 → status=idle 且 materialized_at 更新。

---

## 5. B-back-4 · 数据源测试连接增强

  **背景**：当前测试连接仅返回 `ok: bool`，前端无法展示耗时/错误细节。

  **接口变更**

  - `POST /api/v1/datasources/:id/test` 返回：

      ```json
      {
        "ok": true,
        "latency_ms": 134,
        "tested_at": "2026-04-20T...",
        "details": { "server_version": "...", "tls": true }
      }
      ```
  - 失败时：

      ```json
      {
        "ok": false,
        "latency_ms": 7000,
        "tested_at": "...",
        "error_code": "CONNECTION_TIMEOUT",
        "error_message": "...",
        "hint": "请检查网络与白名单"
      }
      ```

  **不做 DDL**；纯接口字段补齐。

  **测试**：mock connector 抛超时 → 返回 `error_code=CONNECTION_TIMEOUT`。

---

## 6. B-back-5 · 数据源 schema 浏览

  **背景**：前端需要在数据源详情页浏览库 / 表 / 字段（用于"测试一下"和指导建模）。

  **接口**

  ```http
  GET /api/v1/datasources/:id/schema
  GET /api/v1/datasources/:id/schema/:database
  GET /api/v1/datasources/:id/schema/:database/:table
  ```

  返回示例（最细一层）：

  ```json
  {
    "database": "ods",
    "table": "user_event",
    "columns": [
      { "name": "id", "type": "bigint", "nullable": false, "comment": "..." },
      ...
    ],
    "row_count_estimate": 1234567,
    "fetched_at": "..."
  }
  ```

  **缓存策略**：服务端缓存 5 分钟；query string `?refresh=1` 强制重拉。

  **测试**：mock connector 返回 schema；冷调用与命中缓存差异。

---

## 7. B-back-6 · 本体对象搜索

  **背景**：本体工作台需要全局搜索，当前只能按 domain 过滤。

  **接口变更**

  - `GET /api/v1/ontology/objects?q=<keyword>&field=name|description|metric_name`
  - `q` 为 ILIKE 模糊匹配；`field` 默认 `name`，可多值 `field=name&field=metric_name`。
  - 限速：1 用户 30 req / min（与现有限流共用）。

  **不做 DDL**；如查询慢，第二阶段加 `pg_trgm` GIN 索引。

  **测试**：含中文 / 大小写 / 多字段组合。

---

## 8. B-back-7 · Cube 派生字段

  **背景**：前端 Cube 卡片需要展示维度数 / 指标数 / 下游 BI 数；当前需要 N+1 查询，性能差。

  **接口变更**

  - `GET /api/v1/semantic/cubes` 返回每条 cube 新增：

      ```json
      {
        "dimension_count": 12,
        "measure_count": 5,
        "downstream_bi_count": 3,
        "last_modified_at": "..."
      }
      ```

  **实现**：在 cube 仓储层做一次 join + group by；增量更新场景再考虑物化字段。

  **不做**：单 Cube 详情已有完整 dimensions / measures，不重复。

  **测试**：100 个 cube 的列表查询 P95 ≤ 300ms（基准压测进 CI 周报）。

---

## 9. B-back-8 · ScheduledQuery（new-backend）

  **背景**：定时查询当前完全没有；前端 "我的查询 / 调度查询" 是 demo 自造。

  **DDL**

  ```sql
  CREATE TABLE scheduled_queries (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(128) NOT NULL,
    description   TEXT,
    sql           TEXT NOT NULL,
    datasource_id BIGINT NOT NULL REFERENCES datasources(id),
    cron          VARCHAR(64) NOT NULL,    -- 支持 5 段 + 时区
    timezone      VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    enabled       BOOLEAN NOT NULL DEFAULT true,
    next_run_at   TIMESTAMPTZ,
    last_run_at   TIMESTAMPTZ,
    last_status   VARCHAR(16),     -- success | failed | timeout
    owner_id      BIGINT NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_scheduled_queries_owner ON scheduled_queries(owner_id);
  CREATE INDEX idx_scheduled_queries_enabled_next ON scheduled_queries(enabled, next_run_at);

  CREATE TABLE scheduled_query_runs (
    id        BIGSERIAL PRIMARY KEY,
    query_id  BIGINT NOT NULL REFERENCES scheduled_queries(id) ON DELETE CASCADE,
    status    VARCHAR(16) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    rows_returned INT,
    error TEXT
  );
  ```

  **接口**

  ```http
  GET    /api/v1/queries/scheduled
  POST   /api/v1/queries/scheduled
  GET    /api/v1/queries/scheduled/:id
  PATCH  /api/v1/queries/scheduled/:id
  DELETE /api/v1/queries/scheduled/:id
  POST   /api/v1/queries/scheduled/:id/enable
  POST   /api/v1/queries/scheduled/:id/disable
  POST   /api/v1/queries/scheduled/:id/trigger     # 手动触发一次
  GET    /api/v1/queries/scheduled/:id/runs
  ```

  **运行**：复用现有 `app/infrastructure/scheduler/`（如未启用则在 W3 内启用 APScheduler / Celery beat，技术选型由 BE Lead 拍板，写进 ADR）。

  **测试**：cron 解析、enable/disable 幂等、手动触发不影响下次定时、失败统计。

---

## 10. B-back-9 · SemanticDiagnoseRun（new-backend）

  **背景**：语义诊断目前是无状态调用，没有历史记录；demo 在前端用本地 state 假造历史。

  **DDL**

  ```sql
  CREATE TABLE semantic_diagnose_runs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    input_kind  VARCHAR(32) NOT NULL,  -- nl | sql | yaml
    input_text  TEXT NOT NULL,
    parse_ok    BOOLEAN,
    validate_ok BOOLEAN,
    sql_text    TEXT,
    error       TEXT,
    duration_ms INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_diagnose_runs_user_time ON semantic_diagnose_runs(user_id, created_at DESC);
  ```

  **接口**

  ```http
  POST /api/v1/semantic/diagnose             # 同步诊断 + 落库（已存在，调整为落库）
  GET  /api/v1/semantic/diagnose/runs        # 列表
  GET  /api/v1/semantic/diagnose/runs/:id    # 详情
  ```

  **保留期**：30 天，`scripts/cleanup_diagnose_runs.py` 周清理。

  **测试**：诊断成功/失败均落库；列表分页；详情幂等读取。

---

## 11. 集成测试模板

每个 issue 至少 3 类用例，写在 `tests/integration/<area>/test_<feature>.py`：

  ```python
  class TestUserPreferences:
      def test_get_default_when_absent(self, client, auth_user): ...
      def test_put_partial_merges(self, client, auth_user): ...
      def test_put_invalid_theme_returns_422(self, client, auth_user): ...
  ```

  矩阵：

  - happy path（典型成功）
  - boundary（边界值 / 空 / 极大）
  - error（参数错误 / 未授权 / 资源不存在）

  CI tag：所有本期新增测试加 `@pytest.mark.redesign`，便于 W5 跑专项回归。

---

## 12. 不做的事（明确边界）

  - **不动现有 schema 的字段命名**；只做加字段、加表、加接口。
  - **不引入新的鉴权方式**；JWT + 现有 RBAC 已够用。
  - **不引入消息队列**（除非 B-back-9 落库时遇到强烈性能压力，单独 ADR）。
  - **不解决多租户**；当前单租户假设保留。

---

## 13. ADR 触发条件

任何下列变化必须新建一个 ADR（`docs/adr/`，编号顺延）：

  - B-back-8 调度器选型（APScheduler vs Celery beat vs RQ scheduler）。
  - B-back-9 历史保留期（30 天若挑战）。
  - B-back-7 派生字段是否物化。
