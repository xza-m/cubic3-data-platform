---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-04-07
---

# ADR-008 BusinessMetric 采用语义公式而非执行公式

## 状态

当前有效

## 背景

平台引入 `Ontology Layer` 后，需要在业务语义层表达：

- GMV
- 转化率
- 活跃率
- 学习完成率

这类业务指标。

如果 `BusinessMetric` 直接持有 SQL 或执行表达式，就会与下层 `Measure / Derived Metric` 重叠，导致双写和职责混乱。

## 决策

`BusinessMetric` 只承载：

- 名称
- 描述
- 归属对象
- 语义公式 / 业务口径说明
- 语义标签
- 关联的 Measure 引用

不承载：

- SQL 公式
- DSL 公式
- Tool 执行表达式

执行公式继续保留在 `Cube Layer` 的 `Measure / Derived Metric` 中。

## 理由

- 业务语义与执行实现分离，符合 `SOLID`
- 避免在 Ontology 与 Cube 两侧重复维护同一段执行逻辑，符合 `DRY`
- 更适合 Agent、问数和知识空间消费业务指标定义
