"""语义建模 Copilot 门面。

按职责拆分为三个子服务（保持 blueprint 接口与 DI 装配不变）：
- CopilotSessionService：会话 CRUD / 重命名 / principal 鉴权
- CopilotTurnService：send_message / confirm / update_spec / sandbox / Codex run
- CopilotPublishService：save_proposal / publish_proposal / preview_release / review

本类只负责依赖装配与方法委托，不再承载业务逻辑。
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.application.semantic.copilot_publish_service import CopilotPublishService
from app.application.semantic.copilot_session_service import CopilotSessionService
from app.application.semantic.copilot_turn_service import CopilotTurnService
from app.application.semantic.modeling_copilot_tools import ModelingToolRegistry
from app.application.semantic.source_candidate_scoring import SourceCandidateScoringConfig
from app.domain.semantic.ports.modeling_agent_session_repository import IModelingAgentSessionRepository


class SemanticModelingCopilotService:
    """Session-first 的语义建模 Copilot 统一入口（门面）。"""

    def __init__(
        self,
        *,
        session_repository: IModelingAgentSessionRepository,
        agent_app: Any,
        tools: ModelingToolRegistry,
        proposal_service: Any,
        source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
        release_preview_service: Any | None = None,
    ):
        deps = dict(
            session_repository=session_repository,
            agent_app=agent_app,
            tools=tools,
            proposal_service=proposal_service,
            source_scoring_config=source_scoring_config,
            release_preview_service=release_preview_service,
        )
        self.sessions = CopilotSessionService(**deps)
        self.turns = CopilotTurnService(**deps)
        self.publishing = CopilotPublishService(**deps)
        # 兼容历史调用方 / 测试对内部依赖的引用。
        self._sessions = session_repository
        self._agent_app = agent_app
        self._tools = tools
        self._proposal_service = proposal_service
        self._release_preview_service = release_preview_service

    # ------------------------------------------------------------------
    # 会话生命周期
    # ------------------------------------------------------------------

    def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self.sessions.create_session(payload)

    def get_session(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        return self.sessions.get_session(session_id, principal_id=principal_id)

    def list_sessions(
        self,
        principal_id: Optional[str] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        include_legacy: bool = True,
    ) -> Dict[str, Any]:
        return self.sessions.list_sessions(
            principal_id,
            limit=limit,
            offset=offset,
            status=status,
            include_legacy=include_legacy,
        )

    def delete_session(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        return self.sessions.delete_session(session_id, principal_id=principal_id)

    def rename_session(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.sessions.rename_session(session_id, payload, principal_id=principal_id)

    # ------------------------------------------------------------------
    # 对话轮次与确定性动作
    # ------------------------------------------------------------------

    def send_message(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.turns.send_message(session_id, payload, principal_id=principal_id)

    def confirm(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.turns.confirm(session_id, payload, principal_id=principal_id)

    def update_spec(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.turns.update_spec(session_id, payload, principal_id=principal_id)

    def accept_cube_draft(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.turns.accept_cube_draft(session_id, payload, principal_id=principal_id)

    def sandbox(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.turns.sandbox(session_id, payload, principal_id=principal_id)

    def start_review_run(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        return self.turns.start_review_run(session_id, principal_id=principal_id)

    def start_repair_run(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        return self.turns.start_repair_run(session_id, principal_id=principal_id)

    # ------------------------------------------------------------------
    # Proposal 保存 / 发布 / Review
    # ------------------------------------------------------------------

    def get_review(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        return self.publishing.get_review(session_id, principal_id=principal_id)

    def preview_release(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.publishing.preview_release(session_id, payload, principal_id=principal_id)

    def save_proposal(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.publishing.save_proposal(session_id, payload, principal_id=principal_id)

    def publish_proposal(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.publishing.publish_proposal(session_id, payload, principal_id=principal_id)
