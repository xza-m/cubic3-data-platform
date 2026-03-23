"""
Schema Drift 检测执行器

检测语义层 Cube YAML 定义与物理表 Schema 的偏移，
发现偏移时通过飞书群 webhook 推送通知。
"""
from datetime import datetime
from typing import Any, Dict

from app.domain.app_center.execution_context import (
    ExecutionContext,
    ExecutionResult,
    ExecutionStatus,
    ValidationResult,
)
from app.domain.app_center.executor import AppExecutor, register_executor
from app.extensions import db


@register_executor('schema_drift_check')
class SchemaDriftExecutor(AppExecutor):

    def execute(self, context: ExecutionContext) -> ExecutionResult:
        result = ExecutionResult(status=ExecutionStatus.RUNNING)

        try:
            config = context.config
            result.add_log("开始 Schema Drift 检测")

            adapter, database = self._get_maxcompute_adapter()
            if adapter is None:
                result.add_log("未找到 MaxCompute 数据源，跳过检测")
                result.status = ExecutionStatus.SUCCESS
                result.output = {"skipped": True, "reason": "no_maxcompute_source"}
                return result

            result.add_log(f"使用 MaxCompute 数据源，project={database}")

            from app.di.container import get_container
            from app.application.semantic.schema_sync_service import SchemaSyncService
            from app.infrastructure.semantic.maxcompute_schema_inspector import MaxComputeSchemaInspector

            cube_repo = get_container().cube_repository()
            inspector = MaxComputeSchemaInspector(adapter=adapter, database=database)
            sync_service = SchemaSyncService(cube_repo=cube_repo, inspector=inspector)

            report = sync_service.check_all()
            report_dict = report.to_dict()
            result.add_log(
                f"检测完成：{report.checked_cubes}/{report.total_cubes} 个 Cube，"
                f"发现 {len(report.drifts)} 项偏移"
            )

            notified = False
            if report.has_drifts:
                webhook_url = config.get("webhook_url", "")
                if webhook_url:
                    from app.infrastructure.notification.feishu_webhook import FeishuWebhookNotifier
                    notifier = FeishuWebhookNotifier(webhook_url=webhook_url)
                    notifier.send_schema_drift_report(
                        total_cubes=report_dict["total_cubes"],
                        checked_cubes=report_dict["checked_cubes"],
                        skipped_cubes=report_dict["skipped_cubes"],
                        drifts=report_dict["drifts"],
                    )
                    notified = True
                    result.add_log("飞书 webhook 通知已发送")
                else:
                    result.add_log("未配置 webhook URL，跳过通知")

            result.status = ExecutionStatus.SUCCESS
            result.output = {
                **report_dict,
                "notified": notified,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"检测失败：{e}")

        return result

    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        return ValidationResult(is_valid=True)

    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "webhook_url": {
                    "type": "string",
                    "title": "飞书 Webhook URL",
                    "description": "检测到 Schema 偏移时推送通知的飞书群机器人 Webhook 地址",
                    "format": "uri",
                },
            },
        }

    @staticmethod
    def _get_maxcompute_adapter():
        from app.domain.entities.data_source import DataSource
        from app.infrastructure.adapters.datasources.factory import AdapterFactory

        try:
            source = (
                db.session.query(DataSource)
                .filter(DataSource.source_type == "maxcompute")
                .order_by(DataSource.id)
                .first()
            )
            if source is None:
                return None, None

            conn = source.connection_config or {}
            adapter = AdapterFactory.create_adapter(source.source_type, conn)
            database = conn.get("project") or conn.get("database", "")
            return adapter, database
        except Exception:
            return None, None
