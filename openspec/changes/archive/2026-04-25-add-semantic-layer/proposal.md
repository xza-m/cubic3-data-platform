# Change: 新增 Cube.js 风格语义层（Semantic Layer）

## Why

当前 DataAgent 知识体系依赖 14 份 Markdown 文档，指标无统一定义、JOIN 路径散落、LLM 每次现场拼写 SQL 导致口径不一致。需要一个结构化、可编译的语义层替代现有知识库，让 Agent 从"拼 SQL"升级为"构造 DSL → Compiler 编译 SQL"。

## What Changes

- **ADDED** Cube 定义体系：YAML 格式的 Cube/View/Recipe 三层语义模型，包含 Dimension、Measure、Join、Segment、Partition、Default Filter、Enum 等结构化元素
- **ADDED** Query Compiler：10 步 DSL → SQL 编译流水线，含 View Resolution、JoinGraph BFS 最短路径推导、Fan-out 对称聚合防护、分区自动注入、Time Granularity 方言转换
- **ADDED** SQLDialect 抽象：P1 仅实现 MaxComputeDialect，P2 扩展多数据源方言
- **ADDED** Query Recipe 系统：独立 YAML 的 Few-shot 示例，系统从 DSL 自动提取 Cube 引用构建反向索引，`describe_cube` 时自动注入
- **ADDED** Agent 工具集：`list_cubes`、`describe_cube`（含 Recipe 附带）、`query`（DSL 查询），保留 `execute_sql` 兜底
- **ADDED** Schema 同步检测：定时对比 YAML 定义与物理表 Schema，漂移告警
- **ADDED** 查询执行重试策略：可重试/不可重试错误分类 + 自动重试 + Agent `retriable` 标记
- **ADDED** 前端语义中心：Cube 管理列表、关系画布（P2）、开发者工具（Playground/Schema 同步/YAML 编辑器/编译调试器）
- **MODIFIED** DataAgent 工具链：从 `read_knowledge`/`describe_table`/`execute_sql` 迁移为 `list_cubes`/`describe_cube`/`query`/`execute_sql`
- **MODIFIED** System Prompt：注入 Cube 目录摘要 + 典型查询场景表 + Recipe Few-shot

## Impact

- Affected specs: `data-agent`（工具链变更）、新增 `semantic-layer`
- Affected code:
  - 新增 `app/domain/semantic/`（entities、ports、compiler、join_graph、dialects）
  - 新增 `app/infrastructure/semantic/`（yaml_*_repository、schema_inspector、cubes/views/recipes YAML）
  - 新增 `app/application/semantic/`（handlers、commands、queries）
  - 修改 `app/application/agent/`（tool_registry、prompts/templates）
  - 新增 `app/interfaces/api/v1/semantic.py`（REST API）
  - 新增 `frontend/src/pages/Semantic/`（前端页面）
  - 修改 `app/di/container.py`（SemanticContainer 注入）

## PRD Reference

详细技术设计见 [`docs/prd/semantic_layer_prd.md`](../../../docs/prd/semantic_layer_prd.md)
