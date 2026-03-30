"""
数据源适配器单元测试
Mock 外部驱动，测试 PostgreSQL、MySQL、ClickHouse、MaxCompute 适配器
"""
import builtins
from types import SimpleNamespace
import pytest
from unittest.mock import MagicMock, patch

from app.infrastructure.adapters.datasources.base_adapter import DataSourceAdapter
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.adapters.datasources.postgresql_adapter import PostgreSQLAdapter
from app.infrastructure.adapters.datasources.mysql_adapter import MySQLAdapter
from app.infrastructure.adapters.datasources.clickhouse_adapter import ClickHouseAdapter
from app.infrastructure.adapters.datasources.maxcompute_adapter import MaxComputeAdapter


class DummyAdapter(DataSourceAdapter):
    """用于覆盖基类公共行为的测试适配器。"""

    def __init__(self, config=None):
        super().__init__(config or {})
        self.closed = False
        self.raise_on_close = False

    def test_connection(self):
        return {'success': True}

    def list_databases(self):
        return ['default']

    def list_tables(self, database: str):
        return []

    def get_table_schema(self, database: str, table: str):
        return {'table_name': table}

    def execute_query(self, sql: str, limit: int = 100):
        return {'rows': []}

    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        yield {'rows': []}

    def _close_connection(self):
        self.closed = True
        if self.raise_on_close:
            raise RuntimeError('close failed')


# =============================================================================
# DataSourceAdapter / AdapterFactory
# =============================================================================

class TestDataSourceAdapterBase:
    """基类公共行为测试"""

    def test_list_schemas_defaults_to_empty_list(self):
        adapter = DummyAdapter()
        assert adapter.list_schemas('db') == []

    def test_close_calls_subclass_close_and_clears_connection(self):
        adapter = DummyAdapter()
        adapter.connection = object()

        adapter.close()

        assert adapter.closed is True
        assert adapter.connection is None

    def test_close_swallows_close_errors_and_clears_connection(self):
        adapter = DummyAdapter()
        adapter.connection = object()
        adapter.raise_on_close = True

        adapter.close()

        assert adapter.closed is True
        assert adapter.connection is None

    def test_context_manager_closes_adapter(self):
        adapter = DummyAdapter()
        adapter.connection = object()

        with adapter as entered:
            assert entered is adapter

        assert adapter.closed is True
        assert adapter.connection is None

    def test_abstract_contract_methods_are_directly_invokable_for_contract_coverage(self):
        proxy = SimpleNamespace()

        assert DataSourceAdapter.__dict__['test_connection'](proxy) is None
        assert DataSourceAdapter.__dict__['list_databases'](proxy) is None
        assert DataSourceAdapter.__dict__['list_tables'](proxy, 'db') is None
        assert DataSourceAdapter.__dict__['get_table_schema'](proxy, 'db', 'table') is None
        assert DataSourceAdapter.__dict__['execute_query'](proxy, 'SELECT 1') is None
        assert DataSourceAdapter.__dict__['execute_query_stream'](proxy, 'SELECT 1') is None
        assert DataSourceAdapter.__dict__['_close_connection'](proxy) is None


class TestAdapterFactory:
    """工厂和字段映射测试"""

    def test_normalize_connection_config_handles_empty_config(self):
        assert AdapterFactory._normalize_connection_config('maxcompute', {}) == {}
        assert AdapterFactory._normalize_connection_config('maxcompute', None) is None

    def test_normalize_connection_config_maps_maxcompute_keys(self):
        config = {
            'access_key_id': 'ak',
            'access_key_secret': 'sk',
            'endpoint': 'ep',
        }

        normalized = AdapterFactory._normalize_connection_config('maxcompute', config)

        assert normalized == {
            'access_id': 'ak',
            'access_key': 'sk',
            'endpoint': 'ep',
        }
        assert config['access_key_id'] == 'ak'

    def test_create_adapter_returns_normalized_instance(self):
        adapter = AdapterFactory.create_adapter('maxcompute', {
            'access_key_id': 'ak',
            'access_key_secret': 'sk',
            'project': 'demo',
            'endpoint': 'ep',
            'access_id': 'legacy',
        })

        assert isinstance(adapter, MaxComputeAdapter)
        assert adapter.config['access_id'] == 'ak'
        assert adapter.config['access_key'] == 'sk'

    def test_create_adapter_raises_for_unknown_type(self):
        with pytest.raises(ValueError, match='不支持的数据源类型'):
            AdapterFactory.create_adapter('oracle', {'host': 'localhost'})

    def test_get_supported_types_contains_registered_adapters(self):
        supported = AdapterFactory.get_supported_types()
        assert {'maxcompute', 'clickhouse', 'postgresql', 'mysql'}.issubset(set(supported))

    def test_register_adapter_rejects_non_adapter_class(self):
        with pytest.raises(TypeError, match='必须继承自 DataSourceAdapter'):
            AdapterFactory.register_adapter('invalid', object)

    def test_register_adapter_accepts_custom_adapter(self):
        class CustomAdapter(DummyAdapter):
            pass

        AdapterFactory.register_adapter('custom_test', CustomAdapter)
        try:
            adapter = AdapterFactory.create_adapter('custom_test', {'token': 'demo'})
            assert isinstance(adapter, CustomAdapter)
            assert adapter.config['token'] == 'demo'
        finally:
            AdapterFactory._adapters.pop('custom_test', None)


# =============================================================================
# PostgreSQLAdapter
# =============================================================================

class TestPostgreSQLAdapter:
    """PostgreSQL 适配器测试"""

    def test_init_stores_config(self):
        """构造函数正确存储配置"""
        config = {'host': 'localhost', 'port': 5432, 'user': 'u', 'password': 'p', 'database': 'db'}
        adapter = PostgreSQLAdapter(config)
        assert adapter.config == config

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_test_connection_success(self, mock_connect):
        """test_connection 成功路径"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ('PostgreSQL 14.0',)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        result = adapter.test_connection()

        assert result['success'] is True
        assert result['message'] == '连接成功'
        assert result['details']['version'] == 'PostgreSQL 14.0'

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_test_connection_failure(self, mock_connect):
        """test_connection 失败路径"""
        mock_connect.side_effect = Exception('Connection refused')

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p'})
        result = adapter.test_connection()

        assert result['success'] is False
        assert '连接失败' in result['message']
        assert 'Connection refused' in result['message']

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.prepare_readonly_sql')
    def test_list_tables(self, mock_prepare, mock_connect):
        """list_tables 返回表列表"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            ('public.users', '1 MB', '用户表'),
            ('public.orders', '2 MB', '订单表'),
        ]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        tables = adapter.list_tables('db')

        assert len(tables) == 2
        assert tables[0]['table_name'] == 'public.users'
        assert tables[0]['comment'] == '用户表'
        assert tables[0]['size'] == '1 MB'

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.prepare_readonly_sql')
    def test_execute_query_success(self, mock_prepare, mock_connect):
        """execute_query 成功路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_conn = MagicMock()

        # 主查询 cursor（RealDictCursor）
        main_cursor = MagicMock()
        desc1 = MagicMock()
        desc1.name = 'col1'
        desc1.type_code = 23
        desc2 = MagicMock()
        desc2.name = 'col2'
        desc2.type_code = 1043
        main_cursor.description = [desc1, desc2]
        main_cursor.fetchall.return_value = [{'col1': 1, 'col2': 'a'}]
        main_cursor.__enter__ = MagicMock(return_value=main_cursor)
        main_cursor.__exit__ = MagicMock(return_value=False)

        # _batch_get_pg_type_names 用的 cursor
        type_cursor = MagicMock()
        type_cursor.fetchall.return_value = [(23, 'int4'), (1043, 'varchar')]
        type_cursor.__enter__ = MagicMock(return_value=type_cursor)
        type_cursor.__exit__ = MagicMock(return_value=False)

        # 调用顺序：先 main_cursor（execute_query），再 type_cursor（_batch_get_pg_type_names）
        mock_conn.cursor.side_effect = [main_cursor, type_cursor]
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        result = adapter.execute_query('SELECT 1', limit=100)

        assert 'columns' in result
        assert 'data' in result
        assert result['row_count'] == 1
        assert 'execution_time_ms' in result

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.prepare_readonly_sql')
    def test_execute_query_error(self, mock_prepare, mock_connect):
        """execute_query 异常路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_connect.side_effect = Exception('DB error')

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p'})
        with pytest.raises(Exception, match='DB error'):
            adapter.execute_query('SELECT 1')

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_get_table_schema(self, mock_connect):
        """get_table_schema 返回表结构"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.side_effect = [
            [('id', 'integer', 'NO', None, '主键'), ('name', 'varchar', 'YES', None, '名称')],
        ]
        mock_cursor.fetchone.side_effect = [('用户表',), (100,)]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        schema = adapter.get_table_schema('db', 'public.users')

        assert schema['table_name'] == 'public.users'
        assert len(schema['columns']) == 2
        assert schema['columns'][0]['name'] == 'id'
        assert schema['columns'][0]['type'] == 'integer'

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_list_databases_includes_current_database_when_missing(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [('analytics',)]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'warehouse'})
        assert adapter.list_databases() == ['warehouse', 'analytics']

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_list_schemas_returns_filtered_names(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [('mart',), ('ods',)]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'warehouse'})
        assert adapter.list_schemas('warehouse') == ['mart', 'ods']

    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.prepare_readonly_sql')
    @patch('app.infrastructure.adapters.datasources.postgresql_adapter.psycopg2.connect')
    def test_execute_query_stream_batches_rows(self, mock_connect, mock_prepare):
        mock_prepare.return_value = 'SELECT * FROM demo'
        mock_conn = MagicMock()
        stream_cursor = MagicMock()
        stream_cursor.description = [('id',), ('name',)]
        stream_cursor.fetchmany.side_effect = [
            [(1, 'a'), (2, 'b')],
            [(3, 'c')],
            [],
        ]
        stream_cursor.__enter__ = MagicMock(return_value=stream_cursor)
        stream_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = stream_cursor
        mock_connect.return_value = mock_conn

        adapter = PostgreSQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        batches = list(adapter.execute_query_stream('SELECT * FROM demo', batch_size=2))

        assert batches == [
            {'columns': ['id', 'name'], 'rows': [[1, 'a'], [2, 'b']], 'batch_size': 2},
            {'columns': ['id', 'name'], 'rows': [[3, 'c']], 'batch_size': 1},
        ]

    def test_batch_get_pg_type_names_returns_empty_dict_on_error(self):
        conn = MagicMock()
        cursor = MagicMock()
        cursor.execute.side_effect = RuntimeError('boom')
        cursor.__enter__ = MagicMock(return_value=cursor)
        cursor.__exit__ = MagicMock(return_value=False)
        conn.cursor.return_value = cursor
        description = [MagicMock(type_code=23)]

        adapter = PostgreSQLAdapter({'host': 'h'})
        assert adapter._batch_get_pg_type_names(conn, description) == {}

    def test_close_connection_closes_existing_connection(self):
        adapter = PostgreSQLAdapter({'host': 'h'})
        adapter.connection = MagicMock()

        adapter._close_connection()

        adapter.connection.close.assert_called_once()


# =============================================================================
# MySQLAdapter
# =============================================================================

class TestMySQLAdapter:
    """MySQL 适配器测试"""

    def test_init_stores_config(self):
        """构造函数正确存储配置"""
        config = {'host': 'localhost', 'port': 3306, 'user': 'u', 'password': 'p', 'database': 'db'}
        adapter = MySQLAdapter(config)
        assert adapter.config == config

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_test_connection_success(self, mock_connect):
        """test_connection 成功路径"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ('8.0.28',)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        result = adapter.test_connection()

        assert result['success'] is True
        assert result['message'] == '连接成功'
        assert result['details']['version'] == '8.0.28'

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_test_connection_failure(self, mock_connect):
        """test_connection 失败路径"""
        mock_connect.side_effect = Exception('Access denied')

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p'})
        result = adapter.test_connection()

        assert result['success'] is False
        assert '连接失败' in result['message']

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_list_tables(self, mock_connect):
        """list_tables 返回表列表"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            ('users', '用户表', 1000, 1.5),
            ('orders', '订单表', 5000, 2.0),
        ]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        tables = adapter.list_tables('db')

        assert len(tables) == 2
        assert tables[0]['table_name'] == 'users'
        assert tables[0]['comment'] == '用户表'
        assert 'MB' in tables[0]['size']

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    @patch('app.infrastructure.adapters.datasources.mysql_adapter.prepare_readonly_sql')
    def test_execute_query_success(self, mock_prepare, mock_connect):
        """execute_query 成功路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.description = [('id', 3), ('name', 253)]
        mock_cursor.fetchall.return_value = [{'id': 1, 'name': 'a'}]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        result = adapter.execute_query('SELECT 1', limit=100)

        assert 'columns' in result
        assert 'data' in result
        assert result['row_count'] == 1
        assert 'execution_time_ms' in result

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    @patch('app.infrastructure.adapters.datasources.mysql_adapter.prepare_readonly_sql')
    def test_execute_query_error(self, mock_prepare, mock_connect):
        """execute_query 异常路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_connect.side_effect = Exception('MySQL error')

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p'})
        with pytest.raises(Exception, match='MySQL error'):
            adapter.execute_query('SELECT 1')

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_get_table_schema(self, mock_connect):
        """get_table_schema 返回表结构"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.side_effect = [
            [('id', 'int', 'NO', None, '主键', 'PRI'), ('name', 'varchar', 'YES', None, '名称', '')],
        ]
        mock_cursor.fetchone.return_value = ('用户表', 1000)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        schema = adapter.get_table_schema('db', 'users')

        assert schema['table_name'] == 'users'
        assert len(schema['columns']) == 2
        assert schema['columns'][0]['name'] == 'id'
        assert schema['columns'][0]['is_partition'] is True

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_list_databases_includes_current_database_when_missing(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [('analytics',)]
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'warehouse'})
        assert adapter.list_databases() == ['warehouse', 'analytics']

    @patch('app.infrastructure.adapters.datasources.mysql_adapter.prepare_readonly_sql')
    @patch('app.infrastructure.adapters.datasources.mysql_adapter.pymysql.connect')
    def test_execute_query_stream_batches_rows(self, mock_connect, mock_prepare):
        mock_prepare.return_value = 'SELECT * FROM demo'
        mock_conn = MagicMock()
        stream_cursor = MagicMock()
        stream_cursor.description = [('id',), ('name',)]
        stream_cursor.fetchmany.side_effect = [
            [(1, 'a'), (2, 'b')],
            [(3, 'c')],
            [],
        ]
        stream_cursor.__enter__ = MagicMock(return_value=stream_cursor)
        stream_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = stream_cursor
        mock_connect.return_value = mock_conn

        adapter = MySQLAdapter({'host': 'h', 'user': 'u', 'password': 'p', 'database': 'db'})
        batches = list(adapter.execute_query_stream('SELECT * FROM demo', batch_size=2))

        assert batches == [
            {'columns': ['id', 'name'], 'rows': [(1, 'a'), (2, 'b')], 'batch_size': 2},
            {'columns': ['id', 'name'], 'rows': [(3, 'c')], 'batch_size': 1},
        ]

    def test_close_connection_closes_existing_connection(self):
        adapter = MySQLAdapter({'host': 'h'})
        adapter.connection = MagicMock()

        adapter._close_connection()

        adapter.connection.close.assert_called_once()


# =============================================================================
# ClickHouseAdapter
# =============================================================================

class TestClickHouseAdapter:
    """ClickHouse 适配器测试"""

    def test_init_stores_config(self):
        """构造函数正确存储配置"""
        config = {'host': 'localhost', 'port': 9000, 'user': 'default', 'password': ''}
        adapter = ClickHouseAdapter(config)
        assert adapter.config == config
        assert adapter.client is None

    def test_test_connection_success(self):
        """test_connection 成功路径"""
        mock_client = MagicMock()
        mock_client.execute.return_value = [('22.8.1',)]
        adapter = ClickHouseAdapter({'host': 'h', 'port': 9000})
        adapter._get_client = MagicMock(return_value=mock_client)

        result = adapter.test_connection()

        assert result['success'] is True
        assert '成功' in result['message']
        assert result['details']['version'] == '22.8.1'

    def test_test_connection_failure(self):
        """test_connection 失败路径"""
        mock_client = MagicMock()
        mock_client.execute.side_effect = Exception('Connection timeout')
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        result = adapter.test_connection()

        assert result['success'] is False
        assert '连接失败' in result['message']

    def test_list_tables(self):
        """list_tables 返回表列表"""
        mock_client = MagicMock()
        mock_client.execute.return_value = [
            ('events', 'MergeTree', 1000, 1024, 'CREATE TABLE ...'),
            ('logs', 'Log', 500, 512, 'CREATE TABLE ...'),
        ]
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        tables = adapter.list_tables('default')

        assert len(tables) == 2
        assert tables[0]['table_name'] == 'events'
        assert tables[0]['engine'] == 'MergeTree'

    @patch('app.infrastructure.adapters.datasources.clickhouse_adapter.prepare_readonly_sql')
    def test_execute_query_success(self, mock_prepare):
        """execute_query 成功路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_client = MagicMock()
        mock_client.execute.return_value = ([['a', 'b']], [('col1', 'String'), ('col2', 'String')])
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        result = adapter.execute_query('SELECT 1', limit=100)

        assert 'columns' in result
        assert 'rows' in result
        assert result['row_count'] == 1
        assert 'execution_time_ms' in result

    @patch('app.infrastructure.adapters.datasources.clickhouse_adapter.prepare_readonly_sql')
    def test_execute_query_error(self, mock_prepare):
        """execute_query 异常路径"""
        mock_prepare.return_value = 'SELECT 1'
        mock_client = MagicMock()
        mock_client.execute.side_effect = Exception('Query failed')
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        with pytest.raises(Exception, match='查询执行失败'):
            adapter.execute_query('SELECT 1')

    def test_get_table_schema(self):
        """get_table_schema 返回表结构"""
        mock_client = MagicMock()
        mock_client.execute.side_effect = [
            [('id', 'UInt64', '', 'DEFAULT', ''), ('name', 'String', '名称', '', '')],
            [(1000, 1024)],
        ]
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        schema = adapter.get_table_schema('default', 'events')

        assert schema['table_name'] == 'events'
        assert len(schema['columns']) == 2
        assert schema['columns'][0]['name'] == 'id'
        assert schema['row_count'] == 1000

    def test_list_databases(self):
        mock_client = MagicMock()
        mock_client.execute.return_value = [('default',), ('analytics',)]
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        assert adapter.list_databases() == ['default', 'analytics']

    def test_execute_query_stream_batches_rows(self):
        mock_client = MagicMock()
        mock_client.execute.return_value = (
            [(1, 'a'), (2, 'b'), (3, 'c')],
            [('id', 'UInt64'), ('name', 'String')],
        )
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        batches = list(adapter.execute_query_stream('SELECT * FROM demo', batch_size=2))

        assert batches == [
            {'columns': ['id', 'name'], 'rows': [(1, 'a'), (2, 'b')], 'batch_size': 2},
            {'columns': ['id', 'name'], 'rows': [(3, 'c')], 'batch_size': 1},
        ]

    def test_close_connection_disconnects_client(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter.client = MagicMock()

        adapter._close_connection()

        adapter.client = None

    def test_get_client_raises_install_hint_when_driver_missing(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        original_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == 'clickhouse_driver':
                raise ImportError('missing')
            return original_import(name, *args, **kwargs)

        with patch('builtins.__import__', side_effect=fake_import):
            with pytest.raises(ImportError, match='clickhouse-driver'):
                adapter._get_client()

    def test_list_databases_wraps_underlying_error(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(side_effect=RuntimeError('boom'))

        with pytest.raises(Exception, match='获取数据库列表失败: boom'):
            adapter.list_databases()

    def test_list_tables_ignores_broken_comment_parse(self):
        mock_client = MagicMock()
        mock_client.execute.return_value = [
            ('events', 'MergeTree', 1000, 1024, 'COMMENT broken'),
        ]
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(return_value=mock_client)

        tables = adapter.list_tables('default')

        assert tables == [{
            'table_name': 'events',
            'comment': '',
            'row_count': 1000,
            'size': 1024,
            'engine': 'MergeTree',
        }]

    def test_get_table_schema_wraps_error(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(side_effect=RuntimeError('schema boom'))

        with pytest.raises(Exception, match='获取表Schema失败: schema boom'):
            adapter.get_table_schema('default', 'events')

    def test_execute_query_stream_wraps_error(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter._get_client = MagicMock(side_effect=RuntimeError('stream boom'))

        with pytest.raises(Exception, match='流式查询失败: stream boom'):
            list(adapter.execute_query_stream('SELECT * FROM demo', batch_size=2))

    def test_close_connection_swallows_disconnect_error(self):
        adapter = ClickHouseAdapter({'host': 'h'})
        adapter.client = MagicMock()
        adapter.client.disconnect.side_effect = RuntimeError('disconnect failed')

        adapter._close_connection()

        assert adapter.client is None


# =============================================================================
# MaxComputeAdapter
# =============================================================================

class TestMaxComputeAdapter:
    """MaxCompute 适配器测试"""

    def test_init_stores_config(self):
        """构造函数正确存储配置"""
        config = {'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'}
        adapter = MaxComputeAdapter(config)
        assert adapter.config == config
        assert adapter.odps is None

    def test_test_connection_success(self):
        """test_connection 成功路径"""
        mock_project = MagicMock()
        mock_project.name = 'my_project'
        mock_project.owner = 'owner'
        mock_project.comment = 'comment'
        mock_odps = MagicMock()
        mock_odps.get_project.return_value = mock_project

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        result = adapter.test_connection()

        assert result['success'] is True
        assert '成功' in result['message']
        assert result['details']['project_name'] == 'my_project'

    def test_test_connection_failure(self):
        """test_connection 失败路径"""
        mock_odps = MagicMock()
        mock_odps.get_project.side_effect = Exception('Auth failed')

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        result = adapter.test_connection()

        assert result['success'] is False
        assert '连接失败' in result['message']

    def test_list_databases(self):
        """list_databases 返回项目名"""
        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'my_proj'})
        dbs = adapter.list_databases()
        assert dbs == ['my_proj']

    def test_list_tables(self):
        """list_tables 返回表列表"""
        mock_table = MagicMock()
        mock_table.name = 'my_table'
        mock_odps = MagicMock()
        mock_odps.list_tables.return_value = [mock_table]

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        tables = adapter.list_tables('proj')

        assert len(tables) == 1
        assert tables[0]['table_name'] == 'my_table'

    def test_execute_query_success(self):
        """execute_query 成功路径"""
        mock_instance = MagicMock()
        mock_reader = MagicMock()
        mock_reader.schema.columns = [
            MagicMock(name='col1', type='bigint'),
            MagicMock(name='col2', type='string'),
        ]
        mock_reader.__iter__ = lambda self: iter([[1, 'a']])
        mock_reader.__enter__ = MagicMock(return_value=mock_reader)
        mock_reader.__exit__ = MagicMock(return_value=False)
        mock_instance.open_reader.return_value = mock_reader
        mock_instance.wait_for_success = MagicMock()
        mock_odps = MagicMock()
        mock_odps.execute_sql.return_value = mock_instance
        mock_odps.wait_for_success = MagicMock()

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        result = adapter.execute_query('SELECT 1', limit=100)

        assert 'columns' in result
        assert 'rows' in result
        assert result['row_count'] >= 0
        assert 'execution_time_ms' in result

    def test_execute_query_error(self):
        """execute_query 异常路径"""
        mock_odps = MagicMock()
        mock_odps.execute_sql.side_effect = Exception('SQL syntax error')

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        with pytest.raises(Exception, match='查询执行失败'):
            adapter.execute_query('SELECT 1')

    def test_get_table_schema(self):
        """get_table_schema 返回表结构"""
        mock_col = MagicMock()
        mock_col.name = 'id'
        mock_col.type = 'bigint'
        mock_col.comment = '主键'
        mock_table = MagicMock()
        mock_table.schema.columns = [mock_col]
        mock_table.schema.partitions = []
        mock_table.comment = '测试表'
        mock_table.get_stats.return_value = MagicMock(record_num=100)
        mock_table.size = 1024
        mock_odps = MagicMock()
        mock_odps.get_table.return_value = mock_table

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        schema = adapter.get_table_schema('proj', 'my_table')

        assert schema['table_name'] == 'my_table'
        assert len(schema['columns']) == 1
        assert schema['columns'][0]['name'] == 'id'
        assert schema['row_count'] == 100

    def test_get_odps_client_uses_secret_access_key_fallback(self):
        created = {}

        class FakeODPS:
            def __init__(self, **kwargs):
                created.update(kwargs)

        with patch.dict('sys.modules', {'odps': MagicMock(ODPS=FakeODPS)}):
            adapter = MaxComputeAdapter({
                'access_id': 'id',
                'secret_access_key': 'secret',
                'endpoint': 'ep',
                'project': 'proj',
            })
            client = adapter._get_odps_client()

        assert isinstance(client, FakeODPS)
        assert created['secret_access_key'] == 'secret'

    def test_get_odps_client_raises_when_access_key_missing(self):
        with patch.dict('sys.modules', {'odps': MagicMock(ODPS=MagicMock())}):
            adapter = MaxComputeAdapter({
                'access_id': 'id',
                'endpoint': 'ep',
                'project': 'proj',
            })
            with pytest.raises(ValueError, match='缺少必需配置: access_key'):
                adapter._get_odps_client()

    @patch('app.infrastructure.adapters.datasources.maxcompute_adapter.prepare_readonly_sql')
    def test_execute_query_stream_batches_rows(self, mock_prepare):
        mock_prepare.return_value = 'SELECT * FROM demo'
        mock_reader = MagicMock()
        mock_reader.schema.columns = [MagicMock(name='id'), MagicMock(name='name')]
        mock_reader.schema.columns[0].name = 'id'
        mock_reader.schema.columns[1].name = 'name'
        mock_reader.__iter__ = lambda self: iter([[1, 'a'], [2, 'b'], [3, 'c']])
        mock_reader.__enter__ = MagicMock(return_value=mock_reader)
        mock_reader.__exit__ = MagicMock(return_value=False)
        mock_instance = MagicMock()
        mock_instance.wait_for_success = MagicMock()
        mock_instance.open_reader.return_value = mock_reader
        mock_odps = MagicMock()
        mock_odps.execute_sql.return_value = mock_instance

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)
        batches = list(adapter.execute_query_stream('SELECT * FROM demo', batch_size=2))

        assert batches == [
            {'columns': ['id', 'name'], 'rows': [[1, 'a'], [2, 'b']], 'batch_size': 2},
            {'columns': ['id', 'name'], 'rows': [[3, 'c']], 'batch_size': 1},
        ]

    def test_get_partitions_returns_partition_names(self):
        mock_partition = MagicMock()
        mock_partition.name = 'dt=2026-03-25'
        mock_table = MagicMock()
        mock_table.schema.partitions = [MagicMock(name='dt')]
        mock_table.partitions = [mock_partition]
        mock_odps = MagicMock()
        mock_odps.get_table.return_value = mock_table

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        assert adapter.get_partitions('demo') == ['dt=2026-03-25']

    def test_get_partitions_returns_empty_list_when_table_not_partitioned(self):
        mock_table = MagicMock()
        mock_table.schema.partitions = []
        mock_odps = MagicMock()
        mock_odps.get_table.return_value = mock_table

        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter._get_odps_client = MagicMock(return_value=mock_odps)

        assert adapter.get_partitions('demo') == []

    def test_close_connection_resets_odps_client(self):
        adapter = MaxComputeAdapter({'access_id': 'id', 'access_key': 'key', 'endpoint': 'ep', 'project': 'proj'})
        adapter.odps = object()

        adapter._close_connection()

        assert adapter.odps is None
