"""
获取表Schema信息处理器（字段列表、主键、分区键等）
"""
from typing import Dict, Any
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.get_table_schema import GetTableSchemaQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class GetTableSchemaHandler:
    """获取表Schema信息处理器"""
    
    def __init__(self, repository: IDatasourceRepository):
        """
        初始化
        
        Args:
            repository: 数据源仓储
        """
        self.repository = repository
    
    def handle(self, query: GetTableSchemaQuery) -> Dict[str, Any]:
        """
        处理获取表Schema查询
        
        Args:
            query: 查询对象
        
        Returns:
            表Schema信息，包含列列表、分区信息等
        
        Raises:
            ApplicationException: 数据源不存在或查询失败
        """
        logger.info(
            "Getting table schema",
            datasource_id=query.datasource_id,
            database=query.database,
            table=query.table,
            schema=query.schema
        )
        
        # 1. 查找数据源
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        # 2. 创建适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 3. 构建表名（PostgreSQL 支持 schema.table 格式）
        table_ref = query.table
        if query.schema and datasource.source_type == 'postgresql':
            table_ref = f"{query.schema}.{query.table}"
        
        # 4. 获取表Schema
        try:
            result = adapter.get_table_schema(query.database, table_ref)
            return result
        except Exception as e:
            logger.error(
                f"Failed to get table schema: {e}",
                datasource_id=query.datasource_id,
                table=query.table
            )
            raise ApplicationException(f"获取表Schema失败: {str(e)}")
        finally:
            adapter.close()
