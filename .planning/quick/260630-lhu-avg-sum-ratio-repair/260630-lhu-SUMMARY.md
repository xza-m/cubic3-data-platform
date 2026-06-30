---
quick_id: 260630-lhu
slug: avg-sum-ratio-repair
date: 2026-06-30
status: completed
commits:
  - d35d497 feat(semantic): compiler 支持 ratio 度量类型
  - 67ce957 feat(semantic): 新增 AVG/比率度量确定性拆分 helper
  - 0b7d04e feat(semantic): 冷启动+repair 管线自动把 AVG 度量拆成可加 ratio
  - 932ea7f fix(semantic): 比率列拒绝自动拆分(对抗审查堵 stem 误绑分子计数静默错数)
---

# Quick Task 260630-lhu — Summary

## 做了什么

给语义平台冷启动 / repair 建模管线增加「非可加均值/比率度量自动拆成可加分子/分母 SUM + ratio 度量」的能力。让「各学校的平均答题时长」这类按维度分组的均值/比率问法**可答且口径正确**（加权重算 `SUM(分子)/SUM(分母)`，而不是 average-of-averages）。

这是 [[modeling-pipeline-batch-coldstart]] 记录的「非可加指标 route 卡点」的**正解**，与已落地的 UX 兜底（`183e9bc` router 友好反馈）互补：能拆的 → 变 ratio 真可答；推不出权重列的 → 保留 non_additive 走 UX 兜底安全拒答。

## 改动落点

| 层 | 文件 | 改动 |
|---|---|---|
| domain | `app/domain/semantic/entities.py` | `MeasureDef.type` Literal 增加 `"ratio"` |
| domain | `app/domain/semantic/compiler.py` | `_resolve_measure_expr`/`_wrap_agg` 支持 ratio（返回原样表达式，经 `_resolve_measure_refs` 展开成 `SUM/NULLIF(SUM)`）；**`_validate_measure_semantics` non_additive 守卫未动** |
| application | `app/application/semantic/measure_ratio_decomposition.py`（新） | 确定性拆分引擎 `decompose_ratio_measures` |
| application | `app/application/semantic/cube_modeling_service.py` | 两个 `_build_measures*` 构建度量后调用拆分 |
| application | `app/application/semantic/modeling_spec_repair.py` | `repair_modeling_spec` 拆 `cube.measures` + 给指向 ratio 的 metric 写 additivity/semantic_formula |

## 正确性红线（守住）

- **不删 / 不弱化** compiler 的 `non_additive` 守卫；**不把 non_additive 改 False 蒙混**。
- 拆分**确定性、不乱猜分母**。仅在「唯一同 subject-stem 计数列（W≠C）」时拆，否则保留 non_additive（安全拒答）：
  - percentile/median/stddev/variance/wow/mom/yoy → 跳过（不可由 SUM/SUM 重算）。
  - **比率列（rate/ratio/pct/率/比例/百分比）→ 一律不自动拆**（分母总体无法确定性推断，stem 会误绑分子计数）。
  - 对计数列求均值 → 跳过（权重应是行数/未知总体）。
- 分子形态二分（仅均值/总量）：源列已是 per-row 均值（avg/mean/平均/均值）→ `SUM(C*W)` 加权；源列是普通可加总量 → `SUM(C)`。两者 / `SUM(W)` 跨维严格加权重算。

## 对抗审查（review subagent）

第一轮审查抓到 1 BLOCKER + 1 HIGH：`_select_weight` 对**比率列**置信不足——`correct_rate` 的 stem 唯一命中 `correct_cnt`（分子计数）而非 `question_cnt`（分母），误绑后 `SUM(rate*correct_cnt)/SUM(correct_cnt)` 得 average-of-rates 错数（实测 0.82 vs 真值 0.50）且 `non_additive=False` 骗过守卫；以及"全局唯一计数列"弱兜底把 rate 绑到无关计数。已修复（`932ea7f`）：比率列一律拒绝自动拆 + 计数列均值跳过 + 去掉弱兜底 + W≠C，并补对抗回归测试锁定。审查确认 compiler 接线、安全降级骨架、不可重算检测、命名复用均无误。

## 验证

- 新增单测：`test_measure_ratio_decomposition.py`（11）覆盖加权/总量/歧义降级/percentile·median·stddev·wow 跳过/复用/列缺失从度量推权重/复杂 AVG 跳过。
- 新增 compiler 测：ratio 编出 `SUM(..)/NULLIF(SUM(..),0)+GROUP BY`；非可加 avg 带分组仍 `CompilationError`（守卫回归）。
- 新增冷启动测：avg+同 stem 计数列→ratio；无计数列→保留 non_additive。
- 新增 repair 端到端测：avg→ratio + metric additivity=non_additive + semantic_formula；过 ValidationMatrix 无 blocker；`CubeDefinition` 经 `QueryCompiler` 编出 `SUM(时长)/SUM(次数) GROUP BY 学校`（直接对齐任务验证意图）。
- 回归：`tests/unit` 全量 **2357 passed**。后端 lint/typecheck 为仓库未配置入口（no-op）。

## 后续（未做，超范围）

- 真实已发布 cube `dws_study_lesson_answer_stats_wide_df` 的线上重建模 + official 路由实测，需运行后端/DB，留待联调。
- 候选分类器 `MeasureSemanticsInferer._is_non_additive` 用子串匹配（`"duration"` 误命中 `"ratio"`）的既有小瑕疵——本任务 helper 已用词边界匹配规避，但分类器本身可另行收敛。
