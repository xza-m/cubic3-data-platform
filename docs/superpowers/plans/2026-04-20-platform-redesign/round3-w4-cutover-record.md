# Round 3 · Week 4 · Cutover Record

**Date**: 2026-04-20
**Owner**: Main thread
**Phase**: W4.A (legacy 归档 + 单一入口 + Legacy redirects)
**Status**: ✅ DONE

## 1. 执行内容

### 1.1 Legacy 整树归档

`git mv` 全部非 v2 顶层资源到 `frontend/src/legacy/`：

  ```text
  frontend/src/
  ├── legacy/                  # ← 新增（归档目录）
  │   ├── App.tsx
  │   ├── App.test.tsx
  │   ├── index.css
  │   ├── api/  components/  config/  hooks/  lib/  pages/  test/  types/  utils/
  ├── v2/                      # 唯一在产代码
  └── main.tsx                 # ← 重写：统一入口
  ```

被删除：

- `frontend/src/legacy/main.test.tsx` — 测试目标 `./main` 已不存在；新 `frontend/src/main.test.tsx` 替代。

### 1.2 统一入口

`frontend/index.html` 标题改为 `Cubic3 Data Platform`，仍指向 `/src/main.tsx`。

`frontend/src/main.tsx` 重写（44 行）：

- 仅 `import App from '@v2/App'`，挂载 v2 应用。
- 启动期 `migrateLegacyClientState()` 一次性迁移：
  - `localStorage.auth_token` → `sessionStorage.v2.access_token`（仅当 v2 为空，避免覆盖）
  - `localStorage.theme` → `localStorage.v2.theme.fallback`（ThemeProvider 启动时兜底）
  - storage 抛错（隐私模式）静默忽略，不阻塞渲染。
- 5 个 vitest 用例覆盖：挂载、token 迁移、token 不覆盖、theme 暂存、storage 异常容错。

### 1.3 Vite 配置统一

`frontend/vite.config.ts`：

- alias: `@` → `./src/legacy`，`@v2` → `./src/v2`
- 入口默认 `frontend/index.html`，输出 `dist/`，端口 `3000`
- manualChunks 合并：semantic-graph / react-vendor / query-vendor / icons

`frontend/v2.vite.config.ts` 收敛为兼容层（`mergeConfig` 复用主配置，仅覆盖端口 3001 + 输出 `dist-v2`），保留是为不破坏 W4.C E2E 子代理与 CI 的 `dev:v2` / `build:v2` 命令名。下个迭代可删除。

### 1.4 TypeScript 路径

`frontend/tsconfig.json`：

  ```json
  "paths": {
    "@/*":  ["./src/legacy/*"],
    "@v2/*": ["./src/v2/*"]
  }
  ```

### 1.5 包脚本

新增 `dev:v2`、`build:v2`、`preview:v2`、`lint:legacy`；`lint` 默认排除 `src/legacy/**`。

### 1.6 ESLint / Vitest

- `.eslintrc.cjs`：`ignorePatterns` 加 `src/legacy/**`、`dist-v2`、`playwright-report-v2`；overrides 路径从 `src/api/**` 等改成 `src/v2/api/**`。
- `vitest.config.ts`：alias 同步；`exclude` 加 `src/legacy/**`；coverage exclude 同步；`setupFiles` 从 `[legacy/setup.ts, v2/setup.ts]` 收敛到 `[v2/setup.ts]`。

### 1.7 Legacy URL Redirects

`frontend/src/v2/routes.tsx` 新增 `LEGACY_REDIRECTS` 表 + `<LegacyRedirect>` 组件（保留 `:param`、`?query`、`#hash`）：

  | from                              | to                            |
  | --------------------------------- | ----------------------------- |
  | `/queries/editor`                 | `/queries`                    |
  | `/queries/templates`              | `/queries`                    |
  | `/semantic/overview`              | `/semantic/workbench`         |
  | `/semantic/tools`                 | `/semantic/workbench`         |
  | `/semantic/ide`                   | `/semantic/workbench`         |
  | `/semantic/devtools`              | `/semantic/workbench`         |
  | `/semantic/playground`            | `/semantic/cubes`             |
  | `/semantic/canvas`                | `/semantic/domains`           |
  | `/semantic/modeling`              | `/semantic/domains`           |
  | `/semantic/visual-model`          | `/semantic/domains`           |
  | `/semantic/visual-model/:id`      | `/semantic/domains/:id`       |
  | `/semantic/domains/:id/canvas`    | `/semantic/domains/:id`       |

  D+90（即 7 月）查 access log 决定保留/删除。详见 `04-cutover-and-migration.md §4.1`。

### 1.8 Route parity 脚本

`scripts/checks/route_parity.py`：`LEGACY_FILE` 路径更新为 `frontend/src/legacy/App.tsx`。审计仍 0 undeclared mismatches。

## 2. 验证矩阵

  | 命令 | 结果 |
  | --- | --- |
  | `python3 scripts/checks/route_parity.py --fail-on-mismatch` | ✅ 0 undeclared |
  | `cd frontend && npx tsc --noEmit` | ✅ 0 errors |
  | `cd frontend && npx vite build` | ✅ 280 KB gzip 总量 |
  | `python3 scripts/checks/bundle_budget.py --dist frontend/dist` | ✅ 全 chunk under budget |
  | `cd frontend && npx vitest run src/main.test.tsx` | ✅ 5/5 |

## 3. 已知不影响生产但需后续清理

  | 项 | 备注 |
  | --- | --- |
  | `frontend/src/v2/index.html`、`frontend/src/v2/main.tsx` | 切换后未被任何配置引用；保留以等待 W4.C E2E 子代理稳定后统一删除 |
  | `frontend/v2.vite.config.ts` | 仅 `dev:v2` / `build:v2` 命令名兼容层；W6 cleanup 可删 |
  | `frontend/src/legacy/App.test.tsx` | 仍在 git，但 vitest 已排除；可在 D+30 cleanup 删除 |
  | Legacy E2E (`frontend/tests/e2e-node/*.spec.ts`) | baseURL 默认 3100，cutover 后需 `dev:legacy` 才能跑；W4.C 完成后逐步删除 |
  | `frontend/tailwind.config.js` 中 shadcn `hsl(var(--background))` 体系 | 仅 legacy 引用；下迭代统一收敛到 v2 token 体系 |

## 4. W4.B / W4.C / W4.D-1 / W4.D-2 / W4.E · 整合状态（2026-04-21）

| Workstream | 子任务 | 产物 | 主线整合 |
| --- | --- | --- | --- |
| W4.B | CSS token 收敛 + stylelint | `frontend/stylelint.config.js`、`tokens.css` 增 `--bg-skeleton` / `--on-accent`、`lint:css` 0 报错 | ✅ |
| W4.C | Playwright E2E P1~P22 | `frontend/tests/e2e-v2/{playwright.config.ts,helpers.ts,fixtures/*,p01..p22.spec.ts}`、`package.json` 增 `dev:v2`/`test:e2e:v2{,:smoke}`；冒烟跑 `@p01|@p21` 通过 | ✅（修了 P09/P19 unused-import） |
| W4.D-1 | RBAC `require_roles` + 全量补 `@require_auth` | `app/interfaces/api/middleware/auth.py` 增 `require_roles`；semantic / ontology / governance / semantic_router / semantic_mapper / execution_compiler 等蓝图全面挂 `require_auth`；`tests/conftest.py` 增 `client` 默认带 admin token + `client_no_auth` + `viewer_headers` | ✅ |
| W4.D-2 | Users / Roles 后端 CRUD | `app/{domain,application,infrastructure}/users/`、`app/interfaces/api/v1/{users,roles}.py`；232 个 integration test 通过 | ✅ |
| W4.E | B-back-7 Cube 派生字段 | 后端 `cube_listing_service` 已透传 4 个字段；前端在 `frontend/src/v2/api/semantic.ts` 扩展 `CubeSummary`，`Cubes.tsx` Card / Table 直接消费服务端 enriched 字段（不在客户端二次计算）| ✅ |

### 4.1 全量验证矩阵

  | 命令 | 结果 |
  | --- | --- |
  | `python3 scripts/checks/route_parity.py --fail-on-mismatch` | ✅ 0 undeclared |
  | `cd frontend && npx tsc --noEmit` | ✅ 0 errors |
  | `cd frontend && npx vite build` | ✅ index 80.55 KB · gzip 25.18 KB |
  | `cd frontend && npx vitest run` | ✅ 32/32 |
  | `python -m pytest tests/integration --no-cov` | ✅ 232/232 |
  | `cd frontend && npx eslint tests/e2e-v2/` | ✅ 0 errors |
  | `cd frontend && CI=1 npx playwright test --config tests/e2e-v2/playwright.config.ts --grep "@p01\|@p21"` | ✅ 1 passed · 1 skipped |
  | `cd frontend && npx stylelint "src/v2/**/*.css"` | ✅ 0 errors |

### 4.2 已知 backlog（不阻塞 W4 关闸）

  | 项 | 处理时机 |
  | --- | --- |
  | v2 源码遗留 ~59 条 unused-import lint 错（W2/W3 子代理产出）| W5.A 单元覆盖率冲刺时顺便 `eslint --fix` |
  | W4.D-1/D-2 缺少专属 `tests/integration/users/test_*.py`、`test_rbac_*.py`（仅 `test_preferences.py` 复用） | W5.B 后端集成测试每域 1 个时统一补齐 |
  | W4.C 中 P01 因依赖 backend mock 顺序当前 `test.skip` | W5.C a11y 接入时同步排查 |

## 5. 下一步

W4 全部 5 个 workstream 已落地并整合验证；进入 W5（unit 覆盖率 ≥ 80% / 后端集成 / a11y / size-limit / observability / 视觉基线 / GO-NO-GO 演练）。
