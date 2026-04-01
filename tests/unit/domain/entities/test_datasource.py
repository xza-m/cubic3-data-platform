"""
数据源实体测试
"""
import pytest
from app.domain.entities.data_source import DataSource, Datasource
from app.shared.enums import ConnectionStatus


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

    def test_domain_events_can_be_recorded_and_cleared_without_init_state(self):
        datasource = Datasource(
            name="Events",
            source_type="postgresql",
            connection_config={},
        )
        del datasource._domain_events

        datasource.record_event("created")
        datasource.record_event("updated")

        assert datasource.clear_events() == ["created", "updated"]
        assert datasource.clear_events() == []

    def test_clear_events_initializes_missing_event_list(self):
        datasource = Datasource(
            name="NoEvents",
            source_type="postgresql",
            connection_config={},
        )
        del datasource._domain_events

        assert datasource.clear_events() == []
        assert datasource._domain_events == []

    def test_mark_test_success_updates_status_and_timestamps(self):
        datasource = Datasource(
            name="Healthy",
            source_type="postgresql",
            connection_config={"password": "secret123"},
            last_test_error="timeout",
        )

        datasource.mark_test_success()

        assert datasource.connection_status == ConnectionStatus.CONNECTED.value
        assert datasource.last_test_at is not None
        assert datasource.last_test_error is None
        assert datasource.updated_at is not None
        assert datasource.is_connected() is True

    def test_mark_test_failed_sets_error_and_can_use_depends_on_active_and_status(self):
        datasource = Datasource(
            name="Broken",
            source_type="mysql",
            connection_config={},
            is_active=True,
            connection_status=ConnectionStatus.CONNECTED.value,
        )

        datasource.mark_test_failed("access denied")

        assert datasource.connection_status == ConnectionStatus.ERROR.value
        assert datasource.last_test_error == "access denied"
        assert datasource.can_use() is False

        datasource.connection_status = ConnectionStatus.CONNECTED.value
        assert datasource.can_use() is True

        datasource.deactivate()
        assert datasource.is_active is False
        assert datasource.can_use() is False

        datasource.activate()
        assert datasource.is_active is True
        assert datasource.can_use() is True

    def test_update_connection_config_resets_status(self):
        datasource = Datasource(
            name="Warehouse",
            source_type="clickhouse",
            connection_config={"host": "old"},
            connection_status=ConnectionStatus.CONNECTED.value,
        )

        datasource.update_connection_config({"host": "new", "token": "abc"})

        assert datasource.connection_config == {"host": "new", "token": "abc"}
        assert datasource.connection_status == ConnectionStatus.UNKNOWN.value
        assert datasource.updated_at is not None

    def test_get_masked_config_masks_short_and_long_sensitive_values(self):
        datasource = Datasource(
            name="Masking",
            source_type="postgresql",
            connection_config={
                "password": "abcdef",
                "access_key": "ABCDEFGHIJ",
                "secret_access_key": "SECRETACCESS",
                "secret": "xyz",
                "token": "token-123456",
                "host": "db.local",
            },
        )

        masked = datasource.get_masked_config()

        assert masked["password"] == "******"
        assert masked["access_key"] == "ABC****HIJ"
        assert masked["secret_access_key"].startswith("SEC")
        assert masked["secret"] == "******"
        assert masked["token"].startswith("tok")
        assert masked["host"] == "db.local"

    def test_to_dict_supports_masked_and_raw_config_and_repr(self):
        datasource = DataSource(
            id=9,
            name="Serialized",
            source_type="postgresql",
            description="主仓",
            connection_config={"password": "topsecret"},
            extra_config={"ssl": True},
            is_active=True,
            connection_status=ConnectionStatus.CONNECTED.value,
            created_by="alice",
        )

        masked = datasource.to_dict()
        raw = datasource.to_dict(mask_sensitive=False)

        assert masked["connection_config"]["password"] != "topsecret"
        assert raw["connection_config"]["password"] == "topsecret"
        assert masked["name"] == "Serialized"
        assert masked["extra_config"]["ssl"] is True
        assert masked["extra_config"]["catalog_sync"]["status"] == DataSource.CATALOG_SYNC_PENDING
        assert raw["extra_config"]["catalog_sync"]["database_count"] == 0
        assert repr(datasource) == "<DataSource Serialized (postgresql)>"

    def test_catalog_sync_summary_changes_can_persist_to_database(self, app, db_session):
        datasource = DataSource(
            id=999001,
            name="Persisted",
            source_type="postgresql",
            connection_config={"host": "localhost"},
            extra_config={},
            is_active=True,
            created_by="tester",
        )

        db_session.add(datasource)
        db_session.commit()

        datasource.mark_catalog_sync_syncing()
        db_session.commit()
        datasource.mark_catalog_sync_synced(["dw", "ads"])
        db_session.commit()

        db_session.expire_all()
        reloaded = db_session.query(DataSource).filter_by(id=datasource.id).first()

        assert reloaded is not None
        assert reloaded.get_catalog_sync_summary()["status"] == DataSource.CATALOG_SYNC_SYNCED
        assert reloaded.get_catalog_sync_summary()["tracked_databases"] == ["ads", "dw"]
        assert reloaded.get_catalog_sync_summary()["database_count"] == 2
