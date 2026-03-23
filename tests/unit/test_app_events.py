"""
应用中心事件系统单元测试

测试领域事件的创建、收集和发布
"""
import pytest
from datetime import datetime
from app.domain.events.app_events import (
    AppInstanceCreated,
    AppInstanceEnabled,
    AppInstanceDisabled,
    AppInstanceDeleted,
    AppExecutionStarted,
    AppExecutionCompleted,
    AppExecutionFailed
)


class TestAppInstanceEvents:
    """应用实例生命周期事件测试"""
    
    def test_instance_created_event(self):
        """测试实例创建事件"""
        event = AppInstanceCreated(
            instance_id=1,
            app_code="bi_dashboard_push",
            name="测试看板",
            schedule_type="cron",
            enabled=True,
            config={"dashboard_id": "123"}
        )
        
        assert event.event_type == "app.instance.created"
        assert event.entity_type == "app_instance"
        assert event.entity_id == 1
        assert event.data["app_code"] == "bi_dashboard_push"
        assert event.data["name"] == "测试看板"
        assert event.data["config"]["dashboard_id"] == "123"
    
    def test_instance_enabled_event(self):
        """测试实例启用事件"""
        event = AppInstanceEnabled(
            instance_id=2,
            app_code="dataset_card_push",
            name="数据集卡片"
        )
        
        assert event.event_type == "app.instance.enabled"
        assert event.entity_id == 2
        assert event.data["app_code"] == "dataset_card_push"
    
    def test_instance_disabled_event(self):
        """测试实例禁用事件"""
        event = AppInstanceDisabled(
            instance_id=3,
            app_code="report_push",
            name="报表推送"
        )
        
        assert event.event_type == "app.instance.disabled"
        assert event.entity_id == 3
    
    def test_instance_deleted_event(self):
        """测试实例删除事件"""
        event = AppInstanceDeleted(
            instance_id=4,
            app_code="anomaly_monitor",
            name="异常监控"
        )
        
        assert event.event_type == "app.instance.deleted"
        assert event.entity_id == 4


class TestAppExecutionEvents:
    """应用执行生命周期事件测试"""
    
    def test_execution_started_event(self):
        """测试执行开始事件"""
        event = AppExecutionStarted(
            execution_id=10,
            instance_id=1,
            app_code="bi_dashboard_push",
            trigger_type="manual"
        )
        
        assert event.event_type == "app.execution.started"
        assert event.entity_type == "app_execution"
        assert event.entity_id == 10
        assert event.data["instance_id"] == 1
        assert event.data["trigger_type"] == "manual"
    
    def test_execution_started_event_with_trigger_by(self):
        """测试带触发者的执行开始事件"""
        event = AppExecutionStarted(
            execution_id=11,
            instance_id=2,
            app_code="dataset_card_push",
            trigger_type="scheduled",
            triggered_by="cron_scheduler"
        )
        
        assert event.data["triggered_by"] == "cron_scheduler"
    
    def test_execution_completed_event(self):
        """测试执行完成事件"""
        event = AppExecutionCompleted(
            execution_id=12,
            instance_id=1,
            app_code="bi_dashboard_push",
            instance_name="每日销售看板",
            trigger_type="scheduled",
            duration_ms=5432,
            output={"dashboard_id": "123", "message_id": "om_xxx"}
        )
        
        assert event.event_type == "app.execution.completed"
        assert event.entity_id == 12
        assert event.data["duration_ms"] == 5432
        assert event.data["output"]["dashboard_id"] == "123"
        assert event.data["instance_name"] == "每日销售看板"
    
    def test_execution_completed_event_without_output(self):
        """测试无输出的执行完成事件"""
        event = AppExecutionCompleted(
            execution_id=13,
            instance_id=2,
            app_code="dataset_card_push",
            instance_name="数据集卡片",
            trigger_type="manual",
            duration_ms=1000
        )
        
        assert event.data["output"] == {}
    
    def test_execution_failed_event(self):
        """测试执行失败事件"""
        event = AppExecutionFailed(
            execution_id=14,
            instance_id=3,
            app_code="report_push",
            instance_name="周报推送",
            trigger_type="event",
            error_message="Connection timeout"
        )
        
        assert event.event_type == "app.execution.failed"
        assert event.entity_id == 14
        assert event.data["error_message"] == "Connection timeout"
    
    def test_execution_failed_event_with_error_type(self):
        """测试带错误类型的执行失败事件"""
        event = AppExecutionFailed(
            execution_id=15,
            instance_id=4,
            app_code="anomaly_monitor",
            instance_name="异常监控",
            trigger_type="manual",
            error_message="Database connection failed",
            error_type="DatabaseError"
        )
        
        assert event.data["error_type"] == "DatabaseError"


class TestEventDataStructure:
    """事件数据结构一致性测试"""
    
    def test_all_events_have_required_fields(self):
        """测试所有事件都包含必需字段"""
        events = [
            AppInstanceCreated(1, "test", "test", "manual", True, {}),
            AppExecutionStarted(1, 1, "test", "manual"),
            AppExecutionCompleted(1, 1, "test", "test", "manual", 1000),
            AppExecutionFailed(1, 1, "test", "test", "manual", "error")
        ]
        
        for event in events:
            # 检查基础字段
            assert hasattr(event, 'event_id')
            assert hasattr(event, 'event_type')
            assert hasattr(event, 'entity_type')
            assert hasattr(event, 'entity_id')
            assert hasattr(event, 'occurred_at')
            assert hasattr(event, 'data')
            
            # 检查事件类型格式
            assert event.event_type.startswith('app.')
            assert '.' in event.event_type
    
    def test_event_type_naming_convention(self):
        """测试事件类型命名规范"""
        event_types = {
            AppInstanceCreated: "app.instance.created",
            AppInstanceEnabled: "app.instance.enabled",
            AppInstanceDisabled: "app.instance.disabled",
            AppInstanceDeleted: "app.instance.deleted",
            AppExecutionStarted: "app.execution.started",
            AppExecutionCompleted: "app.execution.completed",
            AppExecutionFailed: "app.execution.failed"
        }
        
        for event_class, expected_type in event_types.items():
            if event_class in [AppInstanceCreated]:
                event = event_class(1, "test", "test", "manual", True, {})
            elif event_class in [AppInstanceEnabled, AppInstanceDisabled, AppInstanceDeleted]:
                event = event_class(1, "test", "test")
            elif event_class == AppExecutionStarted:
                event = event_class(1, 1, "test", "manual")
            elif event_class == AppExecutionCompleted:
                event = event_class(1, 1, "test", "test", "manual", 1000)
            elif event_class == AppExecutionFailed:
                event = event_class(1, 1, "test", "test", "manual", "error")
            
            assert event.event_type == expected_type


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

