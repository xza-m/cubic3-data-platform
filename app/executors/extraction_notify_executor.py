"""
数据提取通知执行器

处理数据提取完成事件并生成通知数据
推送逻辑由订阅中心处理
"""
from datetime import datetime
from typing import Dict, Any, List
from jinja2 import Template

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)


@register_executor('extraction_notify')
class ExtractionNotifyExecutor(AppExecutor):
    """
    数据提取通知执行器
    
    职责：
    - 处理数据提取完成/失败事件
    - 生成通知数据
    
    不负责：
    - 推送到具体渠道（由订阅中心处理）
    """
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """执行数据提取通知数据生成"""
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            
            # 从上下文获取事件数据
            extra_data = context.extra_data
            event_type = extra_data.get('event_type')
            extraction_data = extra_data.get('extraction_data', {})
            
            result.add_log(f"开始处理数据提取事件：{event_type}")
            
            # 检查是否需要通知
            notify_on_success = config.get('notify_on_success', True)
            notify_on_failure = config.get('notify_on_failure', True)
            
            should_notify = False
            if event_type == 'extraction.completed' and notify_on_success:
                should_notify = True
            elif event_type == 'extraction.failed' and notify_on_failure:
                should_notify = True
            
            if not should_notify:
                result.add_log(f"✓ 根据配置，跳过此事件的通知")
                result.status = ExecutionStatus.SUCCESS
                result.output = {
                    'notified': False,
                    'event_type': event_type,
                    'reason': '配置为不通知此类事件',
                    'timestamp': datetime.now().isoformat()
                }
                return result
            
            # 检查是否需要筛选任务 ID
            extraction_task_id = config.get('extraction_task_id')
            if extraction_task_id:
                actual_task_id = extraction_data.get('task_id')
                if actual_task_id != extraction_task_id:
                    result.add_log(f"✓ 任务 ID 不匹配（期望 {extraction_task_id}，实际 {actual_task_id}），跳过通知")
                    result.status = ExecutionStatus.SUCCESS
                    result.output = {
                        'notified': False,
                        'event_type': event_type,
                        'reason': '任务 ID 不匹配',
                        'timestamp': datetime.now().isoformat()
                    }
                    return result
            
            # 生成通知内容
            result.add_log("正在生成通知数据...")
            
            success_template = config.get('success_template',
                '✅ 数据提取完成\n任务：{{task_name}}\n提取行数：{{row_count}}\n耗时：{{duration}}'
            )
            failure_template = config.get('failure_template',
                '❌ 数据提取失败\n任务：{{task_name}}\n失败原因：{{error}}'
            )
            
            if event_type == 'extraction.completed':
                message_template = success_template
                card_color = 'green'
                card_title = '✅ 数据提取完成'
            else:
                message_template = failure_template
                card_color = 'red'
                card_title = '❌ 数据提取失败'
            
            # 渲染模板
            template = Template(message_template)
            text_message = template.render(
                task_name=extraction_data.get('task_name', '未知任务'),
                row_count=extraction_data.get('row_count', 0),
                duration=extraction_data.get('duration', '未知'),
                error=extraction_data.get('error', '未知错误')
            )
            
            # 构建飞书卡片
            card = self._build_notification_card(
                title=card_title,
                color=card_color,
                content=text_message,
                extraction_data=extraction_data
            )
            
            # 准备输出结果（供订阅中心使用）
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 通知状态
                'notified': True,
                'event_type': event_type,
                
                # 提取信息
                'task_id': extraction_data.get('task_id'),
                'task_name': extraction_data.get('task_name'),
                'row_count': extraction_data.get('row_count'),
                'duration': extraction_data.get('duration'),
                'error': extraction_data.get('error'),
                
                # 格式化内容
                'feishu_card': card,
                'text_message': text_message,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None
            }
            result.add_log("✓ 数据提取通知数据生成完成，结果已准备好供订阅分发")
            
        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"✗ 执行失败：{e}")
        
        return result
    
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """验证配置"""
        result = ValidationResult(is_valid=True)
        
        # 检查至少启用一种通知
        notify_on_success = config.get('notify_on_success', True)
        notify_on_failure = config.get('notify_on_failure', True)
        if not notify_on_success and not notify_on_failure:
            result.add_warning('notify', '成功和失败通知都已禁用，应用将不会生成任何通知数据')
        
        # 注意：feishu 配置不再是必需的，推送由订阅中心管理
        
        return result
    
    def get_config_schema(self) -> Dict[str, Any]:
        """获取配置 JSON Schema"""
        return {
            "type": "object",
            "properties": {
                "extraction_task_id": {
                    "type": "integer",
                    "title": "提取任务 ID（可选）",
                    "description": "留空则监听所有提取任务"
                },
                "notify_on_success": {
                    "type": "boolean",
                    "title": "成功时通知",
                    "default": True
                },
                "notify_on_failure": {
                    "type": "boolean",
                    "title": "失败时通知",
                    "default": True
                },
                "success_template": {
                    "type": "string",
                    "title": "成功通知模板",
                    "description": "支持变量: {{task_name}}, {{row_count}}, {{duration}}"
                },
                "failure_template": {
                    "type": "string",
                    "title": "失败通知模板",
                    "description": "支持变量: {{task_name}}, {{error}}"
                }
            }
        }
    
    def supports_event_trigger(self) -> bool:
        """支持事件触发"""
        return True
    
    def get_supported_events(self) -> List[str]:
        """获取支持的事件类型"""
        return ['extraction.completed', 'extraction.failed']
    
    def _build_notification_card(
        self,
        title: str,
        color: str,
        content: str,
        extraction_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """构建通知飞书卡片"""
        card = {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "template": color,
                "title": {
                    "tag": "plain_text",
                    "content": title
                }
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": content
                    }
                }
            ]
        }
        
        # 添加额外信息
        if extraction_data:
            extra_info = []
            if extraction_data.get('dataset_name'):
                extra_info.append(f"数据集: {extraction_data['dataset_name']}")
            if extraction_data.get('file_path'):
                extra_info.append(f"文件: {extraction_data['file_path']}")
            if extraction_data.get('started_at'):
                extra_info.append(f"开始时间: {extraction_data['started_at']}")
            
            if extra_info:
                card['elements'].append({
                    "tag": "hr"
                })
                card['elements'].append({
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": " | ".join(extra_info)
                        }
                    ]
                })
        
        return card
