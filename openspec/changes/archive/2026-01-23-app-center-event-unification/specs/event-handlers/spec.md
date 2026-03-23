# Event Handlers Specification

## ADDED Requirements

### Requirement: Execution Started Handler

系统 SHALL 处理 `AppExecutionStarted` 事件并记录日志。

#### Scenario: 记录执行开始日志

**Given** 应用执行开始事件被发布  
**When** 事件处理器接收到该事件  
**Then** 系统应记录结构化日志，包含:
- 日志级别: INFO
- 执行 ID
- 实例 ID
- 应用代码

#### Scenario: 处理器异常不影响主流程

**Given** 应用执行开始事件被发布  
**When** 事件处理器执行过程中抛出异常  
**Then** 异常应被捕获并记录，但不影响应用执行主流程

---

### Requirement: Execution Completed Handler

系统 SHALL 处理 `AppExecutionCompleted` 事件并触发级联逻辑。

#### Scenario: 记录执行完成日志

**Given** 应用执行成功完成  
**When** `AppExecutionCompleted` 事件被处理  
**Then** 系统应记录结构化日志，包含执行时长等关键信息

#### Scenario: 检查事件级联配置

**Given** 应用 A 完成执行并发布事件  
**When** 事件处理器处理该事件  
**Then** 系统应查询所有 `schedule_type == 'event'` 且 `enabled == True` 的应用实例  
**And** 检查它们的 `trigger_on_event` 配置是否匹配

#### Scenario: 触发级联应用执行

**Given** 应用 A 完成执行  
**And** 应用 B 配置了监听应用 A 的完成事件  
**When** 应用 A 的完成事件被处理  
**Then** 系统应自动触发应用 B 的执行  
**And** 应用 B 的 `trigger_type` 应为 "event"

---

### Requirement: Execution Failed Handler

系统 SHALL 处理 `AppExecutionFailed` 事件并记录错误。

#### Scenario: 记录执行失败日志

**Given** 应用执行失败  
**When** `AppExecutionFailed` 事件被处理  
**Then** 系统应记录错误级别日志，包含错误消息和堆栈信息

#### Scenario: 发送失败告警（可选功能）

**Given** 应用执行失败  
**When** 失败事件被处理  
**Then** 系统可选地发送告警通知到配置的通知渠道

---

### Requirement: Event Cascade Condition Matching

事件级联 SHALL 支持条件过滤。

#### Scenario: 按实例 ID 过滤事件

**Given** 应用 B 配置 `conditions: {"instance_id": 123}`  
**When** 应用实例 456 完成执行并发布事件  
**Then** 应用 B 不应被触发  
**When** 应用实例 123 完成执行并发布事件  
**Then** 应用 B 应被触发

#### Scenario: 按应用代码过滤事件

**Given** 应用 B 配置 `conditions: {"app_code": "bi_dashboard_push"}`  
**When** app_code 为 "dataset_card_push" 的应用完成执行  
**Then** 应用 B 不应被触发  
**When** app_code 为 "bi_dashboard_push" 的应用完成执行  
**Then** 应用 B 应被触发

#### Scenario: 多条件 AND 逻辑

**Given** 应用 B 配置 `conditions: {"app_code": "bi_dashboard_push", "status": "success"}`  
**When** bi_dashboard_push 应用成功完成  
**Then** 应用 B 应被触发  
**When** bi_dashboard_push 应用失败  
**Then** 应用 B 不应被触发

---

### Requirement: Event Cascade Loop Prevention

系统 SHALL 防止事件级联导致无限循环。

#### Scenario: 检测直接循环依赖

**Given** 应用 A 配置监听应用 B 的完成事件  
**And** 应用 B 配置监听应用 A 的完成事件  
**When** 应用 A 完成执行  
**Then** 系统应检测到循环依赖并拒绝触发应用 B  
**And** 记录警告日志

#### Scenario: 限制级联深度

**Given** 应用 A → B → C → D 的级联链  
**When** 应用 A 完成执行  
**Then** 系统应最多级联 3 层（A → B → C → D）  
**And** 第 4 层不应被触发  
**And** 记录深度超限警告

#### Scenario: 维护级联调用链

**Given** 应用 A 触发应用 B  
**When** 应用 B 的执行事件被发布  
**Then** 事件的 metadata 应包含 `cascade_chain` 字段  
**And** 调用链应为 `[instance_id_A, instance_id_B]`

---

### Requirement: Event Handler Asynchronous Processing

所有事件处理 SHALL 异步执行，不阻塞主流程。

#### Scenario: 事件通过 RQ 队列处理

**Given** 应用执行完成并发布事件  
**When** EventBus 发布事件  
**Then** 事件应被推送到 RQ 队列  
**And** 应用执行主流程应立即返回，不等待事件处理完成

#### Scenario: 事件处理失败可重试

**Given** 事件处理器执行失败  
**When** RQ Worker 检测到失败  
**Then** 系统应支持事件重试机制（根据 RQ 配置）
