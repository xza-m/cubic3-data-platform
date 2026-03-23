"""
预览表数据处理器
"""
from typing import Dict, Any
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.preview_table_data import PreviewTableDataQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class PreviewTableDataHandler:
    """预览表数据处理器"""
    
    def __init__(self, datasource_repository: IDatasourceRepository):
        """
        初始化处理器
        
        Args:
            datasource_repository: 数据源仓储
        """
        self.datasource_repository = datasource_repository
    
    def handle(self, query: PreviewTableDataQuery) -> Dict[str, Any]:
        """
        处理预览表数据查询（异步）
        
        Args:
            query: 预览查询对象
            
        Returns:
            {
                'columns': [{'name': str, 'type': str}],
                'data': [dict],
                'row_count': int,
                'table_name': str
            }
            
        Raises:
            ApplicationException: 数据源不存在或查询失败
        """
        logger.info(
            f"Previewing table data",
            datasource_id=query.datasource_id,
            database=query.database,
            table=query.table,
            limit=query.limit
        )
        
        # 1. 查找数据源
        datasource = self.datasource_repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        # 2. 创建适配器
        # 为了查询指定数据库中的表，需要临时修改连接配置
        connection_config = datasource.connection_config.copy()
        connection_config['database'] = query.database
        
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            connection_config
        )
        
        try:
            # 3. 先获取表的元数据（包含字段注释）
            try:
                table_schema = adapter.get_table_schema(query.database, query.table)
                # 构建字段名到注释的映射
                field_comments = {
                    col['name']: col.get('comment', '') 
                    for col in table_schema.get('columns', [])
                }
            except Exception as schema_error:
                logger.warning(f"Failed to get table schema, will continue without comments: {schema_error}")
                field_comments = {}
            
            # 4. 生成查询SQL（简单的 SELECT * LIMIT）
            # 对于PostgreSQL，如果表名包含schema，需要分别引用
            # 例如：public.chat -> "public"."chat" 或直接 public.chat（如果表名无特殊字符）
            # 这里使用双引号包裹整个表名，对于大多数数据库都兼容
            if '.' in query.table:
                # 如果包含schema，分别引用
                parts = query.table.split('.', 1)
                sql = f'SELECT * FROM "{parts[0]}"."{parts[1]}" LIMIT {query.limit}'
            else:
                sql = f'SELECT * FROM "{query.table}" LIMIT {query.limit}'
            
            logger.debug(f"Generated preview SQL", sql=sql)
            
            # 5. 执行查询
            result = adapter.execute_query(sql, limit=query.limit)
            
            # 6. 格式化返回结果（合并字段注释）
            # 从 columns 列表提取字段信息（适配器返回的格式）
            columns_info = []
            if result.get('columns'):
                # 某些适配器返回简单的列名列表，某些返回字典
                for col in result['columns']:
                    if isinstance(col, str):
                        col_name = col
                        col_type = 'unknown'
                    else:
                        col_name = col.get('name', col.get('column_name', 'unknown'))
                        col_type = col.get('type', col.get('data_type', 'unknown'))
                    
                    # 添加字段注释
                    columns_info.append({
                        'name': col_name,
                        'type': col_type,
                        'comment': field_comments.get(col_name, '')  # 新增：添加字段注释
                    })
            
            return {
                'columns': columns_info,
                'data': result.get('data', []),
                'row_count': len(result.get('data', [])),
                'table_name': query.table
            }
            
        except Exception as e:
            logger.error(
                f"Failed to preview table data: {e}",
                datasource_id=query.datasource_id,
                table=query.table
            )
            raise ApplicationException(f"预览表数据失败: {str(e)}")
        finally:
            # 关闭适配器连接
            adapter.close()
