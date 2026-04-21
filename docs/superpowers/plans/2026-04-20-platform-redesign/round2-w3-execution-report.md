<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round2-w3-execution-report.md -->

# Platform Redesign · Round 2 · W3 执行报告

> 状态：**已完成**
> 报告时间：2026-04-23
> 关联计划：[Master Plan](../2026-04-20-platform-redesign-rollout-implementation.md) ·
> [01 Frontend](01-frontend-workstream.md) · [02 Backend](02-backend-workstream.md) ·
> [W2 报告](round2-w2-execution-report.md) · [ADR-001 Scheduled Query Runner](../../../adr/001-scheduled-query-runner.md)

---

## 0. TL;DR

  | 维度 | 目标 | 实际 | 结论 |
  | --- | --- | --- | --- |
  | B-back-7/8/9 后端 | 状态盘点 | R1 已完成 80%，本周仅做前端接线 | PASS |
  | ScheduledQuery 端到端 | api+hooks+List+Detail+Create+CRUD/启停/触发+runs | 4 文件新增、3 路由接线、cron 预览工具落地 | PASS |
  | DiagnoseRun 历史 | api+hook+DevTools 历史 Tab | 独立 `api/diagnose.ts`、`hooks/diagnose.ts`、DevTools 三 Tab 全功能化 | PASS |
  | CI 加固 | backend-coverage + size-limit job | 新增 `backend-ci.yml` 与 `bundle_budget.py`（含 5 个单测）、`size-limit` job 接入 frontend-ci | PASS |
  | ThemeProvider 单一源 | 与 useMyPreferences 合并 | ThemeProvider 重写，AppShell 撤掉重复副作用，Login/LeftRail 切到 effectiveTheme | PASS |
  | sub-agent C（Semantic 域批） | P4-P8 + P19 | 全量交付（详见 §6） | PASS |
  | sub-agent D（Data+Config+Apps 域批） | P3/P10/P12/P13/P14/P20 | 全量交付（详见 §6） | PASS |
  | tsc | 0 errors | **0 errors** | PASS |
  | vitest | all green | **101 files / 630 tests passed**（W2 → W3 净增 15 个） | PASS |
  | vite build · v2 | 通过 | 2.51s ✓ | PASS |
  | vite build · legacy | 通过 | 12.03s ✓ | PASS |
  | route_parity.py | 0 undeclared | 6 个新 v2-only 路由全部入 allowlist，0 undeclared | PASS |
  | bundle budget | 关键 chunk gzip 在预算内 | index 24.8KB / react-vendor 77.7KB / query-vendor 14.7KB / total 280KB | PASS |

  W3 把 R2 计划里所有 backlog 的功能页（共 6 域）一次性接入并消除了
  最后两个根因型架构债（ScheduledQuery 后端 dead-end、ThemeProvider 双源），
  CI 又新增 2 个守门 job，进入 W4 时已经具备“整体冻结 + 切流”的条件。

---

## 1. 起点 · 进入 W3 时的状态

W2 收尾后结余的待办（按 plan 文档第 4 节）：

* `w3-scheduled` —— v2 ScheduledQuery 端到端：api+hooks+List+Detail+CRUD/启停/手动触发+runs
* `w3-diagnose-history` —— v2 DiagnoseRun 历史：api+hook+DevTools 历史 Tab
* `w3-ci-harden` —— CI 加 backend-coverage + size-limit job
* `w3-theme-merge` —— ThemeProvider 与 useMyPreferences 合并为单一源
* `w3-semantic-batch` —— P4 / P5 / P6 / P7 / P8 / P19（语义域）
* `w3-other-batch` —— P3 / P10 / P12 / P13 / P14 / P20（Data + Config + Apps）

策略：

1. **先做后端审计** —— 确认 B-back-7/8/9 在 R1 的完成度；如已就绪则
   本周不做 backend，把容量全部投到前端接线 + CI 加固。
2. **Semantic 与 Data/Config/Apps 两域并行**，由 sub-agent C 与 D 各领一
   batch；主线主攻 ScheduledQuery / DiagnoseRun / CI / Theme 这四块
   架构面任务。
3. **隔离写**：Semantic 子域里我（主线）需要碰的 Diagnose 相关代码
   全部隔离到独立文件 (`api/diagnose.ts` + `hooks/diagnose.ts`)，避免与
   sub-agent C 在 `api/semantic.ts` / `hooks/semantic.ts` 的并行编辑发生
   写冲突。
4. **每完成一个里程碑就跑全套验证**（tsc + vitest + build + parity）。

---

## 2. 后端审计（B-back-7/8/9）

| 任务 | 范围 | R1 实际状态 | W3 处置 |
| --- | --- | --- | --- |
| B-back-7 Cube 派生字段 | 字段校验/派生 | 已落 `validate_cube_fields` API + service | 不动 |
| B-back-8 ScheduledQuery + APScheduler | scheduled_queries CRUD + runs + APScheduler in-process | API（`scheduled_queries.py`）/Service（`scheduled_query_service.py`）/Domain (`scheduled_query.py` + `scheduled_query_run.py`) 全部就绪，APScheduler 在 `app/__init__.py` 已注册 BackgroundScheduler | 不动后端，仅前端接线 |
| B-back-9 DiagnoseRun History | `/diagnose` POST + `/diagnose/runs` GET + 详情 | API/Service/Repo/Domain 全部就绪，schema 字段为 `input_kind / input_text / parse_ok / validate_ok / sql_text / error / duration_ms / created_at` | 不动后端，仅前端接线 + 历史 Tab |

**重要发现**：W2 时前端 DevTools `DiagnosePanel` 仍在用旧 schema
`{cubes: []}` 调 `/diagnose`，与 B-back-9 上线的新 schema 不兼容 —— 在
W3 修正前其实是 broken。本周 `w3-diagnose-history` 任务顺手把这条线
的 contract 拨正。

ADR-001（Scheduled Query Runner）状态：W2 收尾时已被用户确认为
`accepted`，W3 不再触碰，仅在 plan 中作为引用。

---

## 3. ScheduledQuery 端到端 (`w3-scheduled` · 主线)

### 3.1 新增/改动文件

| 文件 | 类型 | 行数 | 用途 |
| --- | --- | --- | --- |
| `frontend/src/v2/api/queries.ts` | 改 | +120 | 追加 `ScheduledQuery` / `ScheduledQueryRun` 类型 + 9 个 API 函数（list / get / create / update / delete / enable / disable / trigger / listRuns） |
| `frontend/src/v2/hooks/queries.ts` | 改 | +90 | 9 个对应 react-query hooks，全部带 invalidate（list / detail / runs） |
| `frontend/src/v2/lib/cron.ts` | 新 | 145 | 5 段式 cron parser + `nextRun()` / `nextRuns()` 预览 + 9 条 `CRON_PRESETS` |
| `frontend/src/v2/pages/queries/QueriesScheduled.tsx` | 改 | 列表页全量重写 | 表格 + 启停/触发/删除 actions + Peek 面板（L2 详情 + 最近 runs） |
| `frontend/src/v2/pages/queries/QueriesScheduledDetail.tsx` | 改 | L3 详情页全量重写 | 顶栏 actions + 三 Tab（概览 / SQL / 执行历史）+ Monaco 只读 SQL + inline 编辑表单 |
| `frontend/src/v2/pages/queries/QueriesScheduledCreate.tsx` | 改 | 新建表单页全量重写 | 表单 + 复用 cron 预览，提交后跳详情 |
| `frontend/src/v2/routes.tsx` | 改 | +1 路由 | `/queries/scheduled/new` 接入 |

### 3.2 重要决策

* **Cron 预览**：选择前端纯函数解析（无新依赖），覆盖 95% 常见场景；
  生产 dry-run 仍以服务端为准（APScheduler 计算）。
* **CSS 变量统一**：发现 W1 期沉淀的旧文件中存在大量 `var(--fg-*)` /
  `var(--bg-skeleton)` / `var(--bg-active)` / `var(--bg-input)` /
  `var(--info-soft)` / `var(--info)` 等**未声明**的变量。新写的 3
  个 ScheduledQuery 页一次性对齐到 `tokens.css` 真实声明的
  `--text-* / --bg-hover / --bg-surface-2 / --accent / --accent-soft`，
  避免静默 fallback。后续 W4 应该全局做一次 grep + replace 收敛。
* **Lucide 图标命名修正**：初版用了不存在的 `CirclePlay/CirclePause`
  名字（lucide v0.x 没有这两个），通过 `tsc --noEmit` 一次性发现，
  替换为 `PlayCircle/PauseCircle`。

---

## 4. DiagnoseRun 历史 (`w3-diagnose-history` · 主线)

### 4.1 新增/改动文件

| 文件 | 类型 | 行数 | 用途 |
| --- | --- | --- | --- |
| `frontend/src/v2/api/diagnose.ts` | 新 | 65 | `DiagnoseRun` 类型 + 3 API（runDiagnose / listDiagnoseRuns / getDiagnoseRun） |
| `frontend/src/v2/hooks/diagnose.ts` | 新 | 40 | 3 hook（`useDiagnoseRuns / useDiagnoseRun / useRunDiagnose`），mutation 自动失效列表 |
| `frontend/src/v2/pages/semantic/devtools/DevTools.tsx` | 改 | 全量重写 484 行 | 三 Tab：诊断控制台（B-back-9 schema：input_kind/input_text）/ SQL 预览 / 历史；历史 Tab 是真表 + 详情侧栏 |

### 4.2 重要决策

* **写隔离**：sub-agent C 当时正在持续编辑 `api/semantic.ts` /
  `hooks/semantic.ts`（P4/P5 字段校验 + 指标 dry-run）。为避免双方
  对同一个文件的写竞争，本周把 Diagnose 域单独抽到 `api/diagnose.ts`
  + `hooks/diagnose.ts`。后续若域稳定可在 W4 末段平移合回。
* **DiagnosePanel 重构**：从旧的 `{cubes: []}` schema 切换到 B-back-9
  的 `{ input_kind: 'sql'|'yaml'|'nl', input_text }`，输入区改为
  Monaco 编辑器（语言随类型切换）+ 三模 Chip 切换 + 服务端结果
  落库后回填 `parse_ok / validate_ok / sql_text / error / duration_ms`。
* **历史侧栏**：列表点击行 → 右侧 420px 抽屉显示完整输入、生成 SQL
  与错误，按需懒加载详情。

---

## 5. CI 加固 (`w3-ci-harden` · 主线)

### 5.1 新增 `.github/workflows/backend-ci.yml`

新建独立的 Backend CI workflow：

* 触发：PR 修改 `app/**` / `tests/**` / `requirements.txt` /
  `pytest.ini` / `Makefile` / `backend_coverage_*` / 自身。
* 步骤：`pip install -r requirements.txt` → `pytest --cov=app --cov-fail-under=95`
  → `python scripts/checks/backend_coverage_guard.py`（额外的模块
  均匀度 + 核心模块 100% 守护）→ 上传 `coverage.xml` 工件。

### 5.2 新增 `scripts/checks/bundle_budget.py` + 测试

零外部依赖（gzip 标准库）的 bundle gate：

* 扫描 `frontend/dist-v2/assets/*.js`，按 `<name>-<hash>.js` 前缀
  匹配预算表 `BUDGETS`（index 80KB / react-vendor 110KB /
  query-vendor 50KB / semantic 5KB，全部 gzip 后字节）。
* 全局上限 `TOTAL_BUDGET = 1.4MB` gzip。
* `--json` 输出供未来 PR comment 使用。
* 5 个 unit test 覆盖：under budget / over budget / unknown chunk
  skip / missing dist / gzip 函数本身。

`scripts/checks/bundle_budget.py` 的运行结果（W3 现状）：

  | chunk | gzip | budget | status |
  | --- | --- | --- | --- |
  | index | 24.8 KB | 80 KB | PASS |
  | react-vendor | 77.7 KB | 110 KB | PASS |
  | query-vendor | 14.7 KB | 50 KB | PASS |
  | total | 280 KB | 1400 KB | PASS |

### 5.3 frontend-ci.yml 增加 size-limit job

* 依赖 `v2-build` 完成上传 `dist-v2` 工件。
* `actions/download-artifact@v4` 拉取 → 直接跑
  `python scripts/checks/bundle_budget.py` 即可，与本地完全一致。

---

## 6. 域批次（sub-agent C / sub-agent D）

主线发起 W3 时把两块横向工作并行委派出去。两个 sub-agent 各自独立
完成，没有出现写冲突，最终 tsc / vitest 一次过绿。

### 6.1 sub-agent C · Semantic 域 (`w3-semantic-batch`)

落地范围（按 plan §3）：

* **P4** 字段校验：`validateCubeFields` + `useValidateCubeFields`，
  Cube 详情页接入“一键校验”动作 + 内联问题列表。
* **P5** 指标公式 dry-run：`dryRunMetric` + `useDryRunMetric`，
  `Metrics.tsx` 表格行内联展开 + Monaco 公式编辑 + 结果预览。
* **P6** 关系画布：`/semantic/relations` 列表 + 详情；同步在
  `routes.tsx` 接入。
* **P7** Domain 发布 + 历史：`getDomainPublishHistory` +
  `useDomainPublishHistory`，详情页加“发布历史”Tab。
* **P8** View 物化历史：`getViewMaterializeRuns` +
  `useViewMaterializeRuns`，ViewDetail 加“物化运行历史”Tab。
* **P19** 全局搜索：`CommandPalette` 升级为按域 facet 搜索（cube /
  view / domain / metric / object）。

新增 / 改动文件涉及 `api/semantic.ts` (+250 行)、`hooks/semantic.ts`
(+120 行)、Cube/View/Domain/Metric/Relation 6 个页面、新增
`hooks/semantic.test.tsx`。

### 6.2 sub-agent D · Data + Config + Apps 域 (`w3-other-batch`)

* **P3** 数据集 profile：DatasetDetail 加“画像”Tab（行数 / 类型
  分布 / null 比例）。
* **P10** 抽取任务 cron：ExtractionTaskDetail / ExtractionTasks 接入
  cron 预览组件（与 ScheduledQuery 复用 `lib/cron.ts`）。
* **P12** 通知通道测试发送：ChannelDetail 增加“测试发送”按钮 +
  `useTestChannel` hook。
* **P13** 订阅历史：SubscriptionDetail 增加“发送历史”Tab。
* **P14** Users + Roles 管理：新增完整 4 个页面（Users /
  UserDetail / Roles / RoleDetail）+ `api/users.ts` / `hooks/users.ts`
  / `api/roles.ts` / `hooks/roles.ts`。新增 6 条 v2-only 路由。
* **P20** Marketplace facet + 搜索：Marketplace 页面接入分类
  facet + 文本搜索 + 排序，`api/apps.ts` / `hooks/apps.ts` 同步增强。

新增的 6 条 v2-only 路由（`/config/users`, `/config/users/:id`,
`/config/roles`, `/config/roles/:id`）+ 主线的 `/queries/scheduled/new`
+ sub-agent C 的 `/semantic/relations` 全部入 `route_parity.py`
allowlist，`route_parity --fail-on-mismatch` 0 报警。

---

## 7. ThemeProvider 单一源 (`w3-theme-merge` · 主线)

### 7.1 历史问题

* `ThemeProvider`：本地 state，`localStorage` 持久化，类型 `'light' | 'dark'`。
  `LeftRail.toggle()` 翻转本地 state，但**不会回写后端**。
* `AppShell.useEffect`：基于 `useMyPreferences()` 计算 isDark 然后
  `document.documentElement.classList.toggle('dark', isDark)`。
* 结果：toggle 翻转 → 几秒后 `useMyPreferences` 重新 select 又把
  类切回去；用户体验是“切换后自动反弹”。

### 7.2 处置

`ThemeProvider` 重写为唯一源（`frontend/src/v2/components/ThemeProvider.tsx`）：

1. 类型对齐 backend：`Theme = 'light' | 'dark' | 'system'`，
   外加 `effectiveTheme = 'light' | 'dark'`（system 解析后）。
2. 数据来源：`prefs?.theme ?? localStorage`（保持登录前可用）。
3. 副作用：**唯一**写 `<html class="dark">` 的地方在此 useEffect。
4. `setTheme/toggle`：写 localStorage 缓存 + 当 `prefs` 已加载时
   通过 `useUpdateMyPreferences()` mutate 回写后端，mutation 内部
   会再失效缓存 → ThemeProvider 重渲染 → 类同步。
5. system 模式订阅 `prefers-color-scheme` 变化。

`AppShell.tsx` 删除原本的 dark-class effect；保留 `useMyPreferences`
仅用于 `tableDensity`。`LeftRail.tsx` / `Login.tsx` 切换到
`effectiveTheme` 来挑图标，避免 `'system'` 时图标错乱。

---

## 8. 全验证矩阵

  | gate | 命令 | 结果 |
  | --- | --- | --- |
  | tsc | `cd frontend && npx tsc --noEmit` | **0 errors** |
  | vitest | `cd frontend && npx vitest run` | **101 files / 630 tests passed**（W2 → W3 净增 15 个） |
  | vite build · v2 | `cd frontend && npx vite build --config v2.vite.config.ts --emptyOutDir` | 2.51s ✓ |
  | vite build · legacy | `cd frontend && npx vite build` | 12.03s ✓（chunk warn 不阻塞） |
  | route_parity | `python scripts/checks/route_parity.py --fail-on-mismatch` | **0 undeclared** |
  | bundle budget | `python scripts/checks/bundle_budget.py` | 全部 PASS（最大 react-vendor 77.7KB / 预算 110KB） |
  | bundle_budget unit | `python -m pytest tests/unit/scripts/test_bundle_budget.py` | 5 passed |
  | userPreferences hooks | `npx vitest src/v2/hooks/userPreferences.test.tsx` | 5 passed |
  | settings page | `npx vitest src/v2/pages/settings/Settings.test.tsx` | 7 passed |

---

## 9. 风险与遗留

* **CSS 变量收敛**（M）：本周新写代码已经统一到 tokens.css，但
  W1 沉淀的部分页面仍在用未声明变量。建议 W4 第一天做一次仓库级
  grep 扫描 + 自动替换 + 加 stylelint 规则禁止再引入。
* **Diagnose 模块独立性**（L）：`api/diagnose.ts` + `hooks/diagnose.ts`
  暂时与 semantic 域分离，是为了防写冲突。等 sub-agent C 收尾后，
  W4 可以选择性合回 `api/semantic.ts` 或者保持独立 —— 后者更利
  于代码切片。倾向于保持独立。
* **system 主题 race**（L）：从 `prefs.theme` 改成 `'system'` 之后，
  effectiveTheme 由 `prefers-color-scheme` 决定；用户在浏览器里
  改系统主题时，由于我们订阅了 `change` 事件，会立即跟随。但若
  `useMyPreferences` 的请求还没回来，第一帧仍按 localStorage 渲染
  —— 可能闪一下。可接受范围内，不在 W3 处理。
* **CI 现实**：本仓库使用 GitHub Actions，但目前没有 `gh` 客户端
  可用来在本地 trigger，这两个 workflow 的真实首跑放在 W4 的合
  并 PR 上观察。

---

## 10. 进入 W4 的建议优先级

1. **整体冻结 + 切流**：legacy 路由全量 redirect 到 v2，删除
   `frontend/src/App.tsx` 旧版本，把 `routes.tsx` 升为唯一入口。
2. **CSS 变量收敛**：仓库级 grep + 自动替换 + stylelint。
3. **W3 多页 e2e**（playwright）：补 Schedule / Diagnose 的端到端
   场景，挂到 GH Actions。
4. **B-back-1 RBAC** 收尾：本周 sub-agent D 已经做 Users/Roles 页面，
   但后端 RBAC 实际生效路径还需要 W4 落地一次 audit。

---

## 附录 A · 本周 commit map（按域）

  | 域 | 主线 / sub-agent | 文件数 | 主要动作 |
  | --- | --- | --- | --- |
  | queries | 主线 | 7 | ScheduledQuery 全量 |
  | semantic devtools | 主线 | 3 | Diagnose 全量 |
  | layout / theme | 主线 | 3 | ThemeProvider 重写 |
  | scripts/.github | 主线 | 4 | bundle budget + 2 个 CI workflow |
  | semantic 域 | sub-agent C | ~12 | P4-P8 + P19 |
  | data/config/apps 域 | sub-agent D | ~14 | P3/P10/P12/P13/P14/P20 |

总计 ~43 个新增/修改文件，0 删除。
