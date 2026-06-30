---
quick_id: 260630-lhu
slug: avg-sum-ratio-repair
date: 2026-06-30
status: planned
---

# Quick Task 260630-lhu — AVG/比率度量自动拆分为可加分子/分母 SUM + ratio 度量

## 目标

冷启动 / repair 建模管线在生成 cube 度量时，自动把**非可加的均值/比率度量**（`type=avg` + `non_additive=True`）拆成：
- 可加的分子 SUM 度量
- 可加的分母 SUM 度量（计数/权重列）
- 同名改写为 `type=ratio` 的度量：`sql = "{分子}/NULLIF({分母},0)"`、`non_additive=False`

使「各学校的平均答题时长」这类问法按维度分组时**可答且口径正确**（加权重算 = `SUM(分子)/SUM(分母)`，跨任意维度分组数学严格），而不是 average-of-averages。

**绝不**删除 `compiler.py:482` 的 `non_additive` 守卫，**绝不**把 `non_additive` 改成 `False` 蒙混。本任务是「给非可加均值补正确的可加口径」。

## 正确性核心（设计决策）

对一个 `type=avg` 且 `non_additive` 的度量，源列 `C`（从 `AVG(\`C\`)` 解析），候选权重列 `W`：

1. **不可重算族跳过**：`C`/度量名/注释含 percentile / `p\d+` / 分位 / median / 中位数 / stddev / std / 标准差 / variance / var / 方差 / wow / mom / yoy / 环比 / 同比 → 保留 `non_additive`（拒答安全），不拆。
2. **权重列 W 高置信推断**（否则保留 `non_additive`，不乱猜）：
   - 计数列集合 CC = 名/注释命中计数语义（`_cnt`/`_count`/`cnt`/`count`/`次数`/`_num`/`_number`/`数量`/`计数`）且为数值列。
   - 选 W：与 C 共享首段名 stem 的唯一计数列；或（C 为比率类 且 CC 恰好 1 个）→ 该计数列；否则歧义 → 跳过。
3. **分子形态**：
   - `C` 为均值/比率列（名/注释含 avg/mean/平均/均值/rate/ratio/pct/percent/率/比例/百分比）→ 分子 = `SUM(\`C\` * \`W\`)`（加权；`avg*cnt`=总量、`rate*cnt`=分子事件，跨维严格）。
   - `C` 为普通可加列（无均值/比率信号，如总量列 `answer_duration`）→ 分子 = `SUM(\`C\`)`（即 `SUM(时长)/SUM(次数)`，与任务示例一致）。
4. 生成度量（已存在则复用，均 `certified=False` 避免触发 ontology-first 激活门）：
   - 分母 `sum_<W> = SUM(\`W\`)`，`type=sum`，`non_additive=False`。
   - 分子 `sum_<C>` 或 `wsum_<C>`，`type=sum`，`non_additive=False`。
   - 原度量**同名**改写：`type=ratio`、`sql="{分子}/NULLIF({分母},0)"`、`non_additive=False`，保留 title/description/format/unit/synonyms/tags。

`SUM(C*W)/NULLIF(SUM(W),0)` 在 GROUP BY 任意维度时按组重算，分子/分母都是可加 SUM，编译器天然不再被 `_validate_measure_semantics` 拦（`non_additive=False`）。

## Tasks

### Task 1 — entities + compiler 支持 ratio 度量类型
- **files**: `app/domain/semantic/entities.py`, `app/domain/semantic/compiler.py`
- **action**:
  - `MeasureDef.type` Literal 增加 `"ratio"`。
  - `compiler._resolve_measure_expr`：增加 `elif measure.type == "ratio": return raw`（sql 已是完整 `{分子}/{分母}` 表达式，经 `_resolve_measure_refs` 展开成 `SUM(..)/NULLIF(SUM(..),0)`；`_is_aggregate_expr` 已会提前返回，此分支兜底非聚合开头的展开结果）。
  - `compiler._wrap_agg`：`ratio` → 返回 expr 原样。
  - `_validate_measure_semantics`（:467-485）守卫**保持不动**。
- **verify**: `pytest tests/unit/domain/semantic/test_compiler*.py -q` 全绿；新增 ratio 编译用例。
- **done**: ratio 度量带分组维度可编译出 `SUM(..)/NULLIF(SUM(..),0) ... GROUP BY ...`，无 CompilationError。

### Task 2 — 确定性拆分 helper + 单测
- **files**: `app/application/semantic/measure_ratio_decomposition.py`（新建）, `tests/unit/application/semantic/test_measure_ratio_decomposition.py`（新建）
- **action**: 实现 `decompose_ratio_measures(measures: dict, *, columns) -> RatioDecompositionResult`，按上「正确性核心」逻辑。纯函数、确定性、对 dict 度量载荷操作（与 `MeasureDef.model_dump()` 同形）。返回新 measures dict + 每个 ratio 的元信息（measure_name / numerator / denominator / source_column / weight_column / semantic_formula）。
- **verify**: 新单测覆盖：加权(avg列)/总量(普通列)/歧义降级保留 non_additive/percentile 跳过/median·stddev 跳过/已存在分子分母复用/无计数列降级。
- **done**: 各分支断言通过；安全降级路径**不**改 non_additive。

### Task 3 — 接线冷启动 + repair + 回归
- **files**: `app/application/semantic/cube_modeling_service.py`, `app/application/semantic/modeling_spec_repair.py`, 对应测试
- **action**:
  - `cube_modeling_service`：`_build_measures_from_candidate_set` 与 `_build_measures` 构建度量后调用 helper（传列元数据：名/注释/类型）。
  - `modeling_spec_repair.repair_modeling_spec`：`_ensure_measure` 后对 `cube["measures"]` 调用 helper（列元数据来自 schema snapshot + dimensions + 度量源列）；对引用 ratio 度量的 ontology metric 设 `additivity`(非空) 与 `semantic_formula`（不触发 `metric_additivity_mismatch`，因 ratio 度量 non_additive=False）。
- **verify**: `pytest tests/unit/application/semantic tests/unit/domain/semantic -q` 回归全绿；全 semantic 单测回归。
- **done**: 冷启动/repair 产出的 cube 对均值列自动带分子/分母 SUM + ratio 度量；非可加守卫与拒答行为保留；全测试通过。

## must_haves
- truths:
  - `non_additive` 守卫 (`compiler.py:_validate_measure_semantics`) 未被删除/弱化。
  - ratio 度量 `non_additive=False` 且编译为 `SUM/NULLIF(SUM)` 加权口径。
  - 推不出权重列时保留 `non_additive`（安全拒答），不乱猜分母。
- artifacts:
  - `app/application/semantic/measure_ratio_decomposition.py`
  - ratio 类型进入 `MeasureDef` + compiler。
- key_links:
  - `app/domain/semantic/compiler.py` `_resolve_measure_expr` / `_resolve_measure_refs`
  - `app/application/semantic/cube_modeling_service.py` `_build_measures*`
  - `app/application/semantic/modeling_spec_repair.py` `repair_modeling_spec`
