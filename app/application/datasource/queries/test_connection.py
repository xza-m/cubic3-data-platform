"""
测试数据源连接
"""
from dataclasses import dataclass


@dataclass
class TestConnectionQuery:
    """测试数据源连接"""
    datasource_id: int
