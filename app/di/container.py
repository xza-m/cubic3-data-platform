"""
依赖注入容器
使用 dependency-injector 管理应用依赖
"""
import os

from dependency_injector import containers, providers
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from flask import Flask


def _default_semantic_source_id():
    from app.domain.entities.data_source import DataSource
    from app.extensions import db

    ds = db.session.query(DataSource).filter_by(source_type="maxcompute").first()
    return ds.id if ds else 1


def _create_engine_smart(database_url: str, **pg_kwargs):
    """根据数据库 URL 选择合适的引擎参数。

    SQLite 不支持连接池参数（max_overflow / pool_timeout 等），
    内存库需要 StaticPool 保持 schema；文件库使用独立连接以支持本地
    threaded smoke 并发请求。
    """
    if database_url.startswith('sqlite'):
        if ":memory:" in database_url or database_url.rstrip("/") == "sqlite:":
            from sqlalchemy.pool import StaticPool
            return create_engine(
                database_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
            )
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url, **pg_kwargs)


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_positive_int(value, *, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return parsed


def _modeling_session_repository(store: str, session, sessions_dir: str):
    """按环境选择 Copilot 会话仓储。

    生产默认 SQL；YAML 仅用于本地开发、fixture 或迁移前兼容。
    """

    normalized = (store or "sql").strip().lower()
    if normalized == "yaml":
        return YamlModelingAgentSessionRepository(sessions_dir)
    if normalized == "sql":
        return SqlModelingAgentSessionRepository(session)
    raise ValueError(f"unsupported semantic modeling copilot store: {store}")


def _modeling_proposal_repository(store: str, session, proposals_dir: str):
    """按环境选择 Copilot Proposal 仓储。"""

    normalized = (store or "sql").strip().lower()
    if normalized == "yaml":
        return YamlModelingProposalRepository(proposals_dir)
    if normalized == "sql":
        return SqlModelingProposalRepository(session)
    raise ValueError(f"unsupported semantic modeling copilot store: {store}")


def _codex_ws_client_from_config(config):
    """按管理配置即时创建 Codex WS client，避免联通测试使用旧配置。"""

    provider_extra = config.get("provider_extra")
    if not isinstance(provider_extra, dict):
        provider_extra = {}
    project_root = str(provider_extra.get("project_root") or config.get("project_root") or os.getcwd())
    return CodexAppServerWebSocketClient(
        endpoint=str(config.get("endpoint") or ""),
        project_root=project_root,
        runtime_workspace_roots=_codex_workspace_roots(config, provider_extra, project_root),
        timeout_seconds=_parse_positive_int(
            provider_extra.get("timeout_seconds", config.get("timeout_seconds")),
            default=10,
        ),
    )


def _codex_workspace_roots(config, provider_extra, project_root: str) -> list[str]:
    raw_roots = provider_extra.get("runtime_workspace_roots") or config.get("runtime_workspace_roots")
    if raw_roots is None:
        roots = [project_root]
    elif isinstance(raw_roots, (list, tuple, set)):
        roots = [str(root) for root in raw_roots if str(root).strip()]
    else:
        roots = [item.strip() for item in str(raw_roots).split(",") if item.strip()]
    if project_root not in roots:
        roots.insert(0, project_root)
    return roots


# Infrastructure
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.infrastructure.repositories.dataset_repository import DatasetRepository
from app.infrastructure.repositories.semantic_registry_repository import SemanticRegistryRepository
from app.infrastructure.repositories.extraction_repository import ExtractionRepository
from app.infrastructure.repositories.app_definition_repository import AppDefinitionRepository
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.infrastructure.repositories.app_execution_repository import AppExecutionRepository
from app.infrastructure.repositories.subscription_repository import SubscriptionRepository
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.infrastructure.cache.redis_client import RedisClient
from app.infrastructure.cache.table_cache_service import TableCacheService
from app.infrastructure.tasks.task_queue import TaskQueue
from app.infrastructure.events.event_bus import EventBus

# Application - Datasource Handlers
from app.application.datasource.handlers.create_datasource_handler import CreateDatasourceHandler
from app.application.datasource.handlers.update_datasource_handler import UpdateDatasourceHandler
from app.application.datasource.handlers.delete_datasource_handler import DeleteDatasourceHandler
from app.application.datasource.handlers.list_datasources_handler import ListDatasourcesHandler
from app.application.datasource.handlers.get_datasource_handler import GetDatasourceHandler
from app.application.datasource.handlers.test_connection_handler import TestConnectionHandler
from app.application.datasource.handlers.get_databases_handler import GetDatabasesHandler
from app.application.datasource.handlers.get_tables_handler import GetTablesHandler
from app.application.datasource.handlers.get_statistics_handler import GetStatisticsHandler as GetDatasourceStatisticsHandler
from app.application.datasource.handlers.preview_table_data_handler import PreviewTableDataHandler
from app.application.datasource.handlers.get_schemas_handler import GetSchemasHandler
from app.application.datasource.handlers.get_table_schema_handler import GetTableSchemaHandler

# Application - Dataset Handlers
from app.application.dataset.handlers.create_dataset_handler import CreateDatasetHandler
from app.application.dataset.handlers.update_dataset_handler import UpdateDatasetHandler
from app.application.dataset.handlers.delete_dataset_handler import DeleteDatasetHandler
from app.application.dataset.handlers.list_datasets_handler import ListDatasetsHandler
from app.application.dataset.handlers.get_dataset_handler import GetDatasetHandler
from app.application.dataset.handlers.preview_dataset_handler import PreviewDatasetHandler
from app.application.dataset.handlers.sync_schema_handler import SyncSchemaHandler
from app.application.dataset.handlers.get_statistics_handler import GetStatisticsHandler as GetDatasetStatisticsHandler
from app.application.dataset.handlers.profile_dataset_handler import ProfileDatasetHandler

# Application - Extraction Handlers
from app.application.extraction.handlers.create_task_handler import CreateTaskHandler
from app.application.extraction.handlers.update_task_handler import UpdateTaskHandler
from app.application.extraction.handlers.delete_task_handler import DeleteTaskHandler
from app.application.extraction.handlers.execute_task_handler import ExecuteTaskHandler
from app.application.extraction.handlers.list_tasks_handler import ListTasksHandler
from app.application.extraction.handlers.preview_data_handler import PreviewDataHandler

# Application - Conversation Handlers
from app.application.conversation.handlers.create_conversation_handler import CreateConversationHandler
from app.application.conversation.handlers.send_message_handler import SendMessageHandler
from app.application.conversation.handlers.get_conversation_handler import GetConversationHandler
from app.application.conversation.handlers.list_conversations_handler import ListConversationsHandler

# Infrastructure - LLM Service
from app.infrastructure.llm.openai_service import OpenAIService
from app.infrastructure.adapters.llm.openai_compatible import OpenAICompatibleAdapter
from app.infrastructure.agent_inference_runtime.openai_compatible_adapter import (
    OpenAICompatibleRuntimeAdapter,
)
from app.infrastructure.agent_inference_runtime.codex_ws_client import CodexAppServerWebSocketClient
from app.infrastructure.agent_inference_runtime.sql_repository import (
    SqlAgentInferenceRuntimeRepository,
)
from app.infrastructure.agent_inference_runtime.sql_runtime_config_repository import (
    SqlRuntimeConfigRepository,
)
from app.application.agent_inference_runtime.action_binding import ActionRuntimeBindingRegistry
from app.application.agent_inference_runtime.management import AgentRuntimeManagementService
from app.application.agent_inference_runtime.codex_run_service import CodexRunService
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService

# Application - Agent
from app.application.agent.services.knowledge_service import KnowledgeService
from app.application.agent.services.prompt_builder import PromptBuilder
from app.application.agent.services.tool_registry import ToolRegistry
from app.application.agent.services.agent_loop_service import AgentLoopService
from app.application.agent.handlers.agent_plan_handler import AgentPlanHandler
from app.application.services.dashboard.overview_service import DashboardOverviewService

# Application - Semantic Layer
from app.application.semantic.metric_semantics_service import MetricSemanticsService
from app.application.semantic.modeling_draft_builder import SemanticModelDraftBuilder
from app.application.semantic.cube_modeling_service import CubeModelingService
from app.application.semantic.cube_modeling_source_service import CubeModelingSourceService
from app.application.semantic.data_asset_service import DataAssetService
from app.application.semantic.data_asset_agent_app import DataAssetAgentApp
from app.application.semantic.domain_canvas_service import DomainCanvasService
from app.application.semantic.domain_modeling_service import DomainModelingService
from app.application.semantic.field_candidates import FieldCandidateService
from app.application.semantic.modeling_copilot_service import SemanticModelingCopilotService
from app.application.semantic.modeling_copilot_tools import ModelingToolRegistry
from app.application.semantic.modeling_proposal_service import ModelingProposalService
from app.application.semantic.publish_readiness_checker import PublishReadinessChecker
from app.application.semantic.publish_gate_service import PublishGateService
from app.application.semantic.runtime_snapshot_service import RuntimeSnapshotService
from app.application.semantic.source_candidate_recall_service import SourceCandidateRecallService
from app.application.semantic.semantic_definition_service import SemanticDefinitionService
from app.application.semantic.semantic_query_service import SemanticQueryService
from app.application.semantic.semantic_evidence_builder import SemanticEvidenceBuilder
from app.application.semantic.semantic_modeling_agent_app import SemanticModelingAgentApp
from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
from app.application.semantic.semantic_service import SemanticLayerService
from app.application.semantic.view_publish_service import ViewPublishService
from app.application.ontology.definition_service import OntologyDefinitionService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.ontology.workbench_read_service import OntologyWorkbenchReadService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.governance.access import AccessPolicyDecisionService, PrincipalResolver
from app.infrastructure.semantic.yaml_catalog_repository import YamlCatalogRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from app.infrastructure.semantic.yaml_domain_repository import YamlDomainRepository
from app.infrastructure.semantic.yaml_modeling_agent_session_repository import (
    YamlModelingAgentSessionRepository,
)
from app.infrastructure.semantic.yaml_modeling_proposal_repository import (
    YamlModelingProposalRepository,
)
from app.infrastructure.semantic.sql_modeling_agent_session_repository import (
    SqlModelingAgentSessionRepository,
)
from app.infrastructure.semantic.sql_modeling_proposal_repository import (
    SqlModelingProposalRepository,
)
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository
from app.infrastructure.semantic.sql_data_asset_repository import SqlDataAssetRepository
from app.infrastructure.semantic.yaml_view_repository import YamlViewRepository
from app.infrastructure.semantic.yaml_recipe_repository import YamlRecipeRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_history_repository import YamlOntologyHistoryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_property_repository import YamlBusinessPropertyRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository, SqlGovernanceAuditTraceRepository

# Infrastructure - Conversation Repositories
from app.infrastructure.repositories.conversation_repository import ConversationRepository, MessageRepository

# Infrastructure - Query Repository
from app.infrastructure.repositories.query_repository import QueryRepository
from app.infrastructure.repositories.sql_query_repository import SQLQueryRepository
from app.infrastructure.repositories.feishu_chat_repository import FeishuChatRepository

# Application - Query Handlers
from app.application.query.handlers.execute_query_handler import ExecuteQueryHandler
from app.application.query.handlers.execute_sql_preview_handler import ExecuteSQLPreviewHandler
from app.application.query.handlers.create_query_handler import CreateQueryHandler
from app.application.query.handlers.update_query_handler import UpdateQueryHandler
from app.application.query.handlers.query_list_handlers import (
    ListQueriesHandler,
    GetQueryHandler,
    ToggleFavoriteHandler,
    ListFoldersHandler,
    CreateFolderHandler,
    DeleteQueryHandler,
    ListHistoriesHandler,
    GetHistoryDetailHandler,
    GetStatisticsHandler,
)
from app.application.feishu.handlers.chat_handlers import (
    ListChatsHandler,
    UpdateChatHandler,
)
from app.application.query.handlers.sql_query_async_handlers import (
    SubmitAsyncQueryHandler,
    GetQueryStatusHandler,
    GetQueryResultHandler,
)
from app.application.query.handlers.query_export_handlers import (
    SubmitExportHandler,
    GetExportHandler,
    ListExportsHandler,
    CancelExportHandler,
)
from app.application.query.services.query_export_service import QueryExportService
from app.infrastructure.repositories.query_export_repository import QueryExportRepository
from app.application.agent.semantic_gateway_execute_service import SemanticGatewayExecuteService
from app.infrastructure.gateway.telemetry_client import GatewayQueryClient
from app.application.query.handlers.template_handlers import (
    ListTemplatesHandler,
    CreateTemplateHandler,
    GetTemplateHandler,
    UpdateTemplateHandler,
    DeleteTemplateHandler,
    UseTemplateHandler,
)

class Container(containers.DeclarativeContainer):
    """
    应用依赖注入容器
    
    配置所有依赖的生命周期和注入关系
    """
    
    # ========================================================================
    # 配置提供者
    # ========================================================================
    
    config = providers.Configuration()
    
    # ========================================================================
    # 基础设施 - 数据库
    # ========================================================================
    
    db_engine = providers.Singleton(
        _create_engine_smart,
        config.database_url,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_recycle=3600,
        pool_pre_ping=True,
    )
    
    db_session_factory = providers.Singleton(
        sessionmaker,
        bind=db_engine
    )

    db_scoped_session = providers.Singleton(
        scoped_session,
        db_session_factory,
    )
    
    db_session = providers.Factory(
        lambda scoped: scoped(),
        scoped=db_scoped_session,
    )
    
    # ========================================================================
    # 基础设施 - 缓存
    # ========================================================================
    
    redis_client = providers.Singleton(
        RedisClient,
        redis_url=config.redis_url
    )
    
    table_cache_service = providers.Factory(
        TableCacheService,
        session=db_session
    )
    
    # ========================================================================
    # 基础设施 - 任务队列
    # ========================================================================
    
    task_queue = providers.Singleton(
        TaskQueue,
        redis_url=config.redis_url
    )
    
    # ========================================================================
    # 基础设施 - 事件总线
    # ========================================================================
    
    event_bus = providers.Singleton(
        EventBus,
        task_queue=task_queue
    )
    
    # ========================================================================
    # 基础设施 - LLM 服务
    # ========================================================================
    
    llm_service = providers.Singleton(
        OpenAIService,
        api_key=config.llm.api_key,
        api_base=config.llm.api_base,
        model=config.llm.model,
        timeout=config.llm.timeout
    )
    
    # ========================================================================
    # 基础设施 - Agent LLM 适配器（ILLMPort 实现）
    # ========================================================================
    
    agent_llm_adapter = providers.Singleton(
        OpenAICompatibleAdapter,
        api_key=config.llm.api_key,
        api_base=config.llm.api_base,
        model=config.llm.model,
        timeout=config.llm.timeout
    )

    # ========================================================================
    # 基础设施 - Agent 推理 Runtime 适配器
    # ========================================================================

    agent_openai_runtime_adapter = providers.Singleton(
        OpenAICompatibleRuntimeAdapter,
        api_key=config.agent_openai.api_key,
        api_base=config.agent_openai.api_base,
        model=config.agent_openai.model,
        timeout=config.agent_openai.timeout,
    )

    agent_runtime_action_bindings = providers.Singleton(ActionRuntimeBindingRegistry)

    agent_runtime_config_repository = providers.Factory(
        SqlRuntimeConfigRepository,
        session=db_session,
    )

    agent_runtime_config_service = providers.Factory(
        RuntimeConfigService,
        repository=agent_runtime_config_repository,
        openai_config=config.agent_openai,
        codex_config=config.agent_codex,
    )

    agent_inference_runtime_router = providers.Singleton(
        AgentInferenceRuntimeRouter,
        adapters=providers.List(agent_openai_runtime_adapter),
        action_bindings=agent_runtime_action_bindings,
    )

    agent_inference_runtime_service = providers.Singleton(
        AgentInferenceRuntimeService,
        router=agent_inference_runtime_router,
    )

    agent_codex_ws_client = providers.Factory(
        CodexAppServerWebSocketClient,
        endpoint=config.agent_codex.endpoint,
        project_root=config.agent_codex.project_root,
        runtime_workspace_roots=providers.List(config.agent_codex.project_root),
        timeout_seconds=config.agent_codex.timeout_seconds,
    )

    agent_codex_ws_client_factory = providers.Object(_codex_ws_client_from_config)

    agent_runtime_management_service = providers.Factory(
        AgentRuntimeManagementService,
        openai_config=config.agent_openai,
        codex_config=config.agent_codex,
        action_bindings=agent_runtime_action_bindings,
        runtime_config_service=agent_runtime_config_service,
        codex_ws_client_factory=agent_codex_ws_client_factory,
    )

    agent_inference_runtime_repository = providers.Factory(
        SqlAgentInferenceRuntimeRepository,
        session=db_session,
    )

    codex_run_service = providers.Factory(
        CodexRunService,
        client=agent_codex_ws_client,
        repository=agent_inference_runtime_repository,
    )
    
    # ========================================================================
    # 应用层 - Agent 核心服务
    # ========================================================================
    
    knowledge_service = providers.Singleton(KnowledgeService)
    
    prompt_builder = providers.Singleton(
        PromptBuilder,
        knowledge_service=knowledge_service
    )
    
    # Semantic Layer
    import os as _os
    _semantic_base = _os.path.join(
        _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))),
        "infrastructure", "semantic",
    )
    _ontology_base = _os.path.join(
        _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))),
        "infrastructure", "ontology",
    )

    cube_repository = providers.Singleton(
        YamlCubeRepository,
        cubes_dir=_os.path.join(_semantic_base, "cubes"),
    )
    
    view_repository = providers.Singleton(
        YamlViewRepository,
        views_dir=_os.path.join(_semantic_base, "views"),
    )
    
    recipe_repository = providers.Singleton(
        YamlRecipeRepository,
        recipes_dir=_os.path.join(_semantic_base, "recipes"),
    )

    domain_repository = providers.Singleton(
        YamlDomainRepository,
        domains_dir=_os.path.join(_semantic_base, "domains"),
    )

    catalog_repository = providers.Singleton(
        YamlCatalogRepository,
        catalogs_dir=_os.path.join(_semantic_base, "catalogs"),
    )

    ontology_object_repository = providers.Singleton(
        YamlBusinessObjectRepository,
        objects_dir=_os.path.join(_ontology_base, "objects"),
    )

    ontology_property_repository = providers.Singleton(
        YamlBusinessPropertyRepository,
        properties_dir=_os.path.join(_ontology_base, "properties"),
    )

    ontology_metric_repository = providers.Singleton(
        YamlBusinessMetricRepository,
        metrics_dir=_os.path.join(_ontology_base, "metrics"),
    )

    ontology_relation_repository = providers.Singleton(
        YamlBusinessRelationRepository,
        relations_dir=_os.path.join(_ontology_base, "relations"),
    )

    ontology_action_repository = providers.Singleton(
        YamlBusinessActionRepository,
        actions_dir=_os.path.join(_ontology_base, "actions"),
    )

    ontology_glossary_repository = providers.Singleton(
        YamlGlossaryRepository,
        glossary_dir=_os.path.join(_ontology_base, "glossary"),
    )

    ontology_policy_repository = providers.Singleton(
        YamlPolicyMetadataRepository,
        policies_dir=_os.path.join(_ontology_base, "policies"),
    )

    ontology_history_repository = providers.Singleton(
        YamlOntologyHistoryRepository,
        history_dir=_os.path.join(_ontology_base, "history"),
    )

    ontology_audit_trace_repository = providers.Factory(
        SqlGovernanceAuditTraceRepository,
        session=db_session,
    )

    access_governance_repository = providers.Factory(
        SqlAccessGovernanceRepository,
        session=db_session,
    )

    metric_semantics_service = providers.Singleton(MetricSemanticsService)

    semantic_registry_repository = providers.Factory(
        SemanticRegistryRepository,
        session=db_session,
    )

    semantic_asset_registry_repository = providers.Factory(
        SqlAssetRegistryRepository,
        session=db_session,
    )

    data_asset_repository = providers.Factory(
        SqlDataAssetRepository,
        session=db_session,
    )

    publish_gate_service = providers.Factory(
        PublishGateService.production,
    )

    runtime_snapshot_service = providers.Factory(
        RuntimeSnapshotService,
        runtime_snapshot_repository=semantic_asset_registry_repository,
    )

    semantic_release_service = providers.Factory(
        SemanticReleaseService,
        release_repository=semantic_asset_registry_repository,
        audit_repository=ontology_audit_trace_repository,
    )

    # ========================================================================
    # 仓储
    # ========================================================================
    
    datasource_repository = providers.Factory(
        DatasourceRepository,
        session=db_session
    )

    data_asset_service = providers.Factory(
        DataAssetService,
        repository=data_asset_repository,
        datasource_repository=datasource_repository,
    )

    data_asset_agent_app = providers.Singleton(
        DataAssetAgentApp,
        runtime_service=agent_inference_runtime_service,
    )
    
    dataset_repository = providers.Factory(
        DatasetRepository,
        session=db_session
    )
    
    extraction_repository = providers.Factory(
        ExtractionRepository,
        session=db_session
    )
    
    conversation_repository = providers.Factory(
        ConversationRepository,
        session=db_session
    )
    
    message_repository = providers.Factory(
        MessageRepository,
        session=db_session
    )
    
    query_repository = providers.Factory(
        QueryRepository,
        session=db_session
    )
    
    sql_query_repository = providers.Factory(
        SQLQueryRepository,
        session=db_session
    )
    
    feishu_chat_repository = providers.Factory(
        FeishuChatRepository,
        session=db_session
    )
    
    app_definition_repository = providers.Factory(
        AppDefinitionRepository,
        session=db_session
    )
    
    app_instance_repository = providers.Factory(
        AppInstanceRepository,
        session=db_session
    )
    
    app_execution_repository = providers.Factory(
        AppExecutionRepository,
        session=db_session
    )
    
    subscription_repository = providers.Factory(
        SubscriptionRepository,
        session=db_session
    )
    
    channel_repository = providers.Factory(
        ChannelRepository,
        session=db_session
    )

    semantic_runtime_binding_service = providers.Singleton(
        SemanticRuntimeBindingService,
        datasource_repository=datasource_repository,
    )

    semantic_query_service = providers.Singleton(
        SemanticQueryService,
        cube_repo=cube_repository,
        runtime_binding_service=semantic_runtime_binding_service,
        domain_repo=domain_repository,
    )

    semantic_definition_service = providers.Singleton(
        SemanticDefinitionService,
        cube_repo=cube_repository,
        view_repo=view_repository,
        recipe_repo=recipe_repository,
        metric_semantics_service=metric_semantics_service,
        registry_repo=semantic_registry_repository,
        runtime_binding_service=semantic_runtime_binding_service,
        domain_repo=domain_repository,
    )

    semantic_field_candidate_service = providers.Singleton(
        FieldCandidateService,
    )

    cube_modeling_service = providers.Singleton(
        CubeModelingService,
        cube_repo=cube_repository,
        runtime_binding_service=semantic_runtime_binding_service,
        definition_service=semantic_definition_service,
        registry_repo=semantic_registry_repository,
        metric_repository=ontology_metric_repository,
        field_candidate_service=semantic_field_candidate_service,
    )

    cube_modeling_source_service = providers.Singleton(
        CubeModelingSourceService,
        cube_modeling_service=cube_modeling_service,
        dataset_repository=dataset_repository,
        datasource_repository=datasource_repository,
    )

    domain_modeling_service = providers.Singleton(
        DomainModelingService,
        domain_repo=domain_repository,
        catalog_repo=catalog_repository,
        cube_repo=cube_repository,
        registry_repo=semantic_registry_repository,
    )

    domain_canvas_service = providers.Singleton(
        DomainCanvasService,
        domain_repo=domain_repository,
        catalog_repo=catalog_repository,
        cube_repo=cube_repository,
        registry_repo=semantic_registry_repository,
    )

    from app.application.services.config.domain_publish_history_service import (
        DomainPublishHistoryService,
    )

    domain_publish_history_service = providers.Factory(
        DomainPublishHistoryService,
        session=db_session,
    )

    semantic_service = providers.Singleton(
        SemanticLayerService,
        definition_service=semantic_definition_service,
        query_service=semantic_query_service,
        recipe_repo=recipe_repository,
        cube_repo=cube_repository,
        view_repo=view_repository,
    )

    ontology_definition_service = providers.Singleton(
        OntologyDefinitionService,
        object_repository=ontology_object_repository,
        property_repository=ontology_property_repository,
        metric_repository=ontology_metric_repository,
        glossary_repository=ontology_glossary_repository,
        relation_repository=ontology_relation_repository,
        action_repository=ontology_action_repository,
        policy_repository=ontology_policy_repository,
        history_repository=ontology_history_repository,
    )

    ontology_policy_guard_service = providers.Singleton(
        PolicyGuardService,
        policy_repository=ontology_policy_repository,
    )

    principal_resolver = providers.Singleton(PrincipalResolver)

    access_policy_service = providers.Singleton(
        AccessPolicyDecisionService,
        policy_repository=access_governance_repository,
    )

    semantic_mapper_preview_service = providers.Singleton(
        SemanticMapperPreviewService,
        object_repository=ontology_object_repository,
        metric_repository=ontology_metric_repository,
        glossary_repository=ontology_glossary_repository,
        relation_repository=ontology_relation_repository,
        action_repository=ontology_action_repository,
        cube_repository=cube_repository,
    )

    execution_compiler_preview_service = providers.Singleton(
        ExecutionCompilerPreviewService,
        metric_repository=ontology_metric_repository,
        cube_repository=cube_repository,
        runtime_snapshot_service=runtime_snapshot_service,
        policy_guard_service=ontology_policy_guard_service,
    )

    semantic_router_preview_service = providers.Singleton(
        SemanticRouterPreviewService,
        object_repository=ontology_object_repository,
        metric_repository=ontology_metric_repository,
        glossary_repository=ontology_glossary_repository,
        relation_repository=ontology_relation_repository,
        action_repository=ontology_action_repository,
        mapper_preview_service=semantic_mapper_preview_service,
        compiler_preview_service=execution_compiler_preview_service,
        runtime_snapshot_service=runtime_snapshot_service,
        policy_guard_service=ontology_policy_guard_service,
    )

    ontology_workbench_read_service = providers.Singleton(
        OntologyWorkbenchReadService,
        ontology_service=ontology_definition_service,
        mapper_service=semantic_mapper_preview_service,
        history_repository=ontology_history_repository,
        audit_repository=ontology_audit_trace_repository,
    )

    tool_registry = providers.Singleton(
        ToolRegistry,
        knowledge_service=knowledge_service,
        semantic_service=semantic_service,
    )

    agent_loop_service = providers.Singleton(
        AgentLoopService,
        llm=agent_llm_adapter
    )
    
    # ========================================================================
    # Query 模块 - Handlers
    # ========================================================================
    
    execute_query_handler = providers.Factory(
        ExecuteQueryHandler,
        query_repository=query_repository,
        datasource_repository=datasource_repository
    )

    execution_compiler_runtime_service = providers.Singleton(
        ExecutionCompilerRuntimeService,
        preview_service=execution_compiler_preview_service,
        execute_query_handler_factory=execute_query_handler.provider,
        knowledge_service=knowledge_service,
        semantic_service=semantic_service,
        audit_trace_repository=ontology_audit_trace_repository,
        principal_resolver=principal_resolver,
        access_policy_service=access_policy_service,
    )
    semantic_router_preview_service.add_kwargs(
        runtime_service=execution_compiler_runtime_service,
    )

    agent_plan_handler = providers.Singleton(
        AgentPlanHandler,
        principal_resolver=principal_resolver,
        access_policy_service=access_policy_service,
        router_service=semantic_router_preview_service,
        compiler_service=execution_compiler_preview_service,
    )

    gateway_query_client = providers.Factory(
        GatewayQueryClient,
        base_url=config.query_gateway.base_url,
        platform_service_token=config.query_gateway.platform_service_token,
        timeout_seconds=config.query_gateway.timeout_seconds,
    )

    agent_semantic_execute_service = providers.Factory(
        SemanticGatewayExecuteService,
        plan_handler=agent_plan_handler,
        gateway_client_factory=gateway_query_client.provider,
    )

    semantic_model_draft_builder = providers.Singleton(
        SemanticModelDraftBuilder,
        cube_modeling_source_service=cube_modeling_source_service,
        cube_modeling_service=cube_modeling_service,
        ontology_service=ontology_definition_service,
        mapper_service=semantic_mapper_preview_service,
        agent_plan_handler=agent_plan_handler,
    )
    semantic_modeling_agent = semantic_model_draft_builder

    semantic_modeling_copilot_readiness_checker = providers.Singleton(
        PublishReadinessChecker,
    )

    semantic_modeling_source_recall_service = providers.Factory(
        SourceCandidateRecallService,
        datasource_repository=datasource_repository,
        table_cache_service=table_cache_service,
        dataset_repository=dataset_repository,
        data_asset_service=data_asset_service,
    )

    semantic_modeling_copilot_tools = providers.Singleton(
        ModelingToolRegistry,
        builder=semantic_model_draft_builder,
        readiness_checker=semantic_modeling_copilot_readiness_checker,
        source_candidate_recall_service=semantic_modeling_source_recall_service,
    )

    semantic_modeling_agent_session_repository = providers.Singleton(
        _modeling_session_repository,
        store=config.semantic_modeling.copilot_store,
        session=db_session,
        sessions_dir=_os.path.join(_semantic_base, "modeling_agent_sessions"),
    )

    semantic_modeling_proposal_repository = providers.Singleton(
        _modeling_proposal_repository,
        store=config.semantic_modeling.copilot_store,
        session=db_session,
        proposals_dir=_os.path.join(_semantic_base, "modeling_proposals"),
    )

    semantic_modeling_proposal_service = providers.Singleton(
        ModelingProposalService,
        repository=semantic_modeling_proposal_repository,
        builder=semantic_model_draft_builder,
        readiness_checker=semantic_modeling_copilot_readiness_checker,
        asset_registry_repository=semantic_asset_registry_repository,
        release_service=semantic_release_service,
    )

    semantic_evidence_builder = providers.Singleton(SemanticEvidenceBuilder)

    semantic_modeling_agent_app = providers.Singleton(
        SemanticModelingAgentApp,
        runtime=agent_inference_runtime_service,
        run_service=codex_run_service.provider,
        evidence_builder=semantic_evidence_builder,
    )

    semantic_modeling_copilot = providers.Singleton(
        SemanticModelingCopilotService,
        session_repository=semantic_modeling_agent_session_repository,
        agent_app=semantic_modeling_agent_app,
        tools=semantic_modeling_copilot_tools,
        proposal_service=semantic_modeling_proposal_service,
    )
    
    execute_sql_preview_handler = providers.Factory(
        ExecuteSQLPreviewHandler,
        datasource_repository=datasource_repository
    )
    
    create_query_handler = providers.Factory(
        CreateQueryHandler,
        query_repository=query_repository
    )
    
    update_query_handler = providers.Factory(
        UpdateQueryHandler,
        query_repository=query_repository
    )
    
    delete_query_handler = providers.Factory(
        DeleteQueryHandler,
        query_repository=query_repository
    )
    
    list_queries_handler = providers.Factory(
        ListQueriesHandler,
        query_repository=query_repository
    )
    
    get_query_handler = providers.Factory(
        GetQueryHandler,
        query_repository=query_repository
    )
    
    toggle_favorite_handler = providers.Factory(
        ToggleFavoriteHandler,
        query_repository=query_repository
    )
    
    list_folders_handler = providers.Factory(
        ListFoldersHandler,
        query_repository=query_repository
    )
    
    create_folder_handler = providers.Factory(
        CreateFolderHandler,
        query_repository=query_repository
    )
    
    list_histories_handler = providers.Factory(
        ListHistoriesHandler,
        query_repository=query_repository
    )

    get_history_detail_handler = providers.Factory(
        GetHistoryDetailHandler,
        query_repository=query_repository
    )

    get_statistics_handler = providers.Factory(
        GetStatisticsHandler,
        query_repository=query_repository
    )

    # ========================================================================
    # Query 模块 - Template Repository & Handlers
    # ========================================================================
    
    from app.infrastructure.repositories.query_template_repository import QueryTemplateRepository
    
    query_template_repository = providers.Factory(
        QueryTemplateRepository,
        session=db_session
    )
    
    list_templates_handler = providers.Factory(
        ListTemplatesHandler,
        query_template_repository=query_template_repository
    )
    
    create_template_handler = providers.Factory(
        CreateTemplateHandler,
        query_template_repository=query_template_repository
    )
    
    get_template_handler = providers.Factory(
        GetTemplateHandler,
        query_template_repository=query_template_repository
    )
    
    update_template_handler = providers.Factory(
        UpdateTemplateHandler,
        query_template_repository=query_template_repository
    )
    
    delete_template_handler = providers.Factory(
        DeleteTemplateHandler,
        query_template_repository=query_template_repository
    )
    
    use_template_handler = providers.Factory(
        UseTemplateHandler,
        query_template_repository=query_template_repository
    )
    
    # ========================================================================
    # SQL Query Async Handlers
    # ========================================================================
    
    submit_async_query_handler = providers.Factory(
        SubmitAsyncQueryHandler,
        sql_query_repository=sql_query_repository
    )
    
    get_query_status_handler = providers.Factory(
        GetQueryStatusHandler,
        sql_query_repository=sql_query_repository
    )
    
    get_query_result_handler = providers.Factory(
        GetQueryResultHandler,
        sql_query_repository=sql_query_repository
    )

    # ========================================================================
    # Query Export（异步数据导出）
    # ========================================================================

    query_export_repository = providers.Factory(
        QueryExportRepository,
        session=db_session,
    )

    query_export_service = providers.Factory(
        QueryExportService,
        export_repository=query_export_repository,
        datasource_repository=datasource_repository,
        task_queue=task_queue,
    )

    submit_export_handler = providers.Factory(
        SubmitExportHandler,
        export_service=query_export_service,
    )

    get_export_handler = providers.Factory(
        GetExportHandler,
        export_service=query_export_service,
    )

    list_exports_handler = providers.Factory(
        ListExportsHandler,
        export_service=query_export_service,
    )

    cancel_export_handler = providers.Factory(
        CancelExportHandler,
        export_service=query_export_service,
    )
    
    # ========================================================================
    # Feishu 模块 - Handlers
    # ========================================================================
    
    list_chats_handler = providers.Factory(
        ListChatsHandler,
        feishu_chat_repository=feishu_chat_repository
    )
    
    update_chat_handler = providers.Factory(
        UpdateChatHandler,
        feishu_chat_repository=feishu_chat_repository
    )
    
    # ========================================================================
    # Datasource 模块 - Handlers
    # ========================================================================
    
    # Commands
    create_datasource_handler = providers.Factory(
        CreateDatasourceHandler,
        repository=datasource_repository,
        event_bus=event_bus
    )
    
    update_datasource_handler = providers.Factory(
        UpdateDatasourceHandler,
        repository=datasource_repository
    )
    
    delete_datasource_handler = providers.Factory(
        DeleteDatasourceHandler,
        repository=datasource_repository,
        event_bus=event_bus
    )
    
    # Queries
    list_datasources_handler = providers.Factory(
        ListDatasourcesHandler,
        engine=db_engine
    )
    
    get_datasource_handler = providers.Factory(
        GetDatasourceHandler,
        repository=datasource_repository
    )
    
    test_connection_handler = providers.Factory(
        TestConnectionHandler,
        repository=datasource_repository
    )
    
    get_databases_handler = providers.Factory(
        GetDatabasesHandler,
        repository=datasource_repository
    )
    
    get_tables_handler = providers.Factory(
        GetTablesHandler,
        repository=datasource_repository
    )
    
    preview_table_data_handler = providers.Factory(
        PreviewTableDataHandler,
        datasource_repository=datasource_repository
    )
    
    get_schemas_handler = providers.Factory(
        GetSchemasHandler,
        repository=datasource_repository
    )
    
    get_table_schema_handler = providers.Factory(
        GetTableSchemaHandler,
        repository=datasource_repository
    )
    
    get_datasource_statistics_handler = providers.Factory(
        GetDatasourceStatisticsHandler,
        engine=db_engine
    )
    
    # ========================================================================
    # Dataset 模块 - Handlers
    # ========================================================================
    
    # Commands
    create_dataset_handler = providers.Factory(
        CreateDatasetHandler,
        repository=dataset_repository,
        event_bus=event_bus
    )

    view_publish_service = providers.Factory(
        ViewPublishService,
        definition_service=semantic_definition_service,
        query_service=semantic_query_service,
        dataset_repo=dataset_repository,
        dataset_handler=create_dataset_handler,
        default_source_id_getter=_default_semantic_source_id,
        registry_repo=semantic_registry_repository,
    )
    
    update_dataset_handler = providers.Factory(
        UpdateDatasetHandler,
        repository=dataset_repository
    )
    
    delete_dataset_handler = providers.Factory(
        DeleteDatasetHandler,
        repository=dataset_repository,
        event_bus=event_bus
    )
    
    # Queries
    list_datasets_handler = providers.Factory(
        ListDatasetsHandler,
        engine=db_engine
    )
    
    get_dataset_handler = providers.Factory(
        GetDatasetHandler,
        repository=dataset_repository
    )
    
    preview_dataset_handler = providers.Factory(
        PreviewDatasetHandler,
        datasource_repository=datasource_repository
    )
    
    sync_schema_handler = providers.Factory(
        SyncSchemaHandler,
        dataset_repository=dataset_repository,
        task_queue=task_queue,
    )
    
    get_dataset_statistics_handler = providers.Factory(
        GetDatasetStatisticsHandler,
        engine=db_engine
    )

    profile_dataset_handler = providers.Factory(
        ProfileDatasetHandler,
        dataset_repository=dataset_repository,
        datasource_repository=datasource_repository,
    )

    dashboard_overview_service = providers.Factory(
        DashboardOverviewService,
        session=db_session,
        semantic_definition_service=semantic_definition_service,
    )
    
    # ========================================================================
    # 领域服务（无状态，Singleton）
    # ========================================================================
    
    from app.domain.services.sql_generator import SQLGeneratorService
    from app.domain.services.permission_checker import PermissionCheckerService
    
    sql_generator_service = providers.Singleton(SQLGeneratorService)
    permission_checker_service = providers.Singleton(PermissionCheckerService)
    
    # ========================================================================
    # Extraction 模块 - Handlers
    # ========================================================================
    
    # Commands
    create_task_handler = providers.Factory(
        CreateTaskHandler,
        extraction_repository=extraction_repository,
        dataset_repository=dataset_repository,
        event_bus=event_bus,
        sql_generator=sql_generator_service,
        permission_checker=permission_checker_service
    )
    
    update_task_handler = providers.Factory(
        UpdateTaskHandler,
        extraction_repository=extraction_repository,
        dataset_repository=dataset_repository,
        event_bus=event_bus,
        sql_generator=sql_generator_service,
        permission_checker=permission_checker_service
    )
    
    delete_task_handler = providers.Factory(
        DeleteTaskHandler,
        extraction_repository=extraction_repository,
        event_bus=event_bus
    )
    
    execute_task_handler = providers.Factory(
        ExecuteTaskHandler,
        extraction_repository=extraction_repository,
        task_queue_manager=task_queue,
        event_bus=event_bus
    )
    
    # Queries
    list_tasks_handler = providers.Factory(
        ListTasksHandler,
        db_engine=db_engine
    )
    
    preview_data_handler = providers.Factory(
        PreviewDataHandler,
        dataset_repository=dataset_repository,
        sql_generator=sql_generator_service,
        permission_checker=permission_checker_service
    )
    
    # ========================================================================
    # Conversation 模块 - Handlers
    # ========================================================================
    
    # Commands
    create_conversation_handler = providers.Factory(
        CreateConversationHandler,
        conversation_repository=conversation_repository,
        dataset_repository=dataset_repository
    )
    
    send_message_handler = providers.Factory(
        SendMessageHandler,
        conversation_repository=conversation_repository,
        message_repository=message_repository,
        dataset_repository=dataset_repository,
        llm_service=llm_service,
        semantic_router_service=semantic_router_preview_service,
    )
    
    # Queries
    get_conversation_handler = providers.Factory(
        GetConversationHandler,
        conversation_repository=conversation_repository,
        message_repository=message_repository
    )
    
    list_conversations_handler = providers.Factory(
        ListConversationsHandler,
        conversation_repository=conversation_repository
    )
    
    # ========================================================================
    # App Center 模块 - Services
    # ========================================================================
    
    from app.application.services.app_center.app_definition_service import AppDefinitionService
    from app.application.services.app_center.app_instance_service import AppInstanceService
    from app.application.services.app_center.execution_service import ExecutionService
    from app.application.services.app_center.scheduler_service import SchedulerService
    
    app_definition_service = providers.Factory(
        AppDefinitionService,
        app_definition_repository=app_definition_repository
    )
    
    scheduler_service = providers.Factory(
        SchedulerService,
        app_instance_repository=app_instance_repository
    )
    
    app_instance_service = providers.Factory(
        AppInstanceService,
        app_instance_repository=app_instance_repository,
        app_definition_repository=app_definition_repository,
        scheduler_service=scheduler_service
    )
    
    execution_service = providers.Factory(
        ExecutionService,
        app_execution_repository=app_execution_repository,
        app_instance_repository=app_instance_repository,
        event_bus=event_bus
    )
    
    # ========================================================================
    # Config Center 模块 - Services
    # ========================================================================
    
    from app.application.services.config.channel_service import ChannelService
    from app.application.services.config.subscription_service import SubscriptionService
    from app.application.services.config.delivery_service import DeliveryService
    
    channel_service = providers.Factory(
        ChannelService,
        channel_repository=channel_repository
    )
    
    subscription_service = providers.Factory(
        SubscriptionService,
        subscription_repository=subscription_repository,
        app_instance_repository=app_instance_repository,
        channel_repository=channel_repository
    )
    
    delivery_service = providers.Factory(
        DeliveryService,
        subscription_service=subscription_service,
        subscription_repository=subscription_repository,
    )

def init_container(app: Flask) -> Container:
    """
    初始化依赖注入容器
    
    使用 Pydantic 验证配置，确保所有必需的配置项都已正确设置
    
    Args:
        app: Flask 应用实例
    
    Returns:
        配置完成的容器实例
    
    Raises:
        ValueError: 配置验证失败
    """
    from app.shared.utils.logger import get_logger
    
    logger = get_logger(__name__)
    container = Container()
    
    # 验证配置（可选，如果需要严格验证）
    try:
        from app.config_schema import AppConfig
        
        # 尝试从环境变量加载并验证配置
        validated_config = AppConfig.from_env()
        logger.info("配置验证成功", 
                   database_uri=validated_config.database.uri[:30] + "...",
                   redis_url=validated_config.redis.url,
                   log_level=validated_config.log_level)
    except Exception as e:
        logger.warning(f"配置验证失败（使用默认配置）: {e}")
    
    # 从 Flask 配置加载配置项
    container.config.from_dict({
        'database_url': app.config.get('SQLALCHEMY_DATABASE_URI'),
        'redis_url': app.config.get('REDIS_URL', 'redis://localhost:6379/0'),
        'feishu': {
            'app_id': app.config.get('FEISHU_APP_ID'),
            'app_secret': app.config.get('FEISHU_APP_SECRET'),
        },
        'oss': {
            'access_key_id': app.config.get('OSS_ACCESS_KEY_ID'),
            'access_key_secret': app.config.get('OSS_ACCESS_KEY_SECRET'),
            'endpoint': app.config.get('OSS_ENDPOINT'),
            'bucket_name': app.config.get('OSS_BUCKET_NAME'),
        },
        'llm': {
            'api_key': app.config.get('LLM_API_KEY', ''),
            'api_base': app.config.get('LLM_API_BASE', 'https://api.openai.com/v1'),
            'model': app.config.get('LLM_MODEL', 'gpt-4o-mini'),
            'timeout': app.config.get('LLM_TIMEOUT', 60)
        },
        'agent_openai': {
            'api_key': os.getenv('AGENT_OPENAI_API_KEY', app.config.get('AGENT_OPENAI_API_KEY', '')),
            'api_base': os.getenv('AGENT_OPENAI_BASE_URL', app.config.get('AGENT_OPENAI_BASE_URL', 'https://api.openai.com/v1')),
            'model': os.getenv('AGENT_OPENAI_MODEL', app.config.get('AGENT_OPENAI_MODEL', 'gpt-4o-mini')),
            'timeout': os.getenv('AGENT_OPENAI_TIMEOUT_SECONDS', app.config.get('AGENT_OPENAI_TIMEOUT_SECONDS', 60)),
        },
        'agent_codex': {
            'enabled': _parse_bool(os.getenv('AGENT_CODEX_ENABLED', app.config.get('AGENT_CODEX_ENABLED', False))),
            'ui_managed': _parse_bool(os.getenv('AGENT_CODEX_UI_MANAGED', app.config.get('AGENT_CODEX_UI_MANAGED', False))),
            'server_managed': _parse_bool(os.getenv('AGENT_CODEX_SERVER_MANAGED', app.config.get('AGENT_CODEX_SERVER_MANAGED', False))),
            'command_profile': os.getenv('AGENT_CODEX_COMMAND_PROFILE', app.config.get('AGENT_CODEX_COMMAND_PROFILE', 'local-codex-app-server')),
            'allowed_project_roots': os.getenv('AGENT_CODEX_ALLOWED_PROJECT_ROOTS', app.config.get('AGENT_CODEX_ALLOWED_PROJECT_ROOTS', '')),
            'project_id': os.getenv('AGENT_CODEX_PROJECT_ID', app.config.get('AGENT_CODEX_PROJECT_ID', 'cubic3-data-platform')),
            'project_root': os.getenv('AGENT_CODEX_PROJECT_ROOT', app.config.get('AGENT_CODEX_PROJECT_ROOT', os.getcwd())),
            'runtime_root': os.getenv('AGENT_CODEX_RUNTIME_ROOT', app.config.get('AGENT_CODEX_RUNTIME_ROOT', '.cubic3/agent-codex')),
            'transport': os.getenv('AGENT_CODEX_TRANSPORT', app.config.get('AGENT_CODEX_TRANSPORT', 'ws')),
            'endpoint': os.getenv('AGENT_CODEX_ENDPOINT', app.config.get('AGENT_CODEX_ENDPOINT', '')),
            'timeout_seconds': _parse_positive_int(
                os.getenv(
                    'AGENT_CODEX_TIMEOUT_SECONDS',
                    app.config.get('AGENT_CODEX_TIMEOUT_SECONDS', 10),
                ),
                default=10,
            ),
            'max_concurrency': _parse_positive_int(
                os.getenv(
                    'AGENT_CODEX_MAX_CONCURRENCY',
                    app.config.get('AGENT_CODEX_MAX_CONCURRENCY', 2),
                ),
                default=2,
            ),
        },
        'query_gateway': {
            'base_url': os.getenv('QUERY_GATEWAY_BASE_URL', app.config.get('QUERY_GATEWAY_BASE_URL', 'http://dw-query-gateway:8000')),
            'platform_service_token': os.getenv('QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN', app.config.get('QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN', '')),
            'timeout_seconds': int(os.getenv('QUERY_GATEWAY_TIMEOUT_SECONDS', app.config.get('QUERY_GATEWAY_TIMEOUT_SECONDS', 5))),
        },
        'semantic_modeling': {
            'copilot_store': app.config.get('SEMANTIC_MODELING_COPILOT_STORE', 'sql'),
        }
    })
    
    return container


# ============================================================================
# 全局容器实例（可选，便于在非 Flask 上下文中使用）
# ============================================================================

_container = None


def get_container() -> Container:
    """获取全局容器实例"""
    global _container
    if _container is None:
        _container = Container()
    return _container


def set_container(container: Container):
    """设置全局容器实例"""
    global _container
    _container = container
