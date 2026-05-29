---
doc_type: runbook
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-29
---

# 本地开发运行手册

本文档面向本地联调，重点说明“如何进入可开发状态”。
也就是：服务怎么起、端口怎么连、专项联调前要保证什么环境就绪。
完整启动说明仍以 `docs/QUICK_START.md` 和 `docs/STARTUP_GUIDE.md` 为准；进入“可交付状态”前要跑哪些验证，统一见 `docs/quality/testing.md`。

## 1. 先看哪里

- 最短启动路径：`docs/QUICK_START.md`
- 完整启动与端口说明：`docs/STARTUP_GUIDE.md`
- 语义中心固定验证流程：`docs/semantic_verification.md`
- 统一验证入口与可交付约束：`docs/quality/testing.md`

## 2. 常见本地模式

### 2.1 Docker 完整栈

适用：

- 快速体验完整环境
- 联调后端、数据库、Redis、Worker

参考：

- `docker compose up --build -d`

说明：

- 首次通过 Nginx 访问前端前，使用 `docker compose up --build -d` 或至少重建 `nginx` 镜像，确保镜像内置的是最新 `frontend/dist`
- Nginx 对 `/assets/*` 使用 hash 文件名长期缓存，对业务路由的 SPA fallback 使用 `no-store`，避免部署后旧 HTML 继续引用已删除的动态 chunk
- Docker 模式下 `backend` 与 `rq_worker` 固定连接 compose 内置 PostgreSQL，避免宿主机 `DATABASE_URL` 串到本地容器
- `backend` 容器启动的是 Web 角色，会同时初始化 `APScheduler`
- `rq_worker` 容器负责执行目录同步、数据集同步等长耗时任务

### 2.2 本地前后端开发

适用：

- 调试页面
- 调试 API
- 需要前端热更新

典型形态：

- 后端运行在 `http://localhost:5000`
- 前端运行在 `http://localhost:3000`
- 前端通过 `VITE_API_PROXY_TARGET=http://localhost:5000` 代理到 Flask

进入可开发状态的最短配方：

```bash
flask --app wsgi.py db upgrade
flask --app wsgi.py run
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

补充说明：

- 本地 `flask --app wsgi.py run` 会承载 Web API 和固定周期调度注册点
- 如需验证 Phase 1 的目录同步 / 数据集同步链路，`rq_worker` 必须同时在线

### 2.3 Docker 后端 + 本地前端

适用：

- 后端依赖交给 Docker
- 前端保留本地热更新

典型形态：

- Docker 提供 backend / postgres / redis / worker
- 前端本地运行并代理到 `http://localhost:5000`

进入可开发状态的最短配方：

```bash
docker compose up -d backend postgres redis rq_worker
cd frontend
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

这个模式最适合验证当前数据中心基线：

- `PostgreSQL + MaxCompute` 数据源接入
- `physical / virtual / file` 三类数据集注册
- `CSV / XLS / XLSX` 文件数据集上传与预览

### 2.4 Agent Runtime 本地配置

本地默认只启用 OpenAI-compatible runtime，不默认连接真实 Codex app-server。Codex runtime 已有 workspace / run lifecycle / artifact 权限模型的契约实现；真实主链路目标是本机 WebSocket app-server，live smoke 必须显式 opt-in，避免普通开发启动时创建长任务工作区或连接本机 app-server。

```bash
export AGENT_OPENAI_API_KEY=...
export AGENT_OPENAI_BASE_URL=https://api.openai.com/v1
export AGENT_OPENAI_MODEL=gpt-4o-mini
export AGENT_OPENAI_TIMEOUT_SECONDS=60
export AGENT_CODEX_ENABLED=false
export AGENT_CODEX_UI_MANAGED=false
export AGENT_CODEX_SERVER_MANAGED=false
export AGENT_CODEX_COMMAND_PROFILE=local-codex-app-server
export AGENT_CODEX_ALLOWED_PROJECT_ROOTS=/Users/xuan/Work/cursor_projects
export AGENT_CODEX_PROJECT_ROOT="$(pwd)"
export AGENT_CODEX_RUNTIME_ROOT=.cubic3/agent-codex
export AGENT_CODEX_TRANSPORT=ws
export AGENT_CODEX_ENDPOINT=ws://127.0.0.1:8799
```

如需只验证平台 runtime 的本地回归，使用：

```bash
make test-platform-agent-runtime
```

真实 Codex app-server 目标主链路是本机 WebSocket。先手动启动 app-server，再用后续 WebSocket client smoke 验证：

```bash
codex app-server --listen ws://127.0.0.1:8799
export AGENT_CODEX_LIVE=1
export AGENT_CODEX_ENABLED=true
export AGENT_CODEX_TRANSPORT=ws
export AGENT_CODEX_ENDPOINT=ws://127.0.0.1:8799
export AGENT_CODEX_PROJECT_ROOT="$(pwd)"
export AGENT_CODEX_ALLOWED_PROJECT_ROOTS="$(pwd)"
PYTHONPATH=. python -m pytest --no-cov tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py -q
```

### 2.5 AI Runtime 平台设置页

AI 能力不在具体业务 Copilot 内做 provider 切换。平台设置页负责展示 provider 状态、连接测试和可管理的 Codex 启动动作；业务页面只消费 action binding 结果。

1. 在前端打开 `/settings?tab=agent-runtime`。
2. 确认 `AGENT_CODEX_ALLOWED_PROJECT_ROOTS` 包含当前仓库根目录。
3. 点击 `启动 Codex`，平台只会执行 `AGENT_CODEX_COMMAND_PROFILE=local-codex-app-server` 对应的后端白名单命令。
4. 点击 `连接测试`，成功后 capabilities 面板展示 app-server 工具和上下文能力。
5. 建模 Copilot 主链不展示 runtime selector；复审、修复和审计入口固定使用 Codex runtime，需要连接时只提示进入平台设置页处理。

## 3. 开发就绪检查

进入编码前，至少确认：

- 前端或 Nginx 的入口端口可访问
- 后端健康检查可访问
- 数据库迁移已执行到最新；首次空库应从 `0001_initial_schema` 初始化，已有库应确认 `alembic_version` 已受控对齐到当前 head
- Redis / PostgreSQL 已就绪
- 当前代理目标和你实际要调试的后端实例一致

## 4. 语义专项运行前提

执行 `make smoke-semantic` 或 `make verify-semantic` 前，至少确认：

- 前端开发服务可访问：`http://127.0.0.1:3000`
- 后端 API 与代理已经刷新到最新代码
- 浏览器 smoke 所依赖的数据和语义目录处于可写状态
- 当前环境允许创建或更新草稿、测试数据和语义资产
- 如需避免污染共享环境，优先使用可回收本地环境或独立测试空间

如果使用默认地址，`DOMAIN_SMOKE_BASE_URL` 可不额外设置；如有需要，可在根目录覆盖：

- `DOMAIN_SMOKE_BASE_URL=http://127.0.0.1:3000`

## 5. 本地联调建议

### 5.1 改前端前

- 确认 Vite 能连到正确的 API 代理目标
- 确认前端依赖已安装，且本地开发端口没有冲突

### 5.2 改后端前

- 确认数据库迁移已执行
- 确认本地或 Docker 中的 Redis / PostgreSQL 已就绪

### 5.3 改跨端链路前

- 确认前后端地址、代理、鉴权和必要种子数据一致
- 确认浏览器、接口和本地数据目录都能访问到同一套最新代码与数据

## 6. 故障定位顺序

当你不确定问题是在代码、测试还是环境时，按这个顺序排查：

1. 先确认本地服务是否启动、端口是否正确
2. 再确认代理、数据库、缓存、鉴权和必要种子数据是否就绪
3. 若环境已健康，再去 `docs/quality/testing.md` 选择对应验证入口
4. 若是环境相关问题，回到 `docs/STARTUP_GUIDE.md`
5. 若是语义专项问题，回到 `docs/semantic_verification.md`
