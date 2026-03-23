"""
应用中心事件处理器单元测试

测试 on_execution_started、on_execution_completed、on_execution_failed 等主处理函数，
以及 _deliver_to_subscriptions、_trigger_cascade_applications、_execute_cascade_instance。
（_match_event_type、_check_conditions、_check_cascade_loop 已在 test_cascade_logic.py 中测试）
"""
import pytest
from unittest.mock import MagicMock, patch
from app.infrastructure.events.handlers.app_handler import (
    on_execution_started,
    on_execution_completed,
    on_execution_failed,
    _deliver_to_subscriptions,
    _trigger_cascade_applications,
    _execute_cascade_instance,
)


class TestOnExecutionStarted:
    """on_execution_started 测试"""

    def test_success_logs_event(self):
        """成功时记录日志"""
        event_dict = {
            "event_id": "evt-001",
            "entity_id": 10,
            "data": {
                "instance_id": 1,
                "app_code": "bi_dashboard_push",
                "trigger_type": "manual"
            }
        }
        with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
            on_execution_started(event_dict)
            mock_logger.info.assert_called_once()
            call_kwargs = mock_logger.info.call_args[1]
            assert call_kwargs["extra"]["event_id"] == "evt-001"
            assert call_kwargs["extra"]["execution_id"] == 10
            assert call_kwargs["extra"]["instance_id"] == 1
            assert call_kwargs["extra"]["app_code"] == "bi_dashboard_push"

    def test_exception_handled_gracefully(self):
        """异常时捕获并记录，不抛出"""
        event_dict = {"data": None}  # 访问 data.get 会触发 AttributeError
        with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
            on_execution_started(event_dict)
            mock_logger.error.assert_called_once()
            assert "Error handling" in mock_logger.error.call_args[0][0]


class TestOnExecutionCompleted:
    """on_execution_completed 测试"""

    def test_success_triggers_cascade_and_delivery(self):
        """成功时触发级联和订阅分发"""
        event_dict = {
            "event_id": "evt-002",
            "entity_id": 11,
            "data": {
                "instance_id": 2,
                "app_code": "bi_dashboard_push",
                "duration_ms": 5000
            }
        }
        with patch("app.infrastructure.events.handlers.app_handler.logger"):
            with patch("app.infrastructure.events.handlers.app_handler._trigger_cascade_applications") as mock_cascade:
                with patch("app.infrastructure.events.handlers.app_handler._deliver_to_subscriptions") as mock_deliver:
                    on_execution_completed(event_dict)
                    mock_cascade.assert_called_once_with(event_dict)
                    mock_deliver.assert_called_once_with(
                        event_type='app.execution.completed',
                        event_dict=event_dict
                    )

    def test_exception_handled_gracefully(self):
        """异常时捕获并记录"""
        event_dict = {"data": None}
        with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
            with patch("app.infrastructure.events.handlers.app_handler._trigger_cascade_applications", side_effect=RuntimeError("boom")):
                on_execution_completed(event_dict)
                mock_logger.error.assert_called_once()
                assert "Error handling" in mock_logger.error.call_args[0][0]


class TestOnExecutionFailed:
    """on_execution_failed 测试"""

    def test_success_logs_and_delivers(self):
        """成功时记录日志并触发订阅分发"""
        event_dict = {
            "event_id": "evt-003",
            "entity_id": 12,
            "data": {
                "instance_id": 3,
                "app_code": "report_push",
                "error_message": "Connection timeout"
            }
        }
        with patch("app.infrastructure.events.handlers.app_handler.logger"):
            with patch("app.infrastructure.events.handlers.app_handler._deliver_to_subscriptions") as mock_deliver:
                on_execution_failed(event_dict)
                mock_deliver.assert_called_once_with(
                    event_type='app.execution.failed',
                    event_dict=event_dict
                )

    def test_exception_handled_gracefully(self):
        """异常时捕获并记录"""
        event_dict = {"data": None}
        with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
            with patch("app.infrastructure.events.handlers.app_handler._deliver_to_subscriptions", side_effect=ValueError("fail")):
                on_execution_failed(event_dict)
                mock_logger.error.assert_called_once()


class TestDeliverToSubscriptions:
    """_deliver_to_subscriptions 测试"""

    def test_success_delivers(self):
        """成功时调用 delivery_service"""
        event_dict = {
            "data": {"instance_id": 1}
        }
        mock_delivery = MagicMock()
        mock_delivery.deliver_event.return_value = {
            "total_subscriptions": 2,
            "successful": 2,
            "failed": 0
        }
        mock_container = MagicMock()
        mock_container.delivery_service.return_value = mock_delivery

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger"):
                _deliver_to_subscriptions("app.execution.completed", event_dict)

        mock_delivery.deliver_event.assert_called_once_with(
            event_type="app.execution.completed",
            event_data={"instance_id": 1},
            source_app_instance_id=1
        )

    def test_no_instance_id_skips(self):
        """无 instance_id 时跳过分发"""
        event_dict = {"data": {}}
        mock_container = MagicMock()

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
                _deliver_to_subscriptions("app.execution.completed", event_dict)

        mock_container.delivery_service.assert_not_called()
        mock_logger.warning.assert_called_once()
        assert "instance_id" in mock_logger.warning.call_args[0][0]

    def test_exception_handled_gracefully(self):
        """异常时捕获并记录"""
        event_dict = {"data": {"instance_id": 1}}
        mock_container = MagicMock()
        mock_container.delivery_service.side_effect = RuntimeError("delivery failed")

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
                _deliver_to_subscriptions("app.execution.completed", event_dict)

        mock_logger.error.assert_called_once()
        assert "subscription delivery" in mock_logger.error.call_args[0][0]


class TestTriggerCascadeApplications:
    """_trigger_cascade_applications 测试"""

    def test_no_instances_returns_early(self):
        """无事件触发实例时直接返回"""
        mock_repo = MagicMock()
        mock_repo.find_enabled_event_instances.return_value = []
        mock_container = MagicMock()
        mock_container.app_instance_repository.return_value = mock_repo

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger"):
                _trigger_cascade_applications({"event_type": "app.execution.completed"})

        mock_repo.find_enabled_event_instances.assert_called_once()

    def test_triggers_matching_instance(self):
        """匹配的实例被触发"""
        mock_instance = MagicMock()
        mock_instance.id = 2
        mock_instance.name = "下游应用"
        mock_instance.config = {
            "trigger_on_event": {
                "enabled": True,
                "event_types": ["app.execution.completed"],
                "conditions": {}
            }
        }

        mock_repo = MagicMock()
        mock_repo.find_enabled_event_instances.return_value = [mock_instance]
        mock_container = MagicMock()
        mock_container.app_instance_repository.return_value = mock_repo

        event_dict = {
            "event_type": "app.execution.completed",
            "event_id": "evt-001",
            "data": {"instance_id": 1},
            "metadata": {}
        }

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger"):
                with patch("app.infrastructure.events.handlers.app_handler._execute_cascade_instance") as mock_exec:
                    _trigger_cascade_applications(event_dict)
                    mock_exec.assert_called_once()
                    call_args = mock_exec.call_args[0]
                    assert call_args[0] == mock_instance
                    assert call_args[1] == event_dict

    def test_skips_disabled_trigger(self):
        """跳过未启用触发配置的实例"""
        mock_instance = MagicMock()
        mock_instance.id = 2
        mock_instance.config = {
            "trigger_on_event": {"enabled": False}
        }

        mock_repo = MagicMock()
        mock_repo.find_enabled_event_instances.return_value = [mock_instance]
        mock_container = MagicMock()
        mock_container.app_instance_repository.return_value = mock_repo

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler._execute_cascade_instance") as mock_exec:
                _trigger_cascade_applications({"event_type": "app.execution.completed"})
                mock_exec.assert_not_called()

    def test_exception_handled_gracefully(self):
        """异常时捕获并记录"""
        mock_container = MagicMock()
        mock_container.app_instance_repository.side_effect = RuntimeError("repo error")

        with patch("app.di.container.get_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
                _trigger_cascade_applications({"event_type": "app.execution.completed"})
                mock_logger.error.assert_called_once()
                assert "cascade trigger" in mock_logger.error.call_args[0][0]


class TestExecuteCascadeInstance:
    """_execute_cascade_instance 测试"""

    def test_immediate_execution(self):
        """无延迟时立即执行"""
        mock_instance = MagicMock()
        mock_instance.id = 2
        mock_execution = MagicMock()
        mock_execution.execute_instance.return_value = 999
        mock_container = MagicMock()
        mock_container.execution_service.return_value = mock_execution

        event_dict = {
            "event_id": "evt-001",
            "data": {"instance_id": 1},
            "metadata": {}
        }
        trigger_config = {"delay_seconds": 0}

        with patch("app.di.utils.get_app_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger"):
                _execute_cascade_instance(mock_instance, event_dict, trigger_config)

        mock_execution.execute_instance.assert_called_once()
        call_kwargs = mock_execution.execute_instance.call_args[1]
        assert call_kwargs["instance_id"] == 2
        assert call_kwargs["trigger_type"] == "event"
        assert call_kwargs["triggered_by"] == "event_cascade"
        assert "cascade_chain" in call_kwargs["extra_data"]

    def test_delayed_execution(self):
        """有延迟时通过队列调度"""
        mock_instance = MagicMock()
        mock_instance.id = 3
        mock_queue = MagicMock()
        mock_container = MagicMock()
        mock_container.execution_service.return_value = MagicMock()

        event_dict = {
            "event_id": "evt-002",
            "data": {"instance_id": 1},
            "metadata": {}
        }
        trigger_config = {"delay_seconds": 5}

        with patch("app.di.utils.get_app_container", return_value=mock_container):
            with patch("app.infrastructure.queue.get_queue", return_value=mock_queue):
                with patch("app.infrastructure.events.handlers.app_handler.logger"):
                    _execute_cascade_instance(mock_instance, event_dict, trigger_config)

        mock_queue.enqueue_in.assert_called_once()
        call_args = mock_queue.enqueue_in.call_args[0]
        assert call_args[0].seconds == 5

    def test_exception_handled_gracefully(self):
        """执行异常时捕获并记录"""
        mock_instance = MagicMock()
        mock_instance.id = 2
        mock_container = MagicMock()
        mock_container.execution_service.side_effect = RuntimeError("exec failed")

        with patch("app.di.utils.get_app_container", return_value=mock_container):
            with patch("app.infrastructure.events.handlers.app_handler.logger") as mock_logger:
                _execute_cascade_instance(
                    mock_instance,
                    {"event_id": "e1", "data": {}, "metadata": {}},
                    {"delay_seconds": 0}
                )
                mock_logger.error.assert_called_once()
                assert "Failed to execute cascade" in mock_logger.error.call_args[0][0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
