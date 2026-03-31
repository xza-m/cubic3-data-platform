"""
数据集元数据同步异步任务。
"""
from __future__ import annotations

from rq import get_current_job

from app.application.dataset.services.dataset_metadata_refresh_service import DatasetMetadataRefreshService
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.infrastructure.database.session import get_db_session
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.shared.enums import DatasetSyncStatus
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def execute_dataset_sync_job(dataset_id: int):
    """按数据集类型刷新字段元数据并回写同步状态。"""
    session = get_db_session()
    current_job = get_current_job()
    dataset = session.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise ValueError(f"Dataset {dataset_id} not found")

    logger.info(
        "start_dataset_sync_job",
        dataset_id=dataset_id,
        job_id=current_job.id if current_job else None,
        dataset_type=dataset.dataset_type,
    )

    try:
        dataset.start_sync()
        session.commit()

        refresh_service = DatasetMetadataRefreshService(
            datasource_repository=DatasourceRepository(session),
        )
        refreshed_fields = refresh_service.refresh(dataset)

        existing_fields = {field.physical_name: field for field in dataset.fields.all()}
        updated_count = 0
        added_count = 0

        for index, field_info in enumerate(refreshed_fields):
            physical_name = field_info['physical_name']
            if physical_name in existing_fields:
                field = existing_fields[physical_name]
                field.data_type = field_info['data_type']
                field.display_name = field_info.get('display_name', physical_name)
                field.business_type = field_info.get('business_type', field.business_type)
                field.sensitivity_level = field_info.get('sensitivity_level', field.sensitivity_level)
                field.mask_rule = field_info.get('mask_rule')
                field.comment = field_info.get('comment')
                field.field_order = index
                updated_count += 1
            else:
                dataset.fields.append(
                    DatasetField(
                        dataset=dataset,
                        physical_name=physical_name,
                        data_type=field_info['data_type'],
                        display_name=field_info.get('display_name', physical_name),
                        business_type=field_info.get('business_type', 'dimension'),
                        sensitivity_level=field_info.get('sensitivity_level', 'public'),
                        mask_rule=field_info.get('mask_rule'),
                        comment=field_info.get('comment'),
                        field_order=index,
                        is_nullable=True,
                    )
                )
                added_count += 1

        dataset.complete_sync(len(refreshed_fields))
        session.commit()
        return {
            'dataset_id': dataset.id,
            'status': DatasetSyncStatus.SYNCED.value,
            'updated_fields': updated_count,
            'added_fields': added_count,
            'field_count': len(refreshed_fields),
            'job_id': current_job.id if current_job else None,
        }
    except Exception as exc:
        session.rollback()
        dataset = session.query(Dataset).filter_by(id=dataset_id).first()
        if dataset is not None:
            dataset.fail_sync(str(exc))
            session.commit()
        logger.error("dataset_sync_job_failed", dataset_id=dataset_id, error=str(exc), exc_info=True)
        raise
    finally:
        session.close()
