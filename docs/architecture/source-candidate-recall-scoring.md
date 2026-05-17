---
doc_type: architecture
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-17
---

# 建模 Copilot 候选源召回与元数据打分

本文定义 Modeling Copilot 从业务问题召回候选数据源的当前方案。目标是先复用已有语义资产和本地元数据缓存，不在 Chat 主链路实时探测外部库；只有当候选源被用户确认后，才进入 spec 生成、Proposal 保存和发布链路。

## 1. 召回池

当前召回池按可信度从高到低分三层：

| 层级 | 来源 | 用途 |
| --- | --- | --- |
| 已发布语义资产 | active / published Cube、Object、Metric | 判断是否已有资产可复用，优先避免新建 |
| Dataset 元数据 | `Dataset` 的 code、name、physical_table、description | 承接已治理的数据集入口 |
| 表缓存 | `DataSourceTableCache.table_list` 的表名、标题、注释 | 兜底召回未建 Dataset 的物理表 |

召回服务只读本地缓存，遵循 KISS：不在用户每次输入时连接 MaxCompute / PostgreSQL 做实时 schema 探测；实时探测应放到“确认候选源之后”的证据补充阶段。

## 2. 打分结构

每个候选返回统一字段：

```json
{
  "id": "table:7:df_cb_258187:dwd_interaction_comment_reports_df",
  "asset_type": "table",
  "source_kind": "physical_table",
  "database": "df_cb_258187",
  "table": "dwd_interaction_comment_reports_df",
  "score": 0.92,
  "confidence": "high",
  "matched_terms": ["comment", "reports", "school", "student_comment_domain"],
  "score_breakdown": {
    "source_base": 0.42,
    "lexical_match": 0.5,
    "student_comment_domain_boost": 0.16,
    "canonical_table_boost": 0.08
  },
  "evidence": ["数据源表缓存命中，未实时连接外部库", "命中学生评论/举报事实域"]
}
```

当前总分由四类信号相加后裁剪到 `[0, 0.99]`：

| 信号 | 当前实现 | 设计意图 |
| --- | --- | --- |
| `source_base` | 语义资产 `0.45`、Dataset `0.50`、物理表 `0.42` | 保留已治理资产优先级，但不让宽泛 Dataset 永远压过强匹配事实表 |
| `lexical_match` | 业务问题 term 与名称 / 标题 / 描述 / 表名匹配，最高 `0.5` | 低成本召回，确保无 LLM 环境仍可工作 |
| domain boost | 学生评论场景命中评论 / 举报事实域加分 | 把“评论事实”与“学生答题”等相邻域拉开 |
| negative penalty | 命中答题分析、正确率、耗时等相邻域降分 | 避免 `view_student_answer_analysis` 抢占评论事实表 |

## 3. 决策门槛

候选返回后不直接发布：

| 状态 | 条件 | Copilot 行为 |
| --- | --- | --- |
| `single_high` | 只有一个候选且 `confidence=high` | 可提示用户确认，但仍保留人工确认 |
| `multiple` | 多个候选或分数接近 | 展示候选卡，要求确认来源 |
| `no_candidate` | 无候选 | 请求用户补充物理表、数据集、指标口径、分组字段或时间字段 |

发布链路继续以 Proposal Review 为门禁。候选源确认只说明“可以生成 spec”，不等于“可以发布”。

## 4. 学生评论当前规则

学生评论意图的 canonical 源是：

```text
df_cb_258187.dwd_interaction_comment_reports_df
```

必须满足：

- “查询最近 N 天学生评论数，按学校汇总”优先召回上述 DWD 事实表。
- `view_student_answer_analysis`、`student_answer`、`answer_action` 等答题分析资产只能作为低优先级噪声。
- 若历史 session 已选择错误候选，`SemanticModelingCopilotService` 会在确认阶段修复为 canonical 评论事实表，避免坏样本进入 Proposal 发布。

## 5. 后续演进

下一步不新增复杂向量检索服务，先扩充元数据质量：

1. 在表缓存或 Dataset 中补 `business_domains`、`grain`、`time_fields`、`entity_fields`、`measure_hints`。
2. 将 domain boost 从代码常量迁移为可审计 YAML profile，例如 `student_comment.yml` 定义 positive / negative tokens、canonical source 和 required fields。
3. 引入 margin gate：`top1.score - top2.score < 0.15` 时强制用户确认，不自动生成 spec。
4. 对每次确认保存 `selected_candidate_id`、`supersedes_candidate`、`score_breakdown`，用于后续召回评估。

这样符合 YAGNI：当前只解决已暴露的学生评论坏样本；等候选域扩展到订单、退款、活跃度等更多业务后，再把 domain profile 配置化。
