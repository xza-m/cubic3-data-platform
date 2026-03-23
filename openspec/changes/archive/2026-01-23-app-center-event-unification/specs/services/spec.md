# Services Layer Specification

## MODIFIED Requirements

### Requirement: Execution Service Event Publishing

`ExecutionService` SHALL 在应用执行的关键节点发布领域事件。

#### Scenario: 注入 EventBus 依赖

**Given** DI 容器已配置  
**When** 实例化 `ExecutionService`  
**Then** EventBus 应通过构造函数注入  
**And** 服务应可访问 `self.event_bus` 实例

#### Scenario: 执行开始后发布事件

**Given** 应用执行记录已创建  
**When** 调用 `execution.start()` 并提交事务  
**Then** 服务应从实体收集领域事件  
**And** 调用 `event_bus.publish()` 发布收集到的事件

#### Scenario: 执行完成后发布事件

**Given** 应用执行成功或失败  
**When** 调用 `execution.complete_success()` 或 `complete_failure()` 并提交事务  
**Then** 服务应发布相应的领域事件

#### Scenario: 异常情况下也发布失败事件

**Given** 应用执行过程中抛出未捕获异常  
**When** 异常被捕获并调用 `execution.complete_failure()`  
**Then** 失败事件应被正确发布

---

### Requirement: App Instance Service Event Publishing

`AppInstanceService` SHALL 在实例生命周期变更时发布事件。

#### Scenario: 创建实例后发布事件

**Given** 用户创建新的应用实例  
**When** 实例创建成功并提交数据库事务  
**Then** 服务应发布 `AppInstanceCreated` 事件

#### Scenario: 启用/禁用实例后发布事件

**Given** 用户更新实例的 `enabled` 字段  
**When** 更新成功并提交事务  
**Then** 服务应发布 `AppInstanceEnabled` 或 `AppInstanceDisabled` 事件

#### Scenario: 删除实例后发布事件

**Given** 用户删除应用实例  
**When** 删除操作成功  
**Then** 服务应发布 `AppInstanceDeleted` 事件

---

### Requirement: Entity Event Collection

实体 SHALL 在状态变更时收集领域事件。

#### Scenario: AppExecution 实体收集事件

**Given** `AppExecution` 实体实例  
**When** 调用 `start()` 方法  
**Then** 实体应创建 `AppExecutionStarted` 事件并添加到 `_domain_events` 列表  
**When** 调用 `complete_success()` 方法  
**Then** 实体应创建 `AppExecutionCompleted` 事件并收集

#### Scenario: 移除 TODO 注释

**Given** `app/domain/entities/app_execution.py` 文件  
**When** 检查 `start()`, `complete_success()`, `complete_failure()` 方法  
**Then** 所有 `TODO: 触发xxx事件` 注释应被移除  
**And** 替换为实际的事件收集代码

---

### Requirement: Event Publishing Transaction Safety

事件发布 SHALL 在数据库事务提交后执行。

#### Scenario: 事务回滚不发布事件

**Given** 应用执行开始  
**And** `execution.start()` 被调用并收集了事件  
**When** 数据库事务被回滚  
**Then** 事件不应被发布到 EventBus

#### Scenario: 事务提交后发布事件

**Given** 应用执行状态变更  
**When** 数据库事务成功提交  
**Then** 所有收集的领域事件应被发布  
**And** 事件的 `occurred_at` 时间应反映实际提交时间
