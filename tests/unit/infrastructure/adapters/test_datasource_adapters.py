"""
数据源适配器单元测试
Mock 外部驱动，测试 PostgreSQL、MySQL、ClickHouse、MaxCompute 适配器
"""
import pytest
from unittest.mock import MagicMock, patch

from app.infrastructure.adapters.datasources.postgresql_adapter import PostgreSQLAdapter
from app.infrastructure.adapters.datasources.mysql_adapter import MySQLAdapter
from app.infrastructure.adapters.datasources.clickhouse_adapter import ClickHouseAdapter
from app.infrastructure.adapters.datasources.maxcompute_adapter import MaxComputeAdapter


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
