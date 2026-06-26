---
phase: 10-default-partition
plan: "01"
subsystem: testing
tags: [semantic, compiler, partition, tdd-red, pytest, maxcompute]

# Dependency graph
requires:
  - phase: 09 (260625-ros 冷启动发布缺口修复)
    provides: schema 快照透传分区标记（is_partition + partitions），使分区 cube 能发布出真实 active snapshot
provides:
  - "TestCompilerDefaultPartitionInjection（Test A-H）失败断言锚：date 型分区 cube 无显式过滤应注入默认 7 天窗口范围谓词"
  - "翻转后的 test_latest_partition_fallback：latest_expr 空 → 注入默认窗口（而非裸 SQL）"
  - "可测时钟契约：QueryCompiler(..., today=date(...)) keyword-only 调用约定（Wave 2 须实现）"
affects: [10-02 (GREEN 实现默认分区注入), semantic-query, datachat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD-RED 立失败断言坐实缺陷，用固定时钟（today=date）写死窗口字面量，给 GREEN 确定性目标"
    - "守护断言反证法：以默认 start 字面量 '20260620' not in result.sql 反证不注入"

key-files:
  created: []
  modified:
    - tests/unit/domain/semantic/test_compiler.py

key-decisions:
  - "窗口字面量写死（start_ds=20260620, end_ds=20260626），不在测试里重算，避免测试逻辑与生产逻辑同源漂移"
  - "Test F latest_cube 维度 ds 用 string 型即可——latest_expr 非空走 MAX_PT 与分区 type 无关（块7 现行逻辑只看 latest_expr）"
  - "翻转用例改为局部固定时钟 compiler（不用 fixture），避免依赖系统今天导致 GREEN 后窗口字面量漂移"

patterns-established:
  - "可测时钟注入：所有默认窗口断言显式传 today=date(2026,6,26) 固定字面量"
  - "RED 阶段允许全部用例因 today= TypeError 先红——本波只需坐实红，断言细节由 GREEN 暴露"

requirements-completed: []  # CONSUME-06 待 Wave 2 GREEN 落地后再标记完成（RED 仅立断言，未实现功能）

# Metrics
duration: 2min
completed: 2026-06-26
---

# Phase 10 Plan 01: 编译器默认分区注入 RED 断言 Summary

**为「date 型分区 cube（latest_expr 空）无显式过滤时应注入默认最近 7 天窗口」立下 9 条失败断言（Test A-H + 翻转 fallback），全部 RED，零生产代码改动**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-26T12:57:01Z
- **Completed:** 2026-06-26T12:59:24Z
- **Tasks:** 2
- **Files modified:** 1（tests/unit/domain/semantic/test_compiler.py）

## Accomplishments
- 新增 `TestCompilerDefaultPartitionInjection`（Test A-H，8 用例）覆盖：默认注入 / 守护显式过滤（filters + time_dimensions）/ 非 date 不注 / source_sql 不注 / latest_expr 优先 MAX_PT / 未知 format raise / scoped_table_refs 安全锚点
- 翻转 `test_latest_partition_fallback` 语义：从「latest_expr 空 → 不注入」翻为「→ 注入默认 7 天窗口（仍不注 MAX_PT）」
- 固定时钟 today=date(2026,6,26)，窗口字面量写死 20260620~20260626，给 Wave 2 确定性目标
- 全套 test_compiler.py：9 failed（8 新增 + 1 翻转）, 45 passed——既有未翻转用例 0 破坏

## Task Commits

每个任务原子提交：

1. **Task 1: 新增默认分区注入 RED 测试类** - `f192c8f` (test)
2. **Task 2: 翻转 test_latest_partition_fallback 语义** - `a49242b` (test)

_TDD-RED 波：仅 test 提交，无 feat/refactor（GREEN 在 10-02）_

## Files Created/Modified
- `tests/unit/domain/semantic/test_compiler.py` - 顶部加 `from datetime import date`；末尾新增 `TestCompilerDefaultPartitionInjection`（Test A-H）；翻转 `TestCompilerDerivedMeasures.test_latest_partition_fallback`

## 用例清单（Test A-H + 翻转）

| 用例 | 场景 | 关键断言 | 当前红因 |
|---|---|---|---|
| Test A | date 分区无过滤 | `answer_records.answer_date >= '20260620'` 且 `<= '20260626'` in sql | today= TypeError（未实现注入） |
| Test B | 显式 filters 命中分区字段 | `'20260620'` not in；保留 `>= '20260101'` | today= TypeError |
| Test C | 显式 time_dimensions date_range | 含 `20260221/20260227`，不含 `'20260620'` | today= TypeError |
| Test D | string 型分区 | 不含 `'20260620'`、不含 `MAX_PT` | today= TypeError |
| Test E | source_sql 派生 cube | 不含 `'20260620'`/`'20260626'` | today= TypeError |
| Test F | latest_expr 非空 | 含 `ds = MAX_PT('fact_latest')`，不含 `'20260620'` | today= TypeError |
| Test G | 未知 format `weird-fmt` | `pytest.raises(CompilationError)` | today= TypeError |
| Test H | scoped_table_refs 安全 | `== [{table:dwd_answer, alias:answer_records, scan_anchor:from}]` | today= TypeError |
| 翻转 | latest_expr 空 fallback | `MAX_PT not in` + 含 `'20260620'`/`'20260626'` | today= TypeError |

## 固定时钟与窗口字面量

- 时钟：`QueryCompiler(graph, dialect=MaxComputeDialect(), today=date(2026, 6, 26))`
- 窗口算法（D2）：`win = min(7, max(max_range_days - 1, 1))`；ANSWER max_range_days=90 → win=7
- `end = today = 20260626`，`start = today - (win-1) = 20260620`（含两端 7 天）

## RED 证据（pytest 实际输出）

Task 1（`TestCompilerDefaultPartitionInjection`）：
```
========================= 8 failed in 0.13s =========================
FAILED ...::test_a_date_partition_no_filter_injects_default_window
FAILED ...::test_b_explicit_filter_on_partition_field_skips_default
FAILED ...::test_c_explicit_time_dimension_range_skips_default
FAILED ...::test_d_string_partition_not_injected
FAILED ...::test_e_source_sql_cube_not_injected
FAILED ...::test_f_latest_expr_still_uses_max_pt
FAILED ...::test_g_unknown_format_raises_compilation_error
FAILED ...::test_h_scoped_table_refs_unaffected_by_injection
E   TypeError: QueryCompiler.__init__() got an unexpected keyword argument 'today'
```

Task 2（翻转 fallback）：
```
========================= 1 failed in 0.08s =========================
FAILED ...::TestCompilerDerivedMeasures::test_latest_partition_fallback
E   TypeError: QueryCompiler.__init__() got an unexpected keyword argument 'today'
```

全套 test_compiler.py：
```
========================= 9 failed, 45 passed in 0.15s =========================
```

> 说明：本波全部目标用例首红因 `today=` 触发 `TypeError`（Wave 2 须先实现 keyword-only `today`）——这是计划预期红之一（PLAN <action> 第 8 点「视 today= 是否先 TypeError 而定」）。`today` 实现后将暴露真正的注入断言差异（裸 SQL 无窗口谓词 → 仍红，直到块7 注入逻辑落地）。

## Decisions Made
- 窗口字面量写死（不在测试里重算）：避免测试与生产逻辑同源，确保 RED 锚是独立期望
- Test F latest_cube 维度 ds 用 string 型：latest_expr 非空走 MAX_PT 与分区 type 无关（现行块7 :206 只判 latest_expr）
- 翻转用例用局部固定时钟 compiler 而非 fixture：避免 GREEN 后依赖系统今天导致窗口字面量漂移

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None。两任务均一次性 RED 坐实，无需 auto-fix。

## Known Stubs
None - 本波纯测试断言，无生产代码 stub。

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 2（10-02 GREEN）目标明确：
  1. `QueryCompiler.__init__` 加 keyword-only `today: date | None = None`（D4，生产调用点位置参不破坏）
  2. 块7（:204-218）扩为「latest_expr 优先 > 默认 7 天窗口 > 不注入」，仅对 date 型 + source_sql 空注入
  3. `_has_explicit_partition_filter` 守护（D3，filters/time_dimensions 命中分区字段则跳过）
  4. 未知 format → CompilationError（D5）
- 验收锚：本波 9 条 RED 全部转 GREEN，且既有 45 绿不回归
- 风险登记：`date.today()` 依赖容器 TZ（CONTEXT 审查补正③，内网单机本期接受，确认容器 TZ=+08）

## Self-Check: PASSED

- FOUND: `.planning/phases/10-default-partition/10-01-SUMMARY.md`
- FOUND: `tests/unit/domain/semantic/test_compiler.py`
- FOUND commit: `f192c8f`（Task 1）
- FOUND commit: `a49242b`（Task 2）
- FOUND markers: `TestCompilerDefaultPartitionInjection`、`today=date(2026, 6, 26)`、`'20260620'`/`'20260626'` 窗口断言、`pytest.raises(CompilationError)`、`scoped_table_refs ==` 锚点
- `git diff app/` = 空（零生产代码改动确认）

---
*Phase: 10-default-partition*
*Completed: 2026-06-26*
