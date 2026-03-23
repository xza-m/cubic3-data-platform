"""
测试配置
"""
import os
import pytest
from unittest.mock import MagicMock
from app.di.container import Container


# ============================================================================
# Session 级初始化：确保所有 SQLAlchemy 模型在首个测试前完成映射注册
# ============================================================================

@pytest.fixture(scope="session", autouse=True)
def _register_all_models():
    """
    强制导入全部 SQLAlchemy 实体，防止因导入顺序不同导致的
    mapper 初始化失败（如 ExtractionTemplate 找不到名称）。

    同时在整个测试 session 期间设置 FLASK_TESTING=1，阻止
    create_app() 内部启动 APScheduler 和 seed 逻辑。
    """
    # 这两个环境变量在 create_app() 读取配置之前生效
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
    os.environ['FLASK_TESTING'] = '1'

    from app.domain.entities.feishu_chat_ref import FeishuChatRef           # noqa
    from app.domain.entities.table_cache import DataSourceTableCache         # noqa
    from app.domain.entities.extraction_template import ExtractionTemplate   # noqa
    from app.domain.entities.data_source import DataSource                   # noqa
    from app.domain.entities.dataset import Dataset                          # noqa
    from app.domain.entities.dataset_field import DatasetField               # noqa
    from app.domain.entities.semantic_registry_entry import SemanticRegistryEntry  # noqa
    from app.domain.entities.extraction_task import ExtractionTask           # noqa
    from app.domain.entities.extraction_run import ExtractionRun             # noqa
    from app.domain.entities.conversation import Conversation, Message       # noqa
    from app.domain.entities.query import Query                              # noqa
    from app.domain.entities.query_folder import QueryFolder                 # noqa
    from app.domain.entities.query_history import QueryHistory               # noqa
    from app.domain.entities.query_template import QueryTemplate             # noqa
    from app.domain.entities.sql_query import SQLQuery                       # noqa
    from app.domain.entities.app_definition import AppDefinition             # noqa
    from app.domain.entities.app_instance import AppInstance                 # noqa
    from app.domain.entities.app_execution import AppExecution               # noqa
    from app.domain.entities.config.channel import Channel                   # noqa
    from app.domain.entities.config.subscription import Subscription         # noqa


# ============================================================================
# Function 级隔离：全局容器单例 & APScheduler 单例
# ============================================================================

@pytest.fixture(autouse=True)
def reset_global_container():
    """每个测试前后重置全局容器单例，防止测试间状态污染。"""
    import app.di.container as c
    original = c._container
    c._container = None
    yield
    c._container = original


@pytest.fixture(autouse=True)
def reset_scheduler():
    """每个测试后关闭并重置 APScheduler 单例，防止 SchedulerAlreadyRunningError。"""
    yield
    try:
        from app.application.services.app_center.scheduler_service import SchedulerService
        if SchedulerService._scheduler is not None:
            if SchedulerService._scheduler.running:
                SchedulerService._scheduler.shutdown(wait=False)
            SchedulerService._scheduler = None
    except Exception:
        pass


# ============================================================================
# Mock 容器工具 fixture
# ============================================================================

@pytest.fixture
def mock_container():
    """返回一个完全 Mock 的 DI 容器，可按需设置返回值。

    用法示例::

        def test_list_views(mock_container):
            mock_svc = MagicMock()
            mock_container.semantic_service.return_value = mock_svc
            ...
    """
    return MagicMock(spec=Container)


# ============================================================================
# Flask 应用 fixture（SQLite 内存库，不启动调度器）
# ============================================================================

@pytest.fixture
def app():
    """
    创建测试用 Flask 应用。

    - 强制使用 SQLite 内存库，不依赖 PostgreSQL
    - TESTING=True 跳过 APScheduler 和 seed 数据初始化
    - 每个测试独立建表 / 清表，保证隔离
    """
    # 在 create_app() 读取环境变量之前覆盖 DB URL
    original_db_url = os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'

    from app import create_app
    from app.extensions import db

    flask_app = create_app()
    flask_app.config['TESTING'] = True
    flask_app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    flask_app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()
        if hasattr(flask_app, 'container'):
            try:
                flask_app.container.db_scoped_session().remove()
            except Exception:
                pass
            try:
                flask_app.container.db_engine().dispose()
            except Exception:
                pass
        # 显式释放 SQLite 连接，避免测试结束后触发 unclosed database 警告。
        for engine in db.engines.values():
            engine.dispose()

    # 恢复原始环境变量
    if original_db_url is None:
        os.environ.pop('DATABASE_URL', None)
    else:
        os.environ['DATABASE_URL'] = original_db_url


@pytest.fixture
def client(app):
    """测试客户端"""
    return app.test_client()


@pytest.fixture
def test_container(app):
    """测试依赖注入容器（连接 SQLite 内存库）"""
    container = Container()
    container.config.from_dict({
        'database_url': 'sqlite:///:memory:',
        'redis_url': 'redis://localhost:6379/15'
    })
    return container


@pytest.fixture
def db_session(app):
    """数据库会话"""
    from app.extensions import db
    yield db.session
    db.session.remove()
