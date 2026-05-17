"""查询执行 Worker 入口。"""
from __future__ import annotations

import os
import time

from app import create_app
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


def main() -> None:
    app = create_app(role="worker")
    worker_id = os.getenv("QUERY_WORKER_ID", f"query-worker-{os.getpid()}")
    idle_sleep_seconds = float(os.getenv("QUERY_WORKER_IDLE_SLEEP_SECONDS", "2"))
    cleanup_interval_seconds = float(os.getenv("QUERY_RESULT_CLEANUP_INTERVAL_SECONDS", "300"))
    last_cleanup_at = 0.0
    with app.app_context():
        service = app.container.query_execution_worker_service()
        result_store = app.container.query_execution_result_store()
        while True:
            if cleanup_interval_seconds > 0:
                now = time.monotonic()
                if now - last_cleanup_at >= cleanup_interval_seconds:
                    try:
                        app.container.query_result_service().cleanup_expired_results(
                            result_store=result_store,
                        )
                    except Exception as exc:  # pragma: no cover - worker protection
                        logger.warning("query result cleanup failed", error=str(exc))
                    last_cleanup_at = now
            job = service.process_next(worker_id=worker_id)
            if job is None:
                time.sleep(idle_sleep_seconds)


if __name__ == "__main__":
    main()
