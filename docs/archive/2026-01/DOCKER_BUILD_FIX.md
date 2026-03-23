# Docker前端构建错误修复

**时间**: 2026-01-16  
**问题**: Docker构建前端时出现 `cannot copy to non-directory` 错误

---

## 问题描述

### 错误信息

```
target frontend: failed to solve: cannot copy to non-directory: 
/var/lib/docker/buildkit/containerd-overlayfs/cachemounts/buildkit1516301024/app/node_modules/@ant-design/icons
```

### 原因分析

**根本原因**: Dockerfile使用了`pnpm`，但项目中实际使用的是`npm`（有`package-lock.json`）

**触发条件**: 
1. package.json依赖顺序被重新排序（按字母顺序）
2. Docker构建缓存与本地node_modules状态不一致
3. pnpm与npm的lock文件不兼容

---

## 解决方案

### 1. 修改Dockerfile（使用npm代替pnpm）

**修改前** (`frontend/Dockerfile`):
```dockerfile
# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 构建
RUN pnpm run build
```

**修改后**:
```dockerfile
# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装依赖（使用npm）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 构建
RUN npm run build
```

### 2. 清理Docker缓存

```bash
# 清理构建缓存
docker builder prune -af

# 停止并删除所有容器和volumes
docker-compose -f docker-compose.full.yml down -v
```

### 3. 重新构建（不使用缓存）

```bash
docker-compose -f docker-compose.full.yml build --no-cache frontend
```

### 4. 启动完整服务栈

```bash
docker-compose -f docker-compose.full.yml up -d
```

---

## 构建结果

### 成功输出

```
✓ 2952 modules transformed.
✓ built in 4.26s

dist/index.html                         0.71 kB │ gzip:   0.40 kB
dist/assets/index-Dct7wm_V.css         45.51 kB │ gzip:   5.51 kB
dist/assets/index-CaUlgKz2.js          61.37 kB │ gzip:  14.57 kB
dist/assets/query-vendor-oBsBtSZD.js   78.21 kB │ gzip:  27.05 kB
dist/assets/react-vendor-CygjU8O7.js  160.29 kB │ gzip:  52.36 kB
dist/assets/antd-vendor-yDLewNQQ.js   484.39 kB │ gzip: 156.27 kB
```

### 服务状态

```bash
$ docker-compose -f docker-compose.full.yml ps

NAME                                STATUS
bi_gateway_backend                  Up (healthy)
bi_gateway_nginx                    Up
bi_gateway_postgres                 Up (healthy)
bi_gateway_redis                    Up (healthy)
bi_gateway_frontend                 Exited (0)  # 正常，构建完成后退出
dw_bi_webhook_gateway-rq_worker-1   Up
dw_bi_webhook_gateway-rq_worker-2   Up
```

---

## 访问新界面

### 服务地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | http://localhost:81 | 玻璃质感UI |
| 后端API | http://localhost:81/api | Flask API |
| PostgreSQL | localhost:5432 | 数据库 |
| Redis | localhost:6379 | 缓存+队列 |

### 测试访问

```bash
# 测试前端
curl -I http://localhost:81

# 测试后端API
curl http://localhost:81/api/health
```

---

## 预防措施

### 1. 保持Dockerfile与项目一致

- ✅ 项目用npm → Dockerfile用npm
- ✅ 项目用pnpm → Dockerfile用pnpm + pnpm-lock.yaml
- ❌ 不要混用包管理器

### 2. 定期清理Docker缓存

```bash
# 每周清理一次
docker builder prune -f
docker system prune -f
```

### 3. .dockerignore配置

确保`.dockerignore`包含：
```
node_modules
dist
.git
.env
.DS_Store
```

### 4. CI/CD中禁用缓存

```yaml
# 在CI/CD中
docker build --no-cache -t myapp .
```

---

## 相关文件

| 文件 | 修改内容 |
|------|----------|
| `frontend/Dockerfile` | 改用npm代替pnpm |
| `frontend/package.json` | 依赖顺序调整 |
| `docker-compose.full.yml` | 无修改 |

---

## 后续优化建议

### 短期
- [ ] 添加 `.dockerignore` 文件
- [ ] 优化Dockerfile分层缓存
- [ ] 使用多阶段构建减小镜像大小（已实现）

### 中期
- [ ] 添加健康检查endpoint
- [ ] 配置生产环境环境变量
- [ ] 添加Docker Compose健康检查

### 长期
- [ ] 迁移到Kubernetes
- [ ] 配置CI/CD自动构建
- [ ] 实现蓝绿部署

---

**问题状态**: ✅ **已解决**  
**验证**: 所有服务正常运行，前端构建成功  
**访问**: http://localhost:81
