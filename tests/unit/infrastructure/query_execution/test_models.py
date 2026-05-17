from sqlalchemy import UniqueConstraint

from app.infrastructure.query_execution.models import (
    QueryExecutionEventORM,
    QueryExecutionJobORM,
    QueryResultObjectORM,
)


def test_query_execution_job_model_keeps_production_queue_indexes():
    index_names = {index.name for index in QueryExecutionJobORM.__table__.indexes}
    constraint_names = {
        constraint.name
        for constraint in QueryExecutionJobORM.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert "idx_query_execution_jobs_status_lease_created" in index_names
    assert "idx_query_execution_jobs_principal_created" in index_names
    assert "idx_query_execution_jobs_sql_hash" in index_names
    assert "uq_query_execution_jobs_principal_idempotency" in constraint_names


def test_query_execution_event_and_result_models_keep_lookup_indexes():
    event_index_names = {index.name for index in QueryExecutionEventORM.__table__.indexes}
    result_index_names = {index.name for index in QueryResultObjectORM.__table__.indexes}

    assert "idx_query_execution_events_query_created" in event_index_names
    assert "idx_query_result_objects_status_expires" in result_index_names
