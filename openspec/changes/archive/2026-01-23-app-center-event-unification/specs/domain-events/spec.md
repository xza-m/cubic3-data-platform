# Domain Events Specification

## ADDED Requirements

### Requirement: App Execution Started Event

应用执行开始时系统 SHALL 发布 `AppExecutionStarted` 事件。

#### Scenario: 手动触发应用时发布事件

**Given** 用户手动触发一个应用实例  
**When** 应用开始执行  
**Then** 系统应发布 `AppExecutionStarted` 事件，事件数据包含:
- `execution_id`: 执行记录 ID
- `instance_id`: 应用实例 ID
- `app_code`: 应用代码
- `trigger_type`: 触发类型为 "manual"

#### Scenario: 定时任务触发应用时发布事件

**Given** 一个配置了定时任务的应用实例  
**When** 定时任务触发应用执行  
**Then** 系统应发布 `AppExecutionStarted` 事件，`trigger_type` 为 "scheduled"

---

### Requirement: App Execution Completed Event

应用执行成功完成时系统 SHALL 发布 `AppExecutionCompleted` 事件。

#### Scenario: 应用执行成功时发布事件

**Given** 应用正在执行  
**When** 应用执行成功完成  
**Then** 系统应发布 `AppExecutionCompleted` 事件，事件数据包含:
- `execution_id`: 执行记录 ID
- `instance_id`: 应用实例 ID
- `app_code`: 应用代码
- `instance_name`: 应用实例名称
- `duration_ms`: 执行时长（毫秒）
- `output`: 执行输出结果

#### Scenario: 事件包含准确的执行时长

**Given** 应用在 2026-01-23 10:00:00 开始执行  
**When** 应用在 2026-01-23 10:00:05.432 完成执行  
**Then** 发布的事件中 `duration_ms` 应为 5432

---

### Requirement: App Execution Failed Event

应用执行失败时系统 SHALL 发布 `AppExecutionFailed` 事件。

#### Scenario: 应用执行异常时发布事件

**Given** 应用正在执行  
**When** 应用执行过程中抛出异常  
**Then** 系统应发布 `AppExecutionFailed` 事件，事件数据包含:
- `execution_id`: 执行记录 ID
- `instance_id`: 应用实例 ID
- `app_code`: 应用代码
- `error_message`: 错误信息
- `error_type`: 错误类型（如适用）

#### Scenario: 执行器返回失败结果时发布事件

**Given** 应用执行器执行完成  
**When** 执行器返回 `is_success() == False` 的结果  
**Then** 系统应发布 `AppExecutionFailed` 事件

---

### Requirement: App Instance Lifecycle Events

应用实例生命周期变更时系统 SHALL 发布相应事件。

#### Scenario: 创建应用实例时发布事件

**Given** 用户通过 API 创建一个新的应用实例  
**When** 实例创建成功  
**Then** 系统应发布 `AppInstanceCreated` 事件，包含实例详细信息

#### Scenario: 启用应用实例时发布事件

**Given** 一个禁用状态的应用实例  
**When** 用户启用该实例  
**Then** 系统应发布 `AppInstanceEnabled` 事件

#### Scenario: 禁用应用实例时发布事件

**Given** 一个启用状态的应用实例  
**When** 用户禁用该实例  
**Then** 系统应发布 `AppInstanceDisabled` 事件

#### Scenario: 删除应用实例时发布事件

**Given** 一个已存在的应用实例  
**When** 用户删除该实例  
**Then** 系统应发布 `AppInstanceDeleted` 事件

---

### Requirement: Event Data Structure Consistency

所有领域事件 SHALL 遵循统一的数据结构。

#### Scenario: 事件包含必需的元数据字段

**Given** 任意一个应用中心领域事件  
**When** 事件被发布  
**Then** 事件数据必须包含以下字段:
- `event_id`: 唯一事件 ID（UUID）
- `event_type`: 事件类型字符串
- `entity_type`: 实体类型
- `entity_id`: 实体 ID
- `occurred_at`: 事件发生时间（ISO 8601 格式）
- `data`: 事件特定数据字典

#### Scenario: 事件类型命名遵循规范

**Given** 应用中心的领域事件  
**When** 检查事件类型字段  
**Then** 事件类型应遵循格式 `app.<action>.<status>`，例如:
- `app.execution.started`
- `app.execution.completed`
- `app.execution.failed`
- `app.instance.created`
