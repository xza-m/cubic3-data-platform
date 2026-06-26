---
phase: 10-default-partition
plan: "02"
subsystem: semantic
tags: [semantic, compiler, partition, tdd-green, pytest, maxcompute, default-window]

# Dependency graph
requires:
  - phase: 10-01 (RED 默认分区注入失败断言)
    provides: TestCompilerDefaultPartitionInjection（Test A-H）+ 翻转 test_latest_partition_fallback + 可测时钟 today= 调用约定
provides:
  - "compiler.py 块7：latest_expr 优先 > 默认 7 天 date 窗口 > 不注入；date 型物理表 cube 无显式过滤时注入 partition_condition 范围谓词"
  - "_has_explicit_partition_filter 守护（filters/time_dimensions 命中分区字段则跳过默认注入）"
  - "_fmt_strftime 未知 format → CompilationError（确定性兜底）"
  - "QueryCompiler(..., today=date(...)) 可测时钟落地（生产位置参零破坏）"
affects: [semantic-query, datachat, semantic_query_service, preview_service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD-GREEN：单文件按 <interfaces> 契约逐处实现，9 RED 一次性转 GREEN，既有 45 零回归零断言校准"
    - "优先级链 continue 守护：latest_expr > 默认 date 窗口 > continue，分流 primary→where_parts / join→join_on_parts（沿用既有 :217-218）"
    - "方言中立默认窗口：走 dialect.partition_condition（四方言均渲染范围谓词），非 MaxCompute 绝不注 MAX_PT"

key-files:
  created: []
  modified:
    - app/domain/semantic/compiler.py

key-decisions:
  - "块7 用 _has_explicit_partition_filter（比对 (cube.name, part.field)）取代旧 has_time_range（只比 cube.name）——收紧 D3 缺口，且与 :150-158 既有 date_range 注入天然不重复"
  - "默认窗口 win=min(7, max(max_range_days-1,1))、end=today、start=today-(win-1)（含两端 7 天）；ANSWER max_range_days=90 → win=7 → 20260620~20260626"
  - "Task 2 零断言校准：既有 ANSWER fixture 用例全部经子串 in / negative 反证幸存，无需为多出 WHERE 段放宽任何断言——D1-D5 实现精准未偏离决策"

patterns-established:
  - "可测时钟注入：self._today or date.today()，生产调用点全位置参不破坏"
  - "未知 format 显式 raise 而非静默：隐性数据错误（命中空分区返 0 行）比报错更危险"

requirements-completed: [CONSUME-06]

# Metrics
duration: 2min
completed: 2026-06-26
---

# Phase 10 Plan 02: 编译器默认分区注入 GREEN Summary

**block7 扩为「latest_expr 优先 > 默认最近 7 天 date 窗口 > 不注入」：date 型物理表 cube 无显式过滤时注入方言中立的 ds 范围谓词，绕开 MaxCompute ODPS-0130071 全表扫描保护，让 DataChat 无时间口径问数真出数；9 RED 一次性转 GREEN，既有 45 零回归零断言校准**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-26T13:04:04Z
- **Completed:** 2026-06-26T13:06:06Z
- **Tasks:** 2
- **Files modified:** 1（app/domain/semantic/compiler.py）

## Accomplishments
- 块7（compiler.py）扩为优先级链：`latest_expr` 优先 > 默认 date 窗口（最近 7 天）> 不注入；只对 `part.type=="date"` 且 `cube.source_sql` 为空、且无显式分区过滤的 cube 注入。
- 默认窗口走既有 `self._dialect.partition_condition(...)`（四方言均渲染 `field >= '..' AND field <= '..'`，非 MaxCompute 绝不注 MAX_PT）。
- 新增 `_has_explicit_partition_filter`（D3 守护，filters/time_dimensions 命中分区字段则跳过）取代旧 `has_time_range`（只比 cube.name 不比 field 的缺口已收紧）。
- 新增 `_fmt_strftime`（D5，未知 format → CompilationError，禁止静默产错字面量）。
- `__init__` 加 keyword-only `today: date | None = None`（D4 可测时钟，生产位置参零破坏）。
- 整套 test_compiler.py：**54 passed**（9 RED 转 GREEN + 既有 45 零回归）。

## Task Commits

每个任务原子提交：

1. **Task 1: 实现块7 默认分区注入 + 模块常量 + _fmt_strftime + _has_explicit_partition_filter + __init__ today** - `cfbe55e` (feat)
2. **Task 2: 跑满整套 test_compiler.py + 逐条复核既有 exact/negative 断言** - 无源码/断言改动（零校准），并入本说明（plan <action> 第 4 点「若无断言需改则此步可并入说明」）

## Files Created/Modified
- `app/domain/semantic/compiler.py` — 五处改动：
  1. 顶部 import `from datetime import datetime` → `from datetime import datetime, date, timedelta`（:4）
  2. 模块级常量 `DEFAULT_PARTITION_WINDOW_DAYS = 7` + `_FMT_STRFTIME = {"yyyyMMdd": "%Y%m%d", "yyyy-MM-dd": "%Y-%m-%d"}`（:86-88，class 之上）
  3. `__init__` 加 keyword-only `*, today: date | None = None` + `self._today = today`（:93-102）
  4. 块7（旧 :204-218）整段替换为优先级链（latest_expr > 默认 date 窗口 > continue），分流 primary→where_parts / join→join_on_parts（:204-231）
  5. 新增 `_fmt_strftime`（未知 format raise）+ `_has_explicit_partition_filter`（比对 (cube.name, part.field)，覆盖 time_dimensions.date_range 与 filters.target）（:372-398）

## 块7 优先级链（落地形态）

```python
for cube in cubes.values():
    part = cube.partition
    if not part:
        continue
    if self._has_explicit_partition_filter(dsl, cube):
        continue  # D3 守护：用户已显式过滤分区字段 → 不动
    if part.latest_expr:
        condition = f"{cube.name}.{part.field} = {part.latest_expr}"   # 既有契约 MAX_PT
    elif part.type == "date" and not str(cube.source_sql or "").strip():
        today = self._today or date.today()
        win = min(DEFAULT_PARTITION_WINDOW_DAYS, max(part.max_range_days - 1, 1))
        start = today - timedelta(days=win - 1)
        fmt = self._fmt_strftime(part.format)   # 未知 format → CompilationError
        condition = self._dialect.partition_condition(
            f"{cube.name}.{part.field}", start.strftime(fmt), today.strftime(fmt), part.format
        )
    else:
        continue  # 非 date 型 / source_sql 派生 → 不注入
    if cube.name == primary.name:
        where_parts.append(condition)
    elif cube.name in join_on_parts:
        join_on_parts[cube.name].append(condition)
```

## 9 RED → GREEN 验收

| 用例 | 场景 | 结果 |
|---|---|---|
| Test A | date 分区无过滤 | 注入 `answer_date >= '20260620' AND <= '20260626'` ✅ |
| Test B | 显式 filters 命中分区字段 | 守护跳过，无 '20260620'，保留 `>= '20260101'` ✅ |
| Test C | 显式 time_dimensions date_range | 守护跳过，含 20260221/20260227，无 '20260620' ✅ |
| Test D | string 型分区 | 不注入（不含 '20260620'/MAX_PT）✅ |
| Test E | source_sql 派生 cube | 不注入（不含 '20260620'/'20260626'）✅ |
| Test F | latest_expr 非空 | 走 `ds = MAX_PT('fact_latest')`，无 '20260620' ✅ |
| Test G | 未知 format weird-fmt | raise CompilationError ✅ |
| Test H | scoped_table_refs 安全锚点 | 精确相等不受注入影响 ✅ |
| 翻转 | latest_expr 空 fallback | MAX_PT not in + 含 '20260620'/'20260626' ✅ |

## 审查补正① 逐条复核结论（既有用例默认注入影响）

跑满整套 54 用例**全绿**，零失败。逐条结论：

| 既有用例 | 是否触发默认注入 | 断言类型 | 结论 |
|---|---|---|---|
| test_single_cube_simple_count | 触发（ANSWER 无过滤，多出 answer_date 范围段） | 子串 `in` | 仍绿（不断言 WHERE 缺失） |
| test_dimension_and_measure | 触发 | 子串 `in` | 仍绿 |
| test_filter_equals/in/contains/set_notset | 触发（过滤 subject_name 非分区字段，仍注默认） | 子串 `in` | 仍绿 |
| test_segment | 触发 | 子串 `in`（answer_result=1） | 仍绿 |
| test_order_and_limit | 触发 | 子串 `in`（ORDER/DESC/LIMIT） | 仍绿 |
| test_default_filter_injected | 触发（进 WHERE） | negative（answer_result=1 not in） | 仍绿（默认段只引入 answer_date 范围谓词） |
| test_cross_cube_join | 触发 | 子串 `in`（LEFT JOIN/dim_student） | 仍绿 |
| test_scoped_table_refs_emit_from_and_join_anchors | 触发（注入只改 where_parts/join_on_parts） | 子串 `in` | 仍绿 |
| test_scoped_table_refs_single_cube_only_from_anchor | 触发 | **exact-equal** scoped_table_refs | 仍绿（注入不动 scoped_table_refs，已实证 Test H 同源） |
| test_time_dimension_with_range / test_time_granularity_* / test_time_range_exceeds_partition_limit | **不触发**（显式 date_range → _has_explicit 命中跳过；范围段实测只出现 1 次，无重复注入） | 子串 `in` / raise | 仍绿 |
| test_derived_measure_expansion | 触发（无显式过滤） | 子串 `in`（COUNT/SUM/NULLIF） | 仍绿 |
| test_helper_paths_*（含 latest_partition / non_partition_range / numeric_filter） | 部分触发 | 子串 `in` / raise | 仍绿 |

**结论：Task 2 零断言校准。** 所有既有 ANSWER fixture 用例靠子串 `in`（不断言 WHERE 缺失）或 negative 反证（默认注入只引入 answer_date 范围谓词，不引入 answer_result/MAX_PT）幸存；唯一 exact-equal（scoped_table_refs）因注入只改 where_parts/join_on_parts、不动 scoped_table_refs 而安全。D1-D5 实现精准，未为过测试偏离任何决策。

## Decisions Made
- 块7 用 `_has_explicit_partition_filter`（比 field）取代旧 `has_time_range`（只比 cube.name）——收紧 D3 缺口，且实证与 :150-158 既有 date_range 注入不重复（test_time_dimension_with_range 范围段计数=1）。
- 未知 format 显式 `raise CompilationError` 而非静默——命中空分区返 0 行的隐性数据错误比报错更危险（D5）。
- Task 2 不强行制造断言改动凑「test 提交」——零校准是 D1-D5 实现精准的正向信号，并入说明。

## Deviations from Plan

None - plan executed exactly as written. 五处改动严格按 <interfaces> 契约；dialects.py/entities.py/YAML/生产调用点零 diff。

## Issues Encountered
None。Task 1 一次性转绿（9/9），Task 2 整套 54 绿无回归无校准，无 auto-fix。

## Known Stubs
None - 块7 为真实编译逻辑，无 stub/placeholder。

## Risks Registered（容器 TZ，本期内网单机接受）
- **容器 TZ 风险**：`date.today()` 依赖系统/容器 TZ。若 docker 容器为 UTC，默认窗口「今天」可能比 MaxCompute 业务日历（+08）早一天（边界日凌晨 0-8 点窗口偏移 1 天）。内网单机本期接受。
  - **缓解**：运维侧确认 docker 容器 `TZ=Asia/Shanghai`（+08）；若为 UTC，登记为已知偏移。
  - **Deferred**：时钟时区注入 / 统一容器 TZ（见 10-CONTEXT.md Deferred）。

## 运维待办（非代码任务，执行者运维侧做，不计入本 plan 验收门）
- [ ] **真实出数**：DataChat 问「学生答题统计 总数」应绕过 ODPS-0130071，返回最近 7 天结果（非 500、非全表扫描报错）。
- [ ] **docker 复跑**：单机 Docker 全栈 `make smoke` 或核心链路冒烟不回归。
- [ ] **容器 TZ 核实**：确认 docker 容器 TZ=Asia/Shanghai(+08)；若为 UTC 登记偏移 risk。

## Deferred（本期不做，见 10-CONTEXT.md）
- `PartitionDef.default_window_days` 让建模者按 cube 覆盖窗口（本期用模块常量 7）。
- 时钟时区注入 / 统一容器 TZ。
- string 型分区安全默认策略（本期保持不注入）。
- join cube RIGHT/FULL JOIN 默认窗口进 ON 的方向性复核（本期 LEFT 正确，沿用 :217-218）。
- L1 grounding 从问题抽取时间口径（属 Phase 8.2，本期只解「无口径时给默认窗口」）。

## RED→GREEN 证据（pytest 实际计数）

Task 1 目标（TestCompilerDefaultPartitionInjection + 翻转 fallback）：
```
collected 9 items
tests/unit/domain/semantic/test_compiler.py .........              [100%]
============================== 9 passed in 0.02s ===============================
```

整套 test_compiler.py：
```
collected 54 items
tests/unit/domain/semantic/test_compiler.py ............................ [ 51%]
..........................                                               [100%]
============================== 54 passed in 0.04s ===============================
```

> 对照 Wave 1 RED 基线：`9 failed, 45 passed`（全部因 today= TypeError）→ Wave 2 GREEN：`54 passed`。

## Self-Check: PASSED

- FOUND: `.planning/phases/10-default-partition/10-02-SUMMARY.md`
- FOUND: `app/domain/semantic/compiler.py`
- FOUND commit: `cfbe55e`（Task 1 feat）
- FOUND markers: `DEFAULT_PARTITION_WINDOW_DAYS = 7`（:87）、`def _fmt_strftime`（:373）、`def _has_explicit_partition_filter`（:382）、`self._today or date.today()`（:224）、`from datetime import datetime, date, timedelta`（:4）、`partition_condition(`（:230）
- `git diff --name-only -- app/domain/semantic/dialects.py app/domain/semantic/entities.py app/infrastructure/semantic/` = 空（方言/实体/YAML 零 diff 确认）

---
*Phase: 10-default-partition*
*Completed: 2026-06-26*
