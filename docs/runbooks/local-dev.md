---
doc_type: runbook
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-25
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

- 首次通过 Nginx 访问前端前，需要先构建 `frontend/dist`
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

## 3. 开发就绪检查

进入编码前，至少确认：

- 前端或 Nginx 的入口端口可访问
- 后端健康检查可访问
- 数据库迁移已执行到最新
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
