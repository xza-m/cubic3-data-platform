---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-06
---

# 快速开始

本文档基于当前实现提供最短路径启动说明，优先保证“按文档可跑起来”。

## 1. 前置要求

- Python 3.11+
- Node.js 18+
- Docker 20.10+
- Docker Compose 2+

建议首次进入仓库先执行：

```bash
make setup
```

Phase 1 当前已验证的基础链路基线是：

- 数据源：`PostgreSQL`、`MaxCompute`
- 数据集注册：`physical`、`virtual`、`file`
- 文件数据集：支持 `CSV / XLS / XLSX`

## 2. 方式一：Docker 启动完整体验

### 2.1 准备环境变量

```bash
cp env.sample .env
```

建议至少确认这些配置：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `APP_BASE_URL`

如果需要以下能力，再补充对应配置：

- 智能问数：`LLM_API_KEY`
- 飞书集成：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`
- Superset 截图：`SUPERSET_*`
- OSS 文件交付：`OSS_*`

### 2.2 启动服务

```bash
docker compose up --build -d
```

说明：

- `nginx` 镜像会在构建阶段自动执行前端 `npm ci && npm run build`
- `docker compose up --build` 会同时拿到最新前端静态资源和当前 `nginx` 配置
- Docker 模式下 `backend` 与 `rq_worker` 固定连接 compose 内置 PostgreSQL：`postgresql://postgres:postgres@postgres:5432/cubic3_data_platform`，避免宿主机 `DATABASE_URL` 污染本地验证环境
- Web 进程会在启动时初始化 `APScheduler`
- 长耗时目录同步、数据集同步等任务由 `rq_worker` 执行

### 2.3 验证服务

```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/docs/openapi.json
```

访问入口：

- 前端：`http://localhost:81`
- 后端 API：`http://localhost:5000`
- API 文档：`http://localhost:5000/api/docs`

## 3. 方式二：本地开发

### 3.1 启动后端

```bash
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

后端默认地址：`http://localhost:5000`

说明：

- `flask --app wsgi.py run` 启动的是 Web 角色，包含 API、种子初始化和 `APScheduler`
- Phase 1 的固定周期目录同步注册在这个 Web 进程里

### 3.2 启动前端

```bash
cd frontend
npm run dev
```

前端默认地址：`http://localhost:3000`

如果你没有启动 Nginx，而是让前端直接代理到 Flask，请使用：

```bash
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

### 3.3 启动 Worker

```bash
python run_worker.py
```

可选替代方式：

```bash
./start_rq_worker.sh
```

Worker 负责消费 RQ 队列中的长耗时任务，包括：

- 数据源目录同步
- 数据集元数据刷新
- 其他异步提取 / 应用执行任务

如需消费 Agent 语义执行或统一查询执行面提交的查询任务，另开一个查询执行 Worker：

```bash
python -m app.workers.query_execution_worker
```

该 Worker 不消费 Redis/RQ，而是从 PostgreSQL `query_execution_jobs` claim 任务，支持 lease 续租、过期恢复、取消下沉、可重试提交和过期结果清理。Web 与查询执行 Worker 必须共享 `QUERY_EXECUTION_SPOOL_DIR`（默认 `instance/query_execution_results`），用于读取持久化后的查询结果。常用生产参数包括 `QUERY_EXECUTION_LEASE_SECONDS`、`QUERY_WORKER_IDLE_SLEEP_SECONDS`、`QUERY_RESULT_CLEANUP_INTERVAL_SECONDS` 和 `QUERY_EXECUTION_MAX_SUBMIT_ATTEMPTS`。

## 4. 常用校验命令

```bash
# 初始化依赖
make setup

# 层 1：静态检查
make lint

# 层 2：类型与接口检查
make typecheck

# 层 3：自动化测试
make test
make test-unit
make test-integration

# 层 4：运行验证
make smoke

# 默认总入口
make verify

# 按当前改动检测或执行最低必跑集合
make verify-detect
make verify-changed

# 检查当前改动是否遗漏关键文档更新
make docs-impact

# 按范围进入可交付状态
make verify-backend
make verify-frontend
make verify-docs

# 语义中心专项校验
make verify-semantic
make test-query-execution
make smoke-semantic

# 可选：coverage 专项验证
make coverage
make coverage-backend
make coverage-frontend
make coverage-report
```

后端 coverage 当前门槛按 [后端覆盖率看板](quality/backend-coverage.md) 维护；当前 `pytest.ini` 基线为 `--cov-fail-under=95`。  
`make coverage-backend` 还会自动校验二级模块 `>=95%` 和核心模块 `100%` 守护。
前端 coverage 当前目标按 [前端覆盖率看板](quality/frontend-coverage.md) 维护；`make coverage-frontend` 已退役为显式 skip，实际守护由 `frontend/vitest.config.ts` 的 v2 子树 80% 阈值承接，数字报告使用 `make coverage-report`。

## 5. 常见问题

### 5.1 Docker 已启动但首页为空白

优先确认 Nginx 镜像是否用最新前端重新构建：

```bash
docker compose build nginx
docker compose up -d nginx
```

原因：当前 `docker/nginx.Dockerfile` 会在镜像构建阶段执行前端打包并内置 `dist`；如果只复用旧镜像，可能仍然拿到过期静态资源。

### 5.2 前端开发环境请求不到 API

确认以下任一条件成立：

- 已启动 Nginx，Vite 代理默认指向 `http://localhost:81`
- 或显式设置 `VITE_API_PROXY_TARGET=http://localhost:5000`

### 5.3 健康检查地址不一致

当前健康检查入口是：

```bash
curl http://localhost:5000/health
```

不是旧文档中的 `/api/v1/health`。
