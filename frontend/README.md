# CUBIC3 - 前端项目

基于 React 18 + TypeScript + Vite + Ant Design 5 的现代化前端应用。

## 技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **UI 组件**: Ant Design 5
- **路由**: React Router 6
- **状态管理**: Zustand + TanStack Query
- **样式**: Tailwind CSS
- **HTTP 客户端**: Axios

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发环境

```bash
pnpm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
pnpm run build
```

### 预览生产版本

```bash
pnpm run preview
```

## 项目结构

```
src/
├── pages/           # 页面组件
├── components/      # 可复用组件
├── api/            # API 调用
├── stores/         # 状态管理
├── hooks/          # 自定义 Hooks
├── types/          # TypeScript 类型
├── utils/          # 工具函数
└── App.tsx         # 根组件
```

## 开发规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 组件使用函数式组件 + Hooks
- 使用 React Query 管理服务端状态
- 使用 Zustand 管理客户端状态
