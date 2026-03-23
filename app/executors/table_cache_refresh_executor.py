"""
表缓存刷新执行器

定时刷新已过期的数据源表列表缓存，保持缓存数据新鲜。
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


@register_executor('table_cache_refresh')
class TableCacheRefreshExecutor(AppExecutor):

    def execute(self, context: ExecutionContext) -> ExecutionResult:
        result = ExecutionResult(status=ExecutionStatus.RUNNING)

        try:
            result.add_log("开始刷新过期表缓存")

            from app.di.container import get_container
            cache_service = get_container().table_cache_service()

            stats_before = cache_service.get_cache_stats()
            result.add_log(
                f"当前缓存统计：共 {stats_before['total_caches']} 条，"
                f"过期 {stats_before['expired_caches']} 条"
            )

            refreshed = cache_service.refresh_expired_caches()
            result.add_log(f"刷新完成：{refreshed} 条缓存已更新")

            stats_after = cache_service.get_cache_stats()

            result.status = ExecutionStatus.SUCCESS
            result.output = {
                "refreshed_count": refreshed,
                "stats_before": stats_before,
                "stats_after": stats_after,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"刷新失败：{e}")

        return result

    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        return ValidationResult(is_valid=True)

    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {},
        }
