---
doc_type: adr-index
status: maintained
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-03
---

# ADR 目录

本目录保存当前仍有效的架构决策记录（ADR, Architecture Decision Record）。

## 使用规则

- 只保留仍有效、仍能指导当前实现的决策
- 失效决策不要硬删，应明确标记被替代或转入历史归档
- 新 ADR 应聚焦“为何这样做”和“带来什么约束”，不要写成实施日志

## 当前 ADR

- [ADR-001 平台主线采用 React SPA + Flask API + 分层后端 + RQ 异步任务](ADR-001-platform-baseline.md)
- [ADR-002 语义定义采用 YAML 文件仓储作为主承载](ADR-002-semantic-assets-in-yaml.md)（已被 ADR-010 在生产链路替代）
- [ADR-003 异步任务与领域事件统一基于 RQ + Redis 执行](ADR-003-rq-for-tasks-and-events.md)
- [ADR-004 语义中心采用固定的工作台页面模型，而非资源优先导航](ADR-004-semantic-workbench-page-model.md)
- [ADR-005 HTTP API 采用按业务域分组的 `/api/v1` 契约边界](ADR-005-domain-oriented-api-boundary.md)
- [ADR-006 应用中心与配置中心保持职责分离，通过实例与订阅关联](ADR-006-app-center-config-center-separation.md)
- [ADR-007 Semantic Mapper 只承担只读投影与一致性检测](ADR-007-semantic-mapper-read-only-projection.md)
- [ADR-008 BusinessMetric 采用语义公式而非执行公式](ADR-008-business-metric-semantic-formula.md)
- [ADR-009 第一阶段引入最小 Execution Compiler Preview 验证闭环](ADR-009-minimal-execution-compiler-preview.md)
- [ADR-010 生产语义资产采用 SQL Registry 作为事实源](ADR-010-semantic-sql-registry-production-source.md)
- [ADR-011 数仓查询网关与本项目执行边界](ADR-011-dw-query-gateway-execution-boundary.md)
- [ADR-012 Dataset、数据资产与查询执行边界](ADR-012-dataset-data-asset-and-query-boundary.md)
