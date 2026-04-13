---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-04-07
---

# ADR-007 Semantic Mapper 只承担只读投影与一致性检测

## 状态

当前有效

## 背景

平台正在从单层的 Cube 分析语义，演进为：

- 上层 `Ontology Layer`
- 下层 `Cube Layer`

两层之间必须存在语义投影能力，但如果把中间层做成可人工长期维护的 Mapping 主定义源，会形成：

- Ontology 真相
- Mapping 真相
- Cube 真相

三套真相并存的问题。

## 决策

平台将 `Semantic Mapper` 明确定义为：

- 只读投影层
- 一致性检测层
- stale / impact 告警层

不把它定义为：

- 运行时真相源
- 人工长期维护的映射工作台
- 查询路由层
- 执行编译层

## 理由

- 避免形成第三套主定义，符合 `DRY`
- 保持业务语义与分析语义边界清晰，符合 `SOLID`
- 让投影结果可预览、可校验、可追踪，而不引入新的手工维护负担

## 结果与约束

正面结果：

- Ontology 继续作为业务语义真相源
- Cube 继续作为运行时分析真相源
- Mapping 层只承担编译与校验，不与两侧争夺主定义权

约束：

- 不新增独立 Mapping 工作台
- Mapping 只输出推荐投影、差异、一致性报告和 stale 告警
- Mapping 不直接生成最终 SQL 或 Tool 调用参数
