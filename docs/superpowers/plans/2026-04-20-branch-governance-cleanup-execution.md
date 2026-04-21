<!-- docs/superpowers/plans/2026-04-20-branch-governance-cleanup-execution.md -->

# Branch Governance Cleanup · Execution Record (2026-04-20)

> **状态：执行中（Round 3 cutover 收口）**
> **关联 plan**：[`2026-03-30-branch-governance-cleanup.md`](./2026-03-30-branch-governance-cleanup.md)
> **触发原因**：Round 3 cutover 进入 D-1，working tree 累积 497 项变更（155 untracked + 282 R + 40 M），必须落 git history 才能 release。
> **执行人**：xuanzhiang + AI 协作
> **目标分支**：`release/round3-cutover`

---

## 0. 治理范围（最终）

执行前 `git status` 显示：

  ```text
   282 R   (W4 src/ → src/legacy/ cutover renames)
   155 ??  (Round 1-3 全部产出未 commit + 设计 scratch)
    40 M   (Round 1-3 期间被改的存量文件)
    10 D   (W4 cutover 删除而未匹配 rename 的旧文件)
     9 RM  (R + 后续修改)
     1 RD  (R + 删除)
  ```

> **关键事实**：`git log -- frontend/src/v2/` 为空 —— 整个 UIv2 重构本体 0 commits，
> 一次 `git reset --hard` 会蒸发 6 周工作。本次治理是把 Round 1-3 工作转为 git history 的唯一窗口。

---

## 1. Worktree 治理（已完成）

| Worktree | 处理 | 备注 |
| --- | --- | --- |
| `codex-ontology-workbench-cube-assisted-modeling` | ✅ 关闭 + 删分支 | HEAD `09801ef` 是 main 祖先，0 commits ahead |
| `ontology-workbench-object-aggregate` | ✅ 打 tag `archive/ontology-object-aggregate-2026-04-14` + 关闭 + 删分支 | 含 15 个 commits，frontend 33 文件 path-incompatible，backend 5 service 与 main competing impl 冲突，决策 archive 不 merge；P04/P17 fixme 留 Round 4 v2-IA-native 重写 |

详细 audit 报告见同目录 `2026-04-20-platform-redesign/round3-w6-oncall-day0-precheck.md` 注脚或本次 commit 的对话记录。

---

## 2. 已删除的 playground/QA 残留（32 个 untracked yml）

> **判定原则**：命名为 `pw_*`、`qa_domain_unique_*`、`mc___*`、`pg___*`、`mc_awdadw_*`、
> `order_NN.yml`、`pg_order_NN*.yml`、`*__revision_draft.yml` 的文件，无业务价值，
> 仅为 Playwright/QA 测试或 W2/W3 cube revision 流程残留。

### 2.1 cubes/（14 个）

  ```text
  app/infrastructure/semantic/cubes/lesson_progress__revision_draft.yml
  app/infrastructure/semantic/cubes/student__revision_draft.yml
  app/infrastructure/semantic/cubes/mc___104.yml
  app/infrastructure/semantic/cubes/mc_awdadw_337.yml
  app/infrastructure/semantic/cubes/order_01.yml
  app/infrastructure/semantic/cubes/order_02.yml
  app/infrastructure/semantic/cubes/pg___098.yml
  app/infrastructure/semantic/cubes/pg_order_01.yml
  app/infrastructure/semantic/cubes/pg_order_01_479.yml
  app/infrastructure/semantic/cubes/pg_order_01_969.yml
  app/infrastructure/semantic/cubes/qa_domain_unique_1776323951791.yml
  app/infrastructure/semantic/cubes/qa_domain_unique_1776323995924.yml
  app/infrastructure/semantic/cubes/qa_domain_unique_1776324058923.yml
  app/infrastructure/semantic/cubes/qa_domain_unique_1776324077117.yml
  ```

### 2.2 ontology/objects/（9 个）

  ```text
  app/infrastructure/ontology/objects/pw_order_object_1776153328479.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153367236.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153373949.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153399568.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153444901.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153491955.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153522071.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153548530.yml
  app/infrastructure/ontology/objects/pw_order_object_1776153638332.yml
  ```

### 2.3 ontology/metrics/（9 个）

  ```text
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153328479.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153367236.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153373949.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153399568.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153444901.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153491955.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153522071.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153548530.yml
  app/infrastructure/ontology/metrics/pw_warning_metric_1776153638332.yml
  ```

### 2.4 已加 .gitignore 防御规则（防未来再生）

见 commit `16baa38` 与本 commit 的 `.gitignore` 改动。

---

## 3. 保留并待 commit 的真实业务建模产物（cubes/ 7 个）

> 这些是 GIL 数仓真实建模产物，将在后续 commit（13 docs+真实 cube）中入库：

  ```text
  app/infrastructure/semantic/cubes/ads_bi_class_study_stats_wide_df.yml
  app/infrastructure/semantic/cubes/ads_bi_question_base_stats_df.yml
  app/infrastructure/semantic/cubes/ads_bi_question_dist_stats_df.yml
  app/infrastructure/semantic/cubes/dim_admin_class_df.yml
  app/infrastructure/semantic/cubes/dwd_question_aud_collections.yml
  app/infrastructure/semantic/cubes/dwd_study_lesson_progress_snap.yml
  app/infrastructure/semantic/cubes/view_student_answer_analysis.yml
  ```

---

## 4. 后续 commit 计划（13 个）

本次 Round 3 cutover 落 history 总共拆为 **15 个 commits**，已完成 2：

| # | 状态 | 主题 |
| --- | --- | --- |
| 1 | ✅ `16baa38` | chore(repo): tighten .gitignore |
| 2 | 🟡 当前 | chore(semantic): remove 32 playground residue + governance execution record |
| 3 | ⏳ | chore(legacy): finalize W4 src/* → src/legacy/* (282 R) |
| 4 | ⏳ | feat(backend): user preferences + roles + users CRUD (B-back-1, 2) |
| 5 | ⏳ | feat(backend): scheduled queries + diagnose runs (B-back-8, 9) |
| 6 | ⏳ | feat(backend): view materialize + datasource schema + cube derivatives (B-back-3, 5, 7) |
| 7 | ⏳ | feat(backend): app instance health + ontology object search + test connection (B-back-2, 6, 4) |
| 8 | ⏳ | feat(backend): 5 alembic migrations + DI container + middleware |
| 9 | ⏳ | feat(frontend-v2): platform redesign UI v2 (Round 1-3 W2-W4) |
| 10 | ⏳ | test: integration + unit tests for redesign tag |
| 11 | ⏳ | ci: backend/frontend CI + bundle_budget + check-v2-tokens + stylelint |
| 12 | ⏳ | feat(cutover): deploy.sh / rollback.sh / verify-cutover Make target + bundle_budget hash bug fix |
| 13 | ⏳ | docs: Round 3 W4-W6 records + cutover final report + OnCall precheck + 7 真实 cube yml |
| 14 | ⏳ | docs(plans): archive 5 historical plans + update master plan header |
| 15 | ⏳ | chore(integration): 41 个 M（修复 client/client_no_auth 之类）+ Makefile DEPRECATED 标记 |

---

## 5. 验证（commit 序列结束后）

  ```bash
  git status --short  # 期望：空
  git log --oneline release/round3-cutover ^main  # 期望：15 行
  make verify-cutover  # 期望：全绿
  ```
