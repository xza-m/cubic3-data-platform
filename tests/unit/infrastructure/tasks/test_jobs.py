"""
RQ Job 单元测试
Mock 数据库会话、适配器、服务，测试 sql_query_job 和 extraction_job
"""
import pytest
from unittest.mock import MagicMock, patch

from app.domain.entities.sql_query import SQLQuery, SQLQueryStatus
from app.domain.entities.data_source import DataSource
from app.domain.entities.extraction_run import ExtractionRun
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.entities.dataset import Dataset
from app.shared.enums import DatasetType, TaskStatus


# =============================================================================
# SQL Query Job
# =============================================================================

class TestExecuteSQLQueryJob:
    """execute_sql_query_job 测试"""

    @patch('app.infrastructure.tasks.jobs.sql_query_job.validate_sql_query')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.AdapterFactory')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_current_job')
    def test_success(
        self, mock_get_job, mock_get_session, mock_adapter_factory, mock_validate
    ):
        """成功执行 SQL 查询任务"""
        mock_job = MagicMock()
        mock_job.id = 'job-123'
        mock_get_job.return_value = mock_job

        mock_session = MagicMock()
        mock_query = MagicMock(spec=SQLQuery)
        mock_query.id = 1
        mock_query.source_id = 10
        mock_query.sql = 'SELECT 1'
        mock_query.limit_rows = 100
        mock_query.status = SQLQueryStatus.PENDING
        mock_query.start = MagicMock()
        mock_query.mark_as_completed = MagicMock()
        mock_query.mark_as_failed = MagicMock()

        mock_datasource = MagicMock(spec=DataSource)
        mock_datasource.id = 10
        mock_datasource.source_type = 'postgresql'
        mock_datasource.connection_config = {'host': 'localhost'}

        mock_session.query.return_value.filter_by.return_value.first.side_effect = [
            mock_query,
            mock_datasource,
        ]

        mock_get_session.return_value = mock_session

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {
            'columns': [{'name': 'col1', 'type': 'int'}],
            'data': [{'col1': 1}],
            'row_count': 1,
        }
        mock_adapter_factory.create_adapter.return_value = mock_adapter

        mock_validate.return_value = (True, [])

        from app.infrastructure.tasks.jobs.sql_query_job import execute_sql_query_job

        result = execute_sql_query_job(1)

        assert result['status'] == 'success'
        assert result['query_id'] == 1
        assert result['row_count'] == 1
        mock_query.start.assert_called_once()
        mock_query.mark_as_completed.assert_called_once()

    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_current_job')
    def test_query_not_found(self, mock_get_job, mock_get_session):
        """查询记录不存在"""
        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None
        mock_get_session.return_value = mock_session

        from app.infrastructure.tasks.jobs.sql_query_job import execute_sql_query_job

        result = execute_sql_query_job(999)

        assert result['status'] == 'failed'
        assert 'not found' in result['error'].lower()

    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_current_job')
    def test_skipped_when_not_pending(self, mock_get_job, mock_get_session):
        """非 pending 状态时跳过执行"""
        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_query = MagicMock(spec=SQLQuery)
        mock_query.id = 1
        mock_query.status = SQLQueryStatus.COMPLETED

        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_query
        mock_get_session.return_value = mock_session

        from app.infrastructure.tasks.jobs.sql_query_job import execute_sql_query_job

        result = execute_sql_query_job(1)

        assert result['status'] == 'skipped'
        assert 'completed' in result['reason'].lower()

    @patch('app.infrastructure.tasks.jobs.sql_query_job.validate_sql_query')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.AdapterFactory')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.sql_query_job.get_current_job')
    def test_failure_returns_dict(
        self, mock_get_job, mock_get_session, mock_adapter_factory, mock_validate
    ):
        """执行失败时返回失败字典而非抛出异常"""
        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_query = MagicMock(spec=SQLQuery)
        mock_query.id = 1
        mock_query.source_id = 10
        mock_query.sql = 'SELECT 1'
        mock_query.limit_rows = 100
        mock_query.status = SQLQueryStatus.PENDING
        mock_query.start = MagicMock()
        mock_query.mark_as_failed = MagicMock()

        mock_datasource = MagicMock(spec=DataSource)
        mock_datasource.source_type = 'postgresql'
        mock_datasource.connection_config = {}

        mock_session.query.return_value.filter_by.return_value.first.side_effect = [
            mock_query,
            mock_datasource,
        ]
        mock_get_session.return_value = mock_session

        mock_adapter = MagicMock()
        mock_adapter.execute_query.side_effect = Exception('DB connection failed')
        mock_adapter_factory.create_adapter.return_value = mock_adapter
        mock_validate.return_value = (True, [])

        from app.infrastructure.tasks.jobs.sql_query_job import execute_sql_query_job

        result = execute_sql_query_job(1)

        assert result['status'] == 'failed'
        assert 'query_id' in result
        assert 'DB connection failed' in result['error']


# =============================================================================
# SQL Query Job - 辅助函数
# =============================================================================

class TestSQLQueryJobHelpers:
    """sql_query_job 辅助函数测试"""

    def test_prepare_sql(self):
        """_prepare_sql 包裹子查询并添加 LIMIT"""
        from app.infrastructure.tasks.jobs.sql_query_job import _prepare_sql

        result = _prepare_sql('SELECT * FROM t', 100)
        assert 'SELECT * FROM (' in result
        assert 'AS preview_query' in result
        assert 'LIMIT 100' in result

    def test_prepare_sql_strips_semicolon(self):
        """_prepare_sql 去除尾部分号"""
        from app.infrastructure.tasks.jobs.sql_query_job import _prepare_sql

        result = _prepare_sql('SELECT 1;', 50)
        assert result.endswith('LIMIT 50')
        assert 'SELECT 1' in result

    def test_convert_rows_to_data(self):
        """_convert_rows_to_data 将 rows 转为 data 格式"""
        from app.infrastructure.tasks.jobs.sql_query_job import _convert_rows_to_data

        rows = [[1, 'a'], [2, 'b']]
        columns = [{'name': 'id', 'type': 'int'}, {'name': 'name', 'type': 'str'}]
        result = _convert_rows_to_data(rows, columns)
        assert result == [{'id': 1, 'name': 'a'}, {'id': 2, 'name': 'b'}]

    def test_convert_rows_to_data_empty(self):
        """_convert_rows_to_data 空输入返回空列表"""
        from app.infrastructure.tasks.jobs.sql_query_job import _convert_rows_to_data

        assert _convert_rows_to_data([], []) == []
        assert _convert_rows_to_data([], [{'name': 'x'}]) == []


# =============================================================================
# Extraction Job
# =============================================================================

class TestExecuteExtractionJob:
    """execute_extraction_job 测试"""

    @pytest.fixture
    def mock_run_chain(self):
        """构建 run -> task -> dataset -> source 链"""
        run = MagicMock(spec=ExtractionRun)
        run.id = 1
        run.generated_sql = 'SELECT * FROM t'
        run.start = MagicMock()
        run.mark_as_success = MagicMock()
        run.mark_as_failed = MagicMock()
        run.status = TaskStatus.SUCCESS.value
        run.row_count = 10
        run.result_size_mb = 0.1
        run.delivery_method = 'local'
        run.end_time = None
        run.duration_ms = None

        task = MagicMock(spec=ExtractionTask)
        task.id = 100
        task.task_name = 'test_task'
        task.row_limit = 1000
        task.subscription_config = {}
        task.update_last_run_info = MagicMock()

        dataset = MagicMock(spec=Dataset)
        dataset.id = 200
        dataset.dataset_type = DatasetType.PHYSICAL.value

        datasource = MagicMock(spec=DataSource)
        datasource.id = 300
        datasource.source_type = 'postgresql'
        datasource.connection_config = {'host': 'localhost'}

        run.task = task
        task.dataset = dataset
        dataset.source = datasource
        return run, task, dataset, datasource

    @patch('app.infrastructure.tasks.jobs.extraction_job.FileDeliveryService')
    @patch('app.infrastructure.tasks.jobs.extraction_job.AdapterFactory')
    @patch('app.infrastructure.tasks.jobs.extraction_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.extraction_job.get_current_job')
    def test_success_with_adapter(
        self, mock_get_job, mock_get_session, mock_adapter_factory,
        mock_file_service_cls, mock_run_chain, app
    ):
        """物理数据集：成功执行提取任务"""
        run, task, dataset, datasource = mock_run_chain
        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = run
        mock_get_session.return_value = mock_session

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {
            'columns': ['col1', 'col2'],
            'data': [[1, 'a'], [2, 'b']],
        }
        mock_adapter_factory.create_adapter.return_value = mock_adapter

        mock_file_service = MagicMock()
        mock_file_service.save_query_result.return_value = {
            'file_path': '/tmp/out.csv',
            'file_size_mb': 0.01,
        }
        mock_file_service.deliver_file.return_value = {
            'method': 'local',
            'download_url': None,
        }
        mock_file_service_cls.return_value = mock_file_service

        with app.app_context():
            from app.infrastructure.tasks.jobs.extraction_job import execute_extraction_job

            result = execute_extraction_job(1)

        assert result['status'] == 'success'
        assert result['run_id'] == 1
        run.mark_as_success.assert_called_once()
        task.update_last_run_info.assert_called_once()

    @patch('app.infrastructure.tasks.jobs.extraction_job.FileDeliveryService')
    @patch('app.infrastructure.tasks.jobs.extraction_job.pd')
    @patch('app.infrastructure.tasks.jobs.extraction_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.extraction_job.get_current_job')
    def test_success_file_dataset(
        self, mock_get_job, mock_get_session, mock_pd, mock_file_service_cls,
        mock_run_chain, app
    ):
        """文件数据集：成功执行提取任务"""
        run, task, dataset, datasource = mock_run_chain
        dataset.dataset_type = DatasetType.FILE.value
        dataset.file_metadata = {'file_path': '/tmp/test.csv'}

        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = run
        mock_get_session.return_value = mock_session

        mock_df = MagicMock()
        mock_df.columns.tolist.return_value = ['a', 'b']
        mock_df.values.tolist.return_value = [[1, 2], [3, 4]]
        mock_df.head.return_value = mock_df
        mock_pd.read_csv.return_value = mock_df

        mock_file_service = MagicMock()
        mock_file_service.save_query_result.return_value = {
            'file_path': '/tmp/out.csv',
            'file_size_mb': 0.01,
        }
        mock_file_service.deliver_file.return_value = {'method': 'local'}
        mock_file_service_cls.return_value = mock_file_service

        with app.app_context():
            from app.infrastructure.tasks.jobs.extraction_job import execute_extraction_job

            result = execute_extraction_job(1)

        assert result['status'] == 'success'
        mock_pd.read_csv.assert_called_once_with('/tmp/test.csv')

    @patch('app.infrastructure.tasks.jobs.extraction_job.get_db_session')
    @patch('app.infrastructure.tasks.jobs.extraction_job.get_current_job')
    def test_run_not_found(self, mock_get_job, mock_get_session, app):
        """执行记录不存在时抛出异常"""
        mock_get_job.return_value = MagicMock(id='job-1')
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None
        mock_get_session.return_value = mock_session

        with app.app_context():
            from app.infrastructure.tasks.jobs.extraction_job import execute_extraction_job

            with pytest.raises(ValueError, match='not found'):
                execute_extraction_job(999)
