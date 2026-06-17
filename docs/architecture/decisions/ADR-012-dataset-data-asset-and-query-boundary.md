---
doc_type: adr
status: accepted
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-09
---

# ADR-012 固定 Dataset、数据资产与查询执行边界

## 状态

Accepted，2026-06-03 起生效。

## 背景

当前代码同时存在 `DataSource`、`Dataset`、`DataAssetTable`、表缓存、语义资产、平台查询历史和 gateway 查询遥测。它们来自不同建设阶段，分别解决过数据接入、平台 Dataset 登记、元数据发现、语义建模和生产问数的问题。

如果不固定概念边界，平台会出现三类问题：

- 同一个统计卡片在不同页面读不同事实源，例如把旧 `datasets` 表当作数据资产规模。
- 同一个“查询次数”混用本平台交互式查询历史和 `dw-query-gateway` 的生产执行遥测。
- `Dataset` 与数据资产底座互相扩张，形成两套“dataset”抽象，开发和文档都难以判断谁是事实源。

## 决策

### 核心概念

| 概念 | 当前职责 | 事实源 | 不负责 |
| --- | --- | --- | --- |
| `DataSource` | 平台登记的外部连接、连接配置、连接测试与 connector SPI 入口 | `data_sources` | 语义口径、生产查询队列、资产快照 |
| `Dataset` | 平台应用层的可查询 / 可消费抽象，可由物理表、文件或 SQL 派生；用于数据提取、DataChat、交互式查询和应用编排 | `datasets` / `dataset_fields` | 全量元数据目录、语义真相、gateway 运行态 |
| 数据资产底座 | 元数据事实层，记录表、字段、快照、画像、血缘、使用和质量证据 | `data_asset_*` | 新建第二套 Dataset、直接执行查询、发布 Cube / Ontology |
| `AssetRef` / `EvidenceBundle` | 数据资产底座对外提供的引用和证据容器 | 由数据资产服务构造 | 权限容器、查询作用域、长期语义资产仓储 |
| 语义资产 | 已发布 `Ontology / Cube / Binding / Policy` 和 runtime snapshot，服务 Agent-first 语义规划 | SQL Registry / Release / Runtime Snapshot | 原始元数据扫描、异构连接执行 |
| 平台查询历史 | SQL Lab、查询工作台等交互式 connector 查询历史 | `query_histories` | 生产 Agent 问数执行事实 |
| gateway 查询遥测 | 正式用户 / Agent 数仓查询的执行事实、队列、结果和稳定性 | `dw-query-gateway` telemetry / query events | 业务语义解释、平台角色和策略计算 |

`Dataset` 是平台应用层资源；数据资产底座可以引用 `Dataset`，也可以把 `Dataset` 纳入 `AssetRef` 和证据包，但不得把自己升级为第二套 Dataset 生命周期。

### 查询路径

正式 Agent 问数路径固定为：

```text
Agent / 应用问题
  -> cubic3-data-platform
     - Ontology / Cube / Binding / Policy
     - Semantic Router / Mapper / Execution Compiler
     - GatewayAccessContext / TicketPreview / 审计
  -> dw-query-gateway
     - SQL guard
     - CredentialBinding
     - query job / worker / result / export / telemetry
```

平台交互式查询路径固定为：

```text
用户在平台 SQL Lab / 查询工作台 / DataChat 选择 DataSource 或 Dataset
  -> cubic3-data-platform DataSource Adapter SPI
  -> PostgreSQL / MySQL / ClickHouse / MaxCompute 等异构 connector
  -> query_histories 记录平台交互式历史
```

交互式 connector 查询用于数据探查、建模辅助、小样本预览和平台内应用体验。它不是生产 Agent 问数执行面。若交互式入口需要升级为正式受治理数仓查询，必须改走 `dw-query-gateway`，不能在本仓复制 gateway 的 worker、result object 或 telemetry。

### 首页和聚合统计

首页、模块摘要和健康指标必须标明读数来源：

- 数据源规模读 `data_sources`。
- 数据资产规模读 `data_asset_tables`，不能用旧 `datasets` 代替。
- 平台 Dataset 规模只表达已注册可消费 Dataset，不表达全量资产目录。
- 平台交互式查询统计读 `query_histories`，标题和说明必须标注为“平台交互式查询”。
- 正式 Agent / 用户数仓查询统计读 `dw-query-gateway` telemetry 或 BFF 投影，不能用本地 `query_histories` 冒充。
- 语义覆盖、发布健康、runtime readiness 以 SQL Registry / Release / Runtime Snapshot 为主，YAML 仅用于 local / fixture / debug。

## 取舍

### 方案 A：保留 Dataset，数据资产底座只做证据层，采纳

优点：

- KISS：不用把所有历史 Dataset 消费方一次性迁移，先把边界讲清楚。
- YAGNI：不建设新的通用元数据仓库或第二套查询执行面。
- SOLID：`Dataset` 负责平台应用消费，数据资产负责元数据证据，语义层负责业务口径，gateway 负责生产执行。
- DRY：统计、页面和文档都能围绕同一事实源矩阵治理，避免同一指标多处解释。

缺点：

- 短期内仍有 `/data-center/assets` 与 `/semantic/assets` 两个入口：前者是平台数据中心的资产目录 / 资产登记入口，后者是语义中心的数据资产证据与同步入口，需要 UI 文案和读模型明确区分。
- 需要补投影服务，避免页面直接各自拼接事实源。

### 方案 B：把 Dataset 全部并入数据资产底座，未采纳

优点是概念数量更少；但当前 `Dataset` 已被数据提取、DataChat、应用中心、查询工作台和旧数据集权限引用。直接并入数据资产底座会放大迁移风险，也会让元数据事实层承担平台应用资源的生命周期，不符合 SRP。

### 方案 C：把数据资产底座升级为新的 Dataset 真相源，未采纳

该方案会让数据资产底座同时承担元数据目录、可查询资源、语义证据和应用消费对象，导致职责过宽。它也会让 `Dataset` 命名继续歧义化，不利于后续治理。

## 后续约束

- 新代码不得新增“data asset dataset”这类未定义实体。若需要引用已注册 Dataset，使用 `AssetRef(asset_type="dataset")` 或明确的 `Dataset` 外键。
- 新的 dashboard / context panel / health API 必须在 service 层集中实现事实源矩阵，不允许页面层自由混合 `datasets`、`data_asset_tables` 和 gateway telemetry。
- `connection_status`、`sync_status` 等跨页面状态必须通过共享归一化函数解释，避免 `success / connected / synced` 各自为政。
- 文档中提到 `Dataset` 时必须说明它是平台应用层 Dataset；提到数据资产时必须说明它是元数据事实层。
- 修改上述边界时必须更新本 ADR、`docs/TECH_STACK_AND_ARCHITECTURE.md`、`docs/architecture/README.md` 和相关页面文案。

## 验证与治理建议

后续应补三类守护：

- 文档守护：`make verify-docs` 应能发现当前基线文档中未解释的 legacy 概念。
- 后端守护：Dashboard / module summary 单测应覆盖 `datasets=0` 但 `data_asset_tables>0` 的场景。
- 前端守护：关键聚合卡片应有来源文案或 tooltip，E2E smoke 验证不再把 gateway 查询数显示成本地查询历史。
