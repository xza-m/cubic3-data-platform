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
        2. 调用 Superset 截图 API
        3. 获取看板信息
        4. 返回结果（不直接推送）
        """
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            superset_config = config.get('superset', {})
            
            result.add_log("开始执行BI看板截图获取")
            
            # 1. 获取 Superset access token
            result.add_log("正在获取 Superset access token...")
            access_token = self._get_superset_token(
                base_url=superset_config['base_url'],
                username=superset_config['username'],
                password=superset_config['password']
            )
            result.add_log("✓ 成功获取 access token")
            
            # 2. 请求截图
            dashboard_id = superset_config['dashboard_id']
            screenshot_width = superset_config.get('screenshot_width', 1920)
            
            result.add_log(f"正在请求看板 {dashboard_id} 的截图...")
            screenshot_data = self._request_screenshot(
                base_url=superset_config['base_url'],
                dashboard_id=dashboard_id,
                access_token=access_token,
                width=screenshot_width
            )
            result.add_log(f"✓ 成功获取截图（{len(screenshot_data)} 字节）")
            
            # 3. 获取看板信息
            result.add_log("正在获取看板信息...")
            dashboard_info = self._get_dashboard_info(
                base_url=superset_config['base_url'],
                dashboard_id=dashboard_id,
                access_token=access_token
            )
            dashboard_name = dashboard_info.get('dashboard_title', f'看板 {dashboard_id}')
            dashboard_url = f"{superset_config['base_url']}/superset/dashboard/{dashboard_id}/"
            result.add_log(f"✓ 看板名称：{dashboard_name}")
            
            # 4. 准备输出结果（供订阅中心使用）
            screenshot_base64 = base64.b64encode(screenshot_data).decode('utf-8')
            
            # 执行成功 - 返回结果数据
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 基础信息
                'dashboard_id': dashboard_id,
                'dashboard_name': dashboard_name,
                'dashboard_url': dashboard_url,
                
                # 截图数据（Base64 编码）
                'screenshot_base64': screenshot_base64,
                'screenshot_size': len(screenshot_data),
                'screenshot_width': screenshot_width,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None,
                
                # 渲染后的消息（供渠道使用）
                'rendered_message': self._render_message(
                    dashboard_name=dashboard_name,
                    dashboard_url=dashboard_url,
                    config=config
                )
            }
            result.add_log("✓ BI看板截图获取完成，结果已准备好供订阅分发")
            
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
    
    def _get_superset_token(self, base_url: str, username: str, password: str) -> str:
        """获取 Superset API token"""
        url = f"{base_url}/api/v1/security/login"
        payload = {
            "username": username,
            "password": password,
            "provider": "db",
            "refresh": True
        }
        
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Superset 登录失败: HTTP {resp.status_code}")
        
        data = resp.json()
        access_token = data.get('access_token')
        if not access_token:
            raise Exception("未能获取 Superset access token")
        
        return access_token
    
    def _request_screenshot(
        self, 
        base_url: str, 
        dashboard_id: int, 
        access_token: str,
        width: int = 1920,
        timeout: int = 30
    ) -> bytes:
        """请求 Superset 生成截图"""
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # 1. 请求生成截图
        url = f"{base_url}/api/v1/dashboard/{dashboard_id}/screenshot"
        payload = {"width": width}
        
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Superset 截图请求失败: HTTP {resp.status_code}")
        
        data = resp.json()
        task_id = data.get('task_id')
        if not task_id:
            raise Exception("未能获取截图任务 ID")
        
        # 2. 轮询获取截图结果（最多等待 timeout 秒）
        for _ in range(timeout):
            time.sleep(1)
            
            url = f"{base_url}/api/v1/dashboard/{dashboard_id}/screenshot/{task_id}"
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                continue
            
            data = resp.json()
            status = data.get('status')
            
            if status == 'success':
                # 返回 base64 解码后的图片数据
                image_base64 = data.get('image', '')
                return base64.b64decode(image_base64)
            elif status == 'failed':
                error = data.get('error', '未知错误')
                raise Exception(f"Superset 截图失败: {error}")
        
        raise Exception(f"Superset 截图超时（{timeout}秒）")
    
    def _get_dashboard_info(
        self, 
        base_url: str, 
        dashboard_id: int, 
        access_token: str
    ) -> Dict[str, Any]:
        """获取看板信息"""
        url = f"{base_url}/api/v1/dashboard/{dashboard_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"获取看板信息失败: HTTP {resp.status_code}")
        
        data = resp.json()
        return data.get('result', {})
