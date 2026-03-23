## Context

DataAgent 从 Markdown 知识库迁移到结构化语义层。PRD 已包含完整技术设计（`docs/prd/semantic_layer_prd.md`），本文仅摘要关键架构决策。

## Goals / Non-Goals

**Goals**
- 结构化元数据模型（Cube/View/Recipe YAML）
- DSL → SQL 编译（Compiler + JoinGraph + Fan-out 防护）
- Agent 工具链无缝迁移
- 前端语义中心管理界面

**Non-Goals**
- 不替代 MaxCompute SQL 引擎
- 不做实时数据流处理
- P1 不做 Canvas UI、Pre-aggregation、多数据源方言（仅接口预留）

## Decisions

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|---------|------|
| 语义定义格式 | YAML（非 JS/TS） | Cube.js 原生 JS/TS | 项目后端为 Python，YAML 更适合，且数仓团队更熟悉 |
| DSL → SQL 引擎 | 自研 Compiler + SQLGlot 辅助 | 直接用 SQLGlot | SQLGlot 不理解语义层概念（Measure 展开、Fan-out 防护），需自研编译层 |
| Recipe Cube 关联 | DSL 自动提取（方案 C） | 显式 `cube`/`cubes` 字段 | DSL 中已包含所有 Cube 引用，自动提取零维护、零不一致 |
| SQL 方言隔离 | SQLDialect 抽象 + MaxComputeDialect | 硬编码 MaxCompute | P2 扩展多数据源时仅需实现新 Dialect 子类 |
| View 与虚拟数据集 | View 物化为虚拟数据集 | 独立体系 | 复用现有数据提取管线 |
| 前端组件库 | shadcn/ui (Radix) + Tailwind | Ant Design | 与现有系统 glassmorphism 风格对齐，更灵活 |

## Risks / Trade-offs

详见 PRD 第十一章"风险与缓解"。核心风险：
- Fan-out 数据发散 → Subquery JOIN 自动防护
- MaxCompute 延迟 → 安抚话术 + 结果缓存 + P2 加速层
- LLM DSL 不准确 → Recipe Few-shot + Compiler 校验 + execute_sql 兜底

## Migration Plan

1. Phase 1 并行运行新旧两套：旧 `read_knowledge`/`execute_sql` 与新 `list_cubes`/`describe_cube`/`query` 共存
2. A/B 对比验证指标一致性
3. 确认无误后，切换默认工具集为语义层，旧知识库标记为 deprecated
4. 前端语义中心逐步替代 Markdown 维护流程

## Open Questions

- P2 加速层选型（Hologres vs StarRocks）待生产环境测试后决定
- Canvas UI 交互细节待 P2 设计迭代
