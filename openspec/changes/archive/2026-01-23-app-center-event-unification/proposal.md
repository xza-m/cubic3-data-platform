# Change: 应用中心统一事件设计

## Why

### 当前问题

应用中心模块（App Center）在架构实现上存在**重大不一致**：

1. **事件设计缺失**：数据源、数据集、数据提取模块都已实现完整的事件驱动架构（EventBus + Domain Events + Event Handlers），但应用中心模块**完全没有定义领域事件**。

2. **代码中的 TODO**：`AppExecution` 实体中有 3 个明确的 `TODO` 注释标注需要发布事件，但尚未实现：
   ```python
   # app/domain/entities/app_execution.py:66
   def start(self):
       # TODO: 触发执行开始事件
   
   def complete_success(self, output):
       # TODO: 触发执行成功事件
   
   def complete_failure(self, error_message):
       # TODO: 触发执行失败事件
   ```

3. **架构双重标准**：系统出现两种架构模式并存的局面，影响代码可维护性和扩展性。

### 业务影响

**无法实现的关键场景**：
- ❌ 应用 A 执行完成后自动触发应用 B（事件级联）
- ❌ 基于应用执行结果发送统一通知
- ❌ 监控所有应用执行并生成统计报告
- ❌ 审计日志系统无法追踪应用生命周期
- ❌ `ExtractionNotifyExecutor` 可以监听外部事件，但应用中心本身不发布事件

## What Changes

### 核心变更

1. **新增应用中心领域事件** (`app/domain/events/app_events.py`)
   - `AppInstanceCreated` - 应用实例创建事件
   - `AppInstanceEnabled` - 应用实例启用事件
   - `AppInstanceDisabled` - 应用实例禁用事件
   - `AppInstanceDeleted` - 应用实例删除事件
   - `AppExecutionStarted` - 应用开始执行事件
   - `AppExecutionCompleted` - 应用执行完成事件
   - `AppExecutionFailed` - 应用执行失败事件

2. **修改实体发布事件**
   - `AppExecution.start()` - 发布执行开始事件
   - `AppExecution.complete_success()` - 发布执行完成事件
   - `AppExecution.complete_failure()` - 发布执行失败事件
   - `AppInstance` 实体 - 发布实例生命周期事件

3. **修改服务层集成 EventBus**
   - `ExecutionService` - 注入 EventBus，发布收集的领域事件
   - `AppInstanceService` - 注入 EventBus，发布实例事件

4. **注册事件处理器**
   - 扩展 `app/infrastructure/events/registry.py`
   - 创建 `app/infrastructure/events/handlers/app_handler.py`

5. **配置依赖注入**
   - 更新 `app/di/container.py` 为应用中心服务注入 EventBus

6. **实现事件级联功能**（新功能）
   - 支持应用实例配置 `trigger_on_event` 选项
   - 监听其他应用的执行完成事件并自动触发

## Impact

### 新增文件
- `app/domain/events/app_events.py` - 领域事件定义（7 个事件类）
- `app/infrastructure/events/handlers/app_handler.py` - 事件处理器实现
- `openspec/changes/app-center-event-unification/design.md` - 设计文档

### 修改文件
- `app/domain/entities/app_execution.py` - 移除 TODO，实现事件发布
- `app/domain/entities/app_instance.py` - 添加事件发布逻辑
- `app/application/services/app_center/execution_service.py` - 注入 EventBus
- `app/application/services/app_center/app_instance_service.py` - 注入 EventBus
- `app/infrastructure/events/registry.py` - 注册应用中心事件
- `app/di/container.py` - 配置 EventBus 注入
- `schema/add_app_center_tables.sql` - 可能需要添加 `trigger_on_event` 字段（可选）

### 新增依赖
无新的第三方依赖

### 配置变更
无环境变量或配置文件变更

## Design Decisions

### 1. 事件粒度设计

**决策**：设计 7 个领域事件（实例级 4 个 + 执行级 3 个）

**理由**：
- 实例级事件：支持实例生命周期管理和审计
- 执行级事件：支持执行监控、统计和事件级联

**备选方案**（不采用）：
- 只实现执行级事件：无法追踪实例变更
- 合并成功/失败事件：丢失语义信息

### 2. 事件发布位置

**决策**：在实体方法中收集事件，在服务层统一发布

**理由**：
- 遵循现有架构模式（数据源/数据集模块的实现方式）
- 实体负责业务逻辑和事件收集
- 服务层负责事务管理和事件发布

### 3. EventBus 注入方式

**决策**：通过依赖注入容器注入到服务类

**理由**：
- 保持与其他模块的一致性
- 方便单元测试（可 mock EventBus）
- 符合 Hexagonal Architecture 的依赖倒置原则

### 4. 事件级联实现

**决策**：通过事件处理器 + 配置驱动实现

**设计**：
```python
# AppInstance 配置示例
{
  "trigger_on_event": {
    "enabled": true,
    "event_types": ["app.execution.completed"],
    "conditions": {
      "app_code": "bi_dashboard_push",  # 监听指定应用
      "status": "success"  # 仅成功时触发
    }
  }
}
```

**理由**：
- 配置驱动，无需修改代码即可调整级联关系
- 通过事件处理器实现，解耦各应用
- 支持条件过滤，避免无限递归

### 5. 向后兼容性

**决策**：完全向后兼容，无破坏性变更

**保证**：
- 所有现有 API 保持不变
- 事件发布是**增量功能**，不影响现有流程
- 老代码可以继续运行，逐步迁移

## Non-Goals

本次变更**不包括**以下内容：

- ❌ 修改前端页面（事件级联配置 UI 在后续迭代实现）
- ❌ 实现复杂的工作流引擎（仅支持简单的一对一事件级联）
- ❌ 支持外部系统的事件集成（Kafka、RabbitMQ 等）
- ❌ 修改应用执行器的实现（6 个执行器保持不变）
- ❌ 数据库 schema 变更（除非添加 `trigger_on_event` 配置字段）

## Risks

### 风险 1：事件循环依赖

**描述**：如果应用 A 触发应用 B，应用 B 又触发应用 A，可能导致无限循环。

**缓解措施**：
- 在事件处理器中检测循环依赖（维护执行调用链）
- 限制级联深度（最多 3 层）
- 配置验证时警告循环依赖

### 风险 2：事件处理器性能

**描述**：大量事件可能影响 RQ Worker 性能。

**缓解措施**：
- 事件处理异步化（已通过 RQ 队列实现）
- 监控队列深度和处理延迟
- 必要时扩展 Worker 数量

### 风险 3：EventBus 不可用

**描述**：Redis 故障导致事件无法发布。

**缓解措施**：
- 应用执行本身不依赖事件发布（事件是增量功能）
- 记录事件发布失败日志
- 支持事件重放机制（后续优化）

## Success Criteria

本次变更成功的标准：

1. ✅ 所有 7 个领域事件定义完整且符合规范
2. ✅ `AppExecution` 实体中的 3 个 TODO 全部移除
3. ✅ 事件成功注册到 EventBus 并可被订阅
4. ✅ 集成测试验证事件发布和处理
5. ✅ 事件级联功能正常工作（应用 A → 应用 B）
6. ✅ 无现有功能回归问题
7. ✅ 代码符合项目规范（Linter 无错误）

## Related Work

- **前置依赖**：EventBus 已实现并在数据源/数据集模块验证
- **后续工作**：
  - 前端 UI 支持事件级联配置
  - 事件历史查询和重放
  - 复杂工作流编排（DAG）
