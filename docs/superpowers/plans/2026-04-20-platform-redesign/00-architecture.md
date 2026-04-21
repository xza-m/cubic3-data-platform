<!-- docs/superpowers/plans/2026-04-20-platform-redesign/00-architecture.md -->

# 00 · 目标架构

> 聚焦"切换后的稳态长什么样"，与 [master](../2026-04-20-platform-redesign-rollout-implementation.md) 对齐。

---

## 1. 全景图

  ```mermaid
  flowchart TB
    subgraph Browser
      direction TB
      Shell[AppShell\nLeftRail + SecondarySidebar + TopBar + TabStrip]
      Routes[v2/routes.tsx]
      Shell --> Routes
      Routes --> Pages[Pages\nL0 List | L3 Detail]
      Pages --> Peek[PeekPanel\nL2 Peek]
      Pages --> Ctx[ContextPanel\nmodule + entity 上下文]
      Pages --> Hooks[react-query Hooks]
      Hooks --> Api[v2/api/*\naxios + interceptors]
    end

    Api -->|HTTPS JSON| Gateway[/api/v1/*/]
    Gateway --> Flask[Flask Blueprints\napp/interfaces/api/v1/*]
    Flask --> AppService[Application Services\napp/application/*]
    AppService --> Domain[Domain + Repo\napp/domain/*]
    Domain --> Persist[(MySQL/Postgres)]
    Domain --> Sem[(yaml semantic files)]

    subgraph CrossCut [横切]
      Auth[JWT 认证拦截]
      Telemetry[错误上报 + 操作埋点]
      Tokens[设计 token CSS vars]
    end

    Api -.- Auth
    Pages -.- Telemetry
    Shell -.- Tokens
  ```

---

## 2. 前端分层

`frontend/src/v2/` 强约束 5 层，**禁止跨层调用**：

  | 层 | 路径 | 职责 | 不允许 |
  | --- | --- | --- | --- |
  | layout | `v2/layout/` | AppShell、Peek、ContextPanel、TabStrip、CommandPalette | 直接调用 axios / 业务字段 |
  | pages | `v2/pages/<domain>/` | 路由级页面，组合 layout + hooks | 直接 fetch、跨域引用其他 domain 的内部组件 |
  | hooks | `v2/hooks/<domain>.ts` | react-query hooks（封装 query key、staleTime、mutation invalidation） | 持久化业务状态、UI 副作用 |
  | api | `v2/api/<domain>.ts` | axios 客户端，**只**和 `/api/v1/*` 对接 | 引用 mock、做派生计算 |
  | components/ui | `v2/components/ui/` | 设计系统组件（Button / Card / Table / Chip / Skeleton ...） | 业务字段、领域状态 |

  搬迁规则：

  1. 旧 `frontend/src/` 全部改名归档到 `frontend/src/legacy/`，cutover 后保留 1 个迭代后删除。
  2. 新代码只允许写在 `frontend/src/v2/`；`v2` 与 `legacy` **不互相 import**。
  3. `frontend/src/main.tsx` 只挂 `v2`，cutover 当天移除 legacy 路由挂载。

---

## 3. 数据流

  ```mermaid
  sequenceDiagram
    autonumber
    participant U as User
    participant P as Page
    participant H as react-query hook
    participant A as v2/api/*
    participant B as Backend /api/v1
    participant Q as react-query cache

    U->>P: 进入 /datasources
    P->>H: useDatasources(filters)
    H->>Q: 命中缓存？
    alt 命中
      Q-->>P: cached list
    else 未命中 / stale
      H->>A: listDatasources(filters)
      A->>B: GET /api/v1/datasources
      B-->>A: 200 JSON
      A-->>H: 解析后的 typed payload
      H->>Q: 写入缓存（key = ['datasources', filters]）
      Q-->>P: list
    end

    U->>P: 点击行
    P->>P: setPeekId(row.id)
    P->>H: useDatasource(id)（独立 query key）
    H->>A: getDatasource(id)
    A->>B: GET /api/v1/datasources/:id
    B-->>P: detail
    P->>P: 渲染 PeekPanel

    U->>P: 编辑保存
    P->>H: useUpdateDatasource()
    H->>A: PATCH /api/v1/datasources/:id
    A->>B: 200
    H->>Q: invalidate ['datasources']
    Q-->>P: 自动刷新列表
  ```

要点：

- **query key 规范**：`[domain, action, ...args]`，例：`['datasources', 'list', filters]`、`['datasources', 'detail', id]`。
- **mutation 必须 invalidate**：禁止手动 `setQueryData` 兜底，除非有书面说明。
- **派生字段就近**：能后端算的就后端算（见 [02 · backend workstream](02-backend-workstream.md) §B-back-7 Cube 派生）。

---

## 4. 设计系统基线

设计 token + 组件 + 主题三件套，统一来源于 demo，落到 `v2/components/ui/` + `v2/styles/tokens.css`：

  | 类别 | 来源 | 落地文件 | 锁定方式 |
  | --- | --- | --- | --- |
  | 颜色 token | demo `tokens.css` | `v2/styles/tokens.css` | CSS variables，禁止页面写死十六进制 |
  | 字体 / 间距 / 圆角 | demo | `v2/styles/tokens.css` + Tailwind config | Tailwind theme.extend 引用 var |
  | 组件 API | demo | `v2/components/ui/*` | 公开 props 通过 ts 类型锁定，新增 prop 走 review |
  | 主题切换 | demo `ThemeProvider` | `v2/layout/ThemeProvider.tsx` | `data-theme=light|dark` 落到 `<html>` |
  | 暗色模式 | Tailwind `darkMode:'class'` | 同上 | 所有 token 都要有 dark 对照 |

  组件库治理（见 [03 · cross-cutting](03-cross-cutting-concerns.md) §设计系统）：

  - 所有 demo 现有组件直接进入 `v2/components/ui/`，不再造轮子。
  - 新组件需在 PR 描述里说明：是否能复用现有组件、为什么不能、是否需要进入设计系统。

---

## 5. 路由形态

`v2/routes.tsx` 顶层结构：

  ```tsx
  <Route path="/" element={<AppShell />}>
    <Route index element={<Navigate to="/dashboard" replace />} />

    {/* 一级模块 */}
    <Route path="dashboard" element={<Dashboard />} />

    <Route path="datasources">
      <Route index element={<DatasourcesList />} />
      <Route path="new" element={<DatasourceCreate />} />        {/* 静态路由必须在动态前 */}
      <Route path=":id" element={<DatasourceDetail />} />
    </Route>

    <Route path="datasets">...</Route>
    <Route path="extraction/tasks">...</Route>
    <Route path="extraction/runs">...</Route>
    <Route path="queries">...</Route>
    <Route path="semantic">...</Route>
    <Route path="apps">...</Route>
    <Route path="apps/:id/instances">...</Route>
    <Route path="config">...</Route>

    <Route path="*" element={<NotFound />} />
  </Route>
  ```

详细页面清单见 [01 · frontend workstream](01-frontend-workstream.md) §页面覆盖矩阵。

---

## 6. 与后端的契约

- **路径**：所有前端调用走 `/api/v1/*`，开发期通过 Vite proxy 转 `http://localhost:81`。
- **认证**：`Authorization: Bearer <jwt>`，401 由拦截器统一处理（清除 token + 跳登录）。
- **分页**：统一 `{ items, total, page, page_size }`。命名以后端为准，前端不重命名（详见 §03 状态/错误规范）。
- **错误**：HTTP 状态码 + body `{ code, message, details? }`，详见 §03。
- **字段**：snake_case 在 wire 上保留，仅在 ts 类型层做 Pick/Omit，不做 camelCase 重命名（**减少 mismatch 风险**）。

---

## 7. 删除 legacy 的边界

- W1 内：`frontend/src/` 全部 `git mv` 到 `frontend/src/legacy/`，**不改任何代码**，仅改 import 路径。
- W1~W5：`v2` 持续接管路由；`main.tsx` 同时挂 v2 与 legacy（legacy 走 `/legacy/*` 前缀）。
- W6 cutover Day 0：移除 legacy 路由挂载，但保留代码 1 个迭代以便 `git revert`。
- W6 + 1 sprint：删除 `frontend/src/legacy/` 整个目录，相关测试一并清除。
