"""语义建模 Copilot 会话仓储端口。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.modeling_agent_session import AgentSession


class IModelingAgentSessionRepository(ABC):
    @abstractmethod
    def get(self, session_id: str) -> Optional[AgentSession]:
        ...

    @abstractmethod
    def save(self, session: AgentSession) -> None:
        ...

    @abstractmethod
    def list(
        self,
        principal_id: Optional[str] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        include_legacy: bool = True,
    ) -> List[AgentSession]:
        """按用户列出会话。

        - `principal_id is None` 时不按用户过滤，仅用于可信内部调用或历史测试入口
        - `include_legacy=True`（默认）保留没有 `principal_id` 的老会话，已登录用户都可见
        - 新会话必须带当前登录 `principal_id`，读取和写入由服务层做 owner 校验
        - 结果按 `updated_at` 倒序，便于左栏"最近会话"渲染
        """
        ...

    @abstractmethod
    def delete(self, session_id: str) -> None:
        """删除会话；不存在时静默返回。"""
        ...

    @abstractmethod
    def update_metadata(
        self,
        session_id: str,
        *,
        title: Optional[str] = None,
    ) -> Optional[AgentSession]:
        """更新元数据（当前仅支持 title 重命名）。"""
        ...
