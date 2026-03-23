"""
DeliveryService 单元测试
"""
import pytest
from unittest.mock import MagicMock, patch


class TestDeliveryService:
    """DeliveryService 测试"""
    
    def test_deliver_event_no_matching_subscriptions(self):
        """测试分发事件 - 无匹配订阅"""
        from app.application.services.config.delivery_service import DeliveryService
        
        mock_subscription_service = MagicMock()
        mock_subscription_service.find_matching_subscriptions.return_value = []
        
        service = DeliveryService(subscription_service=mock_subscription_service)
        result = service.deliver_event(
            event_type='app.execution.completed',
            event_data={'app_code': 'test'}
        )
        
        assert result['total_subscriptions'] == 0
        assert result['successful'] == 0
        assert result['failed'] == 0
    
    def test_deliver_event_with_subscriptions(self):
        """测试分发事件 - 有匹配订阅"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        # 创建模拟的订阅和渠道
        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.channel_type = ChannelType.WEBHOOK.value
        mock_channel.enabled = True
        mock_channel.config = {'url': 'https://example.com/webhook'}
        
        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试订阅'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel
        mock_subscription.delivery_config = {}
        
        mock_subscription_service = MagicMock()
        mock_subscription_service.find_matching_subscriptions.return_value = [mock_subscription]
        
        service = DeliveryService(subscription_service=mock_subscription_service)
        
        # 模拟 Webhook 请求
        with patch('requests.request') as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_request.return_value = mock_response
            
            result = service.deliver_event(
                event_type='app.execution.completed',
                event_data={'app_code': 'test'}
            )
        
        assert result['total_subscriptions'] == 1
        assert result['successful'] == 1
        assert result['failed'] == 0
    
    def test_deliver_event_channel_disabled(self):
        """测试分发事件 - 渠道已禁用"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        mock_channel = MagicMock(spec=Channel)
        mock_channel.enabled = False
        
        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试订阅'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel
        
        mock_subscription_service = MagicMock()
        mock_subscription_service.find_matching_subscriptions.return_value = [mock_subscription]
        
        service = DeliveryService(subscription_service=mock_subscription_service)
        result = service.deliver_event(
            event_type='app.execution.completed',
            event_data={}
        )
        
        assert result['total_subscriptions'] == 1
        assert result['failed'] == 1
        assert '渠道已禁用' in result['details'][0]['error']
    
    def test_deliver_to_webhook_success(self):
        """测试 Webhook 分发成功"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试Webhook',
            channel_type=ChannelType.WEBHOOK.value,
            config={'url': 'https://example.com/hook', 'method': 'POST'}
        )
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            delivery_config={}
        )
        
        service = DeliveryService(subscription_service=MagicMock())
        
        with patch('requests.request') as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_request.return_value = mock_response
            
            result = service._deliver_to_webhook(channel, subscription, {'test': 'data'})
        
        assert result['success'] is True
        assert result['status_code'] == 200
    
    def test_deliver_to_webhook_failure(self):
        """测试 Webhook 分发失败"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试Webhook',
            channel_type=ChannelType.WEBHOOK.value,
            config={'url': 'https://example.com/hook'}
        )
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )
        
        service = DeliveryService(subscription_service=MagicMock())
        
        with patch('requests.request') as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.text = 'Internal Server Error'
            mock_request.return_value = mock_response
            
            result = service._deliver_to_webhook(channel, subscription, {})
        
        assert result['success'] is False
        assert 'HTTP 500' in result['error']
    
    def test_deliver_to_webhook_no_url(self):
        """测试 Webhook 分发 - 无 URL 配置"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试Webhook',
            channel_type=ChannelType.WEBHOOK.value,
            config={}  # 缺少 url
        )
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )
        
        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_webhook(channel, subscription, {})
        
        assert result['success'] is False
        assert 'URL' in result['error']
    
    def test_build_feishu_message_with_template(self):
        """测试构建飞书消息 - 使用模板"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试飞书',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx', 'message_template': '应用 {app_code} 执行完成'}
        )
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )
        
        service = DeliveryService(subscription_service=MagicMock())
        result = service._build_feishu_message(
            channel, subscription, {'app_code': 'test_app'}
        )
        
        assert result['msg_type'] == 'text'
        assert '应用 test_app 执行完成' in result['content']['text']
    
    def test_build_feishu_message_default(self):
        """测试构建飞书消息 - 默认格式"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType
        
        channel = Channel(
            id=1,
            name='测试飞书',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )
        
        service = DeliveryService(subscription_service=MagicMock())
        result = service._build_feishu_message(
            channel, subscription, {'app_code': 'test'}
        )
        
        assert result['msg_type'] == 'text'
        assert '事件通知' in result['content']['text']
        assert '测试订阅' in result['content']['text']
    
    def test_filter_by_source_app_instance(self):
        """测试按源应用实例过滤"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        
        sub1 = MagicMock(spec=Subscription)
        sub1.id = 1
        sub1.app_instance_id = 10
        
        sub2 = MagicMock(spec=Subscription)
        sub2.id = 2
        sub2.app_instance_id = 20
        
        mock_subscription_service = MagicMock()
        mock_subscription_service.find_matching_subscriptions.return_value = [sub1, sub2]
        
        service = DeliveryService(subscription_service=mock_subscription_service)
        result = service.deliver_event(
            event_type='app.execution.completed',
            event_data={},
            source_app_instance_id=10  # 只处理实例 10 的订阅
        )
        
        # 只有 sub1 应该被处理
        assert result['total_subscriptions'] == 1

    def test_deliver_event_exception_during_delivery(self):
        """测试分发事件 - 单个订阅分发时抛出异常"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.channel_type = ChannelType.WEBHOOK.value
        mock_channel.enabled = True
        mock_channel.config = {'url': 'https://example.com/webhook'}

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试订阅'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel

        mock_subscription_service = MagicMock()
        mock_subscription_service.find_matching_subscriptions.return_value = [mock_subscription]

        service = DeliveryService(subscription_service=mock_subscription_service)

        with patch('requests.request') as mock_request:
            mock_request.side_effect = ConnectionError('网络错误')

            result = service.deliver_event(
                event_type='app.execution.completed',
                event_data={'app_code': 'test'}
            )

        assert result['total_subscriptions'] == 1
        assert result['successful'] == 0
        assert result['failed'] == 1
        assert '网络错误' in result['details'][0]['error']

    def test_deliver_to_channel_channel_none(self):
        """测试 _deliver_to_channel - 渠道不存在"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试'
        mock_subscription.channel_id = 1
        mock_subscription.channel = None

        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_channel(
            subscription=mock_subscription,
            event_type='app.execution.completed',
            event_data={}
        )
        assert result['success'] is False
        assert '渠道不存在' in result['error']

    def test_deliver_to_channel_routing_feishu(self, app):
        """测试 _deliver_to_channel - 路由到飞书"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.channel_type = ChannelType.FEISHU.value
        mock_channel.enabled = True
        mock_channel.config = {}
        mock_channel.get_feishu_chat_id.return_value = None
        mock_channel.get_feishu_webhook_url.return_value = 'https://open.feishu.cn/webhook/xxx'

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel
        mock_subscription.delivery_config = {}

        service = DeliveryService(subscription_service=MagicMock())
        with app.app_context():
            with patch('requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.raise_for_status = MagicMock()
                mock_post.return_value = mock_response

                result = service._deliver_to_channel(
                    subscription=mock_subscription,
                    event_type='app.execution.completed',
                    event_data={'app_code': 'test'}
                )
        assert result['success'] is True

    def test_deliver_to_channel_routing_email(self):
        """测试 _deliver_to_channel - 路由到邮件（未实现）"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.channel_type = ChannelType.EMAIL.value
        mock_channel.enabled = True

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel

        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_channel(
            subscription=mock_subscription,
            event_type='app.execution.completed',
            event_data={}
        )
        assert result['success'] is False
        assert '邮件分发暂未实现' in result['error']

    def test_deliver_to_channel_routing_oss(self):
        """测试 _deliver_to_channel - 路由到 OSS（未实现）"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.id = 1
        mock_channel.channel_type = ChannelType.OSS.value
        mock_channel.enabled = True

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试'
        mock_subscription.channel_id = 1
        mock_subscription.channel = mock_channel

        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_channel(
            subscription=mock_subscription,
            event_type='app.execution.completed',
            event_data={}
        )
        assert result['success'] is False
        assert 'OSS分发暂未实现' in result['error']

    def test_deliver_to_channel_unsupported_type(self):
        """测试 _deliver_to_channel - 不支持的渠道类型"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel

        channel = MagicMock(spec=Channel)
        channel.id = 1
        channel.channel_type = 'unknown_type'
        channel.enabled = True

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.id = 1
        mock_subscription.name = '测试'
        mock_subscription.channel_id = 1
        mock_subscription.channel = channel

        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_channel(
            subscription=mock_subscription,
            event_type='app.execution.completed',
            event_data={}
        )
        assert result['success'] is False
        assert '不支持的渠道类型' in result['error']

    def test_deliver_to_feishu_success_via_webhook(self, app):
        """测试 _deliver_to_feishu - 通过 webhook_url 成功"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.config = {}
        mock_channel.get_feishu_chat_id.return_value = None
        mock_channel.get_feishu_webhook_url.return_value = 'https://open.feishu.cn/webhook/xxx'

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.name = '测试'
        mock_subscription.delivery_config = {}

        service = DeliveryService(subscription_service=MagicMock())
        with app.app_context():
            with patch('requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.raise_for_status = MagicMock()
                mock_post.return_value = mock_response

                result = service._deliver_to_feishu(
                    mock_channel, mock_subscription, {'app_code': 'test'}
                )

        assert result['success'] is True
        mock_post.assert_called_once()

    def test_deliver_to_feishu_success_via_chat_id(self, app):
        """测试 _deliver_to_feishu - 通过 chat_id 成功"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.config = {}
        mock_channel.get_feishu_chat_id.return_value = 'oc_xxx'
        mock_channel.get_feishu_webhook_url.return_value = None

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.name = '测试'
        mock_subscription.delivery_config = {}

        service = DeliveryService(subscription_service=MagicMock())
        with app.app_context():
            with patch('app.infrastructure.adapters.feishu.client.FeishuClient') as MockClient:
                mock_client_instance = MagicMock()
                MockClient.return_value = mock_client_instance

                result = service._deliver_to_feishu(
                    mock_channel, mock_subscription, {'app_code': 'test'}
                )

        assert result['success'] is True
        mock_client_instance.send_text_message.assert_called_once()

    def test_deliver_to_feishu_no_config(self):
        """测试 _deliver_to_feishu - 未配置 chat_id 和 webhook_url"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        channel = Channel(
            id=1,
            name='飞书',
            channel_type=ChannelType.FEISHU.value,
            config={}
        )
        subscription = Subscription(
            id=1,
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )

        service = DeliveryService(subscription_service=MagicMock())
        result = service._deliver_to_feishu(channel, subscription, {})

        assert result['success'] is False
        assert 'chat_id' in result['error'] or 'webhook_url' in result['error']

    def test_deliver_to_feishu_import_error(self):
        """测试 _deliver_to_feishu - FeishuClient 未实现（ImportError）"""
        import sys
        import types

        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        channel = Channel(
            id=1,
            name='飞书',
            channel_type=ChannelType.FEISHU.value,
            config={'chat_id': 'oc_xxx'}
        )
        subscription = Subscription(
            id=1,
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )

        # 构造一个在访问 FeishuClient 时抛出 ImportError 的假模块
        fake_module = types.ModuleType('app.infrastructure.adapters.feishu.client')

        def __getattr__(name):
            raise ImportError('FeishuClient 未实现')

        fake_module.__getattr__ = __getattr__

        service = DeliveryService(subscription_service=MagicMock())
        with patch.dict(sys.modules, {'app.infrastructure.adapters.feishu.client': fake_module}):
            result = service._deliver_to_feishu(channel, subscription, {})

        assert result['success'] is False
        assert 'FeishuClient 未实现' in result['error']

    def test_deliver_to_feishu_exception(self, app):
        """测试 _deliver_to_feishu - 请求异常"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        mock_channel = MagicMock(spec=Channel)
        mock_channel.config = {}
        mock_channel.get_feishu_chat_id.return_value = None
        mock_channel.get_feishu_webhook_url.return_value = 'https://open.feishu.cn/webhook/xxx'

        mock_subscription = MagicMock(spec=Subscription)
        mock_subscription.name = '测试'
        mock_subscription.delivery_config = {}

        service = DeliveryService(subscription_service=MagicMock())
        with app.app_context():
            with patch('requests.post') as mock_post:
                mock_post.side_effect = Exception('请求超时')

                result = service._deliver_to_feishu(
                    mock_channel, mock_subscription, {}
                )

        assert result['success'] is False
        assert '请求超时' in result['error']

    def test_deliver_to_webhook_exception(self):
        """测试 _deliver_to_webhook - 请求异常"""
        from app.application.services.config.delivery_service import DeliveryService
        from app.domain.entities.config.subscription import Subscription
        from app.domain.entities.config.channel import Channel, ChannelType

        channel = Channel(
            id=1,
            name='Webhook',
            channel_type=ChannelType.WEBHOOK.value,
            config={'url': 'https://example.com/hook'}
        )
        subscription = Subscription(
            id=1,
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            delivery_config={}
        )

        service = DeliveryService(subscription_service=MagicMock())
        with patch('requests.request') as mock_request:
            mock_request.side_effect = Exception('连接失败')

            result = service._deliver_to_webhook(channel, subscription, {})

        assert result['success'] is False
        assert '连接失败' in result['error']
