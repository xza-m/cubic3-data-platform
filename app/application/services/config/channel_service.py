"""
渠道服务

负责渠道的 CRUD 操作和配置验证
"""
import time
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.shared.utils.time import utcnow

import requests

from app.domain.entities.config.channel import Channel, ChannelType
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.shared.exceptions import ValidationError, NotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ChannelService:
    """渠道服务"""
    
    def __init__(self, channel_repository: ChannelRepository):
        """
        初始化
        
        Args:
            channel_repository: 渠道仓储
        """
        self.channel_repository = channel_repository
    
    def create_channel(
        self,
        name: str,
        channel_type: str,
        config: Dict[str, Any],
        description: Optional[str] = None,
        created_by: Optional[str] = None,
        enabled: bool = True
    ) -> Dict[str, Any]:
        """
        创建渠道
        
        Args:
            name: 渠道名称
            channel_type: 渠道类型
            config: 渠道配置
            description: 描述
            created_by: 创建者
            enabled: 是否启用
        
        Returns:
            创建的渠道信息
        
        Raises:
            ValidationError: 配置验证失败
        """
        # 1. 验证渠道类型
        valid_types = [t.value for t in ChannelType]
        if channel_type not in valid_types:
            raise ValidationError(f"不支持的渠道类型: {channel_type}，支持的类型: {valid_types}")
        
        # 2. 创建渠道
        channel = Channel(
            name=name,
            channel_type=channel_type,
            description=description,
            config=config,
            enabled=enabled,
            created_by=created_by
        )
        
        # 3. 验证配置
        errors = channel.validate_config()
        if errors:
            raise ValidationError("渠道配置验证失败", details={'errors': errors})
        
        channel = self.channel_repository.save(channel)
        
        return channel.to_dict()
    
    def update_channel(
        self,
        channel_id: int,
        name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None,
        enabled: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        更新渠道
        
        Args:
            channel_id: 渠道ID
            name: 新名称
            config: 新配置
            description: 新描述
            enabled: 是否启用
        
        Returns:
            更新后的渠道信息
        
        Raises:
            NotFoundError: 渠道不存在
            ValidationError: 配置验证失败
        """
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        if name is not None:
            channel.name = name
        if description is not None:
            channel.description = description
        if config is not None:
            channel.config = config
            # 验证新配置
            errors = channel.validate_config()
            if errors:
                raise ValidationError("渠道配置验证失败", details={'errors': errors})
        if enabled is not None:
            channel.enabled = enabled
        
        channel.updated_at = utcnow()
        self.channel_repository.commit()
        
        return channel.to_dict()
    
    def delete_channel(self, channel_id: int) -> bool:
        """
        删除渠道
        
        Args:
            channel_id: 渠道ID
        
        Returns:
            是否删除成功
        
        Raises:
            NotFoundError: 渠道不存在
        """
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        self.channel_repository.delete(channel)
        
        return True
    
    def get_channel(self, channel_id: int) -> Dict[str, Any]:
        """
        获取渠道详情
        
        Args:
            channel_id: 渠道ID
        
        Returns:
            渠道信息
        
        Raises:
            NotFoundError: 渠道不存在
        """
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        return channel.to_dict()
    
    def list_channels(
        self,
        channel_type: Optional[str] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        获取渠道列表
        
        Args:
            channel_type: 按类型过滤
            enabled: 按启用状态过滤
            page: 页码
            page_size: 每页数量
        
        Returns:
            分页的渠道列表
        """
        channels, total = self.channel_repository.find_all(
            channel_type=channel_type,
            enabled=enabled,
            page=page,
            page_size=page_size
        )
        
        return {
            'items': [c.to_dict() for c in channels],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size
        }
    
    def enable_channel(self, channel_id: int) -> Dict[str, Any]:
        """启用渠道"""
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        channel.enable()
        self.channel_repository.commit()
        
        return channel.to_dict()
    
    def disable_channel(self, channel_id: int) -> Dict[str, Any]:
        """禁用渠道"""
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        channel.disable()
        self.channel_repository.commit()
        
        return channel.to_dict()

    # ========================================================================
    # 渠道连通性测试
    # ========================================================================

    def test_channel(
        self,
        channel_id: int,
        message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """测试渠道连通性

        Args:
            channel_id: 渠道 ID
            message: 可选的自定义测试消息（feishu/webhook 使用）

        Returns:
            ``{
                ok: bool,
                channel_type: str,
                latency_ms: int,
                status_code: Optional[int],
                detail: str,
                error: Optional[str],
                dry_run: bool,  # True 表示仅做配置校验未实际发送
            }``

        Raises:
            NotFoundError: 渠道不存在
        """
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")

        config_errors = channel.validate_config()
        if config_errors:
            return {
                "ok": False,
                "channel_type": channel.channel_type,
                "latency_ms": 0,
                "status_code": None,
                "detail": "渠道配置无效",
                "error": "; ".join(config_errors),
                "dry_run": True,
            }

        default_msg = message or "[Cubic3] 渠道连通性测试消息"
        started = time.perf_counter()

        try:
            if channel.is_feishu():
                webhook_url = channel.get_feishu_webhook_url()
                if not webhook_url:
                    return {
                        "ok": True,
                        "channel_type": channel.channel_type,
                        "latency_ms": int((time.perf_counter() - started) * 1000),
                        "status_code": None,
                        "detail": "仅配置了 chat_id，未实际发送（需要 tenant_access_token 通道）",
                        "error": None,
                        "dry_run": True,
                    }
                resp = requests.post(
                    webhook_url,
                    json={"msg_type": "text", "content": {"text": default_msg}},
                    timeout=10,
                )
                latency_ms = int((time.perf_counter() - started) * 1000)
                body: Dict[str, Any] = {}
                try:
                    body = resp.json() or {}
                except Exception:
                    body = {}
                biz_code = body.get("code") if isinstance(body, dict) else None
                ok = resp.status_code == 200 and (biz_code in (0, None))
                return {
                    "ok": ok,
                    "channel_type": channel.channel_type,
                    "latency_ms": latency_ms,
                    "status_code": resp.status_code,
                    "detail": "飞书 Webhook 发送成功" if ok else f"飞书返回 code={biz_code} msg={body.get('msg')}",
                    "error": None if ok else str(body),
                    "dry_run": False,
                }

            if channel.is_webhook():
                cfg = channel.config or {}
                url = cfg.get("url")
                method = (cfg.get("method") or "POST").upper()
                headers = cfg.get("headers") or {}
                resp = requests.request(
                    method,
                    url,
                    headers=headers,
                    json={"test": True, "message": default_msg},
                    timeout=10,
                )
                latency_ms = int((time.perf_counter() - started) * 1000)
                ok = 200 <= resp.status_code < 400
                return {
                    "ok": ok,
                    "channel_type": channel.channel_type,
                    "latency_ms": latency_ms,
                    "status_code": resp.status_code,
                    "detail": f"{method} {url} -> {resp.status_code}",
                    "error": None if ok else (resp.text[:200] if resp.text else f"HTTP {resp.status_code}"),
                    "dry_run": False,
                }

            # email / oss：当前未集成真正的发送客户端，仅做配置校验。
            return {
                "ok": True,
                "channel_type": channel.channel_type,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "status_code": None,
                "detail": "配置校验通过（邮件 / OSS 通道暂未接入真实客户端，未实际发送）",
                "error": None,
                "dry_run": True,
            }

        except requests.exceptions.Timeout:
            latency_ms = int((time.perf_counter() - started) * 1000)
            return {
                "ok": False,
                "channel_type": channel.channel_type,
                "latency_ms": latency_ms,
                "status_code": None,
                "detail": "请求超时",
                "error": "timeout",
                "dry_run": False,
            }
        except requests.exceptions.RequestException as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.warning("channel_test_request_failed", channel_id=channel_id, error=str(exc))
            return {
                "ok": False,
                "channel_type": channel.channel_type,
                "latency_ms": latency_ms,
                "status_code": None,
                "detail": "请求失败",
                "error": str(exc),
                "dry_run": False,
            }
