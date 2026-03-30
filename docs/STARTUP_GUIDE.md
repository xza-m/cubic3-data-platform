---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-28
---

# 项目启动指南

本文档提供当前实现下的完整启动方式、端口说明和排障建议。

## 1. 环境要求

### 必需

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+，或使用 Docker 自带实例
- Redis 7+，或使用 Docker 自带实例

### 可选外部服务

- OpenAI 兼容 LLM
- 飞书开放平台
- Superset
- 阿里云 OSS

建议首次进入仓库先执行：

```bash
make setup
```

Phase 1 当前验证通过的主链路基线为：

- 数据源：`PostgreSQL`、`MaxCompute`
- 数据集：`physical`、`virtual`、`file`
- 文件数据集格式：`CSV / XLS / XLSX`

## 2. 当前服务与端口

| 服务 | 默认端口 | 说明 |
|---|---:|---|
| 前端开发服务器 | 3000 | `vite` 开发模式 |
| Nginx | 81 | Docker 模式前端入口与 API 代理 |
| Flask API | 5000 | 后端服务 |
| Redis | 6379 | 队列与缓存 |
| PostgreSQL | 5432 | 元数据数据库 |

当前前端主入口：

- `/dashboard`：首页工作台，读取 `/api/v1/dashboard/overview`
- `/queries`：查询分析中心主工作台
- `/semantic/workbench`：语义工作台主入口

说明：

- `/queries/editor` 等旧查询子页只保留兼容重定向
- `/semantic/tools`、`/semantic/overview` 等旧语义入口只保留兼容重定向

## 3. 启动模式

### 模式 A：Docker 完整栈

适用场景：

- 快速体验
- 联调后端、Worker、Redis、PostgreSQL
- 使用 Nginx 托管前端构建产物

步骤：

```bash
cp env.sample .env
cd frontend && npm run build && cd ..
docker compose up --build -d
```

说明：

- `docker-compose.yml` 当前没有独立的前端构建阶段
- Nginx 会直接读取宿主机的 `frontend/dist`
- 如果前端代码刚改过而未重新构建，Nginx 会继续提供旧资源
- 当前交付口径是“容器可支撑联调与验证”，不是一键安装器或云原生收口

验证：

```bash
docker compose ps
curl http://localhost:5000/health
curl http://localhost:81/health
```

### 模式 B：纯本地开发

适用场景：

- 前后端联调
- 本地调试代码
- 需要热更新

#### 终端 1：后端

```bash
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

#### 终端 2：前端

```bash
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

#### 终端 3：Worker

```bash
python run_worker.py
```

说明：

- Web 进程会自动启动 `APScheduler`
- `python run_worker.py` 负责消费 RQ 队列中的目录同步、数据集同步等长耗时任务

### 模式 C：Docker 后端 + 本地前端

适用场景：

- 后端依赖交给 Docker 管理
- 前端保留本地热更新

步骤：

```bash
docker compose up -d backend redis postgres rq_worker
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

如果你同时启动了 Nginx，也可以沿用默认代理目标 `http://localhost:81`。

## 4. 数据库与迁移

### Docker 模式

后端容器启动时会自动尝试：

1. 初始化迁移目录（若不存在）
2. 执行 `flask --app wsgi.py db upgrade`
3. 启动 Gunicorn

你仍然可以手动执行：

```bash
docker compose exec backend flask --app wsgi.py db upgrade
```

### 本地模式

```bash
flask --app wsgi.py db upgrade
```

## 5. Worker 启动方式

当前仓库存在三种入口：

### 推荐：Flask 上下文 Worker

```bash
python run_worker.py
```

特点：

- 会加载 `create_app(role="worker")`
- 与当前后端依赖装配保持一致
- 负责执行目录同步、数据集元数据刷新等后台任务

### Shell 脚本 Worker

```bash
./start_rq_worker.sh
```

特点：

- 从 `.env` 读取 Redis 配置
- 启动 `rq worker --with-scheduler`

### 模块入口 Worker

```bash
python -m app.infrastructure.tasks.rq_worker
```

特点：

- 更轻量
- 适合直接验证 RQ 连通性

## 6. 验证与测试

仓库根目录的验证入口按四层组织，失败信号固定如下：

- `make lint`：层 1，静态检查
- `make typecheck`：层 2，类型与接口检查
- `make test`：层 3，自动化测试
- `make smoke`：层 4，运行验证

### 通用入口

```bash
make lint
make typecheck
make test
make smoke
make verify
make verify-detect
make verify-changed
make docs-impact
make verify-backend
make verify-frontend
make verify-docs
```

如果你的改动集中在数据中心 Phase 1 主链路，优先补跑：

```bash
make typecheck-frontend
make test-regression-platform-data
PYTHONPATH=. python -m pytest --no-cov tests/integration/test_api_routes_smoke.py
```

### 分层下钻

```bash
make test-unit
make test-integration
make test-regression
```

### 语义中心

```bash
make verify-semantic
make semantic-layout
make smoke-semantic
```

### Coverage 专项验证

```bash
make coverage
make coverage-backend
make coverage-frontend
```

后端 coverage 当前门槛按 [后端覆盖率看板](quality/backend-coverage.md) 维护；当前 `pytest.ini` 基线为 `--cov-fail-under=95`。  
`make coverage-backend` 还会自动校验二级模块 `>=95%` 和核心模块 `100%` 守护。
前端 coverage 当前目标按 [前端覆盖率看板](quality/frontend-coverage.md) 维护；`make coverage-frontend` 会自动校验总 coverage `>=90%` 和核心功能与实体页 `100%` 守护。

## 7. 常用日志命令

```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f rq_worker
docker compose logs -f nginx
```

## 8. 已废弃或不再适用的旧说明

以下说法不再适用于当前仓库：

- `docker-compose.full.yml` 是主启动文件
- 前端默认端口是 `5173`
- 启动前需要手工编辑 `app/config.py`
- 健康检查路径是 `/api/v1/health`
- 前端使用 `pnpm` 或 `Ant Design 5` 作为当前主栈

当前真实基线请以本文件、`docs/QUICK_START.md` 与代码实现为准。
