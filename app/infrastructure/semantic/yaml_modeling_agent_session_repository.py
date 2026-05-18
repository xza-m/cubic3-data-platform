"""YAML 文件驱动的语义建模 Copilot 会话仓储。"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

from app.domain.semantic.modeling_agent_session import AgentSession
from app.domain.semantic.ports.modeling_agent_session_repository import IModelingAgentSessionRepository


class YamlModelingAgentSessionRepository(IModelingAgentSessionRepository):
    def __init__(self, sessions_dir: str):
        self._dir = Path(sessions_dir)
        self._cache: Dict[str, AgentSession] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._cache.clear()
        if not self._dir.exists():
            self._loaded = True
            return
        for fp in sorted(self._dir.glob("*.yml")):
            raw = yaml.safe_load(fp.read_text(encoding="utf-8"))
            if raw:
                session = AgentSession(**raw)
                self._cache[session.id] = session
        self._loaded = True

    def get(self, session_id: str) -> Optional[AgentSession]:
        self._ensure_loaded()
        return self._cache.get(session_id)

    def save(self, session: AgentSession) -> None:
        self._ensure_loaded()
        self._dir.mkdir(parents=True, exist_ok=True)
        session.touch()
        fp = self._dir / f"{session.id}.yml"
        fp.write_text(
            yaml.dump(session.model_dump(exclude_none=True), allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
        self._cache[session.id] = session

    def list(
        self,
        principal_id: Optional[str] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        include_legacy: bool = True,
    ) -> List[AgentSession]:
        self._ensure_loaded()
        items: List[AgentSession] = []
        for session in self._cache.values():
            if principal_id is not None:
                if session.principal_id is None:
                    if not include_legacy:
                        continue
                elif session.principal_id != principal_id:
                    continue
            if status is not None and session.status != status:
                continue
            items.append(session)
        # 按 updated_at 倒序，没有 updated_at 的（理论上不应发生）排到最后
        items.sort(key=lambda s: s.updated_at or "", reverse=True)
        if offset:
            items = items[offset:]
        if limit is not None and limit >= 0:
            items = items[:limit]
        return items

    def delete(self, session_id: str) -> None:
        self._ensure_loaded()
        fp = self._dir / f"{session_id}.yml"
        if fp.exists():
            try:
                fp.unlink()
            except OSError:
                # 静默处理：删除并发或权限问题不抛出，调用方按"幂等删除"语义处理
                pass
        self._cache.pop(session_id, None)

    def update_metadata(
        self,
        session_id: str,
        *,
        title: Optional[str] = None,
    ) -> Optional[AgentSession]:
        self._ensure_loaded()
        session = self._cache.get(session_id)
        if session is None:
            return None
        if title is not None:
            session.title = title.strip() or None
        # save 内部会 touch updated_at
        self.save(session)
        return session
