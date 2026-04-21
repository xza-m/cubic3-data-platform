<!-- docs/superpowers/plans/archive/README.md -->

# Plans Archive

本目录归档**已被 Master Plan 覆盖、已完成、或决策不再单独推进**的历史计划。
归档目的：保留决策上下文与执行轨迹，避免在 `plans/` 根目录干扰当前计划检索。

> 编辑约束：归档后不再修改正文。新增脚注请用 `_archived note: ...` 在文档末尾追加。

| 文件 | 归档原因 | 后继 |
| --- | --- | --- |
| `2026-03-27-data-center-online-alignment-phase1.md` | Round 1 之前的对齐计划，已完成。 | Master Plan §3 范围拆分 |
| `2026-03-30-branch-governance-cleanup.md` | 提案版分支治理方案，被实际执行 plan 覆写。 | `../2026-04-20-branch-governance-cleanup-execution.md` |
| `2026-04-03-semantic-workbench-cube-lifecycle-implementation.md` | Round 1 期间 cube 生命周期单点计划。 | Master Plan §02-backend `B-back-3 / cube-listing-service` + `view-materialize-service` |
| `2026-04-07-semantic-workbench-visual-refresh-implementation.md` | Round 2 W1 visual 单点优化。 | Round 2 W2-W3 视觉重构（已合入 frontend/src/v2/）|
| `2026-04-14-ontology-workbench-cube-assisted-modeling-implementation.md` | Workbench cube 辅助建模 P04 子项。 | Round 4（封盘报告 §4.1 R-002 已识别）|
| `2026-04-14-ontology-workbench-object-aggregate-implementation.md` | Object aggregate P17 子项。Worktree `codex-ontology-workbench-object-aggregate` 因路径冲突未合入主分支，已通过 `archive/ontology-object-aggregate-2026-04-14` git tag 冷藏。 | Round 4 重新评估（封盘报告 §4.1 R-001）|

## 归档与回归流程

- **回归（unarchive）**：将文件 `git mv ../<file>.md`，并在 Master Plan 头部 / 当前 Round 周报里说明回归原因与 owner。
- **完全废弃**：在本 README 标记原因后保留，不删除文件，以便审计。

## 相关 spec 归档

参见 [`../../specs/archive/README.md`](../../specs/archive/README.md)。
