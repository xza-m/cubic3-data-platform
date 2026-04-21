<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-runbook-record.md -->

# Round 3 · W6.A · Day 0 Runbook 产出记录

> 主线工作流·2026-04-21
> 上游：[`round3-w5-freeze-rehearsal-record.md`](round3-w5-freeze-rehearsal-record.md)（D-7 演练 + GO/NO-GO）
> 配套：[`04-cutover-and-migration.md`](04-cutover-and-migration.md) §3 / §5 切换日 Runbook 与回滚剧本

---

## 1. 目标

W5 末完成"冻结周演练 + GO/NO-GO checklist"后，W6.A 把 Runbook 第 9 / 10 / 11 条
（runbook 演练、用户公告草稿、回滚剧本 review）的"⏳ 移交 W6.A"承诺
**全部物化为可执行脚本与可复制模板**，让 D-1 评审有齐套交付物可走查、
让 D 0 OnCall 可直接 `./scripts/cutover/deploy.sh` 起跑。

具体三件事：

1. **可执行的部署 / 回滚脚本**：deploy.sh + rollback.sh，含 dry-run、日志、退出码规约；
2. **专门的 60 s 烟雾测试**：cutover-smoke.spec.ts（6 case），覆盖 §3.2 列出的 6 条关键路径；
3. **可复制的公告模板**：站内信 / 飞书广播 / 切换中 banner / What's New 四件套，含变量占位。

---

## 2. 产出清单

  | # | 路径 | 简介 |
  | --- | --- | --- |
  | 1 | `scripts/cutover/deploy.sh` | 部署脚本：pre-flight `make verify-frontend` → `cutover-<date>` 标签 → `vite build`（无 BYPASS）→ `./scripts/rebuild-frontend.sh` → smoke `/health` + `/dashboard`。支持 `--dry-run`。退出码 0/1/2/3/4。 |
  | 2 | `scripts/cutover/rollback.sh` | 回滚脚本：自动定位最近 `cutover-*` tag → 二次确认（`--yes` 跳过）→ `git revert --no-edit` → `./scripts/rebuild-frontend.sh` → `/api/v1/health` 探测 → 时间预算（30 min）assertion。退出码同上。 |
  | 3 | `frontend/tests/e2e-v2/smoke/cutover-smoke.spec.ts` | 6 case `@smoke` spec：S01 /login · S02 /dashboard · S03 /data-center/datasources · S04 /semantic/ontology/objects · S05 /queries/my 创建入口 · S06 /semantic/ontology/metrics 试运行入口。整套 5 s 内跑完。 |
  | 4 | `frontend/package.json` 的 `e2e:smoke` script | `playwright test --config tests/e2e-v2/playwright.config.ts smoke`，给 deploy.sh / CI 一行调用入口。 |
  | 5 | `docs/.../round3-w6-announcements/01-pre-cutover-station-mail.md` | 站内信 ≤ 200 字 + 复制粘贴块（`<!-- COPY-START -->` / `<!-- COPY-END -->`）。 |
  | 6 | `docs/.../round3-w6-announcements/02-pre-cutover-feishu-broadcast.md` | 飞书 / 邮件 ≤ 600 字，含背景 / 时间窗口 / 影响 / 用户行动 / FAQ / OnCall 六段，含 `<SCREENSHOT_PLACEHOLDER_AFTER>` 截图占位。 |
  | 7 | `docs/.../round3-w6-announcements/03-cutover-in-progress-banner.md` | 切换中 banner，中英双语 1-2 句，含 `<ETA_HHMM>` 占位。 |
  | 8 | `docs/.../round3-w6-announcements/04-post-cutover-whats-new.md` | What's New ≤ 1000 字，5 bullet 焕新 + 按模块的功能改进 + 已知问题（P04 / P17）+ 反馈渠道。 |
  | 9 | 本文件 | W6.A 产出索引 + 实测记录 + 限制说明。 |

---

## 3. 使用方法（quickstart）

  > 三种典型场景的最小命令；详细 phase 划分见 §4。

### 3.1 dry-run（D-2 复演 / 任意时刻验证脚本可跑）

  ```bash
  # 跳过 git tag 与 nginx volume 切换；仍跑 verify-frontend + vite build。
  ./scripts/cutover/deploy.sh --dry-run
  ```

### 3.2 真切（D 0 切换日）

  ```bash
  # 1) 真切部署（OnCall 在维护窗口起点执行）
  ./scripts/cutover/deploy.sh

  # 2) 部署完成后立即跑专门 smoke（< 10 s）
  cd frontend && npm run e2e:smoke
  ```

### 3.3 紧急回滚（命中 §5.1 触发条件）

  ```bash
  # 自动定位最近 cutover-* 标签 + 交互确认
  ./scripts/cutover/rollback.sh

  # 或显式指定（CI / 自动化）
  ./scripts/cutover/rollback.sh --to cutover-20260428 --yes
  ```

---

## 4. Day 0 时间轴（重述 §3，用本次产出脚本路径）

  > 与 [`04-cutover-and-migration.md`](04-cutover-and-migration.md) §3 完全对齐；
  > 把"手动步骤"全部替换为本次产出的脚本路径与 npm script。

  | 阶段 | 计划耗时 | 触发动作 | 由谁 |
  | --- | --- | --- | --- |
  | T-30 | 0 min | 投放 `01-pre-cutover-station-mail.md` 复发提醒（如 T-72h 已发即跳过） | PM |
  | T-15 | 5 min | `gh workflow disable`（写入冻结） | OnCall |
  | T-10 | 12 min | `pg_dump` 备份（含 `lesson_progress`） | DBA |
  | T-5 | 0 min | 后端滚动重启（B-back-1~9 早已灰度） | Backend OnCall |
  | T 0 | 6 min | **`./scripts/cutover/deploy.sh`** —— 内含 verify-frontend / 打 cutover-`<date>` 标签 / vite build / rebuild-frontend.sh / `/health` + `/dashboard` smoke | Tech Lead |
  | T+5 | 9 min | **`cd frontend && npm run e2e:smoke`** —— 6 case `@smoke`；同时人工 3 项（暗色主题切换 / 实例 health chip / ScheduledQuery 手动 run） | FE + BE |
  | T+15 | 2 min | `gh workflow enable`（解除冻结） | OnCall |
  | T+30 | 0 min | 投放 `04-post-cutover-whats-new.md`，撤销 `03-cutover-in-progress-banner.md` | PM |
  | T+1h~T+24h | — | OnCall 持续值守，告警阈值临时收紧 | All |

  > 触发条件命中 §5.1 → **立即** `./scripts/cutover/rollback.sh`，目标 30 min 内回滚完成。

---

## 5. 验证

### 5.1 smoke spec 实测（2026-04-21 17:00 CST）

  命令：

  ```bash
  cd frontend && npx playwright test --config tests/e2e-v2/playwright.config.ts smoke --reporter=line
  ```

  Last 5 lines（去除 ANSI 控制符后）：

  ```text
  [3/6] [chromium] › tests/e2e-v2/smoke/cutover-smoke.spec.ts:53:1 › S01 /login 登录页可达 @smoke
  [4/6] [chromium] › tests/e2e-v2/smoke/cutover-smoke.spec.ts:63:1 › S02 /dashboard 加载首屏 @smoke
  [5/6] [chromium] › tests/e2e-v2/smoke/cutover-smoke.spec.ts:93:1 › S04 /semantic/ontology/objects 列表渲染 @smoke
  [6/6] [chromium] › tests/e2e-v2/smoke/cutover-smoke.spec.ts:132:1 › S06 /semantic/ontology/metrics 试运行入口 @smoke
    6 passed (5.1s)
  ```

  6 / 6 全绿，整套 5.1 s 完成（远低于 60 s 预算）。

### 5.2 脚本可执行性

  ```bash
  $ ls -l scripts/cutover/
  -rwxr-xr-x  deploy.sh
  -rwxr-xr-x  rollback.sh

  $ bash -n scripts/cutover/deploy.sh && bash -n scripts/cutover/rollback.sh
  # 退出 0：语法合法
  ```

  `--help` 在两个脚本上均能输出文件头部 usage block；`--dry-run` 在 deploy.sh 上跳过 git tag 与
  nginx 切换，仅做 verify-frontend 与 vite build，可在任意分支安全演练。

---

## 6. 已知限制

### 6.1 公告模板留有 placeholder，需 W6.B 决策填写

  以下变量在四份模板中以 `<...>` 形式保留，**必须**在 D-3 投放前由 PM / OnCall 填实：

  - `<CUTOVER_DATE>`、`<CUTOVER_TIME_WINDOW>`：切换窗口；
  - `<ETA_HHMM>`：切换中 banner 的预计完成时间；
  - `<FAQ_URL>`：04 What's New / Wiki 链接；
  - `<ONCALL_CHANNEL>`、`<TECH_LEAD_CONTACT>`、`<PM_CONTACT>`、`<TICKET_URL>`：联系方式与工单入口；
  - `<SCREENSHOT_PLACEHOLDER_AFTER>`：飞书广播中的升级后截图（建议复用 `design-baseline/dashboard.png`）。

  W6.B 视觉精修阶段会顺带 review 这些占位是否齐全，并在投放前签字。

### 6.2 S05 路径与生产代码现状不一致

  Runbook §3.2 描述路径为 `/queries/my/new`，但当前路由表仅注册了 `/queries/my` 与
  `/queries/my/:id`，`QueriesSavedCreate` 组件挂在 `/queries/saved/new`（未注册）。
  S05 妥协为"在 `/queries/my` 上断言新建按钮可见且可点"，已在 spec 注释中说明。
  W6.B 修复路由后，可把 S05 扩展为完整的 fill name → save → redirect to detail。

### 6.3 deploy.sh 的 post-check 仍假定单机 nginx + localhost:81

  与 `scripts/rebuild-frontend.sh` 一致，本期产出未抽象多环境（dev / staging / prod）。
  当部署目标拓展到 staging 时，需把 `localhost:81` 与 `docker-compose.full.yml`
  外提为参数；W6.C 平台 infra 议程上有这一项。

### 6.4 rollback.sh 不自动恢复 DB 备份

  §5.2 的"4. 后端拓展接口保留（兼容旧前端）"假设 B-back-1~9 已经向后兼容；
  rollback.sh 只翻转前端 + nginx，不去 restore `pg_dump`。如出现需要 DB 回滚的情形，
  必须人工跑 DBA runbook（不在本次产出范围）。
