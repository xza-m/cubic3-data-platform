---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-04-07
---

# ADR-009 第一阶段引入最小 Execution Compiler Preview 验证闭环

## 状态

当前有效

## 背景

如果平台在第一阶段只建设 Ontology 和 Mapper，而没有任何“可执行性预览”，就会积累大量：

- 看起来合理
- 但无法落地执行

的静态语义定义。

这会让 Phase 1 到 Phase 3 都缺乏真实闭环验证。

## 决策

平台在 Phase 1 即引入 **最小 Execution Compiler Preview**，用于：

- 根据业务指标与 Measure 引用生成伪 SQL
- 预览执行计划
- 判断语义定义是否具备落地执行可能

本阶段只做：

- compile preview
- plan preview

不做：

- 完整运行时路由
- 完整多模态执行
- 完整 Tool 编译
