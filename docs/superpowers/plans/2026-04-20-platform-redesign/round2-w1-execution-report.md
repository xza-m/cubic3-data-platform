<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round2-w1-execution-report.md -->

# Platform Redesign · Round 2 · W1 执行报告

> 状态：**已完成**
> 报告时间：2026-04-21
> 关联计划：[Master Plan](../2026-04-20-platform-redesign-rollout-implementation.md) ·
> [04 Cutover](04-cutover-and-migration.md) · [Round 1 报告](round1-execution-report.md)

---

## 0. TL;DR

  | 维度 | 目标 | 实际 | 结论 |
  | --- | --- | --- | --- |
  | 后端覆盖率门槛 | `make coverage-backend` 全绿 | **97.99% 总覆盖**；模块/核心模块全部达标 | PASS |
  | 路由收口（v2 ↔ demo） | 0 未声明差异 | parity script: **0 undeclared mismatches** | PASS |
  | 视觉基线（demo） | demo 全量截图归档 | **46/46 路由截图**（4.8 MB），README + capture 脚本入库 | PASS |
  | v2 独立可 build | `vite build --config v2.vite.config.ts` 通过 | **dist-v2/ 产出**：JS 318 KB / CSS 122 KB（gzip 130 KB） | PASS |
  | v2 静态可 serve | smoke 200 + 资源全 200 | index 200 / 4 个 chunk 全部 200 | PASS |
  | Legacy 健康（回滚兜底） | tsc / build / vitest 全绿 | tsc 0 err / build OK / **96 files 603 tests passed** | PASS |
  | main.tsx 仍指向 legacy | 不动主入口 | `import App from './App'` ✅ | PASS |

W1 准备工作全部就位，**未触发任何不可回滚的变更**。

---

## 1. 后端覆盖率（r2-cov-gate）

### 1.1 起点
Round 1 报告中误报 92.98% 覆盖率 —— 实为只跑 `tests/unit/` 子集；`make coverage-backend` 跑全量后总覆盖 96.78%，但 `scripts/checks/backend_coverage_guard.py` 仍报模块/核心模块多处不达标：

  | 模块 | W1 起 | 阈值 |
  | --- | --- | --- |
  | `application.queries` | 83.90% | 95% |
  | `infrastructure.queries` | 81.53% | 95% |
  | `application.semantic`（核心） | 97.88% | **100%** |
  | `domain.semantic`（核心） | 99.x% | **100%** |
  | `application.users` | 99.x% | 100%（核心） |
  | `application.datasources` | 89.29% | 95% |

### 1.2 处理
派两组 sub-agents 并行补齐 + 主线收尾：

- **queries 域**：6 个新测试文件 / 52 个新用例；`application.queries` 与 `infrastructure.queries` 全部达 100%。
- **semantic views & diagnose 子域**：7 个新测试文件 + 3 个 `__init__.py`；`application.semantic` / `domain.semantic` 100%；`infrastructure.semantic` 99.29%。
  - 顺手修复 2 个生产 bug：
    1. `app/domain/semantic/views_materialize.py` —— `id` 列 `BigInteger().with_variant(Integer, "sqlite")` 修 SQLite autoincrement。
    2. `app/infrastructure/semantic/view_materialize_repo.py` —— 给 `materialized_at` 序列化加 `hasattr(..., "isoformat")` 防御 SQLite 字符串场景。
- **users 偏好**：补 `default_landing` validator 两个分支用例，`application.users` 100%。
- **datasource handlers**：发现 `_classify_error` 关键字匹配 bug（`kw in (msg, cls_name)` 写成元组成员判断而非子串匹配），改为 `kw in msg or kw in cls_name`，并补回归测试。
- **schema browser**：补 `_TTLCache.invalidate` / `list_tables` cache & error / `get_table_schema` cache & error / `_get_adapter` 用例，`application.datasource{,s}` 全部 100%。

### 1.3 结果
```
$ make coverage-backend
TOTAL coverage: 97.99%   (gate: 95%)  PASS
Per-module gate: ALL PASS
Core module 100% gate: ALL PASS
```

---

## 2. 路由收口（r2-route-cutover）

### 2.1 路由 parity 脚本与审计
- 新建 `scripts/checks/route_parity.py`：解析 `frontend/src/App.tsx`（legacy）与 `frontend/src/v2/routes.tsx`（v2）路由表，输出 JSON / 文本报告，内置 allowlist（`renames` / `redirects` / `legacy_only` / `v2_only`），可作为 CI gate（`--fail-on-mismatch`）。
- 新建 `docs/superpowers/plans/2026-04-20-platform-redesign/route-parity-audit.md`：完整对照表 + cutover 任务列表。

### 2.2 路径正本：以 demo 为准
W1 阶段一度把 v2 路由"RESTful 化"（如 `/datasources`、`/extraction/tasks`），但用户给出的设计契约一直是 `tmp/platform-redesign/`。检视 demo 后确认：**demo 沿用 legacy 路径风格**（`/data-center/datasources`、`/extraction-tasks`、`/queries/my` …）。这与"前端设计风格基于 demo"指令冲突。

派 sub-agent 执行回归对齐：
- `frontend/src/v2/routes.tsx` 路径全面回退到 demo 命名。
- `frontend/src/v2/layout/navigation.ts` 同步。
- `route-parity-audit.md` 重新分类。

### 2.3 当前对齐状态

  | 指标 | W1 初始 | 对齐后 |
  | --- | --- | --- |
  | Legacy 路由 | 48 | 48 |
  | V2 路由 | 49 | **53** |
  | ✅ 完全对齐 | 20 | **36** |
  | ⚠ 命名变更 | 18 | **2** |
  | 🔁 compat 重定向 | 8 | 9 |
  | ❌ Legacy 缺 v2 | 2 | **1**（仅 `modeling` 留作 W2 决策） |
  | 🆕 V2 独有 | 19 | **17** |
  | 未声明差异 | 0 | **0** |

`scripts/checks/route_parity.py --fail-on-mismatch` 退出码 0。

---

## 3. 视觉基线（r2-visual-baseline）

### 3.1 策略
v2 大部分页面尚为 placeholder，对 v2 自身建立视觉基线没有 cutover 意义。改为对 **demo 全量录制**，作为 W2-W5 域 Agent 实现时的设计契约（design baseline）。

### 3.2 产出
- `scripts/capture_demo_baseline.mjs`：Playwright 脚本，`vite preview` serve `tmp/platform-redesign/dist/`，遍历 46 条路由（参数路由用 seed：`id=1`、`name=demo_cube`、`code=demo_app`、`instanceId=1`），fullPage 1440×900 截图。API 请求统一拦截返回 200 mock，避免 axios 401 拦截器跳 login。
- `docs/superpowers/plans/2026-04-20-platform-redesign/design-baseline/`：
  - 46 张 PNG（4.8 MB）。
  - `README.md` 说明用途、回放命令、W2-W5 使用约束。

### 3.3 抽样

  | 路由 | 文件 | 大小 |
  | --- | --- | --- |
  | `/semantic/cubes` | `semantic__cubes.png` | 212 KB |
  | `/extraction-tasks` | `extraction-tasks.png` | 208 KB |
  | `/semantic/ontology` | `semantic__ontology.png` | 145 KB |
  | `/queries/my` | `queries__my.png` | 168 KB |
  | `/apps` | `apps.png` | 182 KB |

W2-W5 实现 v2 真实页面后，每条路由对照 `design-baseline/<path>.png` 做视觉 diff（人工 + Playwright snapshot）。

---

## 4. Cutover 冷启动演练（r2-cutover-rehearsal）

### 4.1 v2 独立 build
- 修复 `frontend/src/v2/index.html` 中 `script` 路径：`/src/v2/main.tsx` → `./main.tsx`（绝对路径在 `root: src/v2` 下让 rollup 无法解析）。
- `npx vite build --config v2.vite.config.ts --emptyOutDir`：1545 modules / 1.96 s。

  | Chunk | 原始 | gzip |
  | --- | --- | --- |
  | `react-vendor` | 220.5 KB | 68.5 KB |
  | `query-vendor` | 36.3 KB | 14.7 KB |
  | `index` | 61.4 KB | 19.0 KB |
  | `index.css` | 122.1 KB | 20.2 KB |
  | 4 个 page chunks（Login / Dashboard / Forbidden / NotFound） | 18.6 KB | 7.6 KB |

  total ≈ 459 KB / gzip ≈ 130 KB。

### 4.2 静态可 serve
- `cd frontend/dist-v2 && python3 -m http.server 3011 --bind 127.0.0.1`
- `curl http://127.0.0.1:3011/` → `HTTP 200`，4 个静态资源（index/react-vendor/query-vendor/index.css）全部 `200`。
- `/dashboard` 返回 `404`（python http server 无 SPA fallback）—— 正式部署需 nginx `try_files $uri /index.html` 或 vite preview，**这是已知约束**，记入 W6 cutover checklist。

### 4.3 回滚兜底
- `frontend/src/main.tsx` 当前仍是 `import App from './App'`（legacy），未引入 v2 routes。
- Legacy 全链路验证：

  ```
  tsc --noEmit       0 errors
  vite build         dist/ OK（10.26 s）
  vitest run         96 files / 603 tests passed
  ```

  **结论：W1 全部为非破坏性准备工作；任何时刻都可以零成本回滚（即"不动 main.tsx"）。**

### 4.4 已知约束记入 W6 checklist
1. v2 dist 必须用支持 SPA fallback 的 server 托管（nginx / vite preview / serve -s）。
2. v2 build 要求 `index.html` 中所有相对资源用 `./` 而非 `/src/...`（已修）。
3. v2 chunking 当前没切 lucide-react（manualChunks 中 `id.includes('lucide-react')` 命中条件未触发，因为 v2 lucide 用法极少）；W2-W5 接入更多页面后需复评。

---

## 5. R2-W1 阶段清单

  | Task ID | 描述 | 状态 |
  | --- | --- | --- |
  | r2-cov-gate | `make coverage-backend` 全绿 | ✅ |
  | r2-route-cutover | v2 路径/导航对齐 demo + parity 脚本入库 | ✅ |
  | r2-visual-baseline | demo 全量截图归档 + 回放脚本 + README | ✅ |
  | r2-cutover-rehearsal | v2 独立 build + smoke + legacy 健康 + 回滚验证 | ✅ |

---

## 6. 风险与下一步（W2 起跑前）

### 6.1 风险

  | 风险 | 影响 | 缓解 |
  | --- | --- | --- |
  | v2 大量页面仍是 placeholder | W2-W5 实现压力集中 | sub-agent 并行 + design-baseline 作契约 |
  | demo 与 legacy 后端差异未全部明确 | 部分接口可能需要新增 | 已有 `scheduled_queries` / `user_preferences` 后端 Blueprint 落库，W2 起逐个域排查 |
  | route_parity allowlist 中 17 个 v2-only 路由（多为 ontology workbench 子路由） | 潜在 placeholder 持久化 | W2 计划交付 ontology workbench 真实实现 |
  | v2 dist-v2 未纳入 CI build | cutover 前可能漂移 | W2 加 CI job：`vite build --config v2.vite.config.ts` |

### 6.2 W2 起步

  1. CI 加新 job：`v2-build` + `route-parity-check`（`scripts/checks/route_parity.py --fail-on-mismatch`）。
  2. 启动 W2 域实施：semantic / data-center / extraction 三个 sub-agent 并行，各自对照 `design-baseline/` 实现真实页面，产出 v2 路由真实组件 + Vitest 用例。
  3. 每完成一个 v2 路由真实化，从 `route-parity-audit.md` `🆕 v2-only` 列移到 `✅ aligned`，并把对应 baseline PNG 升级为可比对快照。
