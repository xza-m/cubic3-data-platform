"""
异步数据导出任务仓储接口
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional


class IQueryExportRepository(ABC):
    """QueryExport 仓储接口"""

    @abstractmethod
    def save(self, export) -> object:
        """保存导出记录并返回最新快照"""

    @abstractmethod
    def find_by_id(self, export_id: int) -> Optional[object]:
        """根据 ID 查找导出记录"""

    @abstractmethod
    def find_for_user(self, export_id: int, user_id: str) -> Optional[object]:
        """查找归属某用户的导出记录（非本人一律返回 None）"""

    @abstractmethod
    def list_by_user(
        self,
        user_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> dict:
        """分页获取用户导出任务，返回 {items, total, page, page_size, total_pages}"""

    @abstractmethod
    def list_expiring(self, cutoff: datetime, *, limit: int = 100) -> List[object]:
        """扫描 status=success 且 expires_at <= cutoff 的任务，供过期清理使用"""

    @abstractmethod
    def count_today_by_user(self, user_id: str) -> int:
        """统计用户当日已发起的任务数（用于日配额）"""

    @abstractmethod
    def count_active_by_user(self, user_id: str) -> int:
        """统计用户当前运行中/排队中的任务数（用于并发配额）"""

    @abstractmethod
    def commit(self) -> None:
        """提交当前事务"""
