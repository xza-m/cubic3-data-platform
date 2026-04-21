<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round2-w2-execution-report.md -->

# Platform Redesign · Round 2 · W2 执行报告

> 状态：**已完成**
> 报告时间：2026-04-22
> 关联计划：[Master Plan](../2026-04-20-platform-redesign-rollout-implementation.md) ·
> [01 Frontend](01-frontend-workstream.md) · [02 Backend](02-backend-workstream.md) ·
> [Round 1 报告](round1-execution-report.md) · [W1 报告](round2-w1-execution-report.md)

---

## 0. TL;DR

  | 维度 | 目标 | 实际 | 结论 |
  | --- | --- | --- | --- |
  | routes.tsx 真实接线率 | ≥ 80% | **39 / 42 = 92.9%** 真实页面，3 路由保留 Placeholder | PASS |
  | P21 用户偏好端到端 | API + hook + Settings + 主题落地 | 全部交付（5 新文件 / 6 改文件）+ 12 个新测试 | PASS |
  | P15 测试连接结果详情 | TestConnectionResult 类型扩展 + UI 消费 | 类型 + Banner + DatasourceDetail 接入 | PASS |
  | P16 数据源 schema 浏览 | API + hook + Tab UI | 三层 API + hooks + `DatasourceSchemaBrowser` 组件 | PASS |
  | CI gates | `v2-build` + `route-parity-check` 两个 job | `.github/workflows/frontend-ci.yml` 落地 | PASS |
  | tsc | 0 errors | **0 errors** | PASS |
  | vitest | all green | **98 files / 615 tests passed**（W1 → W2 净增 12 个） | PASS |
  | vite build · legacy | 通过 | 28.92s ✓（chunk warn 不阻塞） | PASS |
  | vite build · v2 | 通过 | **2.56s ✓** / dist-v2 总 380 KB raw / 113 KB gzip | PASS |
  | route_parity.py | 0 undeclared | **0 undeclared mismatches** | PASS |
  | 首屏 JS gzipped 预算 | ≤ 350 KB | v2: ~113 KB gzip（远低于预算） | PASS |

  W2 完成 **批次 1 关键缺口**（P1/P11/P15/P16/P21/P22）的前端落地，
  并把 R1 沉淀的 60+ 真实页面正式接入路由表。CI 加固完成。

---

## 1. routes.tsx 接线（w2-routes-wire）

### 1.1 起点

W1 收尾时发现：v2 已有 60+ 真实页面文件、完整 14 个 API + 13 个 hooks 模块，
但 `frontend/src/v2/routes.tsx` **几乎全部映射到 `<Placeholder />`** ——
路由结构是对的（路径已对齐 demo），但真实组件没接进来。

### 1.2 操作

派 sub-agent A（frontend-developer），交付：

  - **39 / 42 路由** 替换为 `lazy()` 真实组件（包括 ontology/cubes/views/domains/devtools/
    datasources/datasets/extraction/queries/apps/marketplace/instances/executions/
    config/channels/subscriptions/users/roles 全套）。
  - **3 路由保留 Placeholder**（无对应文件，留作 W3 任务）：
    - `/data-chat`（无 `DataChat.tsx`）
    - `/queries/visual`（无 `QueriesVisual.tsx`）
    - `/extraction/config`（`ExtractionTaskCreate.tsx` 注释路由对不上）
  - 路由意图歧义 5 处（`Workbench` vs `Overview`、`DatasetCreate` 三变体等），
    sub-agent 已逐一文档化决策路径，记录在交付回复中。

### 1.3 已识别的潜在运行时风险

  | 页面 | 风险 | 处理 |
  | --- | --- | --- |
  | `QueriesScheduled` / `QueriesScheduledDetail` | B-back-8 后端尚未实现 | 页面内部已渲染 Placeholder + blockerNote，等 W3-W4 |
  | `ontology/Objects` / `ObjectDetail` / `ObjectCreate` | B-back-6 q/field 已落地，但需运行时确认列表填充 | 待 W3 联调 |
  | `ExtractionTaskDetail` / `ExtractionRunDetail` | 后端无单项 GET，页面用列表 client-side find | 已知 workaround，注释说明 |
  | `cubes/CubeCreate` | `POST /semantic/cubes/draft-from-source` 未确认 | 待 W3 后端联调 |

---

## 2. P21 用户偏好端到端（w2-p21-prefs）

### 2.1 起点

后端 B-back-1（`/api/v1/users/me/preferences` GET/PUT）在 R1 已落地，
v2 前端 0 实现：无 API、无 hook、无 Settings 页面，主题/密度全部硬编码。

### 2.2 派 sub-agent B（frontend-developer）交付

  | 类型 | 路径 | 用途 |
  | --- | --- | --- |
  | 新建 | `frontend/src/v2/api/userPreferences.ts` | 类型 + GET/PUT 函数（含 5 字段类型） |
  | 新建 | `frontend/src/v2/hooks/userPreferences.ts` | `useMyPreferences` + `useUpdateMyPreferences`（5 min staleTime） |
  | 新建 | `frontend/src/v2/pages/settings/Settings.tsx` | 设置页：主题/landing/分页/密度 4 字段 + 保存/重置 |
  | 新建 | `frontend/src/v2/hooks/userPreferences.test.tsx` | hook 单元测试 |
  | 新建 | `frontend/src/v2/pages/settings/Settings.test.tsx` | 页面交互测试 |
  | 修改 | `routes.tsx` | `/settings` 路由 + `<DefaultLandingRedirect />` 替换 `/` 硬编码跳 dashboard |
  | 修改 | `AppShell.tsx` | 新增 `UiPreferenceContext`；读取 prefs 后 `document.documentElement.classList` 落主题（含 system 解析） |
  | 修改 | `TopBar.tsx` | 用户头像旁加 Settings 入口 |
  | 修改 | `scripts/checks/route_parity.py` | `KNOWN_V2_ONLY` 加 `/settings` |
  | 修改 | `vitest.config.ts` + `test/setup.ts` | `@v2` 别名补齐 / `matchMedia` 测试兼容 |

### 2.3 与 plan spec 的差异

  - **`list_page_size` 下限**：plan §B-back-1 写 1..200，后端实际是 `ge=5`。
    Settings 页面客户端校验已对齐为 5–200。
  - **主题策略**：`ThemeProvider`（localStorage）与 AppShell（服务端偏好）共存；
    服务端 prefs 在 `useEffect` 中直接写 root class，不经 ThemeProvider state，无冲突。
  - **`UiPreferenceContext`**：导出但表格组件本期未消费，留 TODO。

---

## 3. P15 + P16 数据源能力（w2-p15-types）

### 3.1 P15 · 测试连接结果详情

  - `frontend/src/v2/api/datasources.ts` 中 `TestConnectionResult` 类型从单一字段
    扩展为 B-back-4 完整契约：

      ```typescript
      ok / success / message / latency_ms / tested_at /
      details.{ server_version, tls } /
      error_code / error_message / hint
      ```
  - `DatasourceDetail.tsx` 测试结果 banner 重写为 `<TestResultBanner />`：
    - 成功路径：展示 `latency_ms` + `tested_at` + `server_version` + TLS 启用状态
    - 失败路径：展示 `error_code`（带 mono 样式）+ `error_message` + `hint`
    - 加 dismiss 按钮，避免成功提示长期堆叠

### 3.2 P16 · 数据源 Schema 浏览

  - `frontend/src/v2/api/datasources.ts` 新增三个函数 + 三组类型：

      ```typescript
      getDatasourceSchema(id, refresh?)              // → 数据库列表
      getDatasourceSchemaTables(id, db, refresh?)    // → 表列表
      getDatasourceSchemaTableColumns(id, db, tbl, refresh?)  // → 字段详情
      ```
    全部支持 `?refresh=1` 跳缓存。
  - `frontend/src/v2/hooks/datasources.ts` 新增 3 个 react-query hook，
    staleTime 与后端 5min 缓存对齐，`refetchOnWindowFocus: false`。
  - 新建 `frontend/src/v2/pages/data/_shared/datasource-schema-browser.tsx`：
    三栏布局（数据库 / 表 / 字段），每栏自带刷新按钮 + `fetched_at` tooltip，
    点击数据库切换表列表，点击表切换字段表格。
  - `DatasourceDetail.tsx` "结构" Tab 从 Placeholder 替换为 `<DatasourceSchemaBrowser />`。

### 3.3 影响

  - DatasourceDetail 现已是 W2 内最完整的 L3 页面：
    `Header` + `Tab(概览/结构)` + `测试连接 banner` + `结构浏览三栏`，
    完全覆盖 P15+P16 的对应能力。
  - dist-v2 中 `DatasourceDetail` chunk 13.17 KB / 3.93 KB gzip。

---

## 4. CI Gates（w2-ci-gates）

### 4.1 新增 workflow

`.github/workflows/frontend-ci.yml`，2 个 job：

  | Job | 触发 | 步骤 |
  | --- | --- | --- |
  | `v2-build` | PR 改 `frontend/**` 或 `route_parity.py` 或本工作流 | `npm ci` → `tsc --noEmit` → `vitest` → `vite build`（legacy）→ `vite build`（v2）→ 上传 `dist-v2` 工件 |
  | `route-parity-check` | 同上 | `python scripts/checks/route_parity.py --fail-on-mismatch` |

  - timeout 分别 15 / 5 分钟。
  - `dist-v2` 工件保留 7 天，便于 W3+ 视觉 diff 引用。
  - 与现有 `docs-health.yml` 完全独立，不冲突。

### 4.2 未做（留 W3）

  - **size-limit** 守门（plan §7 性能预算 350 KB）：暂以 vite build 输出做参考，
    后续把首屏 chunk gzip 体积写入 fail 条件。
  - **后端 `make coverage-backend`** 进 CI：W1 已本地通过，CI 接入留 W3。
  - **Playwright 视觉 diff**：等 W3 域 agent 完成更多页面后启动。

---

## 5. 验证

  | 命令 | 结果 |
  | --- | --- |
  | `cd frontend && npx tsc --noEmit --pretty false` | **0 errors** |
  | `cd frontend && npx vitest run --reporter=basic` | **98 files / 615 tests passed**（20.21 s） |
  | `cd frontend && npx vite build` | **✓ built in 28.92 s** |
  | `cd frontend && npx vite build --config v2.vite.config.ts --emptyOutDir` | **✓ built in 2.56 s** |
  | `python scripts/checks/route_parity.py --fail-on-mismatch` | **0 undeclared mismatches** |

### v2 build 产物

  - `dist-v2/assets/react-vendor.js` 252.21 KB / **76.85 KB gzip**
  - `dist-v2/assets/index.js` 68.69 KB / **21.83 KB gzip**
  - `dist-v2/assets/query-vendor.js` 36.29 KB / **14.66 KB gzip**
  - 首屏 ≈ react-vendor + query-vendor + index ≈ **113 KB gzip**
  - 各页面 chunk gzip ≤ 14 KB（DatasourceDetail 3.93 KB / Cubes 3.87 KB / DomainCanvas 3.60 KB）
  - 远低于 plan §7 性能预算 350 KB ✅

### route parity 现状

  ```
  🆕 v2-only allowlisted routes（17 → 18，新增 /settings）：
    - /apps/instances/:id, /config/users, /config/roles
    - /data-center/datasources/:id, /extraction-tasks/:id, /extraction/runs/:id
    - /semantic/ontology/{governance,metrics,objects,objects/:name,objects/new,relations}
    - /semantic/ontology  (index → Workbench)
    - /semantic/views/:name
    - /semantic/cubes/{new,:name,:name/edit}
    - /settings  ← W2 新增
  ```

---

## 6. 关键决策与风险

### 6.1 决策

  - **DatasourceSchemaBrowser** 用三栏 column-style 而非折叠树：
    ∵ 后端三层接口本身就是分层 lazy 加载；树会迫使 prefetch 全表；
    column 模式更贴合 IDE 习惯，也对应 demo 风格。
  - **TestResultBanner** 加 dismiss：成功路径长期堆 banner 容易遮挡 Tab，
    给一个手动收起入口；失败路径同理。
  - **`/` 跳转**：从硬编码 `/dashboard` 改为 `<DefaultLandingRedirect />`
    读取 `prefs.default_landing`。loading 期间显示原 PageLoader，避免闪屏。
  - **CI 不阻塞 main 推送**：第一版只跑 PR + manual + push to main，
    避免 W3 大量 PR 并行时被 CI 反复打断。

### 6.2 风险与处置

  | 风险 | 影响 | 处置 |
  | --- | --- | --- |
  | 17 个 v2-only 路由仍在 allowlist | 防止 cutover 时 401 / 404 漂移 | W3 联调时逐项消化（多数为 ontology / cube 子路由真实需求） |
  | `QueriesScheduled` 内嵌 placeholder | 用户访问到该路由会看到占位 | B-back-8 在 W3-W4 落地后替换；ADR-001 已 accepted |
  | DatasourceSchemaBrowser 未做虚拟化 | 数千张表的库会卡顿 | 当前后端 5min 缓存 + 字符串列表已经可控；plan §7 已规定 >500 行必须虚拟化，留 W3 巡检 |
  | sub-agent 引入的 vitest.config 改动 | `@v2` 别名 + setup 文件 | 已本地验证 615 tests pass；如出现回归，回滚单个 commit 即可 |
  | 旧 `ThemeProvider` 与新 prefs 主题双栈 | 短期共存可接受 | W3 合并为单一 source of truth，ThemeProvider 的 localStorage 改为偏好缓存 |
  | CI 无 size-limit 阈值 | bundle 漂移可能渐进发生 | 当前 113 KB gzip 远低于 350 KB 预算；W3 加阈值告警 |

---

## 7. 下一步（W3 起跑）

### 7.1 紧急（W3 W1）

1. **B-back-8 ScheduledQuery** 后端实现 + APScheduler 接线（ADR-001 已 accepted）。
   实现后 `QueriesScheduled` 系列页面解除 placeholder。
2. **B-back-9 SemanticDiagnoseRun** 历史接口；DevTools 历史 Tab 解除 placeholder。
3. **B-back-7 Cube 派生字段**（dim/measure/下游 BI 计数）—— 让 Cubes 列表卡片不再 N+1。

### 7.2 域 agent 并行（W3 W1-W2）

  以 `design-baseline/` 截图为契约，逐域消化 plan §3.2/3.3 的剩余条目：

  - **semantic-agent**：P4（字段类型校验提示）/ P5（指标公式 dry-run 预览）/
    P6（关系画布）/ P7（发布 + 历史抽屉）/ P8（view 物化历史 Tab）/ P19（全局搜索）
  - **data-agent**：P10（task 调度 cron 表单）/ P3（dataset 字段 profile）
  - **config-agent**：P12（channel 测试发送）/ P13（subscription 历史）/ P14（users + roles）
  - **apps-agent**：P20（marketplace 分类 + 搜索）

### 7.3 治理 / CI 加固（W3 末）

  - 后端 `make coverage-backend` 接入 CI（与 frontend-ci.yml 同 file 或新文件）。
  - 加 `size-limit` job：`react-vendor` + `index` gzip 超过 200 KB 失败。
  - 加 `playwright visual diff`（基于 `design-baseline/`）。
  - 评估是否把 ThemeProvider 与 `useMyPreferences` 合并（去掉 localStorage 双栈）。

---

## 附录 A · 文件改动清单

  **新建**

  - `frontend/src/v2/api/userPreferences.ts`
  - `frontend/src/v2/hooks/userPreferences.ts`
  - `frontend/src/v2/hooks/userPreferences.test.tsx`
  - `frontend/src/v2/pages/settings/Settings.tsx`
  - `frontend/src/v2/pages/settings/Settings.test.tsx`
  - `frontend/src/v2/pages/data/_shared/datasource-schema-browser.tsx`
  - `.github/workflows/frontend-ci.yml`
  - `docs/superpowers/plans/2026-04-20-platform-redesign/round2-w2-execution-report.md`（本文）

  **修改**

  - `frontend/src/v2/routes.tsx`（39 路由接线 + `/settings` + `<DefaultLandingRedirect />`）
  - `frontend/src/v2/layout/AppShell.tsx`（`UiPreferenceContext` + 主题落地）
  - `frontend/src/v2/layout/TopBar.tsx`（Settings 入口）
  - `frontend/src/v2/api/datasources.ts`（B-back-4 类型 + B-back-5 三函数）
  - `frontend/src/v2/hooks/datasources.ts`（3 个 schema hook）
  - `frontend/src/v2/pages/data/DatasourceDetail.tsx`（TestResultBanner + SchemaBrowser）
  - `frontend/vitest.config.ts`（`@v2` 别名 + setupFiles）
  - `frontend/src/v2/test/setup.ts`（`matchMedia` writable）
  - `scripts/checks/route_parity.py`（`/settings` 加入 allowlist）
  - `docs/superpowers/plans/2026-04-20-platform-redesign/route-parity-audit.md`（接线后 TL;DR 更新）
  - `docs/adr/001-scheduled-query-runner.md`（用户标记 accepted）

---

## 附录 B · 与 plan §批次 1 的对账

  | P 项 | 主题 | 状态 |
  | --- | --- | --- |
  | P1 | 应用实例 list / detail / 启停 / 编辑 | ✅ 已接线（页面 R1 落地，W2 接 routes） |
  | P11 | 语义 view 物化触发 + 状态 | ✅ R1 已实现并接线 |
  | P15 | 数据源测试连接结果详情 | ✅ W2 类型 + UI 完成 |
  | P16 | 数据源 schema 浏览 | ✅ W2 API + hook + 三栏 UI 完成 |
  | P21 | 用户偏好（主题 / landing / page_size / density） | ✅ W2 端到端完成 |
  | P22 | 应用实例 health（chip + dashboard 汇总） | ✅ R1 已实现并接线 |

  **批次 1 收口完成。**

---

> 本报告将在 W3 起跑会议上对齐。
> 任何 cutover 相关讨论请改在 [04-cutover-and-migration.md](04-cutover-and-migration.md) 跟进。
