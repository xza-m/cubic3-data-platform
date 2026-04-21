# scripts/cleanup_diagnose_runs.py
# 建议接入调度器周清理（例：每周日 02:00 Asia/Shanghai）
"""
删除 semantic_diagnose_runs 表中超过 30 天的历史记录。

用法：
    python scripts/cleanup_diagnose_runs.py [--dry-run] [--days 30]

选项：
    --dry-run   仅打印将删除的行数，不实际删除
    --days N    保留最近 N 天（默认 30）

退出码：
    0   成功（含无需删除的情况）
    1   执行出错
"""
import argparse
import logging
import os
import sys
from datetime import datetime, timedelta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("cleanup_diagnose_runs")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="清理过期的 semantic_diagnose_runs 记录")
    parser.add_argument("--dry-run", action="store_true", help="不删除，仅打印行数")
    parser.add_argument("--days", type=int, default=30, help="保留天数，默认 30")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    os.environ.setdefault("FLASK_TESTING", "0")

    try:
        from app import create_app
        from app.extensions import db
        from app.infrastructure.semantic.diagnose_run_repo import DiagnoseRunRepo
        from app.domain.semantic.diagnose_run import DiagnoseRun  # noqa

        flask_app = create_app(role="worker")
        with flask_app.app_context():
            db.create_all()

            cutoff = datetime.utcnow() - timedelta(days=args.days)
            repo = DiagnoseRunRepo()

            if args.dry_run:
                count = (
                    db.session.query(DiagnoseRun)
                    .filter(DiagnoseRun.created_at < cutoff)
                    .count()
                )
                logger.info("[dry-run] 将删除 %d 条 created_at < %s 的记录", count, cutoff.date())
            else:
                count = repo.delete_older_than(cutoff)
                logger.info("已删除 %d 条 created_at < %s 的 diagnose_run 记录", count, cutoff.date())

    except Exception as exc:
        logger.error("cleanup failed: %s", exc, exc_info=True)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
