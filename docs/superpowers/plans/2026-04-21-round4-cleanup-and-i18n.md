<!-- docs/superpowers/plans/2026-04-21-round4-cleanup-and-i18n.md -->

# Round 4 · Cleanup & I18n & Visual Polish — 单文件实施计划

> 结构：**不按时序 Sprint 分章**；以 **任务 ID 总表** 为唯一工作清单。  
> 状态：**部分任务已关闭（见 §2.1）**；其余并行/按依赖拉取。  
> 作者：UI/UX 重构小组（Round 3 收口同班底）  
> 最近更新：2026-04-22（合并为单 plan + 全任务表）  
> 上游：[Round 3 封盘报告](2026-04-20-platform-redesign/round3-cutover-final-report.md) §4 / §7 / §9

---

## 0. North Star

> 收口 Round 3 五类技术债（生产稳定性 / R-001 / R-002 / i18n / 清理），在 Round 4 末（D+30 量级）达到「无遗留 E2E fixme · 无双轨 · 真 i18n」；3 个 placeholder 路由**无 PRD 则继续占位**（Round 5 决策）。

| 维度 | 验收线 |
| --- | --- |
| 生产稳定性 | `deploy.sh` / `rebuild-frontend` / `health_probe` 链路与 Runbook 一致；能区分 502 根因 |
| E2E | `rg "test\.fixme" frontend/tests/e2e-v2/` → 0 |
| i18n | `zh.json` ≥ 90% 字面；`pages/` 硬编码中文低于阈值（见 T-001e） |
| a11y | 打开 `color-contrast` 后关键 5 页 0 严重项 |
| legacy | 删除 `frontend/src/legacy/`，`rg "from .*legacy/" src/` → 0 |
| demo / tmp | `tmp/platform-redesign/` 等按 D+28 清理或归档 |
| 性能 | bundle 预算 + Lighthouse median（见 D+7） |
| OnCall | 三脚本 + `round4-oncall-handbook.md` 可用 |

---

## 1. 原则

1. **生产与闸门优先**：`make verify-cutover` 不绿不合 main。
2. **可逆 ≥ 优雅**：删 legacy/demo 前先 grace + 0 引用扫描。
3. **不引入新业务能力**：无 PRD 的 placeholder（/extraction/config、/data-chat、/queries/visual）保持占位。

---

## 2. 任务总表（唯一清单）

**说明**：`P` = 优先级；`域` 仅便于筛选，**非**阶段 gate。`依赖` 为软约束，可并行时注明。

| ID | 域 | 任务 | P | 估 | Owner | 依赖 | 状态 | 验收要点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-002 | 生产 | `deploy.sh`：`flask db upgrade head` + `--skip-migrate` | P0 | 1d | OnCall | — | **DONE** 2026-04-21 | 见已合并实现 |
| T-003 | 生产 | `rebuild-frontend.sh`：backend 健康度 gate | P0 | 1d | OnCall | — | **DONE** 2026-04-21 | 同上 |
| T-004a | 生产 | `health_probe.sh` + nginx `/api/v1/health` 别名 + `deploy.sh` 调用 | P1 | 0.5d | OnCall | — | **DONE** 2026-04-22 | 同上 |
| T-004b | 生产 | `digest_oncall.py` 日报 | P1 | 1d | OnCall | — | **DONE** 2026-04-22 | 同上 |
| T-004c | 生产 | `incident_init.py` + incidents 目录 | P1 | 0.5d | OnCall | — | **DONE** 2026-04-22 | 同上 |
| D+14 | 生产 | 回滚窗关闭：`rollback.sh` DEPRECATED、D+14 closure、oncall 手册、告警 A1/A4 复位提醒 | P1 | 1d | OnCall | — | **DONE** 2026-04-22 | 见 closure 与手册 |
| D+7 | 生产 | LHCI `numberOfRuns:3` + stub 说明 + `lighthouse-ci-dispatch.yml` | P2 | 0.5d | infra | — | **DONE** 2026-04-22 | 同上 |
| T-DRILL | 生产 | 团队演练：本机 docker 全栈跑通 `deploy.sh` | P1 | 0.5d | OnCall | 环境 | **DONE** 2026-04-22 | `docs/superpowers/ops/drills/2026-04-22-round4-docker-stack-drill.md`；health_probe 8/8；修复两处环境缺陷（缺 `bcrypt`、nginx 变量版 `proxy_pass` 不改 URI） |
| T-005 | 闸门 | `make verify-cutover` 增强：alembic dry-run / 或 nginx 与脚本对齐文档 | P2 | 1d | infra | T-002 | **DONE** 2026-04-22 | `scripts/checks/alembic_head_guard.py` + `make verify-alembic` 接入 `verify-cutover` |
| R-001-P04 | 功能 | 本体对象编辑 Tab（校验、保存、撤销、版本对比） | L1 | 5d | FE-A | — | **DONE** 2026-04-22 | `ObjectEdit.tsx` 新路由 `/semantic/ontology/objects/:name/edit`；`updateObject` 走后端 `POST /ontology/objects` 幂等 upsert；表单 dirty 跟踪 + 字段级校验（title 必填 / 长度 / 别名）+ 撤销全部；右栏 diff 面板做"当前 vs baseline"字段对比；埋点 `ontology.object_edited`；`p04` E2E 去 fixme 全绿（校验→撤销→保存→跳回详情） |
| R-001-P17a | 功能 | 抽取 Run 列表：重跑按钮 | L1 | 1d | FE-B | P17c 接口可 mock | **DONE** 2026-04-22 | 列表行 + PeekPanel + 详情页三处均有 `重跑`；running/pending 禁用；新 Run 自动刷新并切入 Peek |
| R-001-P17b | 功能 | 抽取 Run 日志面板 / PeekPanel | L1 | 2d | FE-B | 同左 | **DONE** 2026-04-22 | `useExtractionRunLogs` + `RunLogsSection`（SQL/stack/级别过滤 + 首屏拉取） |
| R-001-P17c | 功能 | 后端：Run rerun + 日志查询 API | L1 | 2d | BE-A | — | **DONE** 2026-04-22 | `POST /extraction/runs/<id>/rerun` + `GET /…/logs`；集成测试 14 项过 |
| R-001-P17d | 测试 | E2E `p17-extraction-run-rerun` 去 fixme | L1 | 1d | FE-B | P17a–c | **DONE** 2026-04-22 | `frontend/tests/e2e-v2/p17-extraction-run-rerun.spec.ts` 打开、fixture 对齐 schema、通过 PeekPanel 触发重跑断言新 Run 出现 |
| R-001-OA | 研究 | Object Aggregate 重做 vs cherry-pick 决策文档，**不实施** | L1 | 3d | TL | — | **DONE** 2026-04-22 | `docs/superpowers/plans/2026-04-22-r001-oa-decision.md`（推荐 C1 · BE 增量 cherry-pick，FE 在 v2 原生重建；交 PM 排 PM-OA） |
| R-002a | 体验 | Design tokens 对比度（`--text-tertiary` 等） | L2 | 1d | DS | — | **DONE** 2026-04-22 | `frontend/src/v2/styles/tokens.css` WCAG AA 对齐（`--text-3/4` 调色 + `--text-tertiary/disabled` 语义别名） |
| R-002b | 体验 | 重开 axe `color-contrast` + 5 关键页 | L2 | 1d | FE-A | R-002a 可并行 | **DONE** 2026-04-22 | `tokens.css` 语义色收紧（`--accent #1956d1` / `--success #166534` / `--danger #b91c1c` / `--violet #6d28d9` / `--text-3 #626874`）；五页 a11y spec 去 `disableRules: ['color-contrast']`；10 个 distinct 违规全清；`e2e-v2-a11y` CI 注释同步更新 |
| R-002c | 体验 | 视觉回归 baseline 更新 | L2 | 1d | FE-A | R-002a/b | **DONE** 2026-04-22 | V03/V04/V05 三张 baseline 重灌；V01/V02 在 `maxDiffPixels=220` 内；全部 `@visual` 复跑绿 |
| D+21 | 清理 | 删除 `frontend/src/legacy/` + Makefile/CLAUDE/AGENTS/ESLint 双轨 | P2 | 1d | TL | 0 引用扫描 | **DONE** 2026-04-22 | `git rm -rq frontend/src/legacy`（297 文件 / 3.1MB 全删）；清理 `vite.config.ts` / `v2.vite.config.ts` / `tsconfig.json` / `vitest.config.ts` 的 `@` legacy 别名与 paths；`.eslintrc.cjs` / `stylelint.config.js` 去 `src/legacy/**` 排除；`package.json` 去 `dev:legacy` / `build:legacy` / `lint:legacy` + 冗余 `test:visual*` / `verify:platform-*` / `verify:semantic-layout` / `verify:ui` 脚本；`Makefile` 去 `test-regression*` 与 `semantic-layout` 目标；`frontend-ci.yml` 去 "Vite build · legacy" 步骤 + job 名更新；`src/main.tsx` 拆掉启动期 legacy storage 迁移（cutover 已 21d+），`main.test.tsx` 同步为 D+21 版本；`tsc` / `lint` / `lint:css` / `check:v2-tokens` / `vitest run`（489/489）全绿 |
| T-001a | i18n | `i18n-extract.mjs` | L1 | 1d | FE-C | — | **DONE** 2026-04-22 | `frontend/scripts/i18n-extract.mjs` + `npm run i18n:extract`；产出 `i18n-keys.summary.md` |
| T-001b | i18n | key 命名规范 spec | L1 | 1d | FE-C+TL | T-001a | **DONE** 2026-04-22 | `frontend/src/v2/i18n/NAMING.md`（宽松版正则 + 段数 2–4 + 历史 camelCase 兼容） |
| T-001c | i18n | 5 大模块先 `t()` 替换 | L1 | 4d | FE-C | T-001b | **DONE** 2026-04-22 | 首批：`layout/navigation.ts` + `SecondarySidebar` + `CommandPalette`；第二批滚动九批覆盖 Settings / Queries / Extraction / Datasets / Datasource / Roles / Users / Login / Marketplace / SubscriptionDetail / QueryHistory / ResourceListPage / TopBar / LeftRail / Inspector / routes / EntityFormDialog / Can / Sheet / Table / Toast / TabStrip / StatusBar / Dashboard / ViewDetail / DevTools / Metrics，以及 API 层的 mock/错误文案；`bare 1145 → 31`（剩余为 `navigation.ts` 内部常量 + 5 条 template literal 套 `t()` 的提取误报），`coverage 48% → 98.66%`；`tsc` / `vitest` 489/489 全绿 |
| T-001d | i18n | `zh.json` ≥90%；`en.json` 占位 | L2 | 1d | FE-C | T-001c | **DONE** 2026-04-22 | `i18n-populate.mjs` 一次入 629 key；`en.json` 同 key 占位；T-001e gate 校验 zh/en 键集一致 |
| T-001e | i18n | `i18n-coverage.py` + CI gate | L1 | 1d | infra | T-001c | **DONE** 2026-04-22 | `frontend/scripts/i18n-coverage.mjs` + `npm run i18n:coverage`；frontend-ci.yml v2-build job 接入；基线 `bare=1145 / coverage≥48%`，字典 key 合法性 + zh/en 对齐三重校验 |
| A-1 | 体验 | `prefers-reduced-motion` | L2 | 2d | FE-A | — | **DONE** 2026-04-22 | `tokens.css` 媒体查询 + `data-reduced-motion`；`A11yPreferencesProvider` + Settings 三态控件；单测覆盖 OS/显式两路 |
| A-2 | 体验 | `prefers-contrast: more` 主题 | L2 | 2d | DS | R-002a | **DONE** 2026-04-22 | `tokens.css` 高对比叠加（明/暗均覆盖）+ `data-contrast`；与 A-1 共用 provider |
| D+28 | 清理 | tmp demo 清 / `uiv2.pen` 归档 / platform-redesign ARCHIVED | P2 | 1d | TL | — | **DONE** 2026-04-22 | `tmp/platform-redesign/` + `tmp/ontology-workbench-redesign/` 本地 demo 目录删除；`uiv2.pen` → `docs/archive/uiv2.pen`；`docs/superpowers/plans/2026-04-20-platform-redesign/README.md` 标记 ARCHIVED；`docs/readme.md`、`docs/DESIGN.md` 指向更新 |
| PM-C | 候选 | 用户偏好扩展（暗黑/紧凑/默认页等） | — | TBD | PM | 产品数据 | **冻结** | 有数据再开 |
| PM-D | 候选 | 后端 B-back 大项（PRD 驱动） | — | TBD | PM | PRD | **冻结** | 同上 |
| PM-P | 候选 | 三 placeholder 实装 | — | TBD | PM | PRD | **冻结** | 同原则 §1.3 |
| PM-OA | 候选 | R-001-OA 实装 | — | TBD | PM | R-001-OA 报 GO | **冻结** | 见研究报告 |

**进度速览（任务数，含选做/冻结行）：** 已关闭 **全部** 执行行（Round 4 最后两项 T-001c 第二批与 D+28 于 2026-04-22 合入） + 冻结 4 行（不占用容量，等 PM 触发）。

### 2.1 Round 4 收口径检查清单（与任务独立，可并行勾选）

- [x] 生产 P0/P1 脚本与手册落地（T-002—T-004c、D+14、D+7）
- [x] T-DRILL 团队演练（见 `docs/superpowers/ops/drills/2026-04-22-round4-docker-stack-drill.md`）
- [ ] 全量 `test.fixme` 清零
- [ ] a11y + 视觉 + legacy + tmp + i18n 门槛（见上表 + North Star）
- [ ] 冻结行（PM-*) 不纳入 Round 4 强交付

---

## 3. 依赖与顺序（说明用，不拆「阶段名」）

- **P17 系列**：P17c（API）建议先于 P17a/b 的联调；P17d 最后收口。
- **R-002**：a → b/c 为常见顺序；可与 P04 并行由不同人做。
- **i18n**：T-001a → b → c → d → e；T-001e 晚于或等于 T-001c 首批合并。
- **D+21（legacy 删）**：与 `route_parity` / 全仓引用扫描通过后再动。
- **D+28**：可晚于 v2 稳定，勿与 P04 抢同一人日。

---

## 4. 风险（合并原 R-S0 / S1 / S2）

- **R4-01** 生产 `flask db upgrade` 在维护窗外风险 → 已有 `--skip-migrate`；DBA 决策。
- **R4-02** P04 涉及版本语义，或超估 → 先切片 spike，必要时加任务行不改 ID。
- **R4-03** color-contrast 引视觉回归 → token 单 PR + 全模块看一遍图。
- **R4-04** 批量 `t()` 易碎 JSX → 依 e2e + visual 双保险。

---

## 5. 工程规范

- **PR 标题**：`[R4] <ID>: 一句话`（例：`[R4] R-001-P04: ontology object edit tab`）
- **分支**：`r4/<id>-<slug>`（已废弃 `r4/sprintN/...` 命名）
- **合入**：必须通过 `make verify-cutover`（或后续 T-005 增强版，以 Makefile 为准）
- **大版本节点**：需要时可打 `r4-d21`、`r4-d28` 等**日历标签**代指 D+ 里程碑，**不等于**内部分期。

### 5.1 文档与结项

- 任务行「状态 / 验收」随 PR 更新；不另维护 sprint 子表。
- Round 4 结项时另写 `round4-final-report.md`（路径待定，可放在本文件同目录下子文件夹）。

### 5.2 日历里程碑（仅提醒，不拆 sprint）

- **D+14** 已执行（回滚窗关闭，见 D+14 行）
- **D+21** ↔ legacy 删（D+21 行）
- **D+28** ↔ tmp/demo 清理（D+28 行）

---

## 6. 决策与资源（不绑 sprint）

- [ ] 上表 **OPEN** 行是否全纳入本轮：可砍 R-001-OA 或 D+28 等到 Round 5（TL/PM 定）
- [ ] 冻结行（PM-*) 的触发条件与 Round 5 边界
- [ ] 人力：建议 FE ≥2、BE ≥1、DS/TL 穿插；与任务行 Owner 对齐即可

---

## 7. 关联

- [round3-cutover-final-report](2026-04-20-platform-redesign/round3-cutover-final-report.md) · [00-architecture](2026-04-20-platform-redesign/00-architecture.md) · [04-cutover-and-migration](2026-04-20-platform-redesign/04-cutover-and-migration.md) §7
- [adr/001-scheduled-query-runner.md](../../adr/001-scheduled-query-runner.md) · [adr/002-frontend-error-reporting.md](../../adr/002-frontend-error-reporting.md) · [adr/003-i18n-tooling.md](../../adr/003-i18n-tooling.md)
- OnCall 手册：[`round4-oncall-handbook.md`](../ops/round4-oncall-handbook.md)
- 冷藏 tag：`archive/ontology-object-aggregate-2026-04-14`（R-001-OA 研究对象）
- **剩余工作排期（2026-04-22 刷新）**：[`2026-04-22-round4-remaining-schedule.md`](2026-04-22-round4-remaining-schedule.md)
- D+21 预扫报告：[`2026-04-22-d21-legacy-references-prescan.md`](2026-04-22-d21-legacy-references-prescan.md)
- R-001-OA 决策：[`2026-04-22-r001-oa-decision.md`](2026-04-22-r001-oa-decision.md)

---

_2026-04-22：由「分 Sprint 章节」改为「单表任务制」；历史关闭任务保留在同一表以便审计。_
