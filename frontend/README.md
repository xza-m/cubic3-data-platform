---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-04-25
---

# CUBIC3 前端

当前前端实现是独立的 React SPA，负责数据中心、查询中心、语义中心、应用中心、配置中心和登录页等主要界面。

## 根目录统一入口

如果你的目标是“按仓库标准执行校验”，优先回到仓库根目录运行：

```bash
make setup
make lint
make typecheck
make test
make test-unit
make test-integration
make smoke
make verify
make verify-detect
make verify-changed
make docs-impact
make review
make verify-frontend
make verify-semantic
make smoke-semantic
make coverage
make coverage-frontend
make coverage-report
```

这些命令是仓库对 agent 和协作者暴露的固定接口；其中 `make lint / typecheck / test / smoke` 明确对应四层验证，`make verify-detect / make verify-changed` 负责把当前变更映射到最低必跑入口，`make docs-impact` 负责检查高风险改动是否遗漏关键文档更新，`make verify-frontend` 对应前端进入可交付状态的默认收口。`make coverage-frontend` 已退役为显式 skip；当前前端覆盖率守护由 `frontend/vitest.config.ts` 的 v2 子树 80% 阈值承接，数字报告用 `make coverage-report`。本目录的 `npm` 脚本仍保留，主要用于前端局部调试和专项验证。

## 当前技术栈

- React 18
- TypeScript 5
- Vite 5
- React Router DOM 6
- TanStack Query 5
- Axios
- Radix UI primitives
- Lucide React
- Monaco Editor
- Recharts
- `@xyflow/react` + ELK

说明：

- 当前前端不依赖 `antd`
- 当前仓库未使用 `zustand`
- 当前包管理锁文件是 `package-lock.json`，默认使用 `npm`

## 开发命令

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建
npm run build

# 预览构建产物
npm run preview

# Lint
npm run lint

# 单元测试
npm run test:unit

# E2E（v2 redesign 套件；Round 3 清理后 test:e2e 已移除）
npm run test:e2e:v2
# 只跑 smoke 子集（P1/P2/P3/P7/P21）
npm run test:e2e:v2:smoke
# 语义治理问题真实后端 smoke（通常由根目录 make smoke-semantic 串行调用）
npm run e2e:governance-issues-smoke

# 设计令牌 + i18n 覆盖等综合校验（根目录 Make 入口也可：`make verify-frontend`）
npm run lint:all
npm run i18n:coverage
```

## 开发地址与代理

- Vite 默认端口：`3000`
- 默认 API 代理目标：`http://localhost:81`

如果你没有启动 Nginx，而是直接调本地 Flask，请这样启动：

```bash
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

## 目录结构

```text
src/
├── main.tsx              # v2-only 挂载入口
└── v2/
    ├── App.tsx           # Provider 装配
    ├── routes.tsx        # v2 路由总入口
    ├── api/              # 前端 API 封装
    ├── hooks/            # TanStack Query hooks
    ├── layout/           # AppShell / TopBar / Sidebar / Inspector
    ├── components/       # 通用组件与 UI primitives
    ├── pages/            # 页面路由
    ├── styles/           # 设计 token 与全局样式
    ├── i18n/             # 文案
    └── observability/    # 前端观测
```

## 主要页面

- `/login`
- `/dashboard`
- `/data-center/datasources`
- `/data-center/datasets`
- `/extraction/tasks`
- `/extraction/runs`
- `/queries`
- `/queries/my`
- `/queries/history`
- `/queries/visual`
- `/queries/scheduled`
- `/queries/exports`
- `/data-chat`（当前占位）
- `/apps`
- `/apps/instances`
- `/executions`
- `/config/*`
- `/settings`
- `/semantic/ontology`
- `/semantic/workbench`
- `/semantic/cubes`
- `/semantic/domains`

兼容层说明：

- `/queries/editor`、`/queries/templates` 会统一重定向到 `/queries`
- `/semantic/overview`、`/semantic/tools`、`/semantic/playground`、`/semantic/visual-model`、`/semantic/canvas`、`/semantic/ide`、`/semantic/devtools` 会统一重定向到新的语义中心主入口
- `/semantic/modeling` 会重定向到 `/semantic/domains`

语义中心当前页面职责：

- `/semantic/ontology`：业务语义工作台主入口，覆盖对象、指标、关系、治理和工作台总览。
- `/semantic/workbench`：语义诊断工作台，对接 diagnose 与历史诊断运行。
- `/semantic/cubes`：Cube 资产管理页，`/semantic/cubes/new` 与 `/semantic/cubes/:name/edit` 是当前真实 v2 页面。
- `/semantic/domains`、`/semantic/domains/:id`：领域列表与领域画布。

路由/API 当前审计见 `docs/quality/frontend-v2-route-api-audit.md`。

当前数据中心 Phase 1 已落地的前端基线：

- 数据源主链路以 `PostgreSQL`、`MaxCompute` 为准
- 数据集注册覆盖 `physical`、`virtual`、`file`
- `virtual` 入口固定保留在 Query Editor 的“保存为虚拟数据集”
- `file` 支持 `CSV / XLS / XLSX`，重新上传会创建新数据集，不覆盖旧对象

## 构建产物

`npm run build` 会生成 `dist/`，用于本地预览或静态产物检查。Docker 模式下，`nginx` 镜像会在构建阶段自动执行前端打包并内置静态资源，不再依赖宿主机的 `dist/` 目录。
