"""
ChannelService 单元测试
"""
import pytest
from unittest.mock import MagicMock, patch
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.domain.entities.config.channel import Channel, ChannelType


def _make_service():
    """创建 ChannelService 并注入 mock 仓储"""
    from app.application.services.config.channel_service import ChannelService
    mock_repo = MagicMock(spec=ChannelRepository)
    service = ChannelService(channel_repository=mock_repo)
    return service, mock_repo


class TestChannelService:
    """ChannelService 测试"""

    def test_create_channel_success(self):
        """测试成功创建渠道"""
        service, mock_repo = _make_service()

        saved_channel = Channel(
            name='测试飞书群',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_12345'},
        )
        saved_channel.id = 1
        mock_repo.save.return_value = saved_channel

        result = service.create_channel(
            name='测试飞书群',
            channel_type='feishu',
            config={'chat_id': 'oc_12345'},
            description='测试描述',
            created_by='admin',
        )

        assert result['name'] == '测试飞书群'
        assert result['channel_type'] == 'feishu'
        mock_repo.save.assert_called_once()

    def test_create_channel_invalid_type(self):
        """测试创建渠道 - 无效类型"""
        from app.shared.exceptions import ValidationError

        service, _ = _make_service()

        with pytest.raises(ValidationError) as exc_info:
            service.create_channel(
                name='测试',
                channel_type='invalid_type',
                config={},
            )

        assert '不支持的渠道类型' in str(exc_info.value)

    def test_create_channel_invalid_config(self):
        """测试创建渠道 - 无效配置"""
        from app.shared.exceptions import ValidationError

        service, _ = _make_service()

        with pytest.raises(ValidationError) as exc_info:
            service.create_channel(
                name='测试',
                channel_type='feishu',
                config={},  # 缺少 chat_id
            )

        assert '渠道配置验证失败' in str(exc_info.value)

    def test_update_channel(self):
        """测试更新渠道"""
        service, mock_repo = _make_service()

        existing = Channel(
            name='原名称',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_old'},
        )
        existing.id = 1
        mock_repo.find_by_id.return_value = existing

        result = service.update_channel(
            channel_id=1,
            name='新名称',
            config={'chat_id': 'oc_new'},
        )

        assert result['name'] == '新名称'
        mock_repo.commit.assert_called_once()

    def test_update_channel_not_found(self):
        """测试更新渠道 - 不存在"""
        from app.shared.exceptions import NotFoundError

        service, mock_repo = _make_service()
        mock_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            service.update_channel(channel_id=999, name='新名称')

    def test_delete_channel(self):
        """测试删除渠道"""
        service, mock_repo = _make_service()

        existing = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'},
        )
        existing.id = 1
        mock_repo.find_by_id.return_value = existing

        result = service.delete_channel(1)

        assert result is True
        mock_repo.delete.assert_called_once_with(existing)

    def test_get_channel(self):
        """测试获取渠道详情"""
        service, mock_repo = _make_service()

        existing = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'},
        )
        existing.id = 1
        mock_repo.find_by_id.return_value = existing

        result = service.get_channel(1)

        assert result['id'] == 1
        assert result['name'] == '测试'

    def test_list_channels(self):
        """测试获取渠道列表"""
        service, mock_repo = _make_service()

        channels = [
            Channel(name='渠道1', channel_type=ChannelType.FEISHU.value, config={'chat_id': 'oc_1'}),
            Channel(name='渠道2', channel_type=ChannelType.EMAIL.value, config={'recipients': ['a@b.com']}),
        ]
        for i, c in enumerate(channels, 1):
            c.id = i
        mock_repo.find_all.return_value = (channels, 2)

        result = service.list_channels()

        assert result['total'] == 2
        assert len(result['items']) == 2
        assert result['page'] == 1

    def test_enable_channel(self):
        """测试启用渠道"""
        service, mock_repo = _make_service()

        existing = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'},
            enabled=False,
        )
        existing.id = 1
        mock_repo.find_by_id.return_value = existing
        mock_repo.save.return_value = existing

        result = service.enable_channel(1)

        assert result['enabled'] is True

    def test_disable_channel(self):
        """测试禁用渠道"""
        service, mock_repo = _make_service()

        existing = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'},
            enabled=True,
        )
        existing.id = 1
        mock_repo.find_by_id.return_value = existing
        mock_repo.save.return_value = existing

        result = service.disable_channel(1)

        assert result['enabled'] is False
