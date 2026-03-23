"""
数据集卡片推送执行器

查询数据集元数据并生成卡片数据
推送逻辑由订阅中心处理
"""
from datetime import datetime
from typing import Dict, Any, List
from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import Dataset
from app.extensions import db


@register_executor('dataset_card_push')
class DatasetCardPushExecutor(AppExecutor):
    """
    数据集卡片推送执行器
    
    职责：
    - 查询数据集元数据
    - 生成卡片数据结构
    
    不负责：
    - 推送到具体渠道（由订阅中心处理）
    """
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """执行数据集卡片数据生成"""
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            dataset_id = config.get('dataset_id')
            include_fields = config.get('include_fields', True)
            include_stats = config.get('include_stats', True)
            
            result.add_log(f"开始生成数据集 {dataset_id} 的卡片数据")
            
            # 1. 查询数据集信息
            result.add_log("正在查询数据集信息...")
            dataset = db.session.query(Dataset).filter_by(id=dataset_id).first()
            if not dataset:
                raise Exception(f"数据集 {dataset_id} 不存在")
            
            result.add_log(f"✓ 数据集名称：{dataset.dataset_name}")
            
            # 2. 构建卡片数据
            result.add_log("正在生成卡片数据...")
            card_data = self._build_dataset_card(
                dataset=dataset,
                include_fields=include_fields,
                include_stats=include_stats
            )
            
            # 3. 准备输出结果（供订阅中心使用）
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 基础信息
                'dataset_id': dataset_id,
                'dataset_name': dataset.dataset_name,
                'dataset_type': dataset.dataset_type,
                'owner': dataset.owner,
                'description': dataset.description,
                
                # 数据源信息
                'source_name': dataset.source.name if dataset.source else None,
                'physical_table': dataset.physical_table,
                
                # 卡片数据结构（飞书格式）
                'feishu_card': card_data,
                
                # 简化文本消息（供其他渠道使用）
                'text_message': self._build_text_message(dataset),
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None
            }
            result.add_log("✓ 数据集卡片数据生成完成，结果已准备好供订阅分发")
            
        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"✗ 执行失败：{e}")
        
        return result
    
    def _build_text_message(self, dataset: Dataset) -> str:
        """构建简化文本消息（供非飞书渠道使用）"""
        msg = f"📊 数据集: {dataset.dataset_name}\n"
        msg += f"类型: {dataset.dataset_type}\n"
        msg += f"所有者: {dataset.owner or '未知'}\n"
        if dataset.description:
            msg += f"描述: {dataset.description}\n"
        if dataset.source:
            msg += f"数据源: {dataset.source.name}\n"
        return msg
    
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """验证配置"""
        result = ValidationResult(is_valid=True)
        
        if not config.get('dataset_id'):
            result.add_error('dataset_id', '缺少数据集 ID')
        
        # 注意：feishu 配置不再是必需的，推送由订阅中心管理
        
        return result
    
    def get_config_schema(self) -> Dict[str, Any]:
        """获取配置 JSON Schema"""
        return {
            "type": "object",
            "required": ["dataset_id"],
            "properties": {
                "dataset_id": {
                    "type": "integer",
                    "title": "数据集 ID"
                },
                "include_fields": {
                    "type": "boolean",
                    "title": "包含字段列表",
                    "default": True
                },
                "include_stats": {
                    "type": "boolean",
                    "title": "包含统计信息",
                    "default": True
                }
            }
        }
    
    def _build_dataset_card(
        self, 
        dataset: Dataset, 
        include_fields: bool = True,
        include_stats: bool = True
    ) -> Dict[str, Any]:
        """构建数据集飞书卡片"""
        elements = []
        
        # 1. 基本信息
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**数据集名称**: {dataset.dataset_name}\n"
                          f"**数据集类型**: {dataset.dataset_type}\n"
                          f"**所有者**: {dataset.owner or '未知'}\n"
                          f"**描述**: {dataset.description or '无'}"
            }
        })
        
        # 2. 数据源信息
        if dataset.source:
            elements.append({
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**数据源**: {dataset.source.name}\n"
                              f"**物理表**: {dataset.physical_table or 'N/A'}"
                }
            })
        
        # 3. 字段列表
        if include_fields and dataset.fields:
            field_count = dataset.fields.count()
            fields_md = f"**字段数量**: {field_count}\n\n"
            
            for field in dataset.fields.limit(10):
                fields_md += f"• `{field.physical_name}` - {field.data_type}\n"
            
            if field_count > 10:
                fields_md += f"\n... 还有 {field_count - 10} 个字段"
            
            elements.append({
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": fields_md
                }
            })
        
        # 4. 统计信息
        if include_stats:
            stats_md = "**统计信息**\n"
            stats_md += f"• 同步状态: {dataset.sync_status}\n"
            if dataset.last_sync_at:
                stats_md += f"• 最后同步: {dataset.last_sync_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
            
            elements.append({
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": stats_md
                }
            })
        
        # 5. 操作按钮
        elements.append({
            "tag": "action",
            "actions": [
                {
                    "tag": "button",
                    "text": {
                        "tag": "plain_text",
                        "content": "查看详情"
                    },
                    "type": "default",
                    "url": f"http://localhost:81/data-center/datasets/{dataset.id}"
                }
            ]
        })
        
        # 构建完整卡片
        card = {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "template": "blue",
                "title": {
                    "tag": "plain_text",
                    "content": f"📊 {dataset.dataset_name}"
                }
            },
            "elements": elements
        }
        
        return card
