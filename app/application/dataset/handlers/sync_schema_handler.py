"""
同步数据集 Schema 处理器。
"""
from __future__ import annotations

from app.application.dataset.commands.sync_schema import SyncSchemaCommand
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.infrastructure.tasks.jobs.dataset_sync_job import execute_dataset_sync_job
from app.infrastructure.tasks.task_queue import TaskQueueManager
from app.shared.exceptions import ApplicationException


class SyncSchemaHandler:
    """将数据集元数据刷新投递到后台队列。"""

    def __init__(
        self,
        dataset_repository: IDatasetRepository,
        task_queue: TaskQueueManager = None,
    ):
        self.dataset_repository = dataset_repository
        self.task_queue = task_queue

    def handle(self, command: SyncSchemaCommand) -> dict:
        dataset = self.dataset_repository.find_by_id(command.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {command.dataset_id}")

        if dataset.dataset_type not in {'physical', 'virtual', 'file'}:
            raise ApplicationException(f"不支持的数据集类型: {dataset.dataset_type}")

        queue = self.task_queue
        if queue is None:
            from app.di.container import get_container
            queue = get_container().task_queue()

        job = queue.enqueue(
            execute_dataset_sync_job,
            command.dataset_id,
            job_timeout=1800,
            result_ttl=86400,
            failure_ttl=604800,
        )
        return {'job_id': job.id, 'status': 'queued'}
