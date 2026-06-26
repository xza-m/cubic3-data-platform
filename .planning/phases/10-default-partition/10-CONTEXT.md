# Phase 10: 编译器默认分区注入 - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** 多智能体 workflow（调研+设计+对抗审查 verdict=needs-adjustment）+ 用户拍板 7 天窗口。本节为权威决策。

<domain>
## Phase Boundary

第④道门（四道门最后一道）。编译器对**有 partition 但 latest_expr 为空**的 cube、且查询**无显式分区/时间过滤**时，注入**默认日期窗口（最近 7 天）**，绕开 MaxCompute 全表扫描保护（ODPS-0130071），让 DataChat 问数真出数。只动 `app/domain/semantic/compiler.py`（单文件）+ 测试。

**根因（实测）**：`compiler.py:204-218`（块"7. WHERE — partition latest_expr"）是全仓**唯一**"无显式时间→注入分区谓词"的落点，进入条件 `if cube.partition and cube.partition.latest_expr:`——只有静态配 latest_expr 才动作。实测 28 个分区 cube 中 **21 个 latest_expr 为空**（含答题 cube；`answer_records.yml:24` 作者注释 `latest_expr: null # 无 MAX_PT，按日期范围查`，partition field=answer_date / type=date / format=yyyyMMdd / max_range_days=90）→ 块7 短路 → 裸 `SELECT ... FROM table`（无 WHERE）→ ODPS-0130071。
</domain>

<decisions>
## Implementation Decisions（权威）

### D1 注入点 + 优先级
- 唯一落点：`compiler.py:204-218` 块7。扩为 **latest_expr 优先 > 默认日期窗口 > 不注入**。
- **不动** `:133-162`（time_dimensions date_range 注入）与 `:188-202`（filters）——因此天然不 override 用户显式过滤。

### D2 默认策略 = 最近 7 天窗口（用户拍板）
- `win = min(DEFAULT_PARTITION_WINDOW_DAYS, max(part.max_range_days - 1, 1))`，模块级 `DEFAULT_PARTITION_WINDOW_DAYS = 7`；`end = today`，`start = today - (win-1)`。
- 走既有 `self._dialect.partition_condition(f"{cube.name}.{part.field}", start_ds, end_ds, part.format)`（四方言均渲染 `field >= '..' AND field <= '..'`，**非 MaxCompute 源绝不注 MAX_PT**）。
- **只对 `part.type == "date"` 且 `cube.source_sql` 为空的 cube 注入**；非 date 型分区、source_sql 派生 cube 不注入。
- latest_expr 非空 → 走既有 `f"{cube.name}.{part.field} = {part.latest_expr}"`（保 8 个 dim cube 契约不变）。
- **产品口径变更（已拍板）**："总数"等无时间口径问数返回**最近 7 天**而非历史全量——绕开全表扫描的必然取舍；建模侧可配 latest_expr 或显式 date_range 覆盖。

### D3 守护显式过滤（不 override 用户）
- 新增 `_has_explicit_partition_filter(self, dsl, cube)`：按 **DSL 结构**（非扫 WHERE 文本）判定，filters 与 time_dimensions 任一命中 `cube.partition.field` 即返 True → 跳过默认注入：
  - time_dimensions：`any(td.date_range and self._parse_ref(td.dimension)==(cube.name, part.field) ...)`（防与 :150-158 重复注入）；
  - filters：`any(self._parse_ref(f.target)==(cube.name, part.field) ...)`（用户显式 `cube.ds gte/equals`）。
- 收紧既有 has_time_range(:207-210) 只比 cube.name 不比 field 的缺口。

### D4 可测时钟注入
- `__init__` 加 keyword-only `today: date | None = None`（生产调用点 semantic_query_service.py:157/166/168、preview_service.py:264 均传位置参 → 零改动、向后兼容）；块7 取 `today = self._today or date.today()`。
- 模块顶 import `from datetime import datetime, date, timedelta`。

### D5 未知 format 兜底（审查补正②）
- `_fmt_strftime(fmt)` 映射 `yyyyMMdd→%Y%m%d`、`yyyy-MM-dd→%Y-%m-%d`；**未识别 format → raise CompilationError**（绝不静默产错字面量命中空分区返 0 行——隐性数据错误比报错更危险）。

</decisions>

<canonical_refs>
## Canonical References

- `app/domain/semantic/compiler.py` — 块7 :204-218（主改）；`__init__` :86-94（加 today）；time_dimension date_range :150-162（守护参照，不改）；filters :188-202（不改）；`_validate_time_range` :507-529；`_parse_ref` 解析 ref。
- `app/domain/semantic/dialects.py` — `partition_condition` 各方言 :52/83/108/133（复用，渲染范围谓词）。
- `app/domain/semantic/entities.py` — `PartitionDef`（field/type/format/max_range_days/latest_expr，:67-72）；`FilterDef.target` property :217-219；`QueryDSL`/`TimeDimensionDef`。
- `app/infrastructure/semantic/cubes/answer_records.yml` :19-24（partition answer_date/date/yyyyMMdd/latest_expr:null，主验证 fixture）。
- `tests/unit/domain/semantic/test_compiler.py` — 既有 46 测试；`test_latest_partition_fallback`(:510-517) 语义必翻转；test_single_cube_simple_count/test_filter_*/test_cross_cube_join/test_scoped_table_refs_* 等会进默认注入路径。
- 生产调用点：`app/application/semantic/semantic_query_service.py:157/166/168`、`app/application/semantic_router/preview_service.py:264`（确认位置参不破坏）。

</canonical_refs>

<specifics>
## 审查补正（needs-adjustment 三项，落地必须处理）

1. **测试影响登记不全（必改）**：~10+ 现有测试用 answer_records fixture（分区 date 型），会进默认注入路径——它们当前靠子串 `in` 断言幸存（不断言 WHERE 缺失）。落地步骤必须：**跑满全套 + 逐条确认无 exact/negative 断言因多出 WHERE 段失败**；`test_scoped_table_refs_*`(:385-390) 断言 scoped_table_refs 精确相等——确认注入只改 where_parts/join_on_parts、不动 scoped_table_refs（已核对：安全）。`test_latest_partition_fallback` 断言从"latest_expr 缺失→不注入"翻转为"→注入默认窗口"。
2. **未知 format → CompilationError**（D5，确定性兜底）。
3. **容器 TZ / join cube（非阻塞，登记）**：`date.today()` 依赖系统 TZ（UTC 容器"今天"可能比 MaxCompute 业务日历 +08 早一天）——内网单机本期接受，确认容器 TZ=+08 或登记 risk；join cube 默认窗口进 ON（沿用 :217-218），LEFT JOIN 正确，RIGHT/FULL 未来复核。

后端测试命令：`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/domain/semantic/test_compiler.py`

</specifics>

<deferred>
## Deferred（本期不做）

- `PartitionDef.default_window_days` 让建模者按 cube 覆盖窗口（本期用模块常量 7）。
- 时钟支持时区注入 / 统一容器 TZ（本期硬编码系统今天 + 登记 risk）。
- string 型分区的安全默认策略（本期保持不注入）。
- L1 grounding 从问题抽取时间口径（属 Phase 8.2 / 召回准度，本期只解"无口径时给默认窗口"）。

</deferred>

---

*Phase: 10-default-partition*
*Context gathered: 2026-06-26（workflow needs-adjustment + 用户拍板 7 天窗口）*
