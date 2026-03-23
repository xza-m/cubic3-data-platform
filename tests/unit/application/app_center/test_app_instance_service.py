"""
AppInstanceService 单元测试

覆盖：
- create_instance: 成功、应用不存在、配置验证失败、事件触发配置验证
- update_instance: 成功、实例不存在、无权限、配置验证失败
- delete_instance: 成功、实例不存在、无权限
- get_instance: 找到、未找到
- list_instances: 无筛选、带筛选
- enable_instance / disable_instance: 成功、实例不存在、无权限
"""
import pytest
from unittest.mock import MagicMock, patch

from app.application.services.app_center.app_instance_service import AppInstanceService
from app.domain.entities import AppInstance, AppDefinition
from app.domain.app_center.execution_context import ValidationResult
from app.shared.exceptions import ValidationError, NotFoundError, AuthorizationError


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_app_instance_repo():
    return MagicMock()


@pytest.fixture
def mock_app_definition_repo():
    return MagicMock()


@pytest.fixture
def mock_scheduler_service():
    return MagicMock()


@pytest.fixture
def service(mock_app_instance_repo, mock_app_definition_repo, mock_scheduler_service):
    return AppInstanceService(
        app_instance_repository=mock_app_instance_repo,
        app_definition_repository=mock_app_definition_repo,
        scheduler_service=mock_scheduler_service,
    )


@pytest.fixture
def service_no_scheduler(mock_app_instance_repo, mock_app_definition_repo):
    """无调度器的服务（scheduler_service=None）"""
    return AppInstanceService(
        app_instance_repository=mock_app_instance_repo,
        app_definition_repository=mock_app_definition_repo,
        scheduler_service=None,
    )


def _make_app_definition(code="test_app", name="测试应用"):
    app_def = MagicMock(spec=AppDefinition)
    app_def.code = code
    app_def.name = name
    return app_def


def _make_app_instance(
    instance_id=1,
    app_code="test_app",
    name="实例1",
    owner="user1",
    schedule_type="manual",
    enabled=False,
):
    inst = MagicMock(spec=AppInstance)
    inst.id = instance_id
    inst.app_code = app_code
    inst.name = name
    inst.owner = owner
    inst.schedule_type = schedule_type
    inst.enabled = enabled
    inst.config = {}
    inst.schedule_config = None
    inst.description = None
    inst.app_definition = _make_app_definition(app_code)
    inst.to_dict.return_value = {
        "id": instance_id,
        "app_code": app_code,
        "name": name,
        "owner": owner,
        "schedule_type": schedule_type,
        "enabled": enabled,
    }
    return inst


# ============================================================================
# create_instance
# ============================================================================

class TestCreateInstance:
    def test_success_manual_schedule(
        self, service, mock_app_instance_repo, mock_app_definition_repo, mock_scheduler_service
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        saved_instance = _make_app_instance(instance_id=10, name="新实例")
        mock_app_instance_repo.save.return_value = saved_instance

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            result = service.create_instance(
                app_code="test_app",
                name="新实例",
                config={"key": "value"},
                schedule_type="manual",
                owner="user1",
            )

        assert result == saved_instance.to_dict.return_value
        mock_app_instance_repo.save.assert_called_once()
        mock_scheduler_service.add_schedule.assert_not_called()

    def test_success_cron_enabled_registers_schedule(
        self, service, mock_app_instance_repo, mock_app_definition_repo, mock_scheduler_service
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        saved_instance = _make_app_instance(
            instance_id=10, schedule_type="cron", enabled=True
        )
        mock_app_instance_repo.save.return_value = saved_instance

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            result = service.create_instance(
                app_code="test_app",
                name="定时实例",
                config={"key": "value"},
                schedule_type="cron",
                owner="user1",
                schedule_config={"cron": "0 * * * *"},
                enabled=True,
            )

        mock_scheduler_service.add_schedule.assert_called_once_with(saved_instance)

    def test_raises_not_found_when_app_does_not_exist(
        self, service, mock_app_definition_repo
    ):
        mock_app_definition_repo.find_by_code.return_value = None

        with pytest.raises(NotFoundError, match="应用 nonexistent 不存在"):
            service.create_instance(
                app_code="nonexistent",
                name="实例",
                config={},
                schedule_type="manual",
                owner="user1",
            )

        mock_app_instance_repo = service.app_instance_repository
        mock_app_instance_repo.save.assert_not_called()

    def test_raises_validation_error_when_executor_config_invalid(
        self, service, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        mock_executor = MagicMock()
        mock_executor.validate_config.return_value = ValidationResult(
            is_valid=False,
            errors={"config": ["缺少必填字段"]},
        )

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            with pytest.raises(ValidationError, match="配置验证失败") as exc_info:
                service.create_instance(
                    app_code="test_app",
                    name="实例",
                    config={"invalid": "config"},
                    schedule_type="manual",
                    owner="user1",
                )

        assert exc_info.value.details == {"errors": {"config": ["缺少必填字段"]}}

    def test_raises_validation_error_when_event_type_without_trigger_config(
        self, service, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            with pytest.raises(ValidationError, match="需要启用 trigger_on_event 配置"):
                service.create_instance(
                    app_code="test_app",
                    name="实例",
                    config={},
                    schedule_type="event",
                    owner="user1",
                )

    def test_raises_validation_error_when_event_type_without_event_types(
        self, service, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            with pytest.raises(ValidationError, match="需要指定 event_types"):
                service.create_instance(
                    app_code="test_app",
                    name="实例",
                    config={"trigger_on_event": {"enabled": True}},
                    schedule_type="event",
                    owner="user1",
                )

    def test_raises_validation_error_when_trigger_on_event_invalid_format(
        self, service, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            with pytest.raises(ValidationError, match="事件触发配置验证失败"):
                service.create_instance(
                    app_code="test_app",
                    name="实例",
                    config={
                        "trigger_on_event": {
                            "enabled": True,
                            "event_types": ["invalid.event.type"],
                        }
                    },
                    schedule_type="event",
                    owner="user1",
                )


# ============================================================================
# update_instance
# ============================================================================

class TestUpdateInstance:
    def test_success(
        self, service, mock_app_instance_repo, mock_app_definition_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="user1")
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.update_instance(
            instance_id=1,
            user="user1",
            name="新名称",
        )

        assert instance.name == "新名称"
        mock_app_instance_repo.commit.assert_called_once()
        assert result == instance.to_dict.return_value

    def test_raises_not_found_when_instance_missing(
        self, service, mock_app_instance_repo
    ):
        mock_app_instance_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError, match="实例 99 不存在"):
            service.update_instance(instance_id=99, user="user1")

    def test_raises_authorization_error_when_not_owner(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="owner1")
        instance.is_owned_by.return_value = False
        mock_app_instance_repo.find_by_id.return_value = instance

        with pytest.raises(AuthorizationError, match="无权限修改此实例"):
            service.update_instance(instance_id=1, user="other_user")

    def test_raises_validation_error_when_config_invalid(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="user1")
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        mock_executor = MagicMock()
        mock_executor.validate_config.return_value = ValidationResult(
            is_valid=False,
            errors={"config": ["配置错误"]},
        )

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            with pytest.raises(ValidationError, match="配置验证失败"):
                service.update_instance(
                    instance_id=1,
                    user="user1",
                    config={"bad": "config"},
                )

    def test_updates_schedule_and_reregisters_when_cron_enabled(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(
            instance_id=1, owner="user1", schedule_type="cron", enabled=True
        )
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        service.update_instance(
            instance_id=1,
            user="user1",
            schedule_config={"cron": "0 0 * * *"},
        )

        instance.update_schedule.assert_called_once()
        mock_scheduler_service.remove_schedule.assert_called_once_with(1)
        mock_scheduler_service.add_schedule.assert_called_once_with(instance)


# ============================================================================
# delete_instance
# ============================================================================

class TestDeleteInstance:
    def test_success(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(instance_id=1, owner="user1")
        instance.is_owned_by.return_value = True
        instance.schedule_type = "manual"
        mock_app_instance_repo.find_by_id.return_value = instance

        service.delete_instance(instance_id=1, user="user1")

        mock_app_instance_repo.delete.assert_called_once_with(instance)
        mock_scheduler_service.remove_schedule.assert_not_called()

    def test_removes_schedule_when_cron(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(
            instance_id=1, owner="user1", schedule_type="cron"
        )
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        service.delete_instance(instance_id=1, user="user1")

        mock_scheduler_service.remove_schedule.assert_called_once_with(1)
        mock_app_instance_repo.delete.assert_called_once_with(instance)

    def test_raises_not_found_when_instance_missing(
        self, service, mock_app_instance_repo
    ):
        mock_app_instance_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError, match="实例 99 不存在"):
            service.delete_instance(instance_id=99, user="user1")

    def test_raises_authorization_error_when_not_owner(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="owner1")
        instance.is_owned_by.return_value = False
        mock_app_instance_repo.find_by_id.return_value = instance

        with pytest.raises(AuthorizationError, match="无权限删除此实例"):
            service.delete_instance(instance_id=1, user="other_user")


# ============================================================================
# get_instance
# ============================================================================

class TestGetInstance:
    def test_found(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance()
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.get_instance(instance_id=1)

        assert result == instance.to_dict.return_value
        instance.to_dict.assert_called_once_with(include_app_info=True, include_stats=False)

    def test_found_with_stats(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance()
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.get_instance(instance_id=1, include_stats=True)

        instance.to_dict.assert_called_once_with(include_app_info=True, include_stats=True)

    def test_not_found_returns_none(
        self, service, mock_app_instance_repo
    ):
        mock_app_instance_repo.find_by_id.return_value = None

        result = service.get_instance(instance_id=99)

        assert result is None


# ============================================================================
# list_instances
# ============================================================================

class TestListInstances:
    def test_without_filters(
        self, service, mock_app_instance_repo
    ):
        inst1 = _make_app_instance(instance_id=1)
        inst2 = _make_app_instance(instance_id=2, name="实例2")
        mock_app_instance_repo.find_all.return_value = ([inst1, inst2], 2)

        result = service.list_instances()

        mock_app_instance_repo.find_all.assert_called_once_with(
            app_code=None,
            owner=None,
            enabled=None,
            page=1,
            page_size=20,
        )
        assert result["total"] == 2
        assert len(result["items"]) == 2
        assert result["page"] == 1
        assert result["page_size"] == 20
        assert result["pages"] == 1

    def test_with_filters(
        self, service, mock_app_instance_repo
    ):
        inst = _make_app_instance()
        mock_app_instance_repo.find_all.return_value = ([inst], 1)

        result = service.list_instances(
            app_code="test_app",
            owner="user1",
            enabled=True,
            page=2,
            page_size=10,
        )

        mock_app_instance_repo.find_all.assert_called_once_with(
            app_code="test_app",
            owner="user1",
            enabled=True,
            page=2,
            page_size=10,
        )
        assert result["total"] == 1
        assert result["page"] == 2
        assert result["page_size"] == 10
        assert result["pages"] == 1


# ============================================================================
# enable_instance / disable_instance
# ============================================================================

class TestEnableInstance:
    def test_success(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(instance_id=1, owner="user1")
        instance.is_owned_by.return_value = True
        instance.schedule_type = "manual"
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.enable_instance(instance_id=1, user="user1")

        instance.enable.assert_called_once()
        mock_app_instance_repo.commit.assert_called_once()
        assert result == instance.to_dict.return_value
        mock_scheduler_service.add_schedule.assert_not_called()

    def test_success_cron_registers_schedule(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(
            instance_id=1, owner="user1", schedule_type="cron"
        )
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.enable_instance(instance_id=1, user="user1")

        instance.enable.assert_called_once()
        mock_scheduler_service.add_schedule.assert_called_once_with(instance)

    def test_raises_not_found_when_instance_missing(
        self, service, mock_app_instance_repo
    ):
        mock_app_instance_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError, match="实例 99 不存在"):
            service.enable_instance(instance_id=99, user="user1")

    def test_raises_authorization_error_when_not_owner(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="owner1")
        instance.is_owned_by.return_value = False
        mock_app_instance_repo.find_by_id.return_value = instance

        with pytest.raises(AuthorizationError, match="无权限操作此实例"):
            service.enable_instance(instance_id=1, user="other_user")


class TestDisableInstance:
    def test_success(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(instance_id=1, owner="user1")
        instance.is_owned_by.return_value = True
        instance.schedule_type = "manual"
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.disable_instance(instance_id=1, user="user1")

        instance.disable.assert_called_once()
        mock_app_instance_repo.commit.assert_called_once()
        assert result == instance.to_dict.return_value
        mock_scheduler_service.remove_schedule.assert_not_called()

    def test_success_cron_removes_schedule(
        self, service, mock_app_instance_repo, mock_scheduler_service
    ):
        instance = _make_app_instance(
            instance_id=1, owner="user1", schedule_type="cron"
        )
        instance.is_owned_by.return_value = True
        mock_app_instance_repo.find_by_id.return_value = instance

        result = service.disable_instance(instance_id=1, user="user1")

        instance.disable.assert_called_once()
        mock_scheduler_service.remove_schedule.assert_called_once_with(1)

    def test_raises_not_found_when_instance_missing(
        self, service, mock_app_instance_repo
    ):
        mock_app_instance_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError, match="实例 99 不存在"):
            service.disable_instance(instance_id=99, user="user1")

    def test_raises_authorization_error_when_not_owner(
        self, service, mock_app_instance_repo
    ):
        instance = _make_app_instance(instance_id=1, owner="owner1")
        instance.is_owned_by.return_value = False
        mock_app_instance_repo.find_by_id.return_value = instance

        with pytest.raises(AuthorizationError, match="无权限操作此实例"):
            service.disable_instance(instance_id=1, user="other_user")


# ============================================================================
# _validate_trigger_on_event_config (间接覆盖)
# ============================================================================

class TestValidateTriggerOnEventConfig:
    """通过 create_instance 间接测试 _validate_trigger_on_event_config"""

    def test_valid_event_types_pass(
        self, service, mock_app_instance_repo, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def
        saved_instance = _make_app_instance(instance_id=10)
        mock_app_instance_repo.save.return_value = saved_instance

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            result = service.create_instance(
                app_code="test_app",
                name="事件实例",
                config={
                    "trigger_on_event": {
                        "enabled": True,
                        "event_types": ["extraction.completed", "app.execution.started"],
                    }
                },
                schedule_type="event",
                owner="user1",
            )

        assert result is not None

    def test_delay_seconds_out_of_range_fails(
        self, service, mock_app_definition_repo
    ):
        app_def = _make_app_definition()
        mock_app_definition_repo.find_by_code.return_value = app_def

        with patch(
            "app.application.services.app_center.app_instance_service.ExecutorFactory.create",
            return_value=None,
        ):
            with pytest.raises(ValidationError, match="事件触发配置验证失败"):
                service.create_instance(
                    app_code="test_app",
                    name="实例",
                    config={
                        "trigger_on_event": {
                            "enabled": True,
                            "event_types": ["extraction.completed"],
                            "delay_seconds": 9999,
                        }
                    },
                    schedule_type="event",
                    owner="user1",
                )
