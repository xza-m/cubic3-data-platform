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

## 2. 当前服务与端口

| 服务 | 默认端口 | 说明 |
|---|---:|---|
| 前端开发服务器 | 3000 | `vite` 开发模式 |
| Nginx | 81 | Docker 模式前端入口与 API 代理 |
| Flask API | 5000 | 后端服务 |
| Redis | 6379 | 队列与缓存 |
| PostgreSQL | 5432 | 元数据数据库 |

## 3. 启动模式

### 模式 A：Docker 完整栈

适用场景：

- 快速体验
- 联调后端、Worker、Redis、PostgreSQL
- 使用 Nginx 托管前端构建产物

步骤：

```bash
cp env.sample .env
cd frontend && npm install && npm run build && cd ..
docker compose up --build -d
```

说明：

- `docker-compose.yml` 当前没有独立的前端构建阶段
- Nginx 会直接读取宿主机的 `frontend/dist`
- 如果前端代码刚改过而未重新构建，Nginx 会继续提供旧资源

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
pip install -r requirements.txt
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

#### 终端 2：前端

```bash
cd frontend
npm install
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

#### 终端 3：Worker

```bash
python run_worker.py
```

### 模式 C：Docker 后端 + 本地前端

适用场景：

- 后端依赖交给 Docker 管理
- 前端保留本地热更新

步骤：

```bash
docker compose up -d backend redis postgres rq_worker
cd frontend
npm install
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

### 后端

```bash
pytest
```

### 前端

```bash
cd frontend
npm run test:unit
npm run test:e2e
npm run verify:ui
```

### 语义中心

```bash
cd frontend
npm run verify:semantic-layout
DOMAIN_SMOKE_BASE_URL=http://127.0.0.1:3000 npm run verify:semantic
```

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
