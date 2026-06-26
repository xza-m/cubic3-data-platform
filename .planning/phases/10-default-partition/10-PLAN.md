---
phase: 10-default-partition
plan: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - tests/unit/domain/semantic/test_compiler.py
autonomous: true
requirements: [CONSUME-06]
must_haves:
  truths:
    - "分区 date 型 cube 无显式过滤查询 → 当前编译输出裸 SELECT（无分区 WHERE），RED 断言此为缺陷"
    - "test_latest_partition_fallback 语义翻转：latest_expr 为空 → 应注入默认 7 天窗口（当前不注入 → 红）"
    - "RED 测试以可测时钟（today=fixed date）固定窗口字面量，断言含具体 ds 范围"
  artifacts:
    - path: tests/unit/domain/semantic/test_compiler.py
      provides: "默认分区注入 RED 测试类 TestCompilerDefaultPartitionInjection（全部失败）+ test_latest_partition_fallback 翻转后的红"
      contains: "TestCompilerDefaultPartitionInjection"
  key_links:
    - from: "RED 测试"
      to: "QueryCompiler(today=date(...))"
      via: "keyword-only 时钟注入"
      pattern: "today\\s*="
---

<objective>
Wave 1（RED）：为 Phase 10「编译器默认分区注入」立下失败断言，坐实当前缺陷——`compiler.py:204-218` 块7 只在 `cube.partition.latest_expr` 非空时注入分区谓词；对 `latest_expr=null` 的 date 型分区 cube（如 answer_records）在无显式时间过滤时短路，编译出裸 `SELECT ... FROM table`（无 WHERE 分区段），触发 MaxCompute 全表扫描保护 ODPS-0130071，DataChat 问数答不出。

本波只改测试文件，全部新增/翻转断言必须为红（GREEN 在 10-02）。

Purpose: TDD 的 RED 锚——先把「应注入默认 7 天窗口」的期望写成可执行断言，且用可测时钟固定字面量，让 Wave 2 的实现有确定性目标。
Output: `tests/unit/domain/semantic/test_compiler.py` 新增 `TestCompilerDefaultPartitionInjection` 测试类 + 翻转 `test_latest_partition_fallback`，运行时全部失败（红）。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/10-default-partition/10-CONTEXT.md

# 主改文件与测试 fixture（执行者必读，勿凭记忆）
@app/domain/semantic/compiler.py
@app/domain/semantic/dialects.py
@app/domain/semantic/entities.py
@tests/unit/domain/semantic/test_compiler.py

<interfaces>
<!-- 执行者直接用以下契约，无需再探查代码库 -->

QueryCompiler 构造签名（Wave 2 将改为，本波 RED 测试需按此调用 today）：
```python
# 当前: def __init__(self, join_graph, dialect=None)
# Wave 2 改为: def __init__(self, join_graph, dialect=None, *, today: date | None = None)
# 本波 RED 测试即按 keyword-only today 调用：QueryCompiler(graph, MaxComputeDialect(), today=date(2026, 6, 26))
# 注：Wave 2 实现前，today= 调用会 TypeError —— 这是预期的红之一。
```

PartitionDef（entities.py:67-72）：
```python
class PartitionDef(BaseModel):
    field: str
    type: Literal["date", "string"] = "date"   # 默认 date
    format: str = "yyyyMMdd"
    max_range_days: int = 90
    latest_expr: Optional[str] = None
```

MaxComputeDialect.partition_condition（dialects.py:52，四方言同形）：
```python
def partition_condition(self, field, start, end, fmt) -> str:
    return f"{field} >= '{start}' AND {field} <= '{end}'"
```

测试既有 ANSWER fixture（test_compiler.py:84-105）：
- name="answer_records", table="dwd_answer"
- partition=PartitionDef(field="answer_date", format="yyyyMMdd")  → type 默认 "date", max_range_days 默认 90
- 维度 answer_date type="string"（:89）；measures total_count 等
- 注：ANSWER 无 source_sql → 满足默认注入「date 型 + source_sql 空」条件
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 新增默认分区注入 RED 测试类（含可测时钟 + 守护 + format 兜底 + 安全锚点）</name>
  <files>tests/unit/domain/semantic/test_compiler.py</files>
  <read_first>
    - app/domain/semantic/compiler.py（块7 :204-218 当前逻辑；`compile` 组装 SQL :246-259；scoped_table_refs :261-271）
    - app/domain/semantic/dialects.py（partition_condition :52 渲染范围谓词）
    - app/infrastructure/semantic/cubes/answer_records.yml（:19-24 主验证 fixture 形态：answer_date / date / yyyyMMdd / latest_expr:null / max_range_days:90）
    - tests/unit/domain/semantic/test_compiler.py（既有 ANSWER fixture :84-105；既有断言风格；TestCompilerTimeDimension :440-492）
  </read_first>
  <behavior>
    新增测试类 `TestCompilerDefaultPartitionInjection`，全部断言以 today=date(2026, 6, 26) 固定时钟。默认窗口算法（D2）：
      win = min(7, max(part.max_range_days - 1, 1))；end = today = 20260626；start = today - (win-1)
      → ANSWER max_range_days=90 → win=7 → start=20260620, end=20260626（含两端 7 天）。
    用例（均当前红）：
      - Test A 分区 date 型无过滤注入默认窗口：QueryDSL(measures=["answer_records.total_count"]) →
        SQL 含 "answer_records.answer_date >= '20260620'" 且含 "answer_records.answer_date <= '20260626'"。
      - Test B 显式 filters 命中分区字段 → 不注入默认（守护 D3）：
        QueryDSL(measures=["answer_records.total_count"], filters=[FilterDef(dimension="answer_records.answer_date", operator="gte", values=["20260101"])]) →
        SQL 不含 ">= '20260620'"（默认窗口 start 不出现），保留用户的 "= '20260101'" / ">= '20260101'"。
      - Test C 显式 time_dimensions date_range 命中分区字段 → 不注入默认（守护 D3，防与 :150-158 重复）：
        复用 TestCompilerTimeDimension 形态（date_range=["2026-02-21","2026-02-27"]）→ SQL 含 "20260221"/"20260227"，不含默认 "20260620"。
      - Test D 非 date 型分区（type="string"）不注入：构造 string 型分区 cube → SQL 无默认窗口范围谓词、无 MAX_PT。
      - Test E source_sql 派生 cube 不注入：构造带 source_sql 的分区 date cube → SQL 无默认窗口谓词。
      - Test F latest_expr 非空仍走 MAX_PT（契约不变）：构造 partition.latest_expr="MAX_PT('t')" 的 cube →
        SQL 含 "= MAX_PT('t')"，不含默认窗口范围谓词（latest_expr 优先级高于默认）。
      - Test G 未知 format → CompilationError（D5 确定性兜底）：构造 partition.format="weird-fmt" 的 date cube，无过滤 →
        pytest.raises(CompilationError)（禁止静默产错字面量）。
      - Test H scoped_table_refs 不受注入影响（审查补正③安全锚点）：
        ANSWER 单 cube 无过滤 → result.scoped_table_refs == [{"table":"dwd_answer","alias":"answer_records","scan_anchor":"from"}]
        （即默认注入只改 where_parts，不动 scoped_table_refs）。
  </behavior>
  <action>
    在 tests/unit/domain/semantic/test_compiler.py 末尾（Dialect 测试类之前或之后均可）新增 `class TestCompilerDefaultPartitionInjection:`，按 <behavior> Test A–H 逐个写为方法。

    关键实现要点：
    1. 时钟固定：所有用例显式 `QueryCompiler(JoinGraph([...]), MaxComputeDialect(), today=date(2026, 6, 26))`。
       顶部 import `from datetime import date`（若文件未 import 则加）。
    2. 窗口字面量写死具体值（不要在测试里重算）：start_ds='20260620', end_ds='20260626'。
       断言用 `assert "answer_records.answer_date >= '20260620'" in result.sql`
       与 `assert "answer_records.answer_date <= '20260626'" in result.sql`。
    3. Test B/C 守护断言用「默认 start 字面量不出现」反证不注入：`assert "'20260620'" not in result.sql`。
    4. Test D string 分区 cube：用 `_make_cube(... partition=PartitionDef(field="ds", type="string", format="yyyyMMdd"))`，
       维度需含 ds（type="string"）；断言 `assert "'20260620'" not in result.sql` 且 `assert "MAX_PT" not in result.sql`。
    5. Test E source_sql cube：`_make_cube(...).model_copy(update={"source_sql": "SELECT * FROM t", "partition": PartitionDef(field="answer_date", type="date", format="yyyyMMdd")})`
       （注意 _make_cube 维度默认含 id；如需 answer_date 维度自行在 dims 传入），断言无默认窗口谓词。
    6. Test F latest cube：`PartitionDef(field="ds", format="yyyyMMdd", latest_expr="MAX_PT('fact_latest')")`，断言
       `assert "ds = MAX_PT('fact_latest')" in result.sql` 且 `assert "'20260620'" not in result.sql`。
    7. Test G：`PartitionDef(field="ds", type="date", format="weird-fmt")`，
       `with pytest.raises(CompilationError): compiler.compile(QueryDSL(measures=[...]))`。
    8. Test H：直接断言 scoped_table_refs 精确等于单 from 锚点列表（防注入越界改 scoped_table_refs）。

    全部用例此刻应失败（Test A/B/H 因未注入或 today= TypeError；Test D/E/F/G 视 today= 是否先 TypeError 而定）——
    本波只要确认「红」，不修 compiler。

    提交：`git add tests/unit/domain/semantic/test_compiler.py && git commit -m "test(10-01): RED 默认分区注入失败断言（含时钟/守护/format兜底/安全锚点）"`
    （遵循 CLAUDE.md：GSD 工作流内提交；commit 末尾按仓库惯例附 Co-Authored-By）。
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/domain/semantic/test_compiler.py::TestCompilerDefaultPartitionInjection 2>&1 | tail -20</automated>
  </verify>
  <done>
    TestCompilerDefaultPartitionInjection 全部用例运行且失败（RED）；grep 确认存在 `today=date(2026, 6, 26)`、`'20260620'`、`'20260626'`、`pytest.raises(CompilationError)`、`scoped_table_refs ==` 锚点断言。无任何 compiler.py 改动。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 翻转 test_latest_partition_fallback 语义为「latest_expr 空 → 注入默认 7 天窗口」</name>
  <files>tests/unit/domain/semantic/test_compiler.py</files>
  <read_first>
    - tests/unit/domain/semantic/test_compiler.py（:510-517 现有 test_latest_partition_fallback，当前断言 "MAX_PT" not in result.sql）
    - app/domain/semantic/compiler.py（块7 :204-218，确认「latest_expr 空当前不注入」为被翻转的旧契约）
    - .planning/phases/10-default-partition/10-CONTEXT.md（canonical_refs：test_latest_partition_fallback 必翻转）
  </read_first>
  <behavior>
    该用例原意「answer_records 没有 latest_expr → 不注入 MAX_PT」（断言 MAX_PT 缺失）。Phase 10 后语义为：
    「latest_expr 空的 date 型分区 cube + 无显式过滤 → 注入默认 7 天窗口范围谓词」。
    翻转后断言（today=date(2026,6,26)）：
      - 仍 `assert "MAX_PT" not in result.sql`（默认窗口走范围谓词，绝不注 MAX_PT —— 守住「非 latest 不出 MAX_PT」）；
      - 新增 `assert "answer_records.answer_date >= '20260620'" in result.sql`
        与 `assert "answer_records.answer_date <= '20260626'" in result.sql`（坐实已注入默认窗口）。
  </behavior>
  <action>
    在 test_compiler.py 内将 `test_latest_partition_fallback`（TestCompilerDerivedMeasures 内 :510-517）改造：
    1. 构造 compiler 时显式传时钟：把方法内 `compiler` 参数改为局部 `compiler = QueryCompiler(JoinGraph([ANSWER, STUDENT, SCHOOL]), MaxComputeDialect(), today=date(2026, 6, 26))`
       （或在该方法上用 today 固定时钟的局部 compiler，避免依赖 fixture 的系统今天）。
    2. 更新 docstring 为「latest_expr 空 → 注入默认 7 天窗口（非 MAX_PT）」。
    3. 断言改为 <behavior> 所列三条（MAX_PT 缺失 + 默认 start/end 字面量存在）。
    本波此用例仍应为红（compiler 尚未实现注入）。

    提交：`git add tests/unit/domain/semantic/test_compiler.py && git commit -m "test(10-01): 翻转 test_latest_partition_fallback 语义为注入默认窗口（RED）"`
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider "tests/unit/domain/semantic/test_compiler.py::TestCompilerDerivedMeasures::test_latest_partition_fallback" 2>&1 | tail -15</automated>
  </verify>
  <done>
    test_latest_partition_fallback 运行且失败（RED）；grep 确认其断言含 `'20260620'` 与 `'20260626'` 且仍含 `"MAX_PT" not in`。
  </done>
</task>

</tasks>

<verification>
- `TestCompilerDefaultPartitionInjection` 全部用例存在且当前红。
- `test_latest_partition_fallback` 翻转后红。
- 本波零 compiler.py / dialects.py / entities.py / YAML / 生产调用点改动（仅 test_compiler.py）：
  `git diff --name-only` 只列 `tests/unit/domain/semantic/test_compiler.py`。
- 注意：本波运行**整套** test_compiler.py 会出现新增红 + 既有 46 绿（既有不应被本波测试改动影响）。
</verification>

<success_criteria>
- 新测试类 8 个用例（Test A–H）+ 翻转用例均为 RED。
- 时钟以 today=date(2026,6,26) 固定，窗口字面量写死 20260620/20260626。
- 守护（B/C）、非 date/source_sql 不注入（D/E）、latest 优先（F）、未知 format 报错（G）、scoped_table_refs 安全（H）断言齐备。
- 既有 46 测试不被本波修改（除翻转的 test_latest_partition_fallback）。
</success_criteria>

<output>
完成后创建 `.planning/phases/10-default-partition/10-01-SUMMARY.md`（记录新增用例清单、固定时钟字面量、确认全红、零生产代码改动）。
</output>
