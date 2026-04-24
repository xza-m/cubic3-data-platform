"""
分发服务

负责将应用执行结果分发到订阅的渠道
"""
import logging
import time
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.shared.utils.time import utcnow

from app.domain.entities.config.subscription import Subscription
from app.domain.entities.config.channel import Channel, ChannelType
from app.domain.entities.config.subscription_delivery_log import SubscriptionDeliveryLog
from app.application.services.config.subscription_service import SubscriptionService
from app.infrastructure.repositories.subscription_repository import SubscriptionRepository

logger = logging.getLogger(__name__)


class DeliveryService:
    """分发服务"""

    def __init__(
        self,
        subscription_service: SubscriptionService,
        subscription_repository: Optional[SubscriptionRepository] = None,
    ):
        self.subscription_service = subscription_service
        self.subscription_repository = subscription_repository

    def _record_log(
        self,
        *,
        subscription: Subscription,
        event_type: str,
        status: str,
        message: Optional[str],
        duration_ms: Optional[int],
    ) -> None:
        """追加分发日志（幂等：无 repository 则静默跳过）"""
        if self.subscription_repository is None:
            return
        try:
            log = SubscriptionDeliveryLog(
                subscription_id=subscription.id,
                channel_id=subscription.channel_id,
                event_type=event_type,
                status=status,
                message=message[:1000] if isinstance(message, str) else message,
                duration_ms=duration_ms,
                trigger_at=utcnow(),
            )
            self.subscription_repository.add_delivery_log(log)
        except Exception as exc:  # 日志写入失败不能影响主链路
            logger.warning(f"写入订阅分发日志失败: subscription_id={subscription.id}, err={exc}")
    
    def deliver_event(
        self,
        event_type: str,
        event_data: Dict[str, Any],
        source_app_instance_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        根据事件分发到匹配的订阅渠道
        
        Args:
            event_type: 事件类型
            event_data: 事件数据
            source_app_instance_id: 源应用实例ID（可选，用于过滤）
        
        Returns:
            分发结果摘要
        """
        results = {
            'event_type': event_type,
            'total_subscriptions': 0,
            'successful': 0,
            'failed': 0,
            'details': []
        }
        
        # 1. 查找匹配的订阅
        matching_subscriptions = self.subscription_service.find_matching_subscriptions(
            event_type, event_data
        )
        
        # 如果指定了源应用实例，只处理该实例的订阅
        if source_app_instance_id:
            matching_subscriptions = [
                s for s in matching_subscriptions 
                if s.app_instance_id == source_app_instance_id
            ]
        
        results['total_subscriptions'] = len(matching_subscriptions)
        
        # 2. 逐个分发
        for subscription in matching_subscriptions:
            started_at = time.perf_counter()
            try:
                delivery_result = self._deliver_to_channel(
                    subscription=subscription,
                    event_type=event_type,
                    event_data=event_data
                )

                duration_ms = int((time.perf_counter() - started_at) * 1000)

                if delivery_result['success']:
                    results['successful'] += 1
                    status = 'success'
                    log_message = delivery_result.get('error') or delivery_result.get('detail')
                else:
                    results['failed'] += 1
                    status = 'failed'
                    log_message = delivery_result.get('error') or '未知失败'

                self._record_log(
                    subscription=subscription,
                    event_type=event_type,
                    status=status,
                    message=log_message,
                    duration_ms=duration_ms,
                )

                results['details'].append({
                    'subscription_id': subscription.id,
                    'subscription_name': subscription.name,
                    'channel_id': subscription.channel_id,
                    **delivery_result
                })

            except Exception as e:
                duration_ms = int((time.perf_counter() - started_at) * 1000)
                logger.error(f"分发到订阅 {subscription.id} 失败: {e}")
                results['failed'] += 1
                self._record_log(
                    subscription=subscription,
                    event_type=event_type,
                    status='failed',
                    message=str(e),
                    duration_ms=duration_ms,
                )
                results['details'].append({
                    'subscription_id': subscription.id,
                    'subscription_name': subscription.name,
                    'channel_id': subscription.channel_id,
                    'success': False,
                    'error': str(e)
                })

        return results
    
    def _deliver_to_channel(
        self,
        subscription: Subscription,
        event_type: str,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        分发到具体渠道
        
        Args:
            subscription: 订阅对象
            event_type: 事件类型
            event_data: 事件数据
        
        Returns:
            分发结果
        """
        channel = subscription.channel
        if not channel:
            return {'success': False, 'error': '渠道不存在'}
        
        if not channel.enabled:
            return {'success': False, 'error': '渠道已禁用'}
        
        # 根据渠道类型调用不同的适配器
        if channel.channel_type == ChannelType.FEISHU.value:
            return self._deliver_to_feishu(channel, subscription, event_data)
        elif channel.channel_type == ChannelType.EMAIL.value:
            return self._deliver_to_email(channel, subscription, event_data)
        elif channel.channel_type == ChannelType.WEBHOOK.value:
            return self._deliver_to_webhook(channel, subscription, event_data)
        elif channel.channel_type == ChannelType.OSS.value:
            return self._deliver_to_oss(channel, subscription, event_data)
        else:
            return {'success': False, 'error': f'不支持的渠道类型: {channel.channel_type}'}
    
    def _deliver_to_feishu(
        self,
        channel: Channel,
        subscription: Subscription,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        分发到飞书
        
        Args:
            channel: 渠道配置
            subscription: 订阅配置
            event_data: 事件数据
        
        Returns:
            分发结果
        """
        try:
            import requests
            from app.infrastructure.adapters.feishu.client import FeishuClient
            
            chat_id = channel.get_feishu_chat_id()
            webhook_url = channel.get_feishu_webhook_url()
            
            if not chat_id and not webhook_url:
                return {'success': False, 'error': '飞书渠道未配置 chat_id 或 webhook_url'}
            
            # 构建消息内容
            message = self._build_feishu_message(channel, subscription, event_data)
            
            # 发送消息
            client = FeishuClient()
            if webhook_url:
                response = requests.post(webhook_url, json=message, timeout=10)
                response.raise_for_status()
                result = {'message_id': None}
            else:
                text_content = message.get('content', {}).get('text', '')
                client.send_text_message(chat_id, text_content)
                result = {'message_id': None}
            
            return {'success': True, 'message_id': result.get('message_id')}
            
        except ImportError:
            logger.warning("FeishuClient 未实现，跳过飞书分发")
            return {'success': False, 'error': 'FeishuClient 未实现'}
        except Exception as e:
            logger.error(f"飞书分发失败: {e}")
            return {'success': False, 'error': str(e)}
    
    def _deliver_to_email(
        self,
        channel: Channel,
        subscription: Subscription,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """分发到邮件（预留实现）"""
        logger.info(f"邮件分发暂未实现: channel={channel.id}")
        return {'success': False, 'error': '邮件分发暂未实现'}
    
    def _deliver_to_webhook(
        self,
        channel: Channel,
        subscription: Subscription,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        分发到 Webhook
        
        Args:
            channel: 渠道配置
            subscription: 订阅配置
            event_data: 事件数据
        
        Returns:
            分发结果
        """
        try:
            import requests
            
            config = channel.config or {}
            url = config.get('url')
            method = config.get('method', 'POST').upper()
            headers = config.get('headers', {})
            
            if not url:
                return {'success': False, 'error': 'Webhook未配置URL'}
            
            # 构建请求体
            payload = {
                'subscription_id': subscription.id,
                'subscription_name': subscription.name,
                'event_data': event_data,
                'timestamp': utcnow().isoformat()
            }
            
            # 发送请求
            response = requests.request(
                method=method,
                url=url,
                json=payload,
                headers=headers,
                timeout=30
            )
            
            if response.status_code >= 200 and response.status_code < 300:
                return {'success': True, 'status_code': response.status_code}
            else:
                return {
                    'success': False, 
                    'error': f'HTTP {response.status_code}',
                    'response': response.text[:200]
                }
                
        except Exception as e:
            logger.error(f"Webhook分发失败: {e}")
            return {'success': False, 'error': str(e)}
    
    def _deliver_to_oss(
        self,
        channel: Channel,
        subscription: Subscription,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """分发到 OSS（预留实现）"""
        logger.info(f"OSS分发暂未实现: channel={channel.id}")
        return {'success': False, 'error': 'OSS分发暂未实现'}
    
    def _build_feishu_message(
        self,
        channel: Channel,
        subscription: Subscription,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        构建飞书消息
        
        Args:
            channel: 渠道配置
            subscription: 订阅配置
            event_data: 事件数据
        
        Returns:
            飞书消息体
        """
        # 优先使用订阅的模板，其次使用渠道的模板
        delivery_config = subscription.delivery_config or {}
        channel_config = channel.config or {}
        
        template = delivery_config.get('message_template') or channel_config.get('message_template')
        
        if template:
            # 简单的模板替换
            try:
                content = template.format(**event_data)
            except KeyError:
                content = str(event_data)
        else:
            # 默认消息格式
            content = f"📢 事件通知\n\n订阅: {subscription.name}\n数据: {event_data}"
        
        return {
            'msg_type': 'text',
            'content': {'text': content}
        }
