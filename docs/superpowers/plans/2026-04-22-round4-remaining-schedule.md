<!-- docs/superpowers/plans/2026-04-22-round4-remaining-schedule.md -->

# Round 4 · 剩余工作统一排期（2026-04-22 刷新）

> 本文只做 **排期 / 并发拉通 / 依赖可视化**。唯一的任务状态表仍在
> [2026-04-21-round4-cleanup-and-i18n.md](2026-04-21-round4-cleanup-and-i18n.md) §2，
> 任何 OPEN → DONE 的转移都改那张表；本文档自生成后不再复制状态字段。

---

## 1. 摘要（一句话）

- **已关闭 12 行**（生产稳定性 P0/P1 + T-005 闸门 + R-001-P17c API + R-002a token + R-001-OA 决策 + T-001a 抽取 + D+21 预扫）；
- **剩余 15 行** 合计约 **23 人日**；按 6 位 owner 并行跑，自然时间 **~2 周**可收口。
- 关键长链：`P04 (5d)` · `T-001c (4d)` · `P17a→b→d (4d)`；其它均为 1–2d 级短任务。

---

## 2. 剩余任务一览（按 owner 汇总）

| Owner | 人日 | 剩余任务（按执行顺序） |
| --- | ---: | --- |
| **FE-A** | 9d | R-001-P04 (5) → R-002b (1) → R-002c (1) → A-1 (2) |
| **FE-B** | 4d | R-001-P17a (1) → R-001-P17b (2) → R-001-P17d (1) |
| **FE-C** | 6d | T-001b (1) → T-001c (4) → T-001d (1) |
| **DS** | 2d | A-2 (2) |
| **TL** | 2d | D+21 真删 MR (1) → D+28 (1) ；+ T-001b 规范评审协作 |
| **infra** | 1d | T-001e (1) |
| **OnCall** | 0.5d | T-DRILL (0.5) |
| **BE** | 0d | — |

总工时 **23.5 人日**；6 位 owner 并行 → 约 **10~14 个自然日**。

---

## 3. 依赖图

```
已完成（作为输入）
  R-002a ✓ ──────────┐
  T-001a ✓ ──┐       │
  R-001-P17c ✓       │
                     │
剩余链路：           │
                     ▼
  T-001a ✓ → T-001b → T-001c ─┬─► T-001d
                              └─► T-001e
  P17c ✓   → P17a → P17b ────► P17d
  R-002a ✓ → R-002b ───────► R-002c
  R-002a ✓ → A-2
  （无上游）→ P04 / A-1 / T-DRILL / D+21 / D+28
```

- 每个 `→` 都是 **软依赖**：下游在上游首批合并后即可启动，不必等全绿。
- `D+21` 仅依赖「全仓 0 引用扫描」，预扫已证明 runtime 零引用，MR 可随时起草。
- `D+28` 依赖 v2 稳定（P04 + i18n 首批合并即视为稳定），不阻塞其它工作。

---

## 4. 波次排期（3 波，覆盖自然日 D+0 → D+14）

**原则**：每位 owner 同一时间段只跑一件事；依赖链首段先开工；"慢任务先动"（P04 / T-001c）。

### 波 1 · D+0 ~ D+5 （可立刻开工 5 条）

| 人 | 任务 | 估 | 备注 |
| --- | --- | ---: | --- |
| FE-A | **R-001-P04** ontology object edit tab | 5d | 最长单任务，立刻动；建议先写 P04 E2E（把 `test.fixme` 切成 `test.skip` 留红 spec），再实现 UI |
| FE-B | **R-001-P17a** 列表重跑按钮 → **P17b** 日志 Peek 面板 | 3d | 依次；P17c API 已合，可直接联调 |
| FE-C | **T-001b** 命名规范 spec → **T-001c** 首批 t() 替换 | 5d | T-001a summary 已产出 Top 15 文件清单；T-001b ≤1d 评审；T-001c 从 `layout/navigation.ts`(67) + `Settings.tsx`(32) + `Datasources.tsx`(32) 起步 |
| DS | **A-2** prefers-contrast: more | 2d | R-002a token 基线已落；做 dark+high-contrast 叠加主题 |
| OnCall | **T-DRILL** 本地 docker 全链路演练 | 0.5d | 跑一遍 `deploy.sh` → `health_probe` → 故意 break 触发 `rollback.sh`，留存日志 |

**波 1 末检查点（D+5）**：
- P04 进展 ≥ 60%（UI 骨架 + 校验上线，但版本对比可留波 2）
- P17a/P17b 合入、P17d 只剩去 fixme
- i18n 首批 3~5 个大文件完成 t() 替换
- A-2 合入
- T-DRILL 日志归档到 `docs/superpowers/ops/drills/`

### 波 2 · D+5 ~ D+10 （波 1 大块落地后触发 6 条）

| 人 | 任务 | 估 | 备注 |
| --- | --- | ---: | --- |
| FE-A | **R-002b** 重开 axe color-contrast + 5 页 | 1d | Datasources / Datasets / Workbench / QueryConsole / Settings |
| FE-A | **R-002c** 视觉回归 baseline 更新 | 1d | 与 R-002b 同批，更新 `tests/e2e-v2/*.spec.ts-snapshots/` |
| FE-A | **A-1** prefers-reduced-motion | 2d | 覆盖 PeekPanel / Modal / Toast / ThemeProvider 动效开关 |
| FE-B | **R-001-P17d** E2E 去 fixme | 1d | 波 1 结束即可，因 P17a/b 已合 |
| FE-C | **T-001c** 继续 + **T-001d** zh/en JSON 托底 | 3d | T-001c 收口至「硬编码中文 < 200 行」；T-001d 整理 zh.json ≥90% |
| infra | **T-001e** i18n-coverage CI gate | 1d | T-001c 首批合入后启动；阈值初设 `max_bare_chinese=200` 行，逐月收紧 |
| TL | **D+21 真删 MR** | 1d | 按预扫报告 §7 的 7 阶段走；阶段 1（shim 替代）+ 阶段 2-6 可合为 1 个 MR；CI `verify-cutover` + `verify-alembic` 全绿即合 |

**波 2 末检查点（D+10）**：
- P04 全部合入（包含版本对比 L2）
- P17 系列 fixme = 0
- R-002 三件套合入，a11y CI 绿
- A-1 / A-2 上线
- i18n：`zh.json` ≥90%、CI gate 上岗
- legacy 目录移除，`@/` alias 清理完毕

### 波 3 · D+10 ~ D+14 （收口 2 条 + 验收）

| 人 | 任务 | 估 | 备注 |
| --- | --- | ---: | --- |
| TL | **D+28** tmp/demo 清 + `platform-redesign` 归档 | 1d | 删 `tmp/platform-redesign/`、`uiv2.pen` 归档到 `docs/archive/`、master plan 打 `ARCHIVED` 标签 |
| 全员 | **Round 4 结项**：`round4-final-report.md` + 任务表 sealing | 0.5d | 按 §2.1 「Round 4 收口径检查清单」逐条勾；`rg "test\.fixme" frontend/tests/e2e-v2/` = 0 是硬门槛 |

---

## 5. 并行冲突与防撞规则

| 冲突点 | 风险 | 规则 |
| --- | --- | --- |
| `tokens.css` | R-002a 已改；R-002b/c + A-1/A-2 都会改 | **只追加不回改**：A-2 改用新变量，避免修 `--text-*` 原值；R-002c 锁定在 R-002b 合并之后 |
| `navigation.ts` | T-001c 首批 + P04 路由更新会同时改 | FE-A (P04) 先合入路由；FE-C (T-001c) 后做 `t()` 替换 |
| `ExtractionRun*` | P17a/b/d + T-001c 均可能改 | P17a/b 先合入 UI 骨架，T-001c 再追 t() 替换 |
| `playwright` snapshot | R-002c + D+21（删 legacy）都影响 | D+21 在 R-002c 合并之后再动，避免双 baseline 更新 |
| CI gate 叠加 | T-001e + D+21 阶段 1 shim 若同时上 | 两者都挂在 `verify-cutover` 之后；T-001e 设 **warning-only** 1 周，转 fail 再合 D+21 |

---

## 6. 触发条件与排斥清单（避免本轮 scope 膨胀）

**不纳入 Round 4（不拉任务行）**：

- `src/legacy/` 删除之后的 `@/*` 彻底溯源（Round 5 做）
- `i18n` 从 `zh.json` 切到 ICU MessageFormat（Round 5 做）
- 仓库级 pytest coverage 95% 达线（历史债，独立 PR 托底）
- R-001-OA 的真实施（已移交 PM-OA，冻结）
- 三个 placeholder 路由的 PRD 实装（PM-P 冻结）
- 用户偏好扩展（PM-C 冻结）

**Go/NoGo 门（TL 拍板点）**：

- **D+5**：若 P04 进度 < 50% 或 i18n 首批未合 → 降级 T-001c 目标到「Top 3 文件」，T-001d/e 推迟到波 3
- **D+10**：若 E2E 有新 fixme 未清 → 冻结 D+21 / D+28，优先 fixme 清零
- **D+14**：若任一 North Star 维度未达线 → 拆独立 PR，写进 `round4-final-report.md` 的「遗留」章

---

## 7. 日常节奏（不改变 §5 工程规范）

- **PR 标题**：`[R4] <ID>: <一句话>`
- **分支**：`r4/<id>-<slug>`
- **合入门**：`make verify-cutover`（含 `verify-alembic`）
- **每日 15 分钟对齐**：按 §2 owner 栏 stand-up，只报「昨天做的 / 今天做的 / 阻塞」
- **波次切换**：TL 在 Slack/飞书发一句 `[R4] Wave N 结束 / N+1 开启` 即可，不单开会

---

## 8. 附：剩余任务行直链

- [R-001-P04](2026-04-21-round4-cleanup-and-i18n.md#L53)
- [R-001-P17a/b/d](2026-04-21-round4-cleanup-and-i18n.md#L54)
- [R-002b / R-002c](2026-04-21-round4-cleanup-and-i18n.md#L60)
- [D+21（预扫完成，待真删 MR）](2026-04-22-d21-legacy-references-prescan.md)
- [T-001b / c / d / e](2026-04-21-round4-cleanup-and-i18n.md#L64)
- [A-1 / A-2](2026-04-21-round4-cleanup-and-i18n.md#L68)
- [D+28](2026-04-21-round4-cleanup-and-i18n.md#L70)
- [T-DRILL](2026-04-21-round4-cleanup-and-i18n.md#L51)

---

_2026-04-22：首次产出；后续状态变化请改 master plan §2，不回写本文。_
