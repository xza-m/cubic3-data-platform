# Docker 配置文件备份说明

## 备份时间
2026-01-30

## 原因
简化 Docker 配置，统一使用 `docker-compose.yml`（原 `docker-compose.full.yml`）

## 备份文件

### 1. docker-compose.yml（旧）
- 用途：开发/测试环境
- 特点：简化配置，只包含 web、rq_worker、redis，依赖外部 PostgreSQL
- 端口：8003

### 2. docker-compose.prod.yml
- 用途：生产环境（简化版）
- 特点：仅 web 服务，所有依赖外部提供
- 端口：5000（仅本地监听）

### 3. frontend/Dockerfile
- 用途：前端独立构建
- 特点：两阶段构建（node:20-alpine + alpine）
- 说明：前端现在由 nginx 直接服务静态文件，不再需要独立构建镜像

## 新的配置

统一使用 `docker-compose.yml`（原 `docker-compose.full.yml`）：
- 包含完整服务：nginx、backend、rq_worker、redis、postgres
- 生产级配置：健康检查、重启策略、网络隔离
- 端口：81 (nginx)、5000 (backend - 内部)

## 恢复方法

如果需要恢复旧配置：

```bash
# 恢复开发环境配置
cp .backup/docker-configs/docker-compose.yml docker-compose.dev.yml

# 恢复生产简化配置
cp .backup/docker-configs/docker-compose.prod.yml docker-compose.simple.yml

# 恢复前端 Dockerfile
cp .backup/docker-configs/Dockerfile frontend/Dockerfile
```
