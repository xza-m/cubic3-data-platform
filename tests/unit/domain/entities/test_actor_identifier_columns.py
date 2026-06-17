from __future__ import annotations

from app.domain.entities.agent_query_log import AgentQueryLog
from app.domain.entities.config.channel import Channel
from app.domain.entities.config.domain_publish_record import DomainPublishRecord
from app.domain.entities.config.subscription import Subscription
from app.domain.entities.conversation import Conversation
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.extraction_run import ExtractionRun
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.entities.extraction_template import ExtractionTemplate
from app.domain.entities.query import Query
from app.domain.entities.query_export import QueryExport
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory
from app.domain.entities.query_template import QueryTemplate
from app.domain.entities.sql_query import SQLQuery
from app.domain.queries.scheduled_query import ScheduledQuery
from app.infrastructure.agent_inference_runtime.models import (
    AgentInferenceRuntimeArtifactORM,
    AgentInferenceRuntimeRunORM,
    AgentRuntimeAuditLogORM,
    AgentRuntimeProviderConfigORM,
)
from app.infrastructure.governance.models import GovernanceAuditTraceORM
from app.infrastructure.semantic.models import (
    SemanticAssetORM,
    SemanticAssetRevisionORM,
    SemanticModelingAgentSessionORM,
    SemanticModelingBuildProjectORM,
    SemanticReleaseORM,
)


ACTOR_IDENTIFIER_MIN_LENGTH = 191


def test_actor_identifier_columns_can_store_principal_identifier():
    """审计字段存的是平台主体 ID，不再是假定很短的用户名。"""
    actor_columns = [
        (Channel, "created_by"),
        (Subscription, "created_by"),
        (DataSource, "created_by"),
        (Dataset, "created_by"),
        (ExtractionTask, "created_by"),
        (ExtractionTemplate, "created_by"),
        (ExtractionRun, "triggered_by"),
        (Query, "created_by"),
        (QueryExport, "user_id"),
        (QueryFolder, "created_by"),
        (QueryHistory, "executed_by"),
        (QueryTemplate, "created_by"),
        (SQLQuery, "created_by"),
        (Conversation, "user_id"),
        (AgentQueryLog, "user_id"),
        (DomainPublishRecord, "published_by"),
        (ScheduledQuery, "owner_id"),
        (GovernanceAuditTraceORM, "principal_id"),
        (AgentInferenceRuntimeRunORM, "principal_id"),
        (AgentInferenceRuntimeArtifactORM, "principal_id"),
        (AgentRuntimeProviderConfigORM, "updated_by"),
        (AgentRuntimeAuditLogORM, "principal_id"),
        (SemanticAssetORM, "owner_principal_id"),
        (SemanticAssetRevisionORM, "created_by"),
        (SemanticReleaseORM, "published_by"),
        (SemanticModelingAgentSessionORM, "principal_id"),
        (SemanticModelingBuildProjectORM, "created_by"),
    ]

    for model, column_name in actor_columns:
        column = model.__table__.c[column_name]
        assert column.type.length >= ACTOR_IDENTIFIER_MIN_LENGTH, (
            f"{model.__tablename__}.{column_name} length should be >= "
            f"{ACTOR_IDENTIFIER_MIN_LENGTH}"
        )
