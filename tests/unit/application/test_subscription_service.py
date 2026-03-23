"""
SubscriptionService 单元测试
"""
import pytest
from unittest.mock import MagicMock
from app.infrastructure.repositories.subscription_repository import SubscriptionRepository
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.domain.entities import AppInstance
from app.domain.entities.config.channel import Channel, ChannelType
from app.domain.entities.config.subscription import Subscription


def _make_service():
    """创建 SubscriptionService 并注入 mock 仓储"""
    from app.application.services.config.subscription_service import SubscriptionService
    mock_sub_repo = MagicMock(spec=SubscriptionRepository)
    mock_inst_repo = MagicMock(spec=AppInstanceRepository)
    mock_chan_repo = MagicMock(spec=ChannelRepository)
    service = SubscriptionService(
        subscription_repository=mock_sub_repo,
        app_instance_repository=mock_inst_repo,
        channel_repository=mock_chan_repo,
    )
    return service, mock_sub_repo, mock_inst_repo, mock_chan_repo


class TestSubscriptionService:
    """SubscriptionService 测试"""

    def test_create_subscription_success(self):
        """测试成功创建订阅"""
        service, mock_sub_repo, mock_inst_repo, mock_chan_repo = _make_service()

        mock_instance = MagicMock(spec=AppInstance)
        mock_instance.id = 1
        mock_instance.name = '测试实例'
        mock_instance.app_code = 'test_app'
        mock_inst_repo.find_by_id.return_value = mock_instance

        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.name = '测试渠道'
        mock_channel.channel_type = ChannelType.FEISHU.value
        mock_chan_repo.find_by_id.return_value = mock_channel

        saved = Subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
        )
        saved.id = 1
        mock_sub_repo.save.return_value = saved

        result = service.create_subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            created_by='admin',
        )

        assert result['name'] == '测试订阅'
        mock_sub_repo.save.assert_called_once()

    def test_create_subscription_invalid_event_type(self):
        """测试创建订阅 - 无效事件类型"""
        from app.shared.exceptions import ValidationError

        service, mock_sub_repo, mock_inst_repo, mock_chan_repo = _make_service()
        mock_inst_repo.find_by_id.return_value = MagicMock(spec=AppInstance)
        mock_chan_repo.find_by_id.return_value = MagicMock(spec=Channel)

        with pytest.raises(ValidationError) as exc_info:
            service.create_subscription(
                name='测试',
                app_instance_id=1,
                channel_id=1,
                event_types=['invalid.event.type'],
            )

        assert '不支持的事件类型' in str(exc_info.value)

    def test_create_subscription_empty_event_types(self):
        """测试创建订阅 - 空事件类型"""
        from app.shared.exceptions import ValidationError

        service, mock_sub_repo, mock_inst_repo, mock_chan_repo = _make_service()
        mock_inst_repo.find_by_id.return_value = MagicMock(spec=AppInstance)
        mock_chan_repo.find_by_id.return_value = MagicMock(spec=Channel)

        with pytest.raises(ValidationError) as exc_info:
            service.create_subscription(
                name='测试',
                app_instance_id=1,
                channel_id=1,
                event_types=[],
            )

        assert '至少需要订阅一个事件类型' in str(exc_info.value)

    def test_create_subscription_app_instance_not_found(self):
        """测试创建订阅 - 应用实例不存在"""
        from app.shared.exceptions import NotFoundError

        service, _, mock_inst_repo, _ = _make_service()
        mock_inst_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError) as exc_info:
            service.create_subscription(
                name='测试',
                app_instance_id=999,
                channel_id=1,
                event_types=['app.execution.completed'],
            )

        assert '应用实例' in str(exc_info.value)

    def test_update_subscription(self):
        """测试更新订阅"""
        service, mock_sub_repo, _, _ = _make_service()

        existing = Subscription(
            name='原名称',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
        )
        existing.id = 1
        mock_sub_repo.find_by_id.return_value = existing

        updated = Subscription(
            name='新名称',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.started', 'app.execution.completed'],
        )
        updated.id = 1
        mock_sub_repo.save.return_value = updated

        result = service.update_subscription(
            subscription_id=1,
            name='新名称',
            event_types=['app.execution.started', 'app.execution.completed'],
        )

        assert result['name'] == '新名称'
        assert 'app.execution.started' in result['event_types']

    def test_delete_subscription(self):
        """测试删除订阅"""
        service, mock_sub_repo, _, _ = _make_service()

        existing = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
        )
        existing.id = 1
        mock_sub_repo.find_by_id.return_value = existing

        result = service.delete_subscription(1)

        assert result is True
        mock_sub_repo.delete.assert_called_once_with(existing)

    def test_find_matching_subscriptions(self):
        """测试查找匹配的订阅"""
        service, mock_sub_repo, _, _ = _make_service()

        subscriptions = [
            Subscription(
                name='订阅1',
                app_instance_id=1,
                channel_id=1,
                event_types=['app.execution.completed'],
                filter_conditions={'app_code': 'test_app'},
                enabled=True,
            ),
            Subscription(
                name='订阅2',
                app_instance_id=2,
                channel_id=1,
                event_types=['app.execution.completed'],
                filter_conditions={},
                enabled=True,
            ),
        ]
        mock_sub_repo.find_matching_subscriptions.return_value = subscriptions

        result = service.find_matching_subscriptions(
            event_type='app.execution.completed',
            event_data={'app_code': 'test_app'},
        )

        assert len(result) == 2

    def test_get_subscriptions_by_app_instance(self):
        """测试获取应用实例的订阅"""
        service, mock_sub_repo, _, _ = _make_service()

        subscriptions = [
            Subscription(
                name='订阅1',
                app_instance_id=1,
                channel_id=1,
                event_types=['app.execution.completed'],
                enabled=True,
            )
        ]
        for i, s in enumerate(subscriptions, 1):
            s.id = i
        mock_sub_repo.find_by_app_instance.return_value = subscriptions

        result = service.get_subscriptions_by_app_instance(1)

        assert len(result) == 1
        assert result[0]['app_instance_id'] == 1

    def test_supported_event_types(self):
        """测试支持的事件类型列表"""
        from app.application.services.config.subscription_service import SubscriptionService

        expected_types = [
            'app.instance.created',
            'app.instance.enabled',
            'app.instance.disabled',
            'app.instance.deleted',
            'app.execution.started',
            'app.execution.completed',
            'app.execution.failed',
            'extraction.completed',
            'extraction.failed',
        ]

        assert SubscriptionService.SUPPORTED_EVENT_TYPES == expected_types
