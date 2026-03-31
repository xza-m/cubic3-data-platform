# 外部集成

## 数据库

- PostgreSQL：主数据库，配置来自 `DATABASE_URL`，默认连接串在 `env.sample`、`docker-compose.yml` 和 `app/config_schema.py` 中。
- SQLAlchemy 访问层：模型与 ORM 扩展入口见 `app/extensions.py`、`app/__init__.py`。
- 数据源适配数据库：
  - PostgreSQL 适配器：`app/infrastructure/adapters/datasources/postgresql_adapter.py`
  - MySQL 适配器：`app/infrastructure/adapters/datasources/mysql_adapter.py`
  - ClickHouse 适配器：`app/infrastructure/adapters/datasources/clickhouse_adapter.py`
  - MaxCompute 适配器：`app/infrastructure/adapters/datasources/maxcompute_adapter.py`
  - 适配器工厂：`app/infrastructure/adapters/datasources/factory.py`

## 缓存

- Redis：用于缓存、任务队列连接与部分运行时协调，配置键为 `REDIS_URL`。
- 主要实现：
  - `app/infrastructure/cache/redis_client.py`
  - `app/infrastructure/cache/table_cache_service.py`
  - `app/infrastructure/queue.py`
  - `app/infrastructure/tasks/task_queue.py`
- 说明：Redis 同时承担缓存与 RQ 连接，属于共享基础设施。

## 队列与异步任务

- RQ：默认队列名为 `default`，用于提取任务、SQL 查询任务、事件派发。
- Worker 入口：
  - `run_worker.py`
  - `app/infrastructure/tasks/rq_worker.py`
- 任务实现：
  - `app/infrastructure/tasks/jobs/extraction_job.py`
  - `app/infrastructure/tasks/jobs/sql_query_job.py`
- 事件总线：
  - `app/infrastructure/events/event_bus.py`
  - `app/infrastructure/events/registry.py`
  - `app/infrastructure/events/dispatcher.py`

## 认证

- JWT：后端鉴权中间件位于 `app/interfaces/api/middleware/auth.py`，前端会把令牌放在 `localStorage` 的 `auth_token`。
- 管理员密码登录：`app/interfaces/api/v1/auth.py` 的 `/api/v1/auth/login`。
- 飞书 SSO：`app/interfaces/api/v1/auth.py` 的 `/api/v1/auth/feishu/authorize` 与 `/callback`。
- 说明：登录态是后端签发 JWT，不是第三方会话直通。

## 第三方 API

- 飞书开放平台：
  - OAuth / 用户信息：`app/infrastructure/adapters/feishu/auth_client.py`
  - 群聊、文件、消息：`app/infrastructure/adapters/feishu/client.py`
  - WebSocket 长连接：`app/infrastructure/adapters/feishu/ws_event_handler.py`
  - 事件回调 API：`app/interfaces/api/v1/feishu.py`
  - 自定义机器人通知：`app/infrastructure/notification/feishu_webhook.py`
- OpenAI 兼容 LLM：
  - `app/infrastructure/llm/openai_service.py`
  - `app/infrastructure/adapters/llm/openai_compatible.py`
  - 配置来自 `LLM_*` 环境变量
- Superset：
  - 客户端：`app/infrastructure/adapters/superset/client.py`
  - 相关配置：`SUPERSET_*` 环境变量
  - 说明：我未在 `app/__init__.py` 的蓝图注册中看到直接路由挂载，因此 Superset 更像是被服务层按需调用的集成，而不是独立 API 模块；这一点是根据代码引用关系推断的。

## 消息与通知

- 飞书群消息与卡片：
  - `app/interfaces/channels/feishu_channel.py`
  - `app/interfaces/api/v1/feishu.py`
  - `app/infrastructure/adapters/feishu/client.py`
- Schema Drift 报告：
  - `app/infrastructure/notification/feishu_webhook.py`
  - `app/executors/schema_drift_executor.py`
- 应用/订阅消息编排：
  - `app/interfaces/api/v1/channels.py`
  - `app/interfaces/api/v1/subscriptions.py`
  - `app/interfaces/api/v1/app_executions.py`

## 存储

- 本地文件上传：`app/interfaces/api/v1/files.py`，默认目录由 `UPLOAD_FOLDER` 控制，示例值在 `env.sample`。
- 提取结果文件：`app/infrastructure/adapters/file_delivery/file_delivery_service.py`，默认目录由 `EXTRACTION_RESULT_DIR` 控制。
- 语义层 YAML 存储：
  - `app/infrastructure/semantic/catalogs/`
  - `app/infrastructure/semantic/cubes/`
  - `app/infrastructure/semantic/domains/`
  - `app/infrastructure/semantic/views/`
  - `app/infrastructure/semantic/recipes/`
- Docker/Nginx 静态资源：`frontend/dist`，由 `docker-compose.yml` 挂载到 Nginx。

## Webhook 与回调

- 飞书事件回调：`POST /api/v1/feishu/events`，实现见 `app/interfaces/api/v1/feishu.py`。
- 飞书回调验证：通过 `FEISHU_VERIFICATION_TOKEN` 校验，逻辑同样在 `app/interfaces/api/v1/feishu.py`。
- 飞书消息卡片回调：通过 `app/infrastructure/adapters/feishu/ws_event_handler.py` 的长连接事件处理，适合无需公网 webhook 的场景。

## 主要适配器位置

- 数据源适配器：`app/infrastructure/adapters/datasources/`
- 飞书适配器：`app/infrastructure/adapters/feishu/`
- LLM 适配器：`app/infrastructure/adapters/llm/`
- Superset 适配器：`app/infrastructure/adapters/superset/`
- 文件交付适配器：`app/infrastructure/adapters/file_delivery/`
- 通知适配器：`app/infrastructure/notification/`
- 前端到后端 API 封装：`frontend/src/api/`

## 备注

- OSS 是可选集成，`app/infrastructure/adapters/file_delivery/file_delivery_service.py` 会在缺少配置或缺少 `oss2` 时回退到本地下载。
- 飞书、Superset、LLM 均依赖环境变量驱动，未配置时大多会走降级或跳过逻辑。
