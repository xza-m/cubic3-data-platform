# Design Document: 应用中心统一事件设计

## 概述

本设计文档描述如何将应用中心模块集成到项目的事件驱动架构中，实现与数据源、数据集、数据提取模块一致的事件设计模式。

## 架构对比

### 当前架构（有问题）

```
用户请求 → ExecutionService → AppExecution.start()
                    ↓                    ↓
            创建执行记录          更新状态为 running
                    ↓                    ↓
            推送到 RQ 队列         ❌ 无事件发布
                    ↓
            RQ Worker 执行
                    ↓
      AppExecution.complete_success/failure()
                    ↓
            更新执行状态
                    ↓
            ❌ 无事件发布 → 其他系统无法感知
```

### 目标架构（事件驱动）

```
用户请求 → ExecutionService → AppExecution.start()
                    ↓                    ↓
            创建执行记录     更新状态 + 收集事件 (ExecutionStarted)
                    ↓                    ↓
            发布收集的事件 → EventBus → 异步处理器
                    ↓                              ↓
            推送到 RQ 队列              - 审计日志
                    ↓                    - 监控统计
            RQ Worker 执行              - 事件级联触发
                    ↓
      AppExecution.complete_success()
                    ↓
    更新状态 + 收集事件 (ExecutionCompleted)
                    ↓
            发布收集的事件 → EventBus → 异步处理器
```

## 领域事件设计

### 事件层次结构

```
DomainEvent (基类)
├── AppInstanceCreated      # 实例创建
├── AppInstanceEnabled      # 实例启用
├── AppInstanceDisabled     # 实例禁用
├── AppInstanceDeleted      # 实例删除
├── AppExecutionStarted     # 执行开始
├── AppExecutionCompleted   # 执行完成
└── AppExecutionFailed      # 执行失败
```

### 事件数据结构

#### AppExecutionCompleted

```python
{
    "event_id": "uuid",
    "event_type": "app.execution.completed",
    "entity_type": "app_execution",
    "entity_id": 123,
    "occurred_at": "2026-01-23T14:00:00Z",
    "data": {
        "instance_id": 456,
        "app_code": "bi_dashboard_push",
        "instance_name": "每日看板推送",
        "trigger_type": "scheduled",
        "duration_ms": 5432,
        "output": {
            "dashboard_name": "销售看板",
            "message_id": "om_xxx"
        }
    }
}
```

## 实现细节

### 1. 领域事件定义

**文件**: `app/domain/events/app_events.py`

```python
from app.domain.events.base import DomainEvent
from datetime import datetime
from typing import Dict, Any, Optional

class AppExecutionStarted(DomainEvent):
    """应用开始执行事件"""
    
    def __init__(
        self,
        execution_id: int,
        instance_id: int,
        app_code: str,
        trigger_type: str,
        triggered_by: Optional[str] = None
    ):
        super().__init__(
            event_type="app.execution.started",
            entity_type="app_execution",
            entity_id=execution_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "trigger_type": trigger_type,
                "triggered_by": triggered_by
            }
        )

class AppExecutionCompleted(DomainEvent):
    """应用执行完成事件"""
    
    def __init__(
        self,
        execution_id: int,
        instance_id: int,
        app_code: str,
        instance_name: str,
        duration_ms: int,
        output: Dict[str, Any]
    ):
        super().__init__(
            event_type="app.execution.completed",
            entity_type="app_execution",
            entity_id=execution_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "instance_name": instance_name,
                "duration_ms": duration_ms,
                "output": output
            }
        )

# ... 其他事件类似
```

### 2. 实体事件收集

**文件**: `app/domain/entities/app_execution.py`

```python
def start(self):
    """开始执行"""
    self.status = 'running'
    self.started_at = datetime.utcnow()
    
    # 收集执行开始事件
    from app.domain.events.app_events import AppExecutionStarted
    event = AppExecutionStarted(
        execution_id=self.id,
        instance_id=self.instance_id,
        app_code=self.instance.app_code if self.instance else None,
        trigger_type=self.trigger_type
    )
    self._domain_events.append(event)

def complete_success(self, output: Optional[Dict[str, Any]] = None):
    """标记执行成功"""
    self.status = 'success'
    self.ended_at = datetime.utcnow()
    self.output = output
    
    if self.started_at:
        delta = self.ended_at - self.started_at
        self.duration_ms = int(delta.total_seconds() * 1000)
    
    if self.instance:
        self.instance.record_execution('success', self.ended_at)
    
    # 收集执行成功事件
    from app.domain.events.app_events import AppExecutionCompleted
    event = AppExecutionCompleted(
        execution_id=self.id,
        instance_id=self.instance_id,
        app_code=self.instance.app_code if self.instance else None,
        instance_name=self.instance.name if self.instance else None,
        duration_ms=self.duration_ms,
        output=output or {}
    )
    self._domain_events.append(event)
```

### 3. 服务层事件发布

**文件**: `app/application/services/app_center/execution_service.py`

```python
from app.infrastructure.events.event_bus import EventBus

class ExecutionService:
    def __init__(self, event_bus: EventBus):
        """注入 EventBus"""
        self.event_bus = event_bus
    
    def _execute_sync(self, execution_id, instance_id, triggered_by, extra_data):
        """同步执行应用（由 RQ Worker 调用）"""
        execution = db.session.query(AppExecution).filter_by(id=execution_id).first()
        instance = db.session.query(AppInstance).filter_by(id=instance_id).first()
        
        try:
            # 1. 开始执行
            execution.start()
            db.session.commit()
            
            # 发布收集的事件
            self._publish_domain_events(execution)
            
            # 2-4. 执行逻辑 ...
            
            # 5. 完成执行
            if result.is_success():
                execution.complete_success(output=result.output)
            else:
                execution.complete_failure(error_message=result.error_message)
            
            db.session.commit()
            
            # 发布收集的事件
            self._publish_domain_events(execution)
            
        except Exception as e:
            execution.complete_failure(error_message=str(e))
            db.session.commit()
            self._publish_domain_events(execution)
    
    def _publish_domain_events(self, entity):
        """发布实体收集的领域事件"""
        events = entity.collect_domain_events()
        for event in events:
            self.event_bus.publish(event)
```

### 4. 事件处理器实现

**文件**: `app/infrastructure/events/handlers/app_handler.py`

```python
"""应用中心事件处理器"""
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

def on_execution_started(event_dict: dict):
    """处理应用执行开始事件"""
    logger.info(
        "Application execution started",
        extra={
            "event_id": event_dict.get("event_id"),
            "execution_id": event_dict.get("entity_id"),
            "instance_id": event_dict["data"].get("instance_id"),
            "app_code": event_dict["data"].get("app_code")
        }
    )
    # TODO: 记录审计日志

def on_execution_completed(event_dict: dict):
    """处理应用执行完成事件"""
    logger.info(
        "Application execution completed",
        extra={
            "event_id": event_dict.get("event_id"),
            "execution_id": event_dict.get("entity_id"),
            "duration_ms": event_dict["data"].get("duration_ms")
        }
    )
    # TODO: 更新统计指标
    # TODO: 检查是否需要触发事件级联

def on_execution_failed(event_dict: dict):
    """处理应用执行失败事件"""
    logger.error(
        "Application execution failed",
        extra={
            "event_id": event_dict.get("event_id"),
            "execution_id": event_dict.get("entity_id")
        }
    )
    # TODO: 发送告警通知
```

### 5. 事件注册

**文件**: `app/infrastructure/events/registry.py`

```python
def register_event_handlers(event_bus: EventBus):
    """注册所有事件处理器"""
    
    # ... 现有事件注册 ...
    
    # 应用中心事件处理器
    from app.domain.events.app_events import (
        AppExecutionStarted,
        AppExecutionCompleted,
        AppExecutionFailed
    )
    
    event_bus.subscribe(
        AppExecutionStarted,
        'app.infrastructure.events.handlers.app_handler.on_execution_started'
    )
    
    event_bus.subscribe(
        AppExecutionCompleted,
        'app.infrastructure.events.handlers.app_handler.on_execution_completed'
    )
    
    event_bus.subscribe(
        AppExecutionFailed,
        'app.infrastructure.events.handlers.app_handler.on_execution_failed'
    )
```

### 6. 依赖注入配置

**文件**: `app/di/container.py`

```python
class Container(containers.DeclarativeContainer):
    # ... 现有配置 ...
    
    # 应用中心服务
    execution_service = providers.Factory(
        ExecutionService,
        event_bus=event_bus  # 注入 EventBus
    )
    
    app_instance_service = providers.Factory(
        AppInstanceService,
        event_bus=event_bus  # 注入 EventBus
    )
```

## 事件级联功能设计

### 配置数据结构

在 `AppInstance.config` 中添加 `trigger_on_event` 配置：

```json
{
  "trigger_on_event": {
    "enabled": true,
    "event_types": ["app.execution.completed"],
    "conditions": {
      "instance_id": 123,  // 监听指定实例
      "app_code": "bi_dashboard_push",  // 或监听指定应用类型
      "status": "success"  // 仅成功时触发
    },
    "delay_seconds": 0  // 延迟触发（秒）
  }
}
```

### 事件级联处理器

```python
# app/infrastructure/events/handlers/app_handler.py

def on_execution_completed(event_dict: dict):
    """处理应用执行完成事件"""
    # ... 现有逻辑 ...
    
    # 检查是否有应用配置了事件级联
    from app.domain.entities import AppInstance
    from app.application.services.app_center import ExecutionService
    from app.di.utils import get_app_container
    
    # 查询所有启用事件触发的实例
    instances = db.session.query(AppInstance).filter(
        AppInstance.enabled == True,
        AppInstance.schedule_type == 'event'
    ).all()
    
    for instance in instances:
        trigger_config = instance.config.get('trigger_on_event', {})
        if not trigger_config.get('enabled'):
            continue
        
        # 检查事件类型匹配
        if event_dict['event_type'] not in trigger_config.get('event_types', []):
            continue
        
        # 检查条件匹配
        conditions = trigger_config.get('conditions', {})
        if not _check_conditions(event_dict, conditions):
            continue
        
        # 触发执行
        container = get_app_container()
        execution_service = container.execution_service()
        
        delay = trigger_config.get('delay_seconds', 0)
        if delay > 0:
            # 延迟执行（通过 RQ 的延迟队列）
            queue.enqueue_in(
                timedelta(seconds=delay),
                execution_service.execute_instance,
                instance_id=instance.id,
                trigger_type='event',
                extra_data={'triggered_by_event': event_dict}
            )
        else:
            # 立即执行
            execution_service.execute_instance(
                instance_id=instance.id,
                trigger_type='event',
                extra_data={'triggered_by_event': event_dict}
            )

def _check_conditions(event_dict: dict, conditions: dict) -> bool:
    """检查事件是否匹配条件"""
    data = event_dict.get('data', {})
    
    for key, expected_value in conditions.items():
        actual_value = data.get(key)
        if actual_value != expected_value:
            return False
    
    return True
```

### 循环依赖检测

```python
def _check_cascade_loop(instance_id: int, event_dict: dict, max_depth: int = 3) -> bool:
    """检查事件级联是否会导致循环"""
    # 从事件数据中提取调用链
    call_chain = event_dict.get('metadata', {}).get('cascade_chain', [])
    
    # 检查当前实例是否已在调用链中
    if instance_id in call_chain:
        logger.warning(f"Cascade loop detected for instance {instance_id}")
        return True
    
    # 检查调用深度
    if len(call_chain) >= max_depth:
        logger.warning(f"Cascade depth exceeded for instance {instance_id}")
        return True
    
    return False
```

## 测试策略

### 单元测试

```python
# tests/unit/test_app_events.py

def test_execution_start_publishes_event():
    """测试执行开始时发布事件"""
    execution = AppExecution(id=1, instance_id=2, trigger_type='manual')
    execution.start()
    
    events = execution.collect_domain_events()
    assert len(events) == 1
    assert events[0].event_type == 'app.execution.started'
    assert events[0].data['instance_id'] == 2

def test_execution_success_publishes_event():
    """测试执行成功时发布事件"""
    execution = AppExecution(id=1, instance_id=2)
    execution.started_at = datetime.utcnow()
    execution.complete_success(output={'result': 'ok'})
    
    events = execution.collect_domain_events()
    assert len(events) == 1
    assert events[0].event_type == 'app.execution.completed'
    assert events[0].data['output'] == {'result': 'ok'}
```

### 集成测试

```python
# tests/integration/test_event_cascade.py

def test_event_cascade_trigger(app, db_session):
    """测试事件级联触发"""
    # 1. 创建应用 A
    instance_a = create_app_instance(app_code='bi_dashboard_push')
    
    # 2. 创建应用 B，配置监听应用 A 的完成事件
    instance_b = create_app_instance(
        app_code='dataset_card_push',
        schedule_type='event',
        config={
            'trigger_on_event': {
                'enabled': True,
                'event_types': ['app.execution.completed'],
                'conditions': {'instance_id': instance_a.id}
            }
        }
    )
    
    # 3. 执行应用 A
    execution_service = get_execution_service()
    execution_id = execution_service.execute_instance(instance_a.id)
    
    # 4. 等待异步执行完成
    wait_for_execution_completion(execution_id)
    
    # 5. 验证应用 B 被自动触发
    executions_b = get_executions_for_instance(instance_b.id)
    assert len(executions_b) == 1
    assert executions_b[0].trigger_type == 'event'
```

## 性能考虑

### 事件发布

- ✅ 事件发布是异步的（通过 RQ 队列）
- ✅ 不影响应用执行的主流程
- ⚠️ 需要监控 RQ 队列深度

### 事件级联

- ⚠️ 可能导致雪崩效应（一个事件触发多个应用）
- ✅ 通过循环检测和深度限制防止无限递归
- ✅ 支持延迟触发，避免瞬时压力

### 建议的监控指标

1. 事件发布速率（events/second）
2. 事件处理延迟（publish → handle 时间）
3. 级联触发次数
4. 循环检测触发次数
5. RQ 队列积压数量

## 向后兼容性

本设计**完全向后兼容**：

1. ✅ 所有现有 API 不变
2. ✅ 现有应用实例可以继续运行
3. ✅ 事件发布是增量功能，不影响核心逻辑
4. ✅ 事件级联是可选功能（默认禁用）
5. ✅ 无数据库 schema 破坏性变更

## 未来扩展

本设计为以下未来功能预留了空间：

1. **复杂工作流编排**：支持 DAG（有向无环图）定义应用依赖
2. **事件重放**：支持历史事件重放和调试
3. **外部事件集成**：支持 Kafka、RabbitMQ 等外部事件源
4. **条件表达式**：支持更复杂的事件过滤条件（类似 CEL）
5. **事件版本控制**：支持事件 schema 演进

---

**设计版本**: 1.0  
**最后更新**: 2026-01-23  
**维护者**: AI Assistant
