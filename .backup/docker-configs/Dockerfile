# ============================================
# Stage 1: 构建阶段
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装依赖（使用npm）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 复制源码
COPY . .

# 构建生产版本
RUN npm run build

# ============================================
# Stage 2: 生产阶段（仅保留构建产物）
# ============================================
FROM alpine:latest AS production

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 默认命令
CMD ["echo", "Frontend build completed"]
