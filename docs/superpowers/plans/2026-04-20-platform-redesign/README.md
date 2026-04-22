<!-- docs/superpowers/plans/2026-04-20-platform-redesign/README.md -->

# platform-redesign 计划目录 · ARCHIVED

> 状态：**ARCHIVED · 2026-04-22（Round 4 · D+28）**
> 后继工作：[`../2026-04-21-round4-cleanup-and-i18n.md`](../2026-04-21-round4-cleanup-and-i18n.md)（收口与 i18n）、[`../2026-04-22-round4-remaining-schedule.md`](../2026-04-22-round4-remaining-schedule.md)（剩余排程）

## 归档原因

Round 1 → Round 3 的 v2 前端重构计划已全部进入执行报告并完成切换：

- **Round 1 – Round 3**：完整执行/验收记录见 `round1-execution-report.md`、`round2-w1-execution-report.md`、`round2-w2-execution-report.md`、`round2-w3-execution-report.md`、`round3-cutover-final-report.md`。
- **Cutover & Freeze**：见 `round3-w4-cutover-record.md`、`round3-w5-freeze-rehearsal-record.md`。
- **性能/视觉基线**：见 `round3-w5-perf-baseline-record.md`、`round3-w5-visual-baseline-record.md`。
- **发布公告**：见 `round3-w6-announcements/`。
- **D+21 legacy 删除**（2026-04-22）已完成，见 Round 4 计划 D+21 行。

## 归档后的阅读指引

1. **需要当前前端实现**：直接看 `frontend/src/v2/`，不要再回到本目录。
2. **需要 v2 设计参考**：已经内化到 `frontend/src/v2/`（组件 + 样式令牌 + 导航清单）。设计源文件 `uiv2.pen` 已归档到 `docs/archive/uiv2.pen`。
3. **需要历史背景**：本目录的 00-05 规划文档、round*-execution-report、cutover 记录保留只读，供事后溯源使用，不再修订正文。新增脚注请在各文末追加 `_archived note: ...` 格式一行。
4. **还有未完成的承接项**：去 [`../2026-04-21-round4-cleanup-and-i18n.md`](../2026-04-21-round4-cleanup-and-i18n.md) 的任务表查看 Round 4 的收口与延展项。

## 归档操作记录

- 2026-04-22：Round 4 · D+28 完成
  - `tmp/platform-redesign/` 与 `tmp/ontology-workbench-redesign/` 本地 demo 目录删除（未在 git 中）。
  - `uiv2.pen` 迁移至 `docs/archive/uiv2.pen`，`docs/readme.md`、`docs/DESIGN.md` 指向更新。
  - 本目录标记为 ARCHIVED，后续不再新增或修改正文。
