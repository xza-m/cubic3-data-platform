---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-04-25
---

# 文档与实现对齐说明

**更新时间**：2026-04-25
**对齐原则**：以当前代码实现、启动脚本、依赖清单和实际路由为准；历史文档保留，但不再作为默认标准。

## 1. 本次梳理范围

本次对齐主要检查了以下信息源之间是否一致：

- 根文档：`README.md`
- 架构与启动文档：`docs/TECH_STACK_AND_ARCHITECTURE.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`
- 质量与运行文档：`docs/quality/testing.md`、`docs/quality/backend-coverage.md`、`docs/quality/frontend-coverage.md`、`docs/quality/review.md`、`docs/runbooks/local-dev.md`、`docs/semantic_verification.md`
- 架构设计文档：`docs/architecture/*.md`
- 前端文档：`frontend/README.md`
- 当前实现：`app/__init__.py`、`app/di/container.py`、`app/interfaces/api/v1/*`
- 前端实现：`frontend/src/main.tsx`、`frontend/src/v2/routes.tsx`、`frontend/src/v2/api/client.ts`、`frontend/package.json`、`frontend/vite.config.ts`
- 部署脚本：`docker-compose.yml`、`Dockerfile`、`deploy.sh`
- 根目录统一入口：`Makefile`

## 2. 发现的主要不一致

| 主题 | 旧文档描述 | 当前实现 | 处理方式 |
|---|---|---|---|
| 前端架构 | 混合 Jinja + React，或仍以 SSR 页面为主 | 当前主线是 React SPA，后端未注册页面模板路由 | 已重写根 README 与架构文档 |
| UI 技术栈 | Ant Design 5 / Bauhaus 主题是主栈 | 当前依赖和代码主线是 Radix UI primitives + 自定义业务组件 | 已重写前端说明 |
| 状态管理 | 使用 Zustand | 当前代码未引入 Zustand，主用 TanStack Query | 已更正文档 |
| 包管理与脚本 | `pnpm`、`npm run test`、Vite 默认 `5173` | 当前使用 `npm`、前端保留 `test:unit` / `test:e2e` / `verify:*`，根目录统一入口为 `make setup` / `make lint` / `make typecheck` / `make test` / `make smoke` / `make verify` / `make verify-*` / `make verify-detect` / `make verify-changed` / `make docs-impact` / `make review`，并按四层校验语义、规则检测和文档影响检查组织，端口为 `3000` | 已重写前端文档、启动文档和根目录入口说明 |
| Docker 启动 | `docker compose up` 会直接复用宿主机 `frontend/dist` | 当前 `docker/nginx.Dockerfile` 会在 Nginx 镜像构建阶段执行前端打包并内置静态资源；需要用 `docker compose up --build` 或重建 `nginx` 镜像刷新前端 | 已在快速开始和启动指南中明确 |
| 启动文件 | `docker-compose.full.yml` 是主入口 | 当前仓库只有 `docker-compose.yml` | 已移除旧说法 |
| 配置方式 | 手动维护 `app/config.py` | 当前使用 `env.sample` + `app/config_schema.py` 的 Pydantic 配置加载 | 已重写启动说明 |
| 健康检查 | `/api/v1/health` | 当前是 `/health` | 已修正文档 |
| 数据中心接口 | 旧版 `/api/v1/metadata/*` 等接口描述 | 当前主 API 为 `/api/v1/data-center/datasources` 与 `/api/v1/data-center/datasets` | 已在基线文档中写明，并将旧元数据文档标记为历史说明 |
| 查询中心 IA | `/queries/editor` 等子页仍被当作主入口 | 当前主入口统一收口为 `/queries`，旧查询子页只保留兼容重定向 | 已更新前端与架构文档 |
| 语义中心 IA | `/semantic/tools`、`/semantic/overview` 等旧入口仍被默认引用，或把 `/semantic/workbench` 当作业务语义主入口 | 当前主入口为 `/semantic/ontology`；`/semantic/workbench` 是语义诊断工作台；Cube、Domain、View 保留独立资产页，旧入口只保留兼容重定向 | 已更新前端、架构文档与 v2 路由/API 审计 |
| 查询中心 IA | `/queries/history`、`/queries/visual`、`/queries/my` 等被误写为旧兼容入口 | 当前 `/queries` 是查询工作台，`/queries/history`、`/queries/visual`、`/queries/my`、`/queries/scheduled`、`/queries/exports` 是有效子路由 | 已更新 README、前端说明与审计文档 |
| 智能问数 UI | 文档描述 `DataChat` 前端已展示语义执行来源 | 后端 `/api/v1/conversations` 主链仍存在，v2 `/data-chat` 当前是 Placeholder | 已改为后端能力与前端占位分开描述 |
| 验证入口 | `make test-regression*`、`make semantic-layout` 仍被当作当前入口 | Round 4 D+21 后 legacy regression 与 `semantic-layout` 目标已移除；当前前端默认入口是 `make verify-frontend`、v2 smoke 是 `make smoke-frontend` | 已更新启动、前端和语义验证说明 |
| 前端 coverage | `make coverage-frontend` 被描述为 90% 总门槛 + 核心页 100% | 当前 `make coverage-frontend` 显式 skip；实际守护由 `frontend/vitest.config.ts` 的 v2 子树 80% 阈值承接 | 已更新启动与前端说明 |
| 首页统计来源 | 前端多接口拼装并夹带占位值 | 当前统一走 `/api/v1/dashboard/overview`，拿不到真实来源的字段返回 `null` | 已更新 README、启动文档与架构文档 |

## 3. 当前推荐阅读顺序

### 新同学或首次接手项目

1. `AGENTS.md`
2. `README.md`
3. `docs/TECH_STACK_AND_ARCHITECTURE.md`
4. `docs/architecture/README.md`
5. `docs/QUICK_START.md`
6. `docs/STARTUP_GUIDE.md`

### 需要核对历史问题

先确认该文档顶部是否标记为历史记录，再决定是否继续参考：

- `docs/archive/legacy/MIGRATION_GUIDE.md`
- `docs/archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md`
- `docs/archive/legacy/FRONTEND_FIX_SUMMARY.md`
- `docs/archive/legacy/METADATA_SYNC_*.md`

## 4. 本次更新的文档

- `README.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `docs/QUICK_START.md`
- `docs/STARTUP_GUIDE.md`
- `docs/quality/testing.md`
- `docs/quality/backend-coverage.md`
- `docs/quality/frontend-coverage.md`
- `docs/quality/frontend-v2-route-api-audit.md`
- `docs/quality/review.md`
- `docs/runbooks/local-dev.md`
- `frontend/README.md`
- `docs/readme.md`
- `docs/DOC_ALIGNMENT_REPORT.md`
- `docs/architecture/README.md`

## 5. 仍保留的历史性文档

以下文档没有完全重写为当前实现说明，而是保留历史价值，并在顶部补充状态提示：

- `docs/archive/legacy/MIGRATION_GUIDE.md`
- `docs/archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md`
- `docs/archive/legacy/FRONTEND_FIX_SUMMARY.md`
- `docs/archive/legacy/METADATA_SYNC_GUIDE.md`
- `docs/archive/legacy/METADATA_SYNC_QUICKSTART.md`
- `docs/archive/legacy/METADATA_SYNC_FRONTEND.md`

这样做的原因：

- 保留迁移背景和问题排查轨迹，符合 DRY，不重复维护历史过程
- 避免删除尚有参考价值的记录
- 通过状态提示降低误用风险，符合 KISS

## 6. 后续维护建议

- 若新增功能文档，先确认对应路由、脚本、依赖和端口是否已经落到代码中
- 当前仓库不再以 OpenSpec 作为默认流程入口；涉及新能力、跨模块契约变化或架构调整时，应把设计说明沉淀到 `docs/prd/`、`docs/architecture/` 或对应专题文档
- README 只保留“当前基线”和“高频入口”，避免堆积历史演进说明
- 历史修复总结、迁移纪要、专题调研统一归类为“历史记录”
- 每次影响启动方式、端口、依赖、API 路径的改动，必须同步更新 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`
