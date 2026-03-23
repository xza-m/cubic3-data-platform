# CUBIC3 前端

当前前端实现是独立的 React SPA，负责数据中心、查询中心、语义中心、应用中心、配置中心和登录页等主要界面。

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
- `/queries/*`
- `/data-chat`
- `/apps`
- `/config/*`
- `/semantic/*`

## 构建产物

`npm run build` 会生成 `dist/`。Docker 模式下，Nginx 会直接挂载该目录作为前端静态资源根目录，因此部署前需要确保 `dist/` 已更新。
