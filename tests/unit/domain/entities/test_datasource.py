"""
数据源实体测试
"""
import pytest
from app.domain.entities.data_source import Datasource


class TestDatasource:
    """数据源实体测试"""
    
    def test_create_datasource_with_valid_data(self):
        """测试创建有效数据源"""
        datasource = Datasource(
            name="Test PostgreSQL",
            source_type="postgresql",
            connection_config={
                "host": "localhost",
                "port": 5432,
                "database": "test"
            },
            created_by="admin"
        )
        
        assert datasource.name == "Test PostgreSQL"
        assert datasource.source_type == "postgresql"
        assert datasource.connection_config["host"] == "localhost"
        assert datasource.created_by == "admin"
    
    def test_datasource_is_active_field(self):
        """测试数据源 is_active 字段可显式设置为 True（Column default 在 DB INSERT 后才生效）"""
        datasource = Datasource(
            name="Test DB",
            source_type="mysql",
            connection_config={},
            is_active=True,
        )

        assert datasource.is_active is True
    
    def test_datasource_with_description(self):
        """测试带描述的数据源"""
        datasource = Datasource(
            name="Test DB",
            source_type="clickhouse",
            connection_config={},
            description="这是测试数据库"
        )
        
        assert datasource.description == "这是测试数据库"
    
    def test_datasource_connection_config_types(self):
        """测试不同数据源类型的连接配置"""
        # PostgreSQL
        pg_datasource = Datasource(
            name="PG",
            source_type="postgresql",
            connection_config={
                "host": "localhost",
                "port": 5432,
                "user": "postgres",
                "password": "secret",
                "database": "mydb"
            }
        )
        assert pg_datasource.connection_config["user"] == "postgres"
        
        # ClickHouse
        ch_datasource = Datasource(
            name="CH",
            source_type="clickhouse",
            connection_config={
                "host": "localhost",
                "port": 9000,
                "user": "default"
            }
        )
        assert ch_datasource.connection_config["port"] == 9000
