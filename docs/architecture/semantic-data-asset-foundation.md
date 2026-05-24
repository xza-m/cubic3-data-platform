---
doc_type: architecture
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-23
---

# 语义数据资产底座架构

本文定义当前语义平台里的“数据资产底座”边界。结论是：数据资产底座只承载元数据事实层，不直接服务语义执行；语义侧通过 `AssetRef` 与 `EvidenceBundle` 读取资产引用和证据，再桥接到 Cube 工作台、Ontology-Cube Projection、本体工作台与语义治理。

## 1. 架构结论

数据资产底座不是新的语义层，也不是第二套 Cube / Ontology 真相源。

```text
外部数据源 / 表缓存 / Dataset / Profiling
  -> 数据资产底座 Metadata Facts
  -> AssetRef + EvidenceBundle
  -> Cube 工作台 / Ontology-Cube Projection / 本体工作台 / 语义治理
  -> 已发布 Cube + 已发布 Ontology + Binding + Policy
  -> Agent-ready Semantic Runtime
```

核心分工：

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| 数据资产底座 | 表、字段、分区、样例、质量摘要、血缘线索、profile 与最近快照 | 生成最终语义、替代 Cube、替代 Ontology、直接授权执行 |
| `AssetRef` | 用稳定引用表达“哪个资产、哪个字段、哪个版本或快照” | 携带完整 schema、业务口径或执行 SQL |
| `EvidenceBundle` | 聚合 schema 快照、样例、统计、召回解释、drift 结果等证据 | 充当资产模型或发布门禁状态机 |
| Cube 工作台 | 基于证据生成、校验和发布技术语义 | 直接读外部库做无边界探测 |
| Ontology-Cube Projection | 将本体业务对象、指标、关系、动作投影到 Cube / Join / Event Fact | 存储第三套语义真相 |
| 本体工作台 | 维护业务语义与发布链 | 直接消费底层字段作为执行入口 |
| 语义治理 | 汇总 drift、stale、policy、audit 问题 | 重写 schema drift detector 或绕过现有治理链 |

## 2. 边界原则

### 2.1 元数据事实层

数据资产底座的事实粒度保持在“资产与快照”：

- 资产：数据源、库表、Dataset、文件数据集、派生视图或 profiling 目标。
- 字段：物理字段名、类型、注释、枚举线索、样例值、敏感级别线索。
- 快照：schema snapshot、partition snapshot、profile summary、quality signal。
- 来源：同步批次、外部数据源、缓存更新时间、扫描任务与操作人。

这些事实可以被语义建模引用，但不能直接成为语义运行时的输入。正式查询、Agent planning 和发布校验仍以已发布 `Cube / Ontology / Binding / Policy` 为准。

### 2.2 `AssetRef`

`AssetRef` 是跨工作台共享的轻量引用，建议保持可序列化、可审计、可降级：

```json
{
  "asset_type": "table",
  "source_id": "maxcompute-prod",
  "database": "df_cb_258187",
  "name": "dwd_interaction_comment_reports_df",
  "field": "school_id",
  "snapshot_id": "schema-sync-2026-05-23T10:00:00Z",
  "qualified_name": "df_cb_258187.dwd_interaction_comment_reports_df.school_id"
}
```

约束：

- `asset_type + source_id + name` 标识资产；字段级引用再补 `field`。
- `snapshot_id` 只绑定证据版本，不改变正式语义资产版本。
- 语义发布时可以把 `AssetRef` 写入 trace / evidence，但不能用它绕过 Cube 或 Ontology 发布门禁。

### 2.3 `EvidenceBundle`

`EvidenceBundle` 是建模、投影和治理的证据容器。它可以包含：

- `asset_refs`：候选表、字段、Dataset、已有 Cube / Metric 的引用。
- `schema_snapshot`：字段名、类型、注释与同步时间。
- `sample_profile`：样例值、空值率、基数、时间范围等低风险摘要。
- `recall_evidence`：候选召回命中词、打分拆解、人工确认记录。
- `drift_evidence`：`SchemaSyncService` 输出的 drift summary 与明细。
- `projection_evidence`：`Semantic Mapper` 输出的 projection、binding 与 stale 结果。

`EvidenceBundle` 的生命周期跟随建模会话、Proposal、投影预览或治理诊断；它不是长期语义资产仓储。

## 3. 四个桥接面

### 3.1 桥接 Cube 工作台

Cube 草案进入 Modeling Copilot Proposal 链路。Cube 工作台从 `EvidenceBundle` 获取候选源和字段证据，用于生成 spec、展示 Review、补齐 trace 和发布前校验；内部 `SemanticModelDraftBuilder` 负责草案生成、校验和发布门禁材料组装。

当前约束：

- 建模 Copilot 召回阶段优先读本地语义资产、Dataset 与表缓存，不在每次用户输入时实时连接外部库。
- 用户确认候选源后，再补证据包和 schema 校验。
- 数据资产底座不直接生成 Cube、Ontology 或运行时语义真相，只提供元数据事实、`AssetRef` 与 `EvidenceBundle`。
- Modeling Copilot 生成草案时优先读取 `EvidenceBundle.schema_snapshot`；证据包缺失 schema 时，才走 datasource adapter fallback 补齐字段事实。
- 生成的 Cube 仍进入 Modeling Copilot Proposal / 内部 `SemanticModelDraftBuilder` 的 spec / validate / apply / publish 链路。

### 3.2 桥接 Ontology-Cube Projection

Ontology-Cube Projection 只做业务语义到技术语义的只读投影与一致性检查。

当前约束：

- `BusinessMetric -> Measure/Cube`、`BusinessRelation -> Join Path`、`BusinessAction -> Event Fact Cube` 的投影结果仍由现有 `Semantic Mapper` 输出。
- 数据资产底座可以为投影提供字段证据、表粒度提示和 schema snapshot，但不直接产出可执行 projection。
- stale 判断继续落在 mapper 与治理问题归一化层，不在资产底座内复制一套判断。

### 3.3 桥接本体工作台

本体工作台消费 `AssetRef` 和 `EvidenceBundle` 的方式是“解释与辅助确认”，不是“直接生成已发布业务语义”。

典型使用：

- 对象页展示候选事实表、主键线索和字段证据。
- 指标页展示 measure 绑定依据、口径确认项和 drift 风险。
- 关系页展示 join key 候选、已有 join path 与缺失字段。
- 动作页展示 event fact cube 候选和时间字段证据。

本体发布仍要通过业务语义发布校验，依赖对象必须已激活，且具备最小分析投影依据。

### 3.4 桥接语义治理

语义治理统一接收 schema drift、mapper stale、policy decision 和 audit trace。数据资产底座只提供事实与证据，不定义新的治理问题模型。

当前归一化链路：

```text
AssetSnapshot / fallback inspector
  -> AssetSnapshotSchemaInspector
  -> SchemaSyncService
  -> SyncReport / DriftItem
  -> SemanticGovernanceIssueService
  -> GovernanceIssue payload
```

## 4. Schema 漂移复用策略

Schema 漂移必须复用现有三件套，不引入第二套 drift detector：

| 组件 | 当前职责 | 数据资产底座中的用法 |
| --- | --- | --- |
| `SchemaSyncService` | 对比 Cube / View 与物理 schema，输出 `SyncReport`、`DriftItem` 和对象级 summary | 继续作为唯一 schema drift 比较器 |
| `AssetSnapshotSchemaInspector` | 将资产快照适配为 `ISchemaInspector` | 让 `SchemaSyncService` 可以读取底座快照，而不直接连接外部库 |
| `SemanticGovernanceIssueService` | 把 schema drift 与 mapper stale 归一成治理问题 | 作为治理中心的统一 issue payload 入口 |

禁止做法：

- 在数据资产底座里新增 `SchemaDriftDetector`、`AssetDriftService` 或独立 drift 规则表。
- 在前端直接比较字段数组并生成治理告警。
- 让 Ontology-Cube Projection 自己判断物理字段缺失、类型变化或新列未绑定。
- 不用定时任务绕开 `SchemaSyncService` 直接写 drift 状态；Schema 漂移统一复用 `SchemaSyncService + AssetSnapshotSchemaInspector + SemanticGovernanceIssueService`，资产页面只展示结果。

允许做法：

- 为 `AssetSnapshotSchemaInspector` 增加新的快照 shape 解析能力。
- 为 `SchemaSyncService` 增加新的 drift kind，但仍由同一个 report 输出。
- 为 `SemanticGovernanceIssueService` 增加 code mapping，使治理问题编码稳定。
- 将 `SyncReport.object_summaries` 写回 registry 或治理看板，作为工作台状态展示。

## 5. 数据流

### 5.1 建模时

```text
业务问题
  -> 候选源召回
  -> AssetRef 列表
  -> EvidenceBundle
  -> schema_snapshot 优先 / datasource adapter fallback
  -> SemanticModelDraftBuilder spec 草稿
  -> SchemaSyncService 校验
  -> Modeling Copilot Proposal Review
  -> 发布 Cube / Ontology
```

建模链路只把底座当成证据输入。发布后，正式语义运行时只消费已发布资产。

### 5.2 投影时

```text
Ontology 资产
  -> Semantic Mapper 只读投影
  -> Cube / Join / Event Fact 引用
  -> AssetRef 反查证据
  -> projection_evidence
  -> stale / binding issue
```

Projection 不能把资产底座里的字段直接当作 measure 或 join path。字段证据只能解释为什么当前投影可行或不可行。

### 5.3 治理时

```text
资产快照
  -> AssetSnapshotSchemaInspector
  -> SchemaSyncService.check_all / check_cube
  -> SyncReport
  -> SemanticGovernanceIssueService.build_payload
  -> 工作台治理问题 / 审计面板
```

这条链路符合 DRY：比较逻辑、问题编码、治理展示只保留一套。

## 6. 方案取舍

| 方案 | 说明 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| A. 资产底座直接服务语义 | 让资产模型直接生成 projection、drift 和运行时输入 | 首期看似路径短 | 形成第三套语义真相，漂移判断重复，发布门禁被绕开 | 不采用 |
| B. 资产底座只做元数据事实层 | 通过 `AssetRef + EvidenceBundle` 给语义工作台和治理链提供证据 | 复用现有 Cube / Ontology / Mapper / Governance 边界，改动面小 | 需要清晰定义证据不是资产真相 | 当前采用 |
| C. 独立治理服务重算 drift | 建一个资产治理服务统一扫描并产出 drift | 长期可扩展空间大 | 当前重复 `SchemaSyncService`，YAGNI，容易和 registry 状态冲突 | 暂不采用 |

推荐 B。等资产数量、profile 类型和治理 issue 类型显著扩展后，再评估是否把治理问题持久化抽象为独立上下文；在此之前，不拆第二套 drift detector。

## 7. 工程原则检查

- KISS：资产底座只做元数据事实层，语义链路继续使用现有内部 `SemanticModelDraftBuilder / Semantic Mapper / Execution Compiler`。
- YAGNI：不提前建设独立 drift detector、资产治理服务或第三套 projection runtime。
- SOLID：`AssetSnapshotSchemaInspector` 通过 `ISchemaInspector` 端口接入，`SchemaSyncService` 不依赖具体资产存储形态。
- DRY：schema drift 比较、mapper stale、治理 issue 编码分别保持单一入口，避免前端、资产底座和语义服务重复实现。

## 8. 当前风险与监控点

- 证据与正式资产版本错位：`EvidenceBundle` 必须记录 `snapshot_id / collected_at`，工作台展示时区分“证据时间”和“资产发布时间”。
- 快照缺失导致误判：`AssetSnapshotSchemaInspector` 找不到快照时应走 fallback inspector 或返回空结果，并在治理摘要中体现 skipped / warn，而不是伪造 ok。
- 字段级敏感信息外泄：sample/profile 只保留低风险摘要，敏感字段样例进入工作台前必须走脱敏或隐藏。
- 多入口状态不一致：Cube 工作台、本体工作台和治理面板都应消费同一份 `GovernanceIssue payload`，不要各自定义状态文案和 code。
- 历史 Proposal 复用旧证据：发布前必须重新跑 schema sync 或确认最近一次 drift 状态仍有效。

## 9. 当前完成标准

本架构视为当前态时，至少满足：

- 数据资产底座文档和代码不声明自己是语义真相源。
- `AssetRef` 只做引用，`EvidenceBundle` 只做证据。
- Schema 漂移统一走 `SchemaSyncService + AssetSnapshotSchemaInspector + SemanticGovernanceIssueService`。
- Cube 工作台、本体工作台、Projection 和治理面板的新增状态都能回溯到同一类 issue code 或 evidence source。
- 架构 README 将本文列入当前架构索引，后续改动优先更新本文而不是散落到 PRD 或计划文件。
