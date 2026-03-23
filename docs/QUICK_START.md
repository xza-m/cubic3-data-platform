# 快速开始

本文档基于当前实现提供最短路径启动说明，优先保证“按文档可跑起来”。

## 1. 前置要求

- Python 3.11+
- Node.js 18+
- Docker 20.10+
- Docker Compose 2+

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

### 2.2 构建前端静态资源

当前 `docker-compose.yml` 不负责构建前端，因此首次启动前应先生成 `frontend/dist`：

```bash
cd frontend
npm install
npm run build
cd ..
```

### 2.3 启动服务

```bash
docker compose up --build -d
```

### 2.4 验证服务

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
pip install -r requirements.txt
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

后端默认地址：`http://localhost:5000`

### 3.2 启动前端

```bash
cd frontend
npm install
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

## 4. 常用校验命令

```bash
# 后端测试
pytest

# 前端类型 + 单测 + E2E
cd frontend && npm run verify:ui

# 语义中心专项校验
cd frontend && npm run verify:semantic-layout
```

## 5. 常见问题

### 5.1 Docker 已启动但首页为空白

优先检查是否已执行：

```bash
cd frontend && npm run build
```

原因：Nginx 直接挂载 `frontend/dist`，不会替你构建前端。

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
