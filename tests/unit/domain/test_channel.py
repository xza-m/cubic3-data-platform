"""
Channel 实体单元测试
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch


class TestChannelEntity:
    """Channel 实体测试"""
    
    def test_channel_type_enum(self):
        """测试渠道类型枚举"""
        from app.domain.entities.config.channel import ChannelType
        
        assert ChannelType.FEISHU.value == 'feishu'
        assert ChannelType.EMAIL.value == 'email'
        assert ChannelType.WEBHOOK.value == 'webhook'
        assert ChannelType.OSS.value == 'oss'
    
    def test_channel_type_detection(self):
        """测试渠道类型检测方法"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 飞书渠道
        feishu_channel = Channel(
            name='测试飞书群',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        assert feishu_channel.is_feishu() is True
        assert feishu_channel.is_email() is False
        assert feishu_channel.is_webhook() is False
        assert feishu_channel.is_oss() is False
        
        # 邮件渠道
        email_channel = Channel(
            name='测试邮件',
            channel_type=ChannelType.EMAIL.value,
            config={'recipients': ['test@example.com']}
        )
        assert email_channel.is_email() is True
        assert email_channel.is_feishu() is False
    
    def test_validate_config_feishu(self):
        """测试飞书渠道配置验证"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 有效配置
        valid_channel = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        assert valid_channel.validate_config() == []
        
        # 无效配置（缺少 chat_id 和 webhook_url）
        invalid_channel = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={}
        )
        errors = invalid_channel.validate_config()
        assert len(errors) == 1
        assert 'chat_id' in errors[0]
    
    def test_validate_config_email(self):
        """测试邮件渠道配置验证"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 有效配置
        valid_channel = Channel(
            name='测试',
            channel_type=ChannelType.EMAIL.value,
            config={'recipients': ['test@example.com']}
        )
        assert valid_channel.validate_config() == []
        
        # 无效配置
        invalid_channel = Channel(
            name='测试',
            channel_type=ChannelType.EMAIL.value,
            config={}
        )
        errors = invalid_channel.validate_config()
        assert len(errors) == 1
        assert 'recipients' in errors[0]
    
    def test_validate_config_webhook(self):
        """测试 Webhook 渠道配置验证"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 有效配置
        valid_channel = Channel(
            name='测试',
            channel_type=ChannelType.WEBHOOK.value,
            config={'url': 'https://example.com/webhook'}
        )
        assert valid_channel.validate_config() == []
        
        # 无效配置
        invalid_channel = Channel(
            name='测试',
            channel_type=ChannelType.WEBHOOK.value,
            config={}
        )
        errors = invalid_channel.validate_config()
        assert len(errors) == 1
        assert 'url' in errors[0]
    
    def test_validate_config_oss(self):
        """测试 OSS 渠道配置验证"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 有效配置
        valid_channel = Channel(
            name='测试',
            channel_type=ChannelType.OSS.value,
            config={'bucket': 'my-bucket'}
        )
        assert valid_channel.validate_config() == []
        
        # 无效配置
        invalid_channel = Channel(
            name='测试',
            channel_type=ChannelType.OSS.value,
            config={}
        )
        errors = invalid_channel.validate_config()
        assert len(errors) == 1
        assert 'bucket' in errors[0]
    
    def test_get_feishu_chat_id(self):
        """测试获取飞书群 ID"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_12345'}
        )
        assert channel.get_feishu_chat_id() == 'oc_12345'
        
        # 非飞书渠道返回 None
        email_channel = Channel(
            name='测试',
            channel_type=ChannelType.EMAIL.value,
            config={'recipients': ['test@example.com']}
        )
        assert email_channel.get_feishu_chat_id() is None
    
    def test_to_dict(self):
        """测试序列化"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试渠道',
            channel_type=ChannelType.FEISHU.value,
            description='测试描述',
            config={'chat_id': 'oc_xxx'},
            enabled=True
        )
        
        result = channel.to_dict()
        assert result['id'] == 1
        assert result['name'] == '测试渠道'
        assert result['channel_type'] == 'feishu'
        assert result['description'] == '测试描述'
        assert result['enabled'] is True
        assert 'config' in result
    
    def test_to_dict_without_config(self):
        """测试序列化（不包含配置）"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试渠道',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        
        result = channel.to_dict(include_config=False)
        assert 'config' not in result
    
    def test_enable_disable(self):
        """测试启用/禁用"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'},
            enabled=False
        )
        
        assert channel.enabled is False
        channel.enable()
        assert channel.enabled is True
        channel.disable()
        assert channel.enabled is False
    
    def test_domain_events(self):
        """测试领域事件记录"""
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            name='测试',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        
        # 记录事件
        event = {'type': 'test', 'data': 'value'}
        channel.record_event(event)
        
        # 清空并获取事件
        events = channel.clear_events()
        assert len(events) == 1
        assert events[0] == event
        
        # 再次获取应为空
        assert len(channel.clear_events()) == 0
