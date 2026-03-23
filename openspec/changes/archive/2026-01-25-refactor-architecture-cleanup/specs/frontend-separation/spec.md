## ADDED Requirements

### Requirement: 前端构建产物排除
系统 SHALL 在 `.gitignore` 中排除前端构建产物，避免提交到 Git 仓库。

#### Scenario: .gitignore 配置
- **WHEN** 查看 `.gitignore`
- **THEN** 包含以下规则：
  ```
  # 前端构建产物
  frontend/dist/
  frontend/node_modules/
  frontend/.vite/
  frontend/.turbo/
  
  # 前端环境文件
  frontend/.env.local
  frontend/.env.*.local
  ```

#### Scenario: Git 状态检查
- **WHEN** 运行 `git status`
- **THEN** 不显示 `frontend/dist/` 目录中的文件
- **AND** 不显示 `frontend/node_modules/` 目录

### Requirement: 前端独立 Docker 镜像
系统 SHALL 为前端创建独立的 Docker 镜像，使用多阶段构建优化镜像大小。

#### Scenario: 前端 Dockerfile
- **WHEN** 查看 `frontend/Dockerfile`
- **THEN** 使用多阶段构建：
  1. 构建阶段（Node.js 18）：安装依赖 + 构建
  2. 运行阶段（Nginx Alpine）：仅复制构建产物
- **AND** 最终镜像大小 < 50MB

#### Scenario: 前端镜像构建
- **WHEN** 运行 `docker build -t bi-gateway-frontend:latest ./frontend`
- **THEN** 构建成功
- **AND** 镜像包含 Nginx + 前端静态文件
- **AND** 不包含 `node_modules/` 和源代码

### Requirement: Nginx 反向代理配置
系统 SHALL 配置 Nginx 作为反向代理，处理静态资源和 API 请求。

#### Scenario: Nginx 配置
- **WHEN** 查看 `nginx/conf.d/default.conf`
- **THEN** 包含以下配置：
  ```nginx
  server {
      listen 80;
      
      # 静态资源
      location / {
          root /usr/share/nginx/html;
          try_files $uri /index.html;
      }
      
      # API 代理
      location /api/ {
          proxy_pass http://backend:5000/api/;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

#### Scenario: 静态资源缓存
- **WHEN** 访问静态资源（JS/CSS/图片）
- **THEN** Nginx 返回 `Cache-Control: max-age=31536000` 响应头
- **AND** 浏览器缓存静态资源 1 年

#### Scenario: API 请求代理
- **WHEN** 前端发起 API 请求 `/api/v1/datasets`
- **THEN** Nginx 代理到后端 `http://backend:5000/api/v1/datasets`
- **AND** 保留原始请求头（Host, X-Real-IP）

### Requirement: Docker Compose 前后端分离
系统 SHALL 在 `docker-compose.full.yml` 中分离前后端服务，支持独立构建和部署。

#### Scenario: Docker Compose 配置
- **WHEN** 查看 `docker-compose.full.yml`
- **THEN** 包含以下服务：
  - `frontend`: 前端 Nginx 服务
  - `backend`: 后端 Flask 服务
  - `postgres`: PostgreSQL 数据库
  - `redis`: Redis 缓存和队列
  - `rq_worker`: RQ 异步任务 Worker

#### Scenario: 前后端独立启动
- **WHEN** 运行 `docker-compose -f docker-compose.full.yml up frontend`
- **THEN** 仅启动前端服务（不启动后端）
- **AND** 前端可以连接到已运行的后端服务

#### Scenario: 前后端独立构建
- **WHEN** 修改前端代码
- **THEN** 仅重新构建前端镜像
- **AND** 不需要重新构建后端镜像

### Requirement: 前端 .dockerignore 配置
系统 SHALL 创建 `frontend/.dockerignore` 排除不必要的文件，优化构建速度。

#### Scenario: .dockerignore 配置
- **WHEN** 查看 `frontend/.dockerignore`
- **THEN** 包含以下规则：
  ```
  node_modules/
  dist/
  .git/
  .vscode/
  .idea/
  *.md
  .env.local
  .env.*.local
  ```

#### Scenario: Docker 构建上下文
- **WHEN** 构建前端镜像
- **THEN** Docker 构建上下文不包含 `node_modules/` 和 `.git/`
- **AND** 构建速度提升 50%+
