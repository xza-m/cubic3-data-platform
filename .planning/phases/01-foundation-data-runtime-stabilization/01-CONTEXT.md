# Phase 1: 基础接入与运行底座稳定化 - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

把数据中心基础主链路做稳：以 `PostgreSQL + MaxCompute` 为验收基线，覆盖数据源接入、连接校验、元数据同步、数据集注册/维护、查询预览和失败可见性。Phase 1 同时要求物理表、SQL 虚拟数据集、文件数据集三种类型都达到稳定可用，但不把部署体验优化、复杂治理能力或新平台能力扩展纳入本阶段。

</domain>

<decisions>
## Implementation Decisions

### 验收基线与覆盖范围
- **D-01:** Phase 1 的数据源验收基线固定为 `PostgreSQL + MaxCompute`，分别代表最主要的 `OLTP` 与 `OLAP` 使用场景。
- **D-02:** Phase 1 必须让三种数据集类型都稳定可用：物理表数据集、SQL 虚拟数据集、文件数据集。

### 同步策略
- **D-03:** 数据接入后必须自动执行首次同步，且保留手动重同步入口。
- **D-04:** 平台需要提供统一固定周期的自动同步，不做每个数据集独立调度配置。
- **D-05:** 自动同步范围同时覆盖数据源目录刷新和已注册数据集同步。
- **D-06:** 自动定时同步失败后自动重试 1 次；仍失败则标记失败并等待人工处理。

### 预览与失败反馈
- **D-07:** 预览结果必须包含表级信息、字段识别结果、分类型失败反馈，以及 `LIMIT 20` 的样本数据预览。
- **D-08:** 失败信息至少要让用户区分连接失败、权限或对象不存在、Schema 拉取失败、查询或超时失败等主要类型。
- **D-09:** 列表页展示状态与失败摘要；详情页和注册页展示完整失败原因与最近执行结果。

### 类型边界
- **D-10:** SQL 虚拟数据集在 Phase 1 中按“受管数据集对象”处理，支持保存 SQL、字段解析、样本预览、编辑后重解析和手动刷新，但不扩展到复杂 lineage、依赖图或版本治理。
- **D-11:** 文件数据集在 Phase 1 仅支持 `CSV + Excel`。
- **D-12:** 文件数据集不允许覆盖原对象；重新上传必须创建新数据集。

### 交互与状态模型
- **D-13:** 连接测试与轻量预览同步返回；首次同步、手动重同步、定时同步走后台任务并回写状态。
- **D-14:** 三种数据集类型采用“统一骨架、类型差异可见”的体验策略：统一列表状态模型、详情基础信息区、失败表达方式与通用操作入口位置；允许注册流程、特有字段和特有操作存在差异。

### 交付口径
- **D-15:** Phase 1 不以部署体验优化为重点，不要求一键部署或安装体验收口；重点是现有容器体系后续能支撑功能联调与验证。

### the agent's Discretion
- 平台统一自动同步的具体周期值。
- 同步失败后的具体退避时间、轮询节奏与 UI 文案。
- 状态枚举命名与摘要展示的精确结构。
- `LIMIT 20` 样本预览的表格呈现细节与骨架屏样式。

</decisions>

<specifics>
## Specific Ideas

- 用户明确要求先把功能做稳，不把 Phase 1 资源花在部署体验优化上。
- `PostgreSQL + MaxCompute` 被选为验收基线，因为它们代表当前最常用的数据库与数仓场景。
- 问题定位和失败可见性优先级很高，不能只给通用 toast 或模糊失败提示。
- 三种数据集类型都要可用，但不要求做成完全一致的单一路径；统一骨架即可。

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目范围与阶段目标
- `.planning/PROJECT.md` — 当前 brownfield 演进约束、交付边界和平台主线。
- `.planning/REQUIREMENTS.md` — Phase 1 对应的 `DATA-01` 至 `DATA-05` 与 `OPS-01` requirement。
- `.planning/ROADMAP.md` — Phase 1 目标、排序理由和阶段成功标准。
- `.planning/STATE.md` — 当前项目状态与后续推进顺序。

### 架构与运行基线
- `docs/TECH_STACK_AND_ARCHITECTURE.md` — 现有 `React SPA + Flask API + PostgreSQL/Redis/RQ` 技术栈与部署拓扑。
- `docs/architecture/README.md` — 当前架构边界、ADR 索引与设计入口。
- `docs/quality/testing.md` — 统一验证入口与校验原则。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/Datasources.tsx`：已有数据源列表、创建、测试与基础状态展示入口。
- `frontend/src/pages/Datasets.tsx`：已有数据集列表、统计、同步动作与注册入口。
- `frontend/src/pages/DatasetRegister.tsx`：现有物理表数据集注册流程，已具备表选择、字段识别与预览相关页面结构。
- `frontend/src/pages/FileDatasetRegister.tsx`：现有文件数据集注册页面，可作为 `CSV + Excel` 边界的直接落点。
- `frontend/src/api/datasets.ts`：集中定义数据集相关接口调用，适合统一三种类型的状态与错误处理。
- `app/interfaces/api/v1/datasources.py`：当前数据源 API 边界。
- `app/interfaces/api/v1/datasets.py`：当前数据集 API 边界，包含预览与同步相关入口。

### Established Patterns
- 前端当前以页面级工作台模式组织，列表页 + 注册/详情流是主交互模式。
- 后端通过 Flask API 暴露数据中心能力，适合继续沿用薄接口层 + 应用服务的方式补齐状态回写。
- 当前运行时已存在 `Redis + RQ`，适合承接首次同步、手动重同步和定时同步等长耗时任务。

### Integration Points
- `docker-compose.yml` 已定义 `nginx / backend / rq_worker / redis / postgres` 基础运行容器，可作为 Phase 1 最小运行底座。
- `run_worker.py` 与 `app/infrastructure/tasks/rq_worker.py` 是现有异步执行入口。
- `docs/architecture/decisions/ADR-003-rq-for-tasks-and-events.md` 提供了 RQ 作为异步任务基础设施的现有决策背景。

</code_context>

<deferred>
## Deferred Ideas

- 一键部署、安装体验优化或更强部署收口，不作为 Phase 1 重点。
- SQL 虚拟数据集的 lineage、依赖图、版本治理，延后到后续阶段。
- 文件数据集覆盖更新能力，延后处理。
- `Parquet` 或更多文件格式支持，延后处理。

</deferred>

---

*Phase: 01-foundation-data-runtime-stabilization*
*Context gathered: 2026-03-25*
