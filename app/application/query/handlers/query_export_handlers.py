"""
异步数据导出 CQRS handlers

每个 handler 只做输入/输出胶水，业务编排全部在 QueryExportService 里。
"""
from typing import Optional

from app.application.query.commands.cancel_export import CancelExportCommand
from app.application.query.commands.submit_export import SubmitExportCommand
from app.application.query.services.query_export_service import QueryExportService


class SubmitExportHandler:
    def __init__(self, export_service: QueryExportService):
        self.export_service = export_service

    def handle(self, command: SubmitExportCommand) -> dict:
        export = self.export_service.submit(
            user_id=command.user_id,
            source_id=command.source_id,
            sql_query=command.sql_query,
            visual_spec=command.visual_spec,
        )
        return export.to_dict()


class GetExportHandler:
    def __init__(self, export_service: QueryExportService):
        self.export_service = export_service

    def handle(self, *, user_id: str, export_id: int) -> dict:
        export = self.export_service.get(user_id=user_id, export_id=export_id)
        return export.to_dict()


class ListExportsHandler:
    def __init__(self, export_service: QueryExportService):
        self.export_service = export_service

    def handle(
        self,
        *,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> dict:
        return self.export_service.list(
            user_id=user_id,
            page=page,
            page_size=page_size,
            status=status,
        )


class CancelExportHandler:
    def __init__(self, export_service: QueryExportService):
        self.export_service = export_service

    def handle(self, command: CancelExportCommand) -> dict:
        export = self.export_service.cancel(
            user_id=command.user_id,
            export_id=command.export_id,
        )
        return export.to_dict()
