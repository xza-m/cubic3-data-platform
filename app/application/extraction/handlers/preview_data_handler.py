"""
预览数据查询处理器
"""
from app.application.extraction.queries.preview_data import PreviewDataQuery
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.services.sql_generator import SQLGeneratorService
from app.domain.services.permission_checker import PermissionCheckerService
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import DatasetNotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class PreviewDataHandler:
    """
    预览数据查询处理器
    
    职责：
    1. 验证用户权限
    2. 生成 SQL
    3. 执行查询
    4. 返回预览数据
    """
    
    def __init__(
        self,
        dataset_repository: IDatasetRepository,
        sql_generator: SQLGeneratorService = None,
        permission_checker: PermissionCheckerService = None
    ):
        self._dataset_repo = dataset_repository
        self._sql_generator = sql_generator
        self._permission_checker = permission_checker
    
    def handle(self, query: PreviewDataQuery) -> dict:
        """
        处理预览数据查询
        
        Args:
            query: 预览数据查询
        
        Returns:
            {
                'sql': str,
                'columns': List[str],
                'data': List[dict],
                'total': int
            }
        
        Raises:
            DatasetNotFoundError: 数据集不存在
            AuthorizationError: 用户无权限
        """
        logger.info(
            f"Previewing data",
            dataset_id=query.dataset_id,
            user_id=query.user_id,
            field_count=len(query.select_fields)
        )
        
        # 1. 加载数据集
        dataset = self._dataset_repo.find_by_id(query.dataset_id)
        if not dataset:
            raise DatasetNotFoundError(query.dataset_id)
        
        # 2. 验证权限
        self._permission_checker.check_dataset_access(query.user_id, dataset)
        self._permission_checker.check_field_access(
            query.user_id,
            dataset,
            query.select_fields
        )
        
        # 3. 生成 SQL
        sql = self._sql_generator.generate_sql(
            dataset=dataset,
            select_fields=query.select_fields,
            filter_conditions=query.filter_conditions,
            limit=query.limit,
            apply_masking=True
        )
        
        logger.debug(f"Generated SQL for preview", sql=sql)
        
        # 4. 创建适配器并执行查询
        adapter = AdapterFactory.create_adapter(
            dataset.source.source_type,
            dataset.source.connection_config
        )
        
        result = adapter.execute_query(sql, limit=query.limit)
        
        logger.info(
            f"Preview data query completed",
            row_count=len(result.get('data', []))
        )
        
        return {
            'sql': sql,
            'columns': result.get('columns', []),
            'data': result.get('data', []),
            'total': len(result.get('data', []))
        }
