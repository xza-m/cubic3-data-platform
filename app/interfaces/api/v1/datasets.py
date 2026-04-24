"""
数据集管理 REST API（新架构）
"""

from flask import Blueprint, request, g
from pydantic import ValidationError as PydanticValidationError
from app.application.dataset.commands.create_dataset import CreateDatasetCommand
from app.application.dataset.commands.update_dataset import UpdateDatasetCommand
from app.application.dataset.commands.delete_dataset import DeleteDatasetCommand
from app.application.dataset.commands.sync_schema import SyncSchemaCommand
from app.application.dataset.queries.list_datasets import ListDatasetsQuery
from app.application.dataset.queries.get_dataset import GetDatasetQuery
from app.application.dataset.queries.preview_dataset import PreviewDatasetQuery
from app.application.dataset.queries.get_statistics import GetStatisticsQuery
from app.application.dataset.schemas.dataset_schemas import (
    CreateDatasetRequest,
    UpdateDatasetRequest,
    PreviewDatasetRequest
)
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created, bad_request
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def create_datasets_blueprint(container):
    """Blueprint 工厂：container 在初始化时注入，便于单元测试时传入 Mock。

    Args:
        container: DI 容器，提供各类 Handler/Repository
    """
    bp = Blueprint('datasets_api_v1', __name__, url_prefix='/api/v1/data-center/datasets')

    # ============================================================================
    # 数据集管理 API
    # ============================================================================

    @bp.route('', methods=['GET'])
    @require_auth
    def list_datasets():
        """
        获取数据集列表

        Query Parameters:
            - source_id: 数据源ID筛选
            - owner: 负责人筛选
            - search: 搜索关键词
            - page: 页码 (默认1)
            - page_size: 每页数量 (默认20)
        """
        source_id = request.args.get('source_id', type=int)
        owner = request.args.get('owner')
        search = request.args.get('search')
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 20, type=int)

        query = ListDatasetsQuery(
            source_id=source_id,
            owner=owner,
            search=search,
            page=page,
            page_size=page_size
        )

        handler = container.list_datasets_handler()
        result = handler.handle(query)
        items = [ds.to_dict() for ds in result['items']]

        return success(data={
            'items': items,
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
            'total_pages': result['total_pages']
        })

    @bp.route('/<int:dataset_id>', methods=['GET'])
    @require_auth
    def get_dataset(dataset_id):
        """获取数据集详情"""
        include_fields = request.args.get('include_fields', 'false').lower() == 'true'

        query = GetDatasetQuery(
            dataset_id=dataset_id,
            include_fields=include_fields
        )

        handler = container.get_dataset_handler()
        dataset = handler.handle(query)

        return success(data=dataset.to_dict(include_fields=include_fields))

    @bp.route('', methods=['POST'])
    @require_auth
    def create_dataset():
        """创建数据集"""
        try:
            data = request.get_json()
            schema = CreateDatasetRequest(**data)
        except PydanticValidationError as e:
            return bad_request(message=f'请求参数验证失败: {e.errors()}')

        if not schema.dataset_code:
            ds_repo = container.datasource_repository()
            datasource = ds_repo.find_by_id(schema.source_id)

            if not datasource:
                from app.shared.exceptions import ApplicationException
                raise ApplicationException(f"数据源不存在: {schema.source_id}")

            from app.shared.utils.code_generator import generate_dataset_code
            schema.dataset_code = generate_dataset_code(
                datasource.source_type,
                schema.physical_table,
                fallback_name=schema.dataset_name
            )
            logger.info(f"Auto-generated dataset_code: {schema.dataset_code}")

        command = CreateDatasetCommand(
            dataset_code=schema.dataset_code,
            dataset_name=schema.dataset_name,
            source_id=schema.source_id,
            physical_table=schema.physical_table or '',
            fields=[field.dict() for field in schema.fields],
            description=schema.description,
            owner=schema.owner,
            created_by=g.get('user_id', 'admin'),
            dataset_type=schema.dataset_type,
            sql_query=schema.sql_query,
            file_metadata=schema.file_metadata
        )

        handler = container.create_dataset_handler()
        dataset = handler.handle(command)

        return created(data=dataset.to_dict(), message='数据集创建成功')

    @bp.route('/<int:dataset_id>', methods=['PUT'])
    @require_auth
    def update_dataset(dataset_id):
        """更新数据集"""
        try:
            data = request.get_json()
            schema = UpdateDatasetRequest(**data)
        except PydanticValidationError as e:
            return bad_request(message=f'请求参数验证失败: {e.errors()}')

        command = UpdateDatasetCommand(
            dataset_id=dataset_id,
            dataset_name=schema.dataset_name,
            description=schema.description,
            owner=schema.owner
        )

        handler = container.update_dataset_handler()
        dataset = handler.handle(command)

        return success(data=dataset.to_dict(), message='数据集更新成功')

    @bp.route('/<int:dataset_id>', methods=['DELETE'])
    @require_auth
    def delete_dataset(dataset_id):
        """删除数据集"""
        command = DeleteDatasetCommand(dataset_id=dataset_id)
        handler = container.delete_dataset_handler()
        handler.handle(command)

        return success(message='数据集删除成功')

    @bp.route('/<int:dataset_id>/sync-schema', methods=['POST'])
    @require_auth
    def sync_dataset_schema(dataset_id):
        """刷新数据集元数据"""
        command = SyncSchemaCommand(dataset_id=dataset_id)
        handler = container.sync_schema_handler()
        result = handler.handle(command)

        return success(data=result, message='元数据同步已触发')

    @bp.route('/preview', methods=['POST'])
    @require_auth
    def preview_dataset():
        """预览数据集（获取表Schema并自动识别字段）"""
        try:
            data = request.get_json()
            schema = PreviewDatasetRequest(**data)
        except PydanticValidationError as e:
            return bad_request(message=f'请求参数验证失败: {e.errors()}')

        query = PreviewDatasetQuery(
            datasource_id=schema.datasource_id,
            database=schema.database,
            table=schema.table
        )

        handler = container.preview_dataset_handler()
        result = handler.handle(query)

        return success(data=result)

    @bp.route('/statistics', methods=['GET'])
    @require_auth
    def get_statistics():
        """获取数据集统计信息"""
        query = GetStatisticsQuery()
        handler = container.get_dataset_statistics_handler()
        stats = handler.handle(query)

        return success(data=stats)

    @bp.route('/<int:dataset_id>/profile', methods=['GET'])
    @require_auth
    def get_dataset_profile(dataset_id):
        """获取数据集画像（best-effort）"""
        handler = container.profile_dataset_handler()
        result = handler.handle(dataset_id, force_refresh=False)
        return success(data=result)

    @bp.route('/<int:dataset_id>/profile/refresh', methods=['POST'])
    @require_auth
    def refresh_dataset_profile(dataset_id):
        """强制刷新数据集画像"""
        handler = container.profile_dataset_handler()
        result = handler.handle(dataset_id, force_refresh=True)
        return success(data=result, message='画像已刷新')

    return bp
