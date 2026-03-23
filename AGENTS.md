<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## 项目结构与模块组织
- `app/` 为 Flask 主应用：`routes/` 路由、`services/` 业务服务、`models.py` 数据模型、`templates/` Jinja 页面模板。
- `frontend/` 存放前端组件示例（如 `QueryBuilder.tsx`），`docs/` 是功能与集成说明。
- `schema/` 提供数据库扩展 SQL，`instance/` 放本地开发数据库（`local.db`）。
- 入口与部署：`wsgi.py`、`entrypoint.sh`、`Dockerfile`、`docker-compose*.yml`、`deploy.sh`。

## 构建、测试与开发命令
- `cp env.sample .env`：配置数据库、Superset、飞书等环境变量。
- `docker compose up --build -d`：本地启动服务（含依赖镜像）。
- `docker compose logs -f`：查看全部服务日志与排错。
- `docker compose logs -f nginx` / `docker compose logs -f backend` / `docker compose logs -f rq_worker`：分别查看反向代理、Flask API 与异步任务 Worker 日志。
- `pip install -r requirements.txt` + `flask db upgrade` + `flask run`：不使用 Docker 的本地后端开发。
- `cd frontend && npm install && npm run dev`：启动 Vite 前端开发环境（默认 `http://localhost:3000`，`/api` 代理到 `VITE_API_PROXY_TARGET` 或 `http://localhost:81`）。
- `python run_worker.py`：在 Flask app context 中启动本地 RQ Worker。
- `./start_rq_worker.sh`：按 `.env` 配置启动带 scheduler 的独立 RQ Worker。
- `docker compose up -d rq_worker`：在 Docker 环境中单独拉起异步任务 Worker。
- `python -m app.infrastructure.tasks.rq_worker`：按 `REDIS_URL` 启动模块化 RQ Worker（默认 `redis://localhost:6379/0`）。
- `cd frontend && npm run build` / `npm run lint` / `npm run preview`：前端构建、ESLint 检查与预览。
- `cd frontend && npm run test:e2e`：运行完整 Playwright 端到端测试套件。
- `cd frontend && npm run test:unit` / `npm run test:e2e` / `npm run test:visual`：运行 Vitest 单测、Playwright E2E 与语义中心视觉回归。
- `cd frontend && npm run verify:ui`：执行前端类型检查、Vitest 单测与 Playwright E2E 的组合校验。
- `cd frontend && npm run verify:semantic-layout`：执行语义中心布局专项校验（类型检查、关键页面单测、关键 E2E 与视觉回归）。
- `cd frontend && npm run verify:semantic`：执行语义建模相关前端 smoke 流程（类型检查、构建、3 个 e2e 脚本）。
- `cd frontend && npm run e2e:domain-smoke` / `npm run e2e:domain-publish-smoke` / `npm run e2e:cube-draft-smoke`：按场景单独执行语义中心关键路径 smoke。
- `flask db migrate -m "msg"` / `flask db upgrade`：数据库迁移。
- `./deploy.sh`：执行前端构建、`docker compose build`、重启服务并做 `/health` 健康检查。
- TODO: `scripts/rebuild-frontend.sh` 依赖 `docker-compose.full.yml`，当前仓库根目录未发现该文件，使用前需先确认来源或同步脚本。

## 编码风格与命名规范
- Python 遵循 PEP 8，使用 4 空格缩进；函数/变量 `snake_case`，类名 `CapWords`，常量全大写。
- 路由与服务保持单一职责；模板命名与页面功能一致（如 `dashboard.html`）。
- 前端已配置 `ESLint`（`cd frontend && npm run lint`）；后端暂未发现统一格式化工具，提交前请手动保持风格一致并补充中文注释。

## 测试指南
- 已配置 `pytest`，默认读取 `pytest.ini` 中的覆盖率参数（`--cov=app`、`--cov-fail-under=55`）。
- 运行全部测试：`pytest`；按目录执行：`pytest tests/unit -v`、`pytest tests/integration -v`。
- 前端测试入口：`cd frontend && npm run test:unit`（Vitest）、`npm run test:e2e`（Playwright）、`npm run test:visual`（语义中心视觉回归）。
- 当语义中心改动聚焦页面布局、画布交互或视觉回归时，优先执行 `cd frontend && npm run verify:semantic-layout`。
- UI 组合校验可执行 `cd frontend && npm run verify:ui`；语义中心主路径固定验证可执行 `cd frontend && DOMAIN_SMOKE_BASE_URL=http://127.0.0.1:3000 npm run verify:semantic`。
- 执行语义中心 smoke 前，推荐先运行 `docker compose restart backend nginx`，并在 `frontend/` 下执行 `npm run dev -- --host 127.0.0.1`；项目 `vite.config.ts` 已固定开发端口为 `3000`，默认提供 `http://127.0.0.1:3000` 前端入口。
- 需要覆盖率产物时可直接运行 `pytest`，会生成 `htmlcov/` 与 `coverage.xml`。
- 基础接口烟测可使用：`curl http://localhost:81/health`、`curl http://localhost:5000/health`；本地 API 文档入口为 `http://localhost:5000/api/docs`。
- 语义中心 smoke 失败时会在 `frontend/tests/artifacts/` 产出截图；如新增后端测试，建议放在 `tests/` 并采用 `test_*.py` 命名。

## 提交与 Pull Request 规范
- 当前目录未包含 `.git`，无法总结既有提交规范；建议采用 Conventional Commits（如 `feat: ...`、`fix: ...`）。
- PR 请描述变更目的、影响范围与验证方式；涉及界面变化请附截图；如有关联需求/缺陷请链接。

## 安全与配置提示
- 敏感配置统一放入 `.env` / `.env.prod`，不要提交秘钥（如 `FEISHU_APP_SECRET`、`SUPERSET_PASSWORD`）。
- `env.sample` 为模板，新增配置时请同步更新并注明用途。
