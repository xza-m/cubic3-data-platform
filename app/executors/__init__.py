"""
应用执行器实现

包含所有内置应用的执行器实现
"""

from .bi_dashboard_push_executor import BiDashboardPushExecutor
from .dataset_card_push_executor import DatasetCardPushExecutor
from .report_push_executor import ReportPushExecutor
from .anomaly_monitor_executor import AnomalyMonitorExecutor
from .query_result_push_executor import QueryResultPushExecutor
from .extraction_notify_executor import ExtractionNotifyExecutor
from .data_agent_executor import DataAgentExecutor
from .schema_drift_executor import SchemaDriftExecutor
from .table_cache_refresh_executor import TableCacheRefreshExecutor

# 自动注册所有执行器
def register_all_executors():
    """注册所有内置应用执行器"""
    # 执行器通过装饰器自动注册，这里仅用于确保模块被导入
    pass

__all__ = [
    'BiDashboardPushExecutor',
    'DatasetCardPushExecutor',
    'ReportPushExecutor',
    'AnomalyMonitorExecutor',
    'QueryResultPushExecutor',
    'ExtractionNotifyExecutor',
    'DataAgentExecutor',
    'SchemaDriftExecutor',
    'TableCacheRefreshExecutor',
    'register_all_executors',
]
