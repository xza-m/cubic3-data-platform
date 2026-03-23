"""
Subscription 实体单元测试
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock


class TestSubscriptionEntity:
    """Subscription 实体测试"""
    
    def test_matches_event_type(self):
        """测试事件类型匹配"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed', 'app.execution.failed']
        )
        
        # 匹配的事件类型
        assert subscription.matches_event('app.execution.completed') is True
        assert subscription.matches_event('app.execution.failed') is True
        
        # 不匹配的事件类型
        assert subscription.matches_event('app.execution.started') is False
        assert subscription.matches_event('app.instance.created') is False
    
    def test_matches_event_with_filter_conditions(self):
        """测试带过滤条件的事件匹配"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            filter_conditions={'app_code': 'bi_dashboard_push'}
        )
        
        # 匹配条件
        assert subscription.matches_event(
            'app.execution.completed',
            {'app_code': 'bi_dashboard_push', 'status': 'success'}
        ) is True
        
        # 不匹配条件
        assert subscription.matches_event(
            'app.execution.completed',
            {'app_code': 'report_push', 'status': 'success'}
        ) is False
    
    def test_matches_event_with_nested_filter(self):
        """测试嵌套路径的过滤条件"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            filter_conditions={'output.status': 'success'}
        )
        
        # 匹配嵌套条件
        assert subscription.matches_event(
            'app.execution.completed',
            {'output': {'status': 'success', 'data': {}}}
        ) is True
        
        # 不匹配嵌套条件
        assert subscription.matches_event(
            'app.execution.completed',
            {'output': {'status': 'failed', 'data': {}}}
        ) is False
    
    def test_matches_event_empty_filter(self):
        """测试空过滤条件"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试订阅',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            filter_conditions={}
        )
        
        # 空过滤条件应匹配任何数据
        assert subscription.matches_event(
            'app.execution.completed',
            {'any': 'data'}
        ) is True
    
    def test_get_nested_value(self):
        """测试嵌套值获取"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[]
        )
        
        data = {
            'level1': {
                'level2': {
                    'level3': 'value'
                }
            }
        }
        
        assert subscription._get_nested_value(data, 'level1.level2.level3') == 'value'
        assert subscription._get_nested_value(data, 'level1.level2') == {'level3': 'value'}
        assert subscription._get_nested_value(data, 'nonexistent') is None
        assert subscription._get_nested_value(data, 'level1.nonexistent') is None
    
    def test_update_event_types(self):
        """测试更新事件类型"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed']
        )
        
        subscription.update_event_types(['app.execution.started', 'app.execution.failed'])
        assert 'app.execution.started' in subscription.event_types
        assert 'app.execution.failed' in subscription.event_types
        assert 'app.execution.completed' not in subscription.event_types
    
    def test_update_filter_conditions(self):
        """测试更新过滤条件"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=['app.execution.completed'],
            filter_conditions={'old': 'condition'}
        )
        
        subscription.update_filter_conditions({'new': 'condition'})
        assert subscription.filter_conditions == {'new': 'condition'}
    
    def test_enable_disable(self):
        """测试启用/禁用"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[],
            enabled=False
        )
        
        assert subscription.enabled is False
        subscription.enable()
        assert subscription.enabled is True
        subscription.disable()
        assert subscription.enabled is False
    
    def test_to_dict(self):
        """测试序列化"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            id=1,
            name='测试订阅',
            description='测试描述',
            app_instance_id=10,
            channel_id=20,
            event_types=['app.execution.completed'],
            filter_conditions={'app_code': 'test'},
            delivery_config={'template': 'custom'},
            enabled=True
        )
        
        result = subscription.to_dict()
        assert result['id'] == 1
        assert result['name'] == '测试订阅'
        assert result['description'] == '测试描述'
        assert result['app_instance_id'] == 10
        assert result['channel_id'] == 20
        assert result['event_types'] == ['app.execution.completed']
        assert result['filter_conditions'] == {'app_code': 'test'}
        assert result['delivery_config'] == {'template': 'custom'}
        assert result['enabled'] is True
    
    def test_domain_events(self):
        """测试领域事件记录"""
        from app.domain.entities.config.subscription import Subscription
        
        subscription = Subscription(
            name='测试',
            app_instance_id=1,
            channel_id=1,
            event_types=[]
        )
        
        # 记录事件
        event = {'type': 'test'}
        subscription.record_event(event)
        
        # 清空并获取事件
        events = subscription.clear_events()
        assert len(events) == 1
        assert events[0] == event
