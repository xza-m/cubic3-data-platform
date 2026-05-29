import logging
import os
import uuid
from flask import Flask, request, g
from .config_schema import AppConfig
from .extensions import configure_logging, db, migrate, scheduler

# 健康检查
from .interfaces.api.health import bp as health_bp

# API 文档
from .interfaces.api.docs import bp as api_docs_bp

# 新架构 v1 API（完全迁移）
from .interfaces.api.v1.datasources import bp as datasources_v1_bp
from .interfaces.api.v1.datasets import create_datasets_blueprint
from .interfaces.api.v1.extraction import bp as extraction_v1_bp
from .interfaces.api.v1.conversations import bp as conversations_v1_bp
from .interfaces.api.v1.files import bp as files_v1_bp
from .interfaces.api.v1.sql_lab import bp as sql_lab_v1_bp
from .interfaces.api.v1.queries import bp as queries_v1_bp
from .interfaces.api.v1.auth import bp as auth_v1_bp
from .interfaces.api.v1.feishu import bp as feishu_v1_bp
from .interfaces.api.v1.dashboard import create_dashboard_blueprint

# 应用中心 API v1
from .interfaces.api.v1.apps import bp as apps_v1_bp
from .interfaces.api.v1.app_instances import bp as app_instances_v1_bp
from .interfaces.api.v1.app_executions import bp as app_executions_v1_bp

# 配置中心 API v1
from .interfaces.api.v1.channels import bp as channels_v1_bp
from .interfaces.api.v1.subscriptions import bp as subscriptions_v1_bp
from .interfaces.api.v1.subscriptions import app_instance_subscriptions_bp

# 语义层 API v1
from .interfaces.api.v1.semantic import create_semantic_blueprint
from .interfaces.api.v1.semantic_assets import create_semantic_assets_blueprint
from .interfaces.api.v1.semantic_releases import create_semantic_releases_blueprint
from .interfaces.api.v1.semantic_modeling_copilot import create_semantic_modeling_copilot_blueprint
from .interfaces.api.v1.ontology import create_ontology_blueprint
from .interfaces.api.v1.semantic_mapper import create_semantic_mapper_blueprint
from .interfaces.api.v1.semantic_router import create_semantic_router_blueprint
from .interfaces.api.v1.execution_compiler import create_execution_compiler_blueprint
from .interfaces.api.v1.governance import create_governance_blueprint
from .interfaces.api.v1.agent import create_agent_blueprint
from .interfaces.api.v1.agent_runtime import create_agent_runtime_blueprint
from .interfaces.api.v1.scheduled_queries import bp as scheduled_queries_v1_bp
from .interfaces.api.v1.access import bp as access_v1_bp
from .interfaces.api.v1.access_preferences import bp as access_preferences_v1_bp

from .infrastructure.scheduler import init_jobs

# 依赖注入容器
from .di.container import init_container, set_container


def assert_semantic_modeling_copilot_routes(app: Flask) -> None:
    """确认建模 Copilot 的生产关键路由已注册。

    该检查用于阻止依赖装配失败后应用继续启动但 Copilot API 消失。
    """

    required_rules = {
        "/api/v1/semantic/modeling-copilot/sessions",
        "/api/v1/semantic/modeling-copilot/sessions/<session_id>/messages",
        "/api/v1/semantic/modeling-copilot/sessions/<session_id>/publish",
    }
    registered_rules = {rule.rule for rule in app.url_map.iter_rules()}
    missing = sorted(required_rules - registered_rules)
    if missing:
        raise RuntimeError(
            "semantic modeling copilot routes missing: " + ", ".join(missing)
        )


def register_semantic_modeling_copilot_blueprint(app: Flask, container) -> None:
    """从 DI 容器注册语义建模 Copilot Blueprint，失败时显式阻断启动。"""

    try:
        app.register_blueprint(
            create_semantic_modeling_copilot_blueprint(
                container.semantic_modeling_copilot(),
            )
        )
        assert_semantic_modeling_copilot_routes(app)
    except Exception as exc:  # pragma: no cover - 调用方测试覆盖异常路径
        raise RuntimeError(
            "semantic modeling copilot blueprint registration failed"
        ) from exc


def create_app(role: str = "web") -> Flask:
    """
    Flask App Factory

    Args:
        role: 进程角色
              - "web"    : Gunicorn 主进程，加载全部模块（路由/调度器/飞书 WS）
              - "worker" : RQ Worker，仅加载基础设施（DB/DI/事件总线）
    """
    app = Flask(__name__)

    # ================================================================
    # 公共基础设施（所有角色）
    # ================================================================

    app_config = AppConfig.from_env()
    app.config.update(app_config.to_flask_config())
    app.app_config = app_config

    configure_logging(app.config.get("LOG_LEVEL", "INFO"))

    db.init_app(app)
    migrate.init_app(app, db)

    container = init_container(app)
    set_container(container)
    app.container = container

    # 导入所有模型（确保 SQLAlchemy 能够识别）
    from .domain.entities.feishu_chat_ref import FeishuChatRef  # noqa
    from .domain.entities.table_cache import DataSourceTableCache  # noqa
    from .domain.entities.extraction_template import ExtractionTemplate  # noqa
    from .domain.entities.data_source import DataSource  # noqa
    from .domain.entities.dataset import Dataset  # noqa
    from .domain.entities.dataset_field import DatasetField  # noqa
    from .domain.entities.semantic_registry_entry import SemanticRegistryEntry  # noqa
    from .domain.entities.extraction_task import ExtractionTask  # noqa
    from .domain.entities.extraction_run import ExtractionRun  # noqa
    from .domain.entities.conversation import Conversation, Message  # noqa
    from .domain.entities.query import Query  # noqa
    from .domain.entities.query_folder import QueryFolder  # noqa
    from .domain.entities.query_history import QueryHistory  # noqa
    from .domain.entities.query_template import QueryTemplate  # noqa
    from .domain.entities.sql_query import SQLQuery  # noqa
    from .domain.entities.app_definition import AppDefinition  # noqa
    from .domain.entities.app_instance import AppInstance  # noqa
    from .domain.entities.app_execution import AppExecution  # noqa
    from .domain.entities.config.channel import Channel  # noqa
    from .domain.entities.config.subscription import Subscription  # noqa
    from .domain.queries.scheduled_query import ScheduledQuery  # noqa
    from .domain.queries.scheduled_query_run import ScheduledQueryRun  # noqa
    from .domain.semantic.diagnose_run import DiagnoseRun  # noqa
    from .infrastructure.access.models import (  # noqa
        AccessApiKeyORM,
        AccessDelegationEventORM,
        AccessPrincipalAliasORM,
        AccessPrincipalORM,
        AccessRoleBindingORM,
        AccessServicePrincipalORM,
        PrincipalPreferencesORM,
    )
    from .infrastructure.governance.models import (  # noqa
        AccessDataPolicyORM,
        AccessExecutionProfileORM,
        AccessPolicyDecisionORM,
        GovernanceAuditTraceORM,
    )
    from .infrastructure.agent_inference_runtime.models import (  # noqa
        AgentInferenceRuntimeArtifactORM,
        AgentInferenceRuntimeRunORM,
    )
    from .infrastructure.semantic.models import (  # noqa
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

    # 注册执行器（worker 执行任务时需要）
    from .executors import register_all_executors
    register_all_executors()

    # ================================================================
    # Web 角色专属（路由 / 调度器 / 请求钩子）
    # ================================================================

    _testing = app.config.get('TESTING') or os.environ.get('FLASK_TESTING', '').lower() in ('1', 'true')

    if role == "web":
        # 调度器仅在非测试环境启动，避免 SchedulerAlreadyRunningError
        if not _testing:
            scheduler.init_app(app)

        # 路由注册（始终执行，测试环境也需要路由）
        app.register_blueprint(health_bp, url_prefix="/health")
        app.register_blueprint(api_docs_bp)
        app.register_blueprint(auth_v1_bp)
        app.register_blueprint(datasources_v1_bp)
        app.register_blueprint(create_datasets_blueprint(container))
        app.register_blueprint(extraction_v1_bp)
        app.register_blueprint(conversations_v1_bp)
        app.register_blueprint(files_v1_bp)
        app.register_blueprint(sql_lab_v1_bp)
        app.register_blueprint(queries_v1_bp)
        app.register_blueprint(feishu_v1_bp)
        app.register_blueprint(access_v1_bp)
        app.register_blueprint(access_preferences_v1_bp)
        app.register_blueprint(apps_v1_bp)
        app.register_blueprint(app_instances_v1_bp)
        app.register_blueprint(app_executions_v1_bp)
        app.register_blueprint(channels_v1_bp)
        app.register_blueprint(subscriptions_v1_bp)
        app.register_blueprint(app_instance_subscriptions_bp)
        app.register_blueprint(create_dashboard_blueprint(container))
        app.register_blueprint(create_semantic_blueprint(
            semantic_service=container.semantic_service(),
            publish_service=container.view_publish_service(),
            modeling_service=container.cube_modeling_service(),
            modeling_source_service=container.cube_modeling_source_service(),
            domain_modeling_service=container.domain_modeling_service(),
            domain_canvas_service=container.domain_canvas_service(),
            dataset_repo=container.dataset_repository(),
            dataset_handler=container.create_dataset_handler(),
            registry_repo=container.semantic_registry_repository(),
            runtime_snapshot_service=container.runtime_snapshot_service(),
        ))
        app.register_blueprint(create_semantic_assets_blueprint(
            container.data_asset_service,
        ))
        app.register_blueprint(create_semantic_releases_blueprint(
            container.semantic_release_service(),
        ))
        register_semantic_modeling_copilot_blueprint(app, container)
        app.register_blueprint(create_ontology_blueprint(
            container.ontology_definition_service(),
            container.semantic_mapper_preview_service(),
            container.ontology_audit_trace_repository(),
            container.ontology_workbench_read_service(),
        ))
        app.register_blueprint(create_semantic_mapper_blueprint(
            container.semantic_mapper_preview_service(),
        ))
        app.register_blueprint(create_execution_compiler_blueprint(
            container.execution_compiler_preview_service(),
            container.execution_compiler_runtime_service(),
        ))
        app.register_blueprint(create_semantic_router_blueprint(
            container.semantic_router_preview_service(),
        ))
        app.register_blueprint(create_agent_blueprint(
            container.agent_plan_handler(),
            container.agent_semantic_execute_service(),
        ))
        app.register_blueprint(create_agent_runtime_blueprint(
            container.agent_inference_runtime_repository,
        ))
        app.register_blueprint(create_governance_blueprint(
            container.ontology_audit_trace_repository(),
        ))
        app.register_blueprint(scheduled_queries_v1_bp)

        # 全局错误处理器
        from app.interfaces.api.middleware.error_handler import register_error_handlers
        register_error_handlers(app)

        # 请求上下文钩子
        @app.before_request
        def setup_request_context():
            from app.shared.utils.logger import set_request_context
            request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
            g.request_id = request_id
            user_id = getattr(g, 'user_id', None)
            set_request_context(request_id=request_id, user_id=user_id)

        @app.after_request
        def add_request_id_header(response):
            if hasattr(g, 'request_id'):
                response.headers['X-Request-ID'] = g.request_id
            return response

        @app.teardown_request
        def clear_request_context_on_teardown(exception=None):
            from app.shared.utils.logger import clear_request_context
            clear_request_context()

        @app.teardown_appcontext
        def cleanup_container_scoped_session(exception=None):
            scoped_session_provider = getattr(container, "db_scoped_session", None)
            if scoped_session_provider is None:
                return
            try:
                scoped_session_provider().remove()
            except Exception:
                logging.getLogger(__name__).debug("cleanup_container_scoped_session_failed", exc_info=True)

    # ================================================================
    # App Context 初始化（所有角色）
    # ================================================================

    with app.app_context():
        if role == "web" and not _testing:
            from app.infrastructure.seed import (
                seed_access_governance_defaults,
                seed_app_definitions,
                seed_system_instances,
            )
            seed_app_definitions()
            seed_system_instances()
            seed_access_governance_defaults()

            init_jobs()
            logging.getLogger(__name__).info("Scheduler initialized with app-center schedules")
            try:
                from app.infrastructure.queries.scheduled_query_runner import reload_all_scheduled_queries
                reload_all_scheduled_queries()
            except Exception as _e:
                logging.getLogger(__name__).warning("Failed to reload scheduled query jobs: %s", _e)

        # 事件处理器（worker 执行任务时也可能触发事件）
        try:
            from app.infrastructure.events.registry import register_event_handlers
            event_bus = container.event_bus()
            register_event_handlers(event_bus)
            logging.getLogger(__name__).info("Event handlers registered")
        except Exception as e:
            logging.getLogger(__name__).warning(f"Failed to register event handlers: {e}")

    # ================================================================
    # 飞书长连接（仅 Web 角色）
    # ================================================================

    if role == "web":
        try:
            from app.infrastructure.adapters.feishu.ws_event_handler import start_feishu_ws
            start_feishu_ws(app)
        except Exception as e:
            logging.getLogger(__name__).warning(f"飞书长连接启动失败: {e}")

    return app
