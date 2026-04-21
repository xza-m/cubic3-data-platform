<!-- docs/superpowers/plans/2026-04-20-platform-redesign/03-cross-cutting-concerns.md -->

# 03 · 横切关注点

> 7 条横切轨道，每条独立可验证，缺一不可。所有 PR 必须能逐项过关。

---

## 0. 对齐规则（写在所有人脑子里）

demo 与后端不一致时，按下表选档（不允许 hide 作为常规手段）：

  | 档位 | 适用情形 | 处理 |
  | --- | --- | --- |
  | **align** | 字段已有，仅命名 / 形态略异 | 前端按后端字段名直连，必要时表现层 format |
  | **extend-backend** | 实体在，缺字段或聚合接口 | 后端拓展（详见 [02 · backend](02-backend-workstream.md)），前端不派生 |
  | **new-backend** | 前后端共识但实体也缺 | 后端新建实体 + 接口，前端等齐再接 |
  | **drop-frontend** | 后端从设计上没规划 | **直接删除**，禁止假数据，commit 注释说明 |

---

## 1. 设计系统

  | 项 | 规范 | 守门 |
  | --- | --- | --- |
  | 颜色 | 仅用 `var(--*)` token；禁止 `#hex` 或 `rgb()` 字面量 | stylelint plugin |
  | 间距 | 仅用 Tailwind spacing scale（4 / 8 / 12 / 16 ...）；禁止 `mt-[13px]` | eslint custom rule |
  | 字体 | 仅用 token 字号（`text-xs/sm/base/lg/xl/2xl`）；禁止任意 `[12.5px]` | 同上 |
  | 圆角 | 仅 `rounded-(none/sm/md/lg/xl/2xl/full)` | 同上 |
  | 阴影 | 仅 `shadow-(sm/md/lg/xl)` | 同上 |
  | 图标 | `lucide-react`，单导入；禁止 `import * as Icons` | eslint no-namespace-import |
  | 主题 | `data-theme=light|dark` 落 `<html>`；所有 token 必须有 dark 对照 | 视觉测试矩阵 |
  | 暗色对比 | 文本/背景对比度 ≥ AA（4.5:1）；Chip / Button 同 | a11y 工具扫描 |
  | 新组件 | 必须先在 `v2/components/ui/` 评审通过，再用 | review checklist |

  **token 文件**：`frontend/src/v2/styles/tokens.css`，单一来源。

  **不允许**：`shadcn/ui`、`mui`、`antd`、`chakra` 等三方组件库；新增组件均在 demo 现有组件基础上演进。

---

## 2. 认证 & 权限

  ### 2.1 认证

  - 登录：`POST /api/v1/auth/login` → 拿到 `{ access_token, refresh_token, expires_in }`。
  - 存储：`access_token` 内存 + `refresh_token` HttpOnly cookie（**不写 localStorage**）。
  - 续期：access token 过期前 60s，自动 silent refresh；失败则跳登录。
  - 拦截器：401 清状态 + `navigate('/login?redirect=...')`。

  ### 2.2 RBAC

  - 后端约束：所有变更接口必须 enforce role check（已存在）。
  - 前端约束：
    - **路由级**：`<RouteGuard required="role:semantic.editor">...</RouteGuard>`。
    - **按钮级**：`<Can action="datasource.delete"><Button .../></Can>`，无权限直接 disabled + tooltip 解释。
    - **数据级**：列表自动过滤由后端兜底；前端不做"用户看不到自己 own 的"假隐藏。
  - 权限元数据：`GET /api/v1/users/me/permissions` → `string[]`，登录后拉一次缓存。

  ### 2.3 未登录态

  - 任意 401 → 跳 `/login?redirect=<encoded>`。
  - 登录成功 → 回到 redirect。
  - `VITE_AUTH_BYPASS=1`（仅本地）跳过认证（仅开发）。

---

## 3. 状态管理 & 错误处理

  ### 3.1 状态

  - **唯一状态层**：`@tanstack/react-query`。
  - **禁止**：Redux、Mobx、Recoil、Zustand 用于业务数据（UI-only state 例外，可用 useState）。
  - **query key**：见 [01 · frontend](01-frontend-workstream.md) §5。
  - **mutation invalidate**：必须；review 重点项。
  - **乐观更新**：仅在 demo 中验证过的列表（如订阅启停），其他默认服务端真相 + invalidate。

  ### 3.2 错误

  - **HTTP 拦截器**统一转 `AppError`：

      ```ts
      class AppError extends Error {
        constructor(
          public code: string,
          public httpStatus: number,
          message: string,
          public details?: unknown,
        ) { super(message) }
      }
      ```

  - **错误边界**：
    - 全局 `<AppErrorBoundary>` 包 AppShell（包住 router）。
    - 路由级 `<RouteErrorBoundary>` 包每个 detail 页。
    - 边界 fallback UI 含错误 ID（埋点后台可查）+ "回到上一页" / "重试"。
  - **toast**：mutation 错误一次 toast；列表错误**不**用 toast，用内嵌 ErrorState。
  - **特殊状态码**：
    - 401 → 跳登录
    - 403 → `<Forbidden />`
    - 404 → `<NotFound />`
    - 409 / 422 → 表单字段级错误展示（`error.details.fields`）
    - 5xx → ErrorState + 重试按钮

  ### 3.3 加载态

  - 列表 Skeleton（默认 5 行，行高与真实行一致）。
  - 详情 Skeleton 分块（Header / Tabs / Body）。
  - Peek 打开 Skeleton 占位（300ms 超时切错误态）。
  - 按钮 loading 内联 spinner，禁止双击。

---

## 4. 性能 & 打包

  ### 4.1 预算

  | 指标 | 预算 | 守门 |
  | --- | --- | --- |
  | 首屏 JS gzipped | ≤ 350 KB | size-limit GH Action |
  | 单 chunk gzipped | ≤ 200 KB | 同上 |
  | LCP（dashboard） | ≤ 2.5s（4G 模拟） | Lighthouse CI 周报 |
  | TTI（dashboard） | ≤ 3.5s | 同上 |

  ### 4.2 拆包

  - `routes.tsx` 全部用 `lazy()` 拆 chunk。
  - Monaco editor、ECharts、xterm 等大件**强制**动态 import。
  - vendor split：`react/react-dom`、`react-query`、`lucide-react`、`tailwind` runtime 分独立 chunk。

  ### 4.3 渲染

  - 列表 > 100 行：必须 `@tanstack/react-virtual`。
  - 频繁更新（如执行日志流）：`react-window` + `useDeferredValue`。
  - 大图 / 截图：`<img loading="lazy" decoding="async">` + 固定 aspect-ratio。

  ### 4.4 缓存

  - react-query staleTime 默认 30s。
  - 设计 token CSS 文件单独缓存（强 etag）。
  - 静态资源：CDN（如有），否则 nginx `Cache-Control: max-age=31536000, immutable`。

---

## 5. 可观测性

  ### 5.1 错误上报

  - 前端：`@sentry/react` 或自建 endpoint（看 [05 · governance](05-governance-and-process.md) 决策）。
  - 上报内容：`AppError.code`、stack、route、user_id（脱敏）、release（git sha）。
  - 采样：error 100%；transaction 10%。

  ### 5.2 操作埋点

  - 关键操作必须埋点（事件名以 `<domain>.<verb>` 命名）：

      ```text
      datasource.create | datasource.update | datasource.delete | datasource.test
      dataset.create | dataset.refresh
      extraction.task.create | extraction.task.run
      query.execute | query.save | query.scheduled.create
      semantic.cube.create | semantic.cube.publish | semantic.diagnose.run
      app.instance.create | app.instance.start | app.instance.stop
      ```

  - 上报字段：`event`, `entity_id`, `result`(success/failure), `latency_ms`, `from`(route)。

  ### 5.3 性能埋点

  - Web Vitals（CLS / LCP / INP）通过 `web-vitals` 上报。
  - 关键路径自定义 mark：`peek.open`、`detail.first_paint`。

  ### 5.4 后端可观测

  - 沿用现有 logging（`app/common/logging.py`），新增接口必须有 INFO 级请求日志。
  - 接口 P50/P95 通过 nginx access log + 周报。

---

## 6. 可访问性 (a11y) & 国际化 (i18n)

  ### 6.1 a11y 必须项

  - 所有可点击元素是 `<button>` 或 `<a>`，禁止 `<div onClick>`。
  - 键盘可达：tab 顺序合理，Enter / Space 激活，Esc 关闭 dialog/peek。
  - 焦点可见：`focus-visible:ring-2`。
  - 表单：每个 input 必须有 `<label htmlFor>`；error 用 `aria-describedby` 关联。
  - 图标按钮：`aria-label` 必填。
  - 动效：`prefers-reduced-motion` 禁用。
  - 对比度：WCAG AA（≥ 4.5:1）。
  - 工具：CI 跑 `axe-core` smoke 扫描，关键页面 P0 必须 0 violations。

  ### 6.2 i18n

  - 本期不做完整翻译，但**所有用户可见字符串走 `t('key', 'fallback')`**：
    - 落字段：`frontend/src/v2/i18n/zh.json`（默认）+ 占位 `en.json`。
    - 工具：`react-i18next` 或自建轻量 t 函数（看 ADR）。
  - 时间 / 数字格式化：用 `Intl`，禁止 `toLocaleString('zh-CN')` 写死。
  - 文案变更通过 PR 改 i18n 文件，避免分散在组件里。

---

## 7. 测试金字塔

  ### 7.1 比例

  ```text
                   ↑
          E2E      |  P1~P22 关键流程，每条 1 条 happy path
                   |  ~ 30~40 条
        视觉对比   |  5 大模块首屏 + 关键 Peek 打开态
                   |  ~ 20 张快照
        集成       |  每个域 1 个，msw 模拟
                   |  ~ 18 条
        单元       |  hook、reducer、纯函数
                   |  覆盖率 ≥ 80%
                   ↓
  ```

  ### 7.2 工具

  | 层 | 工具 | 位置 |
  | --- | --- | --- |
  | 单元（前端） | vitest + @testing-library/react | `frontend/src/v2/**/*.test.ts(x)` |
  | 集成（前端） | vitest + msw | `frontend/src/v2/**/*.integration.test.tsx` |
  | 视觉 | Playwright snapshot | `frontend/tests/e2e-node/visual.*.spec.ts` |
  | E2E | Playwright | `frontend/tests/e2e-node/*.spec.ts` |
  | 单元（后端） | pytest | `tests/unit/**` |
  | 集成（后端） | pytest + Flask test client | `tests/integration/**`，新增带 `@pytest.mark.redesign` |

  ### 7.3 CI gate

  - PR 必跑：lint / typecheck / 单元 / 集成。
  - PR 选跑：视觉（修改 UI 时）、E2E（修改路由 / mutation 时）。
  - main 必跑：全套 + Lighthouse + size-limit。
  - 每周：a11y 扫描 + 性能基准。

  ### 7.4 覆盖率门槛

  - 前端单元：80%（line + branch）。
  - 后端：本期新增代码 90%。
  - 不达标 PR 不允许合并；豁免需 Tech Lead approve + 注释说明。

---

## 8. 横切轨道交付清单

  | 轨道 | 出口 | 周 |
  | --- | --- | --- |
  | 设计系统 token + stylelint 规则 | tokens.css 锁定，CI 跑 stylelint 通过 | W1 末 |
  | 认证 + RBAC `<Can>` `<RouteGuard>` | 5 个域接入完成 | W2 末 |
  | 状态/错误规范（hooks + boundary + toast） | 所有页面统一封装 | W2 末 |
  | 性能预算 + 拆包 + size-limit CI | 首屏 ≤ 350 KB 通过 | W3 末 |
  | 可观测性（错误 + 埋点 + Web Vitals） | dashboard 可看到上报数据 | W4 末 |
  | a11y + i18n（t() 接入 + axe smoke） | 关键页 0 violations | W5 中 |
  | 测试金字塔 + CI gate | 全套绿 | W5 末 |
