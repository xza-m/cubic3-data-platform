# 项目启动指南

完整的项目启动说明，支持多种启动方式。

---

## 📋 前置要求

### 必需

- **Python 3.9+**
- **Node.js 16+** (前端开发)
- **PostgreSQL** (或使用Docker自带)
- **Redis** (或使用Docker自带)

### 外部服务

- **Superset** 访问权限（用户名/密码 或 JWT）
- **飞书机器人** App ID 和 Secret

---

## 🚀 快速启动（推荐）

### 方式1: Docker Compose 完整栈（最简单）

适合生产环境或想快速体验完整功能。

```bash
# 1. 配置环境变量
cp env.sample .env
vim .env  # 编辑必要配置

# 2. 一键启动（包含前端+后端+数据库+Redis+RQ Worker）
docker-compose -f docker-compose.full.yml up --build -d

# 3. 初始化数据库
docker-compose -f docker-compose.full.yml exec backend flask db upgrade

# 4. 访问应用
# 前端: http://localhost (Nginx)
# 后端API: http://localhost/api/v1/*
```

**服务列表**:
- ✅ Nginx (端口 80/443) - 反向代理 + 前端静态文件
- ✅ Frontend (React SPA)
- ✅ Backend (Flask API, 端口 5000)
- ✅ RQ Worker (2个实例)
- ✅ Redis (端口 6379)
- ✅ PostgreSQL (端口 5432, 可选)

**停止服务**:
```bash
docker-compose -f docker-compose.full.yml down
```

---

### 方式2: Docker Compose 后端 + 本地前端

适合前端开发，后端使用Docker。

```bash
# 1. 启动后端服务
docker-compose up --build -d

# 包含: backend + rq_worker + redis
# 前端: http://localhost:5173 (Vite dev server)
# 后端API: http://localhost:5000/api/v1/*

# 2. 本地启动前端（另一个终端）
cd frontend
npm install
npm run dev

# 访问 http://localhost:5173
```

---

## 🛠️ 开发环境启动（本地运行）

### 1. 配置环境变量

```bash
cp env.sample .env
vim .env
```

**必需配置**:
```bash
# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cubic3_data_platform

# Redis
REDIS_URL=redis://localhost:6379/0

# Superset
SUPERSET_BASE_URL=https://your-superset.com
SUPERSET_USERNAME=admin
SUPERSET_PASSWORD=admin123

# 飞书
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx_secret

# JWT认证
JWT_SECRET=your-very-long-secret-key-change-in-production
```

### 2. 安装Python依赖

```bash
# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```

### 3. 初始化数据库

```bash
# 创建数据库
createdb cubic3_data_platform

# 或使用SQL
# psql -c "CREATE DATABASE cubic3_data_platform;"

# 运行迁移
flask db upgrade
```

### 4. 启动Redis（如果本地没有）

```bash
# 使用Docker启动Redis
docker run -d -p 6379:6379 redis:7-alpine

# 或使用brew安装（Mac）
brew install redis
brew services start redis
```

### 5. 启动后端服务

```bash
# 方式1: 使用Flask开发服务器
flask run

# 方式2: 使用Gunicorn（生产模式）
gunicorn -w 4 -b 0.0.0.0:5000 wsgi:app

# 访问: http://localhost:5000
```

### 6. 启动RQ Worker（另一个终端）

```bash
# 激活虚拟环境
source venv/bin/activate

# 启动Worker
rq worker default --url redis://localhost:6379/0

# 启动多个Worker（可选）
rq worker default --url redis://localhost:6379/0 --name worker-1 &
rq worker default --url redis://localhost:6379/0 --name worker-2 &
```

### 7. 启动前端（另一个终端）

```bash
cd frontend

# 安装依赖（首次）
npm install

# 启动开发服务器
npm run dev

# 访问: http://localhost:5173
```

---

## 🧪 运行测试

### 后端测试

```bash
# 安装测试依赖
pip install -r requirements.txt

# 运行所有测试
pytest -v

# 运行特定测试
pytest tests/unit/domain/ -v

# 生成覆盖率报告
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

### 前端测试（待实现）

```bash
cd frontend
npm run test
```

---

## 🐳 Docker 命令速查

### docker-compose.yml (基础版)

```bash
# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f rq_worker

# 进入容器
docker-compose exec backend bash

# 重启服务
docker-compose restart backend

# 停止
docker-compose down

# 清理（包括数据卷）
docker-compose down -v
```

### docker-compose.full.yml (完整版)

```bash
# 启动
docker-compose -f docker-compose.full.yml up -d

# 构建并启动
docker-compose -f docker-compose.full.yml up --build -d

# 查看所有服务状态
docker-compose -f docker-compose.full.yml ps

# 数据库迁移
docker-compose -f docker-compose.full.yml exec backend flask db upgrade

# 查看Nginx日志
docker-compose -f docker-compose.full.yml logs -f nginx

# 重新构建前端
docker-compose -f docker-compose.full.yml build frontend

# 停止
docker-compose -f docker-compose.full.yml down
```

---

## 📊 服务端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx | 80 | HTTP入口（完整版） |
| Nginx | 443 | HTTPS入口（完整版） |
| Frontend (Dev) | 5173 | Vite开发服务器 |
| Backend (Flask) | 5000 | API服务 |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 + 队列 |

---

## 🔍 健康检查

### 检查后端

```bash
# Health检查
curl http://localhost:5000/health

# 返回:
# {"status": "healthy", "timestamp": "..."}

# 检查数据源API
curl http://localhost:5000/api/v1/datasources \
  -H "X-User-Id: admin"
```

### 检查Redis

```bash
# 连接Redis
redis-cli

# 或Docker方式
docker-compose exec redis redis-cli

# 测试
127.0.0.1:6379> PING
PONG

127.0.0.1:6379> KEYS *
```

### 检查RQ队列

```bash
# 查看队列状态
rq info --url redis://localhost:6379/0

# 查看Worker
rq info --url redis://localhost:6379/0 --workers

# 使用Docker
docker-compose logs -f rq_worker
```

---

## ⚙️ 常见配置

### 修改后端端口

**.env**:
```bash
FLASK_RUN_PORT=8000
```

或启动时指定:
```bash
flask run --port 8000
```

### 修改数据库

**.env**:
```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# SQLite (开发用)
DATABASE_URL=sqlite:///instance/local.db
```

### 修改Redis

**.env**:
```bash
# 本地Redis
REDIS_URL=redis://localhost:6379/0

# 远程Redis（带密码）
REDIS_URL=redis://:password@host:6379/0

# Redis Cluster
REDIS_URL=redis://host1:6379,host2:6379/0
```

---

## 🐛 常见问题

### 1. 数据库连接失败

**错误**: `psycopg2.OperationalError: could not connect to server`

**解决**:
```bash
# 检查PostgreSQL是否运行
pg_isready

# 检查DATABASE_URL配置
echo $DATABASE_URL

# 重启PostgreSQL
brew services restart postgresql  # Mac
sudo service postgresql restart   # Linux
```

### 2. Redis连接失败

**错误**: `redis.exceptions.ConnectionError: Error 111 connecting to localhost:6379`

**解决**:
```bash
# 启动Redis
redis-server

# 或使用Docker
docker run -d -p 6379:6379 redis:7-alpine

# 检查Redis
redis-cli ping
```

### 3. 端口被占用

**错误**: `OSError: [Errno 48] Address already in use`

**解决**:
```bash
# 查找占用端口的进程
lsof -i :5000

# 杀死进程
kill -9 <PID>

# 或换个端口
flask run --port 8000
```

### 4. 前端API请求失败

**错误**: `Network Error` 或 `CORS Error`

**解决**:

检查前端API配置 `frontend/src/api/client.ts`:
```typescript
const apiClient = axios.create({
  baseURL: 'http://localhost:5000',  // 确保端口正确
  // ...
})
```

### 5. 依赖安装失败

**错误**: `pip install` 失败

**解决**:
```bash
# 升级pip
pip install --upgrade pip

# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 清理缓存重试
pip cache purge
pip install -r requirements.txt
```

### 6. Docker构建慢

**解决**:
```bash
# 使用BuildKit
DOCKER_BUILDKIT=1 docker-compose build

# 清理无用镜像
docker system prune -a

# 使用缓存
docker-compose build --parallel
```

---

## 📦 生产部署建议

### 1. 环境变量

使用独立的 `.env.prod`:
```bash
cp env.sample .env.prod
vim .env.prod

# 使用
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 2. 数据库迁移

```bash
# 备份数据库
pg_dump cubic3_data_platform > backup.sql

# 运行迁移
flask db upgrade

# 回滚（如果需要）
flask db downgrade
```

### 3. 日志管理

```bash
# 查看实时日志
docker-compose logs -f --tail=100

# 导出日志
docker-compose logs > logs/app.log

# 清理日志
docker-compose logs --no-log-prefix > /dev/null
```

### 4. 监控

- 使用 `rq-dashboard` 监控任务队列
- 添加 Prometheus + Grafana
- 配置告警（Sentry等）

---

## 🎯 下一步

1. ✅ 启动成功后，访问前端：http://localhost（或 http://localhost:5173）
2. ✅ 创建第一个数据源
3. ✅ 注册数据集
4. ✅ 配置提取任务
5. ✅ 配置Superset订阅推送

完整功能文档：[README.md](../README.md)

---

**需要帮助?** 

- 查看日志：`docker-compose logs -f`
- 提交Issue
- 联系运维团队
