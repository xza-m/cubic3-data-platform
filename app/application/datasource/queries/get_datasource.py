"""
获取数据源详情
"""
from dataclasses import dataclass


@dataclass
class GetDatasourceQuery:
    """获取数据源详情"""
    datasource_id: int
