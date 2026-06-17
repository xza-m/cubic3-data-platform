"""
BI看板推送执行器

调用 Superset 截图 API 获取看板截图
推送逻辑由订阅中心处理
"""
import base64
import time
from datetime import datetime
from typing import Dict, Any, Optional
import requests

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)


@register_executor('bi_dashboard_push')
class BiDashboardPushExecutor(AppExecutor):
    """
    BI看板推送执行器
    
    职责：
    - 调用 Superset API 获取看板截图
    - 返回截图数据和元信息
    
    不负责：
    - 推送到具体渠道（由订阅中心处理）
    """
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """
        执行BI看板截图获取

        流程：
        1. 获取 Superset access token
        2. 获取看板信息
        3. 尝试获取截图（服务端未开启截图能力时降级为链接推送）
        4. 返回结果（不直接推送）
        """
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            superset_config = config.get('superset', {})
            base_url = superset_config['base_url'].rstrip('/')
            
            result.add_log("开始执行BI看板推送准备")
            
            # 1. 获取 Superset access token
            result.add_log("正在获取 Superset access token...")
            session = requests.Session()
            access_token = self._get_superset_token(
                session,
                base_url=base_url,
                username=superset_config['username'],
                password=superset_config['password']
            )
            result.add_log("✓ 成功获取 access token")
            
            # 2. 获取看板信息
            dashboard_id = superset_config['dashboard_id']
            result.add_log("正在获取看板信息...")
            dashboard_info = self._get_dashboard_info(
                session,
                base_url=base_url,
                dashboard_id=dashboard_id,
                access_token=access_token
            )
            dashboard_name = dashboard_info.get('dashboard_title', f'看板 {dashboard_id}')
            dashboard_url = f"{base_url}/superset/dashboard/{dashboard_id}/"
            result.add_log(f"✓ 看板名称：{dashboard_name}")
            
            # 3. 尝试获取截图（Superset 需开启 THUMBNAILS / 截图 feature flag）
            screenshot_width = superset_config.get('screenshot_width', 1920)
            screenshot_data, screenshot_note = self._try_fetch_screenshot(
                session,
                base_url=base_url,
                dashboard_id=dashboard_id,
                access_token=access_token,
                thumbnail_url=dashboard_info.get('thumbnail_url'),
                width=screenshot_width,
            )
            if screenshot_data:
                result.add_log(f"✓ 成功获取截图（{len(screenshot_data)} 字节）")
            else:
                result.add_log(f"⚠️ 截图不可用，降级为链接推送：{screenshot_note}")
            
            # 4. 准备输出结果（供订阅中心使用）
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 基础信息
                'dashboard_id': dashboard_id,
                'dashboard_name': dashboard_name,
                'dashboard_url': dashboard_url,
                
                # 截图数据（Base64 编码；服务端未开启截图能力时为 None）
                'screenshot_available': screenshot_data is not None,
                'screenshot_base64': base64.b64encode(screenshot_data).decode('utf-8') if screenshot_data else None,
                'screenshot_size': len(screenshot_data) if screenshot_data else 0,
                'screenshot_width': screenshot_width,
                'screenshot_note': screenshot_note,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance_name,
                
                # 渲染后的消息（供渠道使用）
                'rendered_message': self._render_message(
                    dashboard_name=dashboard_name,
                    dashboard_url=dashboard_url,
                    config=config
                )
            }
            result.add_log("✓ BI看板推送数据已准备好供订阅分发")
            
        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"✗ 执行失败：{e}")
        
        return result
    
    def _render_message(
        self, 
        dashboard_name: str, 
        dashboard_url: str,
        config: Dict[str, Any]
    ) -> str:
        """渲染消息模板"""
        from jinja2 import Template
        message_template = config.get('message_template', 
            '📊 {{dashboard_name}}\n🔗 {{dashboard_url}}\n时间：{{date}}'
        )
        template = Template(message_template)
        return template.render(
            dashboard_name=dashboard_name,
            dashboard_url=dashboard_url,
            date=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )
    
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """验证配置"""
        result = ValidationResult(is_valid=True)
        
        # 验证 superset 配置（必需）
        superset = config.get('superset', {})
        if not superset.get('base_url'):
            result.add_error('superset.base_url', '缺少 Superset URL')
        if not superset.get('dashboard_id'):
            result.add_error('superset.dashboard_id', '缺少看板 ID')
        if not superset.get('username'):
            result.add_error('superset.username', '缺少用户名')
        if not superset.get('password'):
            result.add_error('superset.password', '缺少密码')
        
        # 注意：feishu 配置不再是必需的，推送由订阅中心管理
        
        return result
    
    def get_config_schema(self) -> Dict[str, Any]:
        """获取配置 JSON Schema"""
        return {
            "type": "object",
            "required": ["superset"],
            "properties": {
                "superset": {
                    "type": "object",
                    "title": "Superset 配置",
                    "required": ["base_url", "dashboard_id", "username", "password"],
                    "properties": {
                        "base_url": {"type": "string", "title": "Superset URL"},
                        "dashboard_id": {"type": "integer", "title": "看板 ID"},
                        "username": {"type": "string", "title": "用户名"},
                        "password": {"type": "string", "title": "密码"},
                        "screenshot_width": {"type": "integer", "title": "截图宽度", "default": 1920}
                    }
                },
                "message_template": {
                    "type": "string",
                    "title": "消息模板",
                    "description": "支持变量: {{dashboard_name}}, {{dashboard_url}}, {{date}}"
                }
            }
        }
    
    # ========== Superset API 调用方法 ==========
    
    def _get_superset_token(self, session: requests.Session, base_url: str, username: str, password: str) -> str:
        """获取 Superset API token"""
        url = f"{base_url}/api/v1/security/login"
        payload = {
            "username": username,
            "password": password,
            "provider": "db",
            "refresh": True
        }
        
        resp = session.post(url, json=payload, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Superset 登录失败: HTTP {resp.status_code}")
        
        data = resp.json()
        access_token = data.get('access_token')
        if not access_token:
            raise Exception("未能获取 Superset access token")
        
        return access_token

    def _get_csrf_token(self, session: requests.Session, base_url: str, access_token: str) -> str:
        """获取 CSRF token（写操作必需，session 会记录配套 cookie）"""
        resp = session.get(
            f"{base_url}/api/v1/security/csrf_token/",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
        if resp.status_code != 200:
            raise Exception(f"获取 CSRF token 失败: HTTP {resp.status_code}")
        return resp.json().get('result') or ''

    def _try_fetch_screenshot(
        self,
        session: requests.Session,
        *,
        base_url: str,
        dashboard_id: int,
        access_token: str,
        thumbnail_url: Optional[str],
        width: int = 1920,
        timeout: int = 60,
    ) -> tuple[Optional[bytes], str]:
        """尽力获取看板截图，按 Superset 真实 API 合约逐级尝试。

        ① POST /api/v1/dashboard/{id}/cache_dashboard_screenshot/ + 轮询
           GET /screenshot/{cache_key}/（需开启 EnableDashboardScreenshotEndpoints）
        ② GET thumbnail_url 缩略图（需开启 THUMBNAILS）
        两者都不可用（部署未开启 feature flag）时返回 (None, 原因)，
        由调用方降级为链接推送，不视为执行失败。
        """
        headers = {"Authorization": f"Bearer {access_token}"}
        notes = []

        # ① 截图端点
        try:
            csrf = self._get_csrf_token(session, base_url, access_token)
            resp = session.post(
                f"{base_url}/api/v1/dashboard/{dashboard_id}/cache_dashboard_screenshot/",
                headers={**headers, "X-CSRFToken": csrf, "Referer": base_url},
                json={"dataMask": {}, "activeTabs": [], "anchor": "", "urlParams": []},
                timeout=30,
            )
            if resp.status_code in (200, 202):
                cache_key = (resp.json() or {}).get('cache_key')
                if cache_key:
                    for _ in range(timeout):
                        time.sleep(1)
                        poll = session.get(
                            f"{base_url}/api/v1/dashboard/{dashboard_id}/screenshot/{cache_key}/",
                            headers=headers,
                            timeout=30,
                        )
                        if poll.status_code == 200 and poll.headers.get('Content-Type', '').startswith('image/'):
                            return poll.content, 'screenshot_endpoint'
                        if poll.status_code not in (202, 404):
                            break
                    notes.append(f"screenshot 轮询超时/失败")
            else:
                notes.append(f"screenshot 端点不可用（HTTP {resp.status_code}，需开启 EnableDashboardScreenshotEndpoints）")
        except Exception as exc:
            notes.append(f"screenshot 端点异常：{exc}")

        # ② 缩略图端点
        if thumbnail_url:
            try:
                resp = session.get(f"{base_url}{thumbnail_url}", headers=headers, timeout=30)
                if resp.status_code == 200 and resp.headers.get('Content-Type', '').startswith('image/'):
                    return resp.content, 'thumbnail_endpoint'
                notes.append(f"thumbnail 端点不可用（HTTP {resp.status_code}，需开启 THUMBNAILS）")
            except Exception as exc:
                notes.append(f"thumbnail 端点异常：{exc}")
        else:
            notes.append("看板无 thumbnail_url")

        return None, '；'.join(notes)
    
    def _get_dashboard_info(
        self,
        session: requests.Session,
        *,
        base_url: str,
        dashboard_id: int,
        access_token: str
    ) -> Dict[str, Any]:
        """获取看板信息"""
        url = f"{base_url}/api/v1/dashboard/{dashboard_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        resp = session.get(url, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"获取看板信息失败: HTTP {resp.status_code}")
        
        data = resp.json()
        return data.get('result', {})
