"""时间工具函数，替代已弃用的 datetime.utcnow()"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """返回当前 UTC 时间（timezone-aware）。

    Python 3.12+ 弃用了 datetime.utcnow()，应改用 datetime.now(UTC)。
    此函数在项目中统一提供替代。
    """
    return datetime.now(timezone.utc)
