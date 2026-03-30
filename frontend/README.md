---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-03-28
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
make test-regression
make smoke
make verify
make verify-detect
make verify-changed
make docs-impact
make review
make verify-frontend
make verify-semantic
make semantic-layout
make smoke-semantic
make coverage
make coverage-frontend
```

这些命令是仓库对 agent 和协作者暴露的固定接口；其中 `make lint / typecheck / test / smoke` 明确对应四层验证，`make verify-detect / make verify-changed` 负责把当前变更映射到最低必跑入口，`make docs-impact` 负责检查高风险改动是否遗漏关键文档更新，`make verify-frontend` 对应前端进入可交付状态的默认收口，`make coverage / make coverage-frontend` 则属于 coverage 专项验证，不并入默认 `make verify`。当前 `make coverage-frontend` 会额外校验前端总 coverage `>=90%` 和核心功能与实体页 `100%` 守护，详见 `docs/quality/frontend-coverage.md`。本目录的 `npm` 脚本仍保留，主要用于前端局部调试和专项验证。

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

# E2E
npm run test:e2e

# UI 综合校验
npm run verify:ui
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
├── api/                  # 前端 API 封装
├── components/
│   ├── ui/               # 通用 UI primitives
│   ├── business/         # 业务组件
│   ├── Layout/           # 应用布局
│   ├── Semantic/         # 语义建模组件
│   └── Chat/             # 智能问数组件
├── hooks/                # 自定义 Hook
├── lib/                  # 工具与领域辅助
├── pages/                # 页面路由
├── types/                # 类型定义
├── App.tsx               # 路由总入口
└── main.tsx              # 应用入口
```

## 主要页面

- `/login`
- `/dashboard`
- `/data-center/datasources`
- `/data-center/datasets`
- `/queries`
- `/data-chat`
- `/apps`
- `/config/*`
- `/semantic/workbench`
- `/semantic/cubes`
- `/semantic/domains`
- `/semantic/modeling`

兼容层说明：

- `/queries/editor`、`/queries/history`、`/queries/templates`、`/queries/visual`、`/queries/my`、`/queries/scheduled` 会统一重定向到 `/queries`
- `/semantic/overview`、`/semantic/tools`、`/semantic/playground`、`/semantic/visual-model`、`/semantic/canvas`、`/semantic/ide`、`/semantic/devtools` 会统一重定向到新的语义中心主入口

当前数据中心 Phase 1 已落地的前端基线：

- 数据源主链路以 `PostgreSQL`、`MaxCompute` 为准
- 数据集注册覆盖 `physical`、`virtual`、`file`
- `virtual` 入口固定保留在 Query Editor 的“保存为虚拟数据集”
- `file` 支持 `CSV / XLS / XLSX`，重新上传会创建新数据集，不覆盖旧对象

## 构建产物

`npm run build` 会生成 `dist/`。Docker 模式下，Nginx 会直接挂载该目录作为前端静态资源根目录，因此部署前需要确保 `dist/` 已更新。
