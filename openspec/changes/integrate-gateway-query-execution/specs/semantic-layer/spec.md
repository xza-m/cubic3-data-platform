# semantic-layer 补充规格 · Agent-first 执行闭环

## ADDED Requirements

### Requirement: Agent Semantic Execute Uses Query Execution Plane

正式 Agent 语义执行入口 SHALL 通过统一查询执行面提交查询任务，而不是直接调用数据源 adapter。

#### Scenario: Agent 语义执行成功提交查询

- **WHEN** 用户调用 `POST /api/v1/agent/semantic/execute`
- **AND** Router 命中 active Ontology
- **AND** Mapper 成功绑定 active Cube measure
- **AND** Compiler 生成 `logical_sql`、`resource_set`、`sql_hash` 和 `data_level`
- **AND** Governance 返回 `allow`
- **THEN** 系统 SHALL 生成 `ExecutionTicketSnapshot`
- **AND** 通过 `QuerySubmissionService` 创建 `query_execution_jobs`
- **AND** 将 ticket snapshot 写入 `query_execution_jobs.ticket_snapshot_json`
- **AND** 响应 SHALL 包含 `query_id`、`poll_url`、`result_url`、`semantic_trace`

#### Scenario: Governance deny 不进入执行面

- **WHEN** `POST /api/v1/agent/semantic/execute` 的治理结果为 `deny`
- **THEN** 系统 SHALL 返回 blocked 诊断
- **AND** 不生成 `ExecutionTicketSnapshot`
- **AND** 不创建 `query_execution_jobs`

#### Scenario: Governance approval_required 不执行 SQL

- **WHEN** `POST /api/v1/agent/semantic/execute` 的治理结果为 `approval_required`
- **THEN** 系统 SHALL 返回审批材料
- **AND** 不创建可执行 ticket snapshot
- **AND** 不创建查询任务

#### Scenario: Agent 语义执行不回退到 Cube 直查

- **WHEN** Router 未命中 active Ontology 业务语义
- **THEN** 系统 SHALL 返回“未命中已发布业务语义”的诊断
- **AND** 不回退到直接 Cube 查询
- **AND** 不提交查询执行任务

#### Scenario: Semantic trace 贯穿执行任务

- **WHEN** Agent 语义执行创建查询任务
- **THEN** `semantic_trace` SHALL 记录业务意图、命中的 Ontology 对象、绑定的 Cube measure、编译 SQL hash、policy decision、ticket snapshot hash 和 query id
- **AND** 这些信息 SHALL 可用于审计和问题回放
