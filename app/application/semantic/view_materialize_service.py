# app/application/semantic/view_materialize_service.py
"""
语义 View 物化应用服务。

触发物化：立即返回 run_id，实际工作由线程池后台执行。
状态轮询：由调用方通过 GET runs 接口轮询。

TODO(ADR-001): 本期采用 ThreadPoolExecutor 简单方案；
  当并发物化量较大时，迁移至 ADR-001 中讨论的分布式调度器（Celery / RQ）。
"""
from __future__ import annotations

import concurrent.futures
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# 全局线程池（进程级单例，限并发 4）
_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="view-mat")


class ViewMaterializeService:
    """应用服务：驱动 View 物化的生命周期。"""

    def __init__(self, repo, semantic_service=None):
        """
        Args:
            repo: ViewMaterializeRepository 实例
            semantic_service: SemanticLayerService —— 用于执行真实物化逻辑（可选，
                              测试中可传 None 或 MagicMock）
        """
        self._repo = repo
        self._semantic_service = semantic_service

    # ── 公开接口 ─────────────────────────────────────────────────────────────

    def trigger(self, view_id: int) -> dict[str, Any]:
        """异步触发物化，立即返回 run_id。

        状态机：idle → running，待后台完成后 → idle/failed。
        """
        # 设置 running 状态
        self._repo.set_view_materialize_status(view_id, status="running")
        # 插入运行记录
        run = self._repo.create_run(view_id)
        run_id: int = run.id

        # 后台执行（不阻塞 HTTP 请求）
        _EXECUTOR.submit(self._run_materialize, view_id, run_id)

        return {"run_id": run_id, "status": "running"}

    def get_runs(
        self,
        view_id: int,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        return self._repo.list_runs(view_id, page=page, page_size=page_size)

    def get_view_extra_fields(self, view_id: int) -> dict[str, Any]:
        """返回 describe_view 附加的物化字段。"""
        return self._repo.get_view_materialize_status(view_id)

    # ── 私有：后台物化逻辑 ───────────────────────────────────────────────────

    def _run_materialize(self, view_id: int, run_id: int) -> None:
        """在线程池中执行，通过 DB 更新状态。

        注意：Flask app_context 不会自动注入至线程池线程，需手动推入。
        """
        from flask import current_app  # noqa: PLC0415

        app = current_app._get_current_object()  # type: ignore[attr-defined]
        with app.app_context():
            try:
                self._do_materialize(view_id)
                from datetime import datetime, timezone
                self._repo.finish_run(run_id, success=True)
                self._repo.set_view_materialize_status(
                    view_id,
                    status="idle",
                    materialized_at=datetime.now(timezone.utc).replace(tzinfo=None),
                )
            except Exception as exc:
                logger.exception("view_materialize_failed", extra={"view_id": view_id})
                self._repo.finish_run(run_id, success=False, error=str(exc))
                self._repo.set_view_materialize_status(view_id, status="failed")

    def _do_materialize(self, view_id: int) -> None:
        """执行实际物化逻辑（当前为 stub，后续对接数据集发布）。

        TODO(ADR-001): 对接 ViewPublishService.publish_view 或调度器任务。
        """
        if self._semantic_service is not None:
            materialize_fn = getattr(self._semantic_service, "materialize_view", None)
            if callable(materialize_fn):
                materialize_fn(view_id)
                return
        # 无实际实现时记录日志（功能占位）
        logger.info("view_materialize_stub", extra={"view_id": view_id})
