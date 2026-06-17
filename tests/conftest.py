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
    # 这些环境变量在 create_app() 读取配置之前生效
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
    os.environ['FLASK_TESTING'] = '1'
    # 固定 JWT 密钥并清掉外部凭证，保证测试不被本地 .env / shell 环境污染
    os.environ['JWT_SECRET'] = 'your-secret-key'
    for _key in ('FEISHU_APP_ID', 'FEISHU_APP_SECRET'):
        os.environ.pop(_key, None)

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
    from app.infrastructure.governance.models import GovernanceAuditTraceORM  # noqa
    from app.infrastructure.agent_inference_runtime.models import (  # noqa
        AgentInferenceRuntimeArtifactORM,
        AgentInferenceRuntimeRunORM,
    )
    from app.infrastructure.semantic.models import (  # noqa
        DataAssetFieldORM,
        DataAssetLineageORM,
        DataAssetSnapshotORM,
        DataAssetSyncRunORM,
        DataAssetTableORM,
        DataAssetUsageORM,
        SemanticAssetDependencyORM,
        SemanticAssetORM,
        SemanticAssetRevisionORM,
        SemanticModelingAgentSessionORM,
        SemanticModelingProposalORM,
        SemanticReleaseAssetORM,
        SemanticReleaseORM,
        SemanticRuntimeSnapshotORM,
    )
    from app.domain.queries.scheduled_query import ScheduledQuery            # noqa  B-back-8
    from app.domain.queries.scheduled_query_run import ScheduledQueryRun    # noqa  B-back-8
    from app.infrastructure.semantic.models import DiagnoseRun               # noqa  B-back-9
    from app.infrastructure.semantic.models import SemanticViewMaterializeRun  # noqa  B-back-3


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
        try:
            db.metadata.create_all(bind=flask_app.container.db_engine())
        except Exception:
            pass
        yield flask_app
        db.session.remove()
        db.drop_all()
        if hasattr(flask_app, 'container'):
            try:
                flask_app.container.db_scoped_session().remove()
            except Exception:
                pass
            try:
                db.metadata.drop_all(bind=flask_app.container.db_engine())
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
    """测试客户端

    默认带有 admin 角色的合法 JWT，匹配 RBAC 强化后的 ``@require_auth`` /
    ``@require_admin`` 路由。需要断言 401/403 时使用 ``client_no_auth``，
    或在用例内 ``client.environ_base.pop("HTTP_AUTHORIZATION", None)`` 临时清除。
    """
    return install_default_admin_auth(app.test_client())


@pytest.fixture
def client_no_auth(app):
    """不带任何认证 Header 的测试客户端，用于 401/未认证场景断言。"""
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


# ============================================================================
# JWT 测试 Token 工具
# ============================================================================
#
# 这些 fixture 不依赖 ``app`` fixture，便于在自建 Flask app 的集成测试中复用。
# JWT 默认签名密钥与 ``AppConfig.jwt_secret`` 保持一致 (``your-secret-key``)，
# 因此对走 ``create_app()`` 的测试也同样有效（前提是测试未覆写 ``JWT_SECRET``）。

_TEST_JWT_SECRET = "your-secret-key"


def _make_jwt(*, user_id: str, user_name: str, roles: list[str]) -> str:
    import jwt
    from datetime import datetime, timedelta

    payload = {
        "user_id": user_id,
        "principal_id": user_id,
        "user_name": user_name,
        "roles": roles,
        "token_use": "access",
        "sid": "test-session",
        "jti": "test-access-token",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(payload, _TEST_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def auth_headers():
    """合法 JWT Bearer Header（admin 角色），用于需要 @require_auth 或 @require_admin 的集成测试。"""
    token = _make_jwt(user_id="test_user_admin", user_name="Test Admin", roles=["admin"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(auth_headers):
    """``auth_headers`` 的别名（明确表达管理员角色）。"""
    return auth_headers


@pytest.fixture
def viewer_headers():
    """合法 JWT Bearer Header（仅 ``user`` 角色，无 admin 权限）。

    用于验证 ``@require_admin`` 路由对普通用户返回 403。
    """
    token = _make_jwt(user_id="test_user_viewer", user_name="Test Viewer", roles=["user"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def no_auth_headers():
    """空 Header，用于断言 401 行为。"""
    return {}


def install_default_admin_auth(test_client, *, roles=("admin",)):
    """在 Flask test client 上安装默认的 Bearer Token（admin 角色）。

    适用于"测试自建 Flask app + 已开启 require_auth"的集成测试夹具：
    无需在每条 ``client.get/post/...`` 调用上重复传 ``headers=auth_headers``。

    单条用例若需断言 401/403，可临时清除：
        client.environ_base.pop("HTTP_AUTHORIZATION", None)
    或显式传入 ``headers={"Authorization": ""}``。

    Args:
        test_client: Flask test client 实例（``app.test_client()`` 返回值）
        roles: 写入 token 的角色列表，默认 ``("admin",)``

    Returns:
        同一个 test_client 实例（便于链式赋值）
    """
    token = _make_jwt(
        user_id="test_admin",
        user_name="Test Admin",
        roles=list(roles),
    )
    test_client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return test_client
