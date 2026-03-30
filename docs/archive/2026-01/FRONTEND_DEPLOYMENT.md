# 前后端分离部署指南

## 架构概述

```
用户请求 (http://localhost)
    ↓
Nginx (80)
    ├─ / → React SPA (静态文件)
    └─ /api/* → Flask API (5000)
         ├─ RQ Worker (×2)
         ├─ Redis (6379)
         └─ PostgreSQL (5432)
```

---

## 快速开始

### 1. 前置条件

- Docker 20.10+
- Docker Compose 2.0+
- 8GB+ 可用内存

### 2. 一键部署

```bash
# 1. 配置环境变量
cp env.sample .env
# 编辑 .env 文件

# 2. 启动所有服务
./start_fullstack.sh

# 3. 访问应用
open http://localhost
```

---

## 详细部署步骤

### 步骤 1: 配置环境变量

创建 `.env` 文件：

```bash
cp env.sample .env
```

**必须配置**的变量：

```bash
# 数据库（如使用外部数据库）
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis
REDIS_URL=redis://redis:6379/0

# JWT 认证
JWT_SECRET=your-secret-key-change-in-production

# 飞书（如需推送功能）
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# OSS（如需大文件交付）
OSS_ACCESS_KEY_ID=your_key
OSS_ACCESS_KEY_SECRET=your_secret
OSS_ENDPOINT=your_endpoint
OSS_BUCKET_NAME=your_bucket
```

### 步骤 2: 启动服务

**完整部署**（前后端分离）：

```bash
docker-compose -f docker-compose.full.yml up -d --build
```

**仅后端**（保留旧前端）：

```bash
docker-compose up -d --build
```

### 步骤 3: 验证部署

```bash
# 检查服务状态
docker-compose -f docker-compose.full.yml ps

# 健康检查
curl http://localhost/health

# 查看日志
docker-compose -f docker-compose.full.yml logs -f
```

---

## 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| nginx | 80, 443 | 反向代理 + 静态文件服务 |
| frontend | - | React SPA 构建（仅构建阶段） |
| backend | 5000（内部） | Flask API 服务 |
| rq_worker | - | 异步任务处理（2个实例） |
| redis | 6379（内部） | 缓存 + 任务队列 |
| postgres | 5432（内部） | 主数据库 |

---

## 前端开发

### 本地开发模式

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 访问 http://localhost:3000
```

**注意**：开发模式下，API 请求会代理到 `http://localhost:5000`

### 构建生产版本

```bash
cd frontend
pnpm run build

# 构建产物在 frontend/dist/
```

---

## 运维操作

### 查看日志

```bash
# 所有服务
docker-compose -f docker-compose.full.yml logs -f

# 特定服务
docker-compose -f docker-compose.full.yml logs -f nginx
docker-compose -f docker-compose.full.yml logs -f backend
docker-compose -f docker-compose.full.yml logs -f rq_worker
```

### 重启服务

```bash
# 重启所有服务
docker-compose -f docker-compose.full.yml restart

# 重启特定服务
docker-compose -f docker-compose.full.yml restart backend
docker-compose -f docker-compose.full.yml restart nginx
```

### 扩展 Worker 数量

```bash
docker-compose -f docker-compose.full.yml up -d --scale rq_worker=4
```

### 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker-compose -f docker-compose.full.yml up -d --build

# 3. 查看状态
docker-compose -f docker-compose.full.yml ps
```

### 清理与重置

```bash
# 停止服务
docker-compose -f docker-compose.full.yml down

# 清理（包括 volumes）
docker-compose -f docker-compose.full.yml down -v

# 清理构建缓存
docker system prune -a
```

---

## 故障排查

### 前端无法访问

**问题**：访问 http://localhost 出现 502 错误

**解决**：

```bash
# 1. 检查 nginx 日志
docker-compose -f docker-compose.full.yml logs nginx

# 2. 检查 frontend 是否构建成功
docker-compose -f docker-compose.full.yml logs frontend

# 3. 重新构建前端
docker-compose -f docker-compose.full.yml up -d --build frontend
```

### API 请求失败

**问题**：前端请求 /api/* 返回 502

**解决**：

```bash
# 1. 检查 backend 是否运行
docker-compose -f docker-compose.full.yml ps backend

# 2. 查看 backend 日志
docker-compose -f docker-compose.full.yml logs backend

# 3. 重启 backend
docker-compose -f docker-compose.full.yml restart backend
```

### RQ Worker 不执行任务

**问题**：任务一直处于 pending 状态

**解决**：

```bash
# 1. 检查 worker 状态
docker-compose -f docker-compose.full.yml ps rq_worker

# 2. 查看 worker 日志
docker-compose -f docker-compose.full.yml logs rq_worker

# 3. 检查 Redis 连接
docker-compose -f docker-compose.full.yml exec redis redis-cli ping

# 4. 重启 worker
docker-compose -f docker-compose.full.yml restart rq_worker
```

---

## 性能优化

### Nginx 缓存配置

编辑 `nginx/conf.d/default.conf`：

```nginx
# 静态资源缓存
location ~* \.(js|css|png|jpg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 前端资源优化

```bash
# 分析打包体积
cd frontend
pnpm run build
npx vite-bundle-visualizer
```

### 数据库连接池

编辑 `app/config.py`：

```python
SQLALCHEMY_POOL_SIZE = 10
SQLALCHEMY_MAX_OVERFLOW = 20
SQLALCHEMY_POOL_TIMEOUT = 30
```

---

## 监控与告警

### RQ Dashboard（可选）

```bash
# 安装
pip install rq-dashboard

# 启动
rq-dashboard --redis-url redis://localhost:6379/0

# 访问 http://localhost:9181
```

### Prometheus + Grafana（可选）

参考 `docs/MONITORING.md`（待实现）

---

## 常见问题

### Q: 如何使用外部数据库？

A: 编辑 `.env` 文件：

```bash
DATABASE_URL=postgresql://user:pass@external-host:5432/dbname
```

然后注释掉 `docker-compose.full.yml` 中的 `postgres` 服务。

### Q: 如何启用 HTTPS？

A: 参考 `nginx/conf.d/ssl.conf.example`（需手动创建）

### Q: 前端如何连接不同的 API？

A: 修改 `frontend/vite.config.ts` 中的 proxy 配置。

---

## 相关文档

- [架构重构记录](./ARCHITECTURE_REFACTORING.md)
- [迁移指南](../legacy/MIGRATION_GUIDE.md)
- [快速开始](../../QUICK_START.md)
- [故障排查](../legacy/TROUBLESHOOTING.md)
