"""
数据源事件处理器
"""
from app.shared.utils.logger import get_logger

# TODO: AuditLog 模型尚未实现，审计日志功能暂时注释
# from app.extensions import db

logger = get_logger(__name__)


def on_datasource_created(event_dict: dict):
    """
    处理数据源创建事件
    
    业务逻辑：
    1. 记录审计日志
    2. 发送通知（可选）
    """
    try:
        logger.info(
            f"Datasource created",
            extra={
                'datasource_id': event_dict.get('datasource_id'),
                'name': event_dict.get('name'),
                'source_type': event_dict.get('source_type')
            }
        )
        
        # TODO: 记录审计日志（需要AuditLog模型）
        # audit = AuditLog(
        #     user_id=event_dict.get('created_by'),
        #     action='CREATE',
        #     resource_type='DATASOURCE',
        #     resource_id=event_dict.get('datasource_id'),
        #     timestamp=event_dict.get('occurred_at')
        # )
        # db.session.add(audit)
        # db.session.commit()
        
        # TODO: 发送飞书通知（可选）
        # from app.infrastructure.adapters.feishu.client import FeishuClient
        # feishu_client = FeishuClient()
        # feishu_client.send_text_message(
        #     chat_id="oc_xxx",  # 配置默认通知群
        #     text=f"数据源 {event_dict.get('name')} 已创建"
        # )
        
    except Exception as e:
        logger.error(f"Failed to handle DatasourceCreated event: {e}", exc_info=True)
        raise


def on_datasource_updated(event_dict: dict):
    """处理数据源更新事件"""
    try:
        logger.info(
            f"Datasource updated",
            extra={
                'datasource_id': event_dict.get('datasource_id'),
                'changes': event_dict.get('changes')
            }
        )
        
        # TODO: 记录审计日志
        
    except Exception as e:
        logger.error(f"Failed to handle DatasourceUpdated event: {e}", exc_info=True)
        raise


def on_datasource_deleted(event_dict: dict):
    """处理数据源删除事件"""
    try:
        logger.info(
            f"Datasource deleted",
            extra={
                'datasource_id': event_dict.get('datasource_id'),
                'name': event_dict.get('name')
            }
        )
        
        # TODO: 记录审计日志
        # TODO: 清理关联资源（如缓存）
        
    except Exception as e:
        logger.error(f"Failed to handle DatasourceDeleted event: {e}", exc_info=True)
        raise
