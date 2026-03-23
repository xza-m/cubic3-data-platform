# CUBIC3

> 3 Layers: Source, Semantic, Application

CUBIC3（仓库名 `cubic3-data-platform`）是一个面向企业数据场景的数据应用平台。当前代码基线已经演进为 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的分层架构，覆盖数据接入、数据集管理、SQL 查询、智能问数、语义建模、应用编排与消息推送。

## 当前文档基线

以下文档已按当前实现对齐：

- `README.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `docs/QUICK_START.md`
- `docs/STARTUP_GUIDE.md`
- `frontend/README.md`
- `docs/DOC_ALIGNMENT_REPORT.md`

以下文档保留为历史迁移/修复记录，不作为当前实现基线：

- `docs/MIGRATION_GUIDE.md`
- `docs/FRONTEND_ARCHITECTURE_REVIEW.md`
- `docs/FRONTEND_FIX_SUMMARY.md`
- `docs/METADATA_SYNC_*.md`

## 核心能力

### Source Layer

- 数据源管理：支持 PostgreSQL、MySQL、ClickHouse、MaxCompute 等数据源接入
- 数据集管理：注册物理表、文件数据集和 SQL 生成的数据集
- 元数据刷新：同步表结构并维护字段级元数据
- 数据提取：支持任务化抽取、运行记录与结果交付

### Semantic Layer

- Cube 建模：基于物理表草拟 Cube 并保存为 YAML 定义
- 领域建模：用目录、领域和 Join 关系组织业务语义
- View / Recipe 管理：沉淀可复用的语义视图和分析配方
- 语义查询：通过语义定义生成可执行查询

### Application Layer

- 查询中心：SQL 编辑、模板、收藏、历史、异步查询
- 智能问数：多轮对话、上下文记忆、图表可视化
- 应用中心：应用定义、实例管理、执行监控
- 配置中心：渠道、订阅、投递规则
- 飞书集成：SSO、消息通知、长连接事件处理

## 当前技术架构

### 前端

- React 18 + TypeScript 5
- Vite 5 + React Router 6
- TanStack Query 5
- Radix UI primitives + 自定义业务组件
- Tailwind 风格的工具类样式与业务组件封装
- Monaco Editor、Recharts、`@xyflow/react`、ELK

### 后端

- Flask 3 App Factory
- Flask-SQLAlchemy + Flask-Migrate
- `dependency-injector` 统一依赖装配
- `application / domain / infrastructure / interfaces` 分层
- RQ + Redis 异步任务
- APScheduler 定时任务
- Pydantic 环境配置校验

### 基础设施

- PostgreSQL：平台元数据存储
- Redis：缓存、任务队列、异步执行协调
- Nginx：生产静态资源与反向代理
- OpenAI 兼容 LLM、飞书、Superset、OSS 集成

## 代码结构

```text
.
├── app/
│   ├── application/            # 应用层：commands / queries / handlers / services
│   ├── domain/                 # 领域层：实体、端口、领域服务、语义模型
│   ├── infrastructure/         # 基础设施：仓储、适配器、缓存、任务、事件总线
│   ├── interfaces/api/v1/      # REST API
│   ├── di/                     # 依赖注入容器
│   └── config_schema.py        # Pydantic 配置定义
├── frontend/
│   ├── src/api/                # 前端 API 封装
│   ├── src/components/         # UI primitives 与业务组件
│   ├── src/pages/              # 页面级路由
│   └── vite.config.ts          # 开发端口与 API 代理
├── docs/                       # 项目文档
├── schema/                     # SQL / 扩展脚本
├── docker-compose.yml          # 本地 Docker 编排
└── deploy.sh                   # 生产部署脚本
```

## 快速开始

### 方式一：Docker 体验完整栈

1. 复制环境变量模板并按需修改：

```bash
cp env.sample .env
```

2. 首次通过 Nginx 访问前端前，先构建前端静态资源：

```bash
cd frontend
npm install
npm run build
cd ..
```

3. 启动服务：

```bash
docker compose up --build -d
```

4. 访问入口：

- 前端：`http://localhost:81`
- 后端 API：`http://localhost:5000`
- API 文档：`http://localhost:5000/api/docs`
- 健康检查：`http://localhost:5000/health`

### 方式二：本地开发

后端：

```bash
pip install -r requirements.txt
flask --app wsgi.py db upgrade
flask --app wsgi.py run
```

前端：

```bash
cd frontend
npm install
npm run dev
```

Worker：

```bash
python run_worker.py
```

默认情况下，Vite 开发服务器运行在 `http://localhost:3000`。如果你没有启动 Nginx，而是直接让前端代理到 Flask，请显式设置：

```bash
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

## 常用命令

```bash
# 后端测试
pytest

# 前端基础校验
cd frontend && npm run verify:ui

# 语义中心专项校验
cd frontend && npm run verify:semantic-layout

# 查看 Docker 日志
docker compose logs -f

# 单独查看后端或 Worker
docker compose logs -f backend
docker compose logs -f rq_worker
```

## 关键入口

- Flask App Factory：`app/__init__.py`
- DI 容器：`app/di/container.py`
- 后端启动入口：`wsgi.py`
- Worker 启动脚本：`run_worker.py`
- 前端路由入口：`frontend/src/App.tsx`
- API 客户端：`frontend/src/api/client.ts`

## 参考文档

- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `docs/QUICK_START.md`
- `docs/STARTUP_GUIDE.md`
- `docs/DOC_ALIGNMENT_REPORT.md`
- `docs/semantic_verification.md`

## 说明

仓库中仍保留部分历史文档和迁移记录，用于追溯演进过程。若文档描述与代码冲突，请以当前实现和上面的“当前文档基线”为准。
