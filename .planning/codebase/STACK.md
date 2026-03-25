# 技术栈

## 总览

- 当前主线是 `React SPA + Flask API + PostgreSQL/Redis/RQ`。
- 前端与后端均有独立入口，生产环境由 `Nginx` 托管前端静态产物并反向代理后端 API。
- 说明中的 Python 版本、部分集成能力与部署方式，有少量是从运行镜像或配置文件推断的；已在对应条目中标注。

## 语言与运行时

- `TypeScript 5`：前端主语言，见 `frontend/src/`。
- `JavaScript / JSX`：前端运行时代码与测试代码混用，见 `frontend/src/main.tsx`、`frontend/src/App.tsx`。
- `Python 3.11`：从 `Dockerfile` 的 `python:3.11-slim` 推断为当前后端运行时。
- `Node.js`：前端构建与测试运行时，版本未在仓库内单独锁定。

## 前端框架与库

- 框架：`React 18`、`React Router DOM 6`、`Vite 5`。
- 状态与数据请求：`@tanstack/react-query`、`axios`。
- UI 组件：`@radix-ui/*`、`lucide-react`、`overlayscrollbars`、`class-variance-authority`、`clsx`、`tailwind-merge`。
- 可视化与编辑：`@monaco-editor/react`、`recharts`、`@xyflow/react`、`elkjs`、`sql-formatter`。
- 表单与交互：`@rjsf/core`、`@rjsf/utils`、`@rjsf/validator-ajv8`、`react-day-picker`。

## 后端框架与库

- Web 框架：`Flask 3`，应用工厂见 `app/__init__.py`。
- ORM 与迁移：`Flask-SQLAlchemy`、`Flask-Migrate`，扩展初始化见 `app/extensions.py`。
- 依赖注入：`dependency-injector`，容器见 `app/di/container.py`。
- 配置校验：`pydantic 2`，环境装配见 `app/config_schema.py`。
- 认证：`PyJWT`。
- 异步与调度：`rq`、`redis`、`flask_apscheduler`、`apscheduler`。
- 通用能力：`requests`、`tenacity`、`PyYAML`、`pandas`、`sqlparse`、`psycopg2-binary`、`gunicorn`。

## 数据源与集成 SDK

- `pyodps`：MaxCompute 适配。
- `clickhouse-driver`：ClickHouse 适配。
- `pymysql`：MySQL 适配。
- `oss2`：对象存储交付。
- `openai`：LLM/OpenAI 兼容调用。
- `lark-oapi`：飞书长连接事件接收。

## 包管理器

- 前端使用 `npm`，依据 `frontend/package-lock.json` 与 `frontend/README.md`。
- 后端使用 `pip` + `requirements.txt`。
- 仓库内未看到 `poetry.lock`、`uv.lock` 或 `pnpm-lock.yaml` 作为主锁文件。

## 构建与测试工具

- 前端构建：`vite build`，入口脚本见 `frontend/package.json`。
- 前端类型检查：`tsc --noEmit`。
- 前端静态检查：`eslint`。
- 前端测试：`vitest`、`@playwright/test`、`@testing-library/*`。
- 后端测试：`pytest`、`pytest-cov`、`pytest-flask`、`pytest-mock`、`faker`。
- 部署与运行：`gunicorn`、`docker compose`、`Makefile`。

## 配置入口

- 后端环境模板：`env.sample`。
- 后端配置 Schema：`app/config_schema.py`。
- Flask 配置注入：`app/__init__.py`、`app/di/container.py`。
- 前端开发代理与端口：`frontend/vite.config.ts`。
- 前端脚本与依赖声明：`frontend/package.json`。
- 统一验证入口：`Makefile`。
- WSGI 入口：`wsgi.py`。
- RQ Worker 入口：`run_worker.py`。
- Docker 部署编排：`docker-compose.yml`、`Dockerfile`、`deploy.sh`。

## 实现备注

- `SQLite` 被 `app/config_schema.py` 允许作为开发/测试选项，但主部署与默认环境仍以 PostgreSQL 为准。
- `frontend/dist` 是 Docker/Nginx 场景下的静态产物，需先执行前端构建。
