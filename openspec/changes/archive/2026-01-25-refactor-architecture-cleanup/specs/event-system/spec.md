## MODIFIED Requirements

### Requirement: 事件订阅 - 类型安全
系统 SHALL 使用类型化的事件订阅机制，`EventBus.subscribe()` 方法接受 `Callable[[DomainEvent], None]` 类型的处理器函数，而非字符串路径。

#### Scenario: 订阅事件（类型安全）
- **WHEN** 注册事件处理器
- **THEN** 使用 `event_bus.subscribe(DataSourceCreated, on_datasource_created)`
- **AND** `on_datasource_created` 是一个可调用函数
- **AND** IDE 提供自动完成和跳转支持

#### Scenario: 事件处理器类型检查
- **WHEN** 注册事件处理器
- **THEN** 类型检查器（mypy/pyright）验证处理器签名
- **AND** 处理器必须接受 `DomainEvent` 类型参数
- **AND** 处理器返回类型必须为 `None`

#### Scenario: 重构安全性
- **WHEN** 重命名事件处理器函数
- **THEN** IDE 自动更新所有订阅调用
- **AND** 不会出现运行时 `ModuleNotFoundError`

### Requirement: 事件处理器序列化
系统 SHALL 自动将事件处理器函数序列化为字符串路径（用于 RQ 任务队列），格式为 `module.path.function_name`。

#### Scenario: 处理器路径序列化
- **WHEN** 调用 `event_bus.subscribe(DataSourceCreated, on_datasource_created)`
- **THEN** 系统自动提取处理器路径 `app.infrastructure.events.handlers.datasource_handler.on_datasource_created`
- **AND** 将路径存储到内部处理器映射表

#### Scenario: 事件发布到 RQ 队列
- **WHEN** 调用 `event_bus.publish(DataSourceCreated(...))`
- **THEN** 系统使用序列化的处理器路径推送到 RQ 队列
- **AND** RQ Worker 通过 `importlib` 动态加载处理器函数

### Requirement: 事件处理器注册集中管理
系统 SHALL 在 `app/infrastructure/events/registry.py` 中集中注册所有事件处理器，便于管理和审计。

#### Scenario: 集中注册事件处理器
- **WHEN** 应用启动时
- **THEN** 调用 `register_event_handlers(event_bus)`
- **AND** 函数内部注册所有事件处理器
- **EXAMPLE**:
  ```python
  def register_event_handlers(event_bus: EventBus):
      from app.infrastructure.events.handlers import datasource_handler, dataset_handler
      
      event_bus.subscribe(DataSourceCreated, datasource_handler.on_datasource_created)
      event_bus.subscribe(DataSourceDeleted, datasource_handler.on_datasource_deleted)
      event_bus.subscribe(DatasetCreated, dataset_handler.on_dataset_created)
  ```

## REMOVED Requirements

### Requirement: 字符串路径订阅
**Reason**: 类型不安全，重构时容易遗漏更新

**Migration**: 所有订阅调用从字符串路径改为函数引用
