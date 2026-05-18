"""YAML 文件驱动的建模助手 Proposal 仓储。"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import yaml

from app.domain.semantic.modeling_proposal import ModelingProposal
from app.domain.semantic.ports.modeling_proposal_repository import IModelingProposalRepository


class YamlModelingProposalRepository(IModelingProposalRepository):
    def __init__(self, proposals_dir: str):
        self._dir = Path(proposals_dir)
        self._cache: Dict[str, ModelingProposal] = {}
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
                proposal = ModelingProposal(**raw)
                self._cache[proposal.id] = proposal
        self._loaded = True

    def get(self, proposal_id: str) -> Optional[ModelingProposal]:
        self._ensure_loaded()
        return self._cache.get(proposal_id)

    def save(self, proposal: ModelingProposal) -> None:
        self._ensure_loaded()
        self._dir.mkdir(parents=True, exist_ok=True)
        proposal.touch()
        fp = self._dir / f"{proposal.id}.yml"
        fp.write_text(
            yaml.dump(proposal.model_dump(exclude_none=True), allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
        self._cache[proposal.id] = proposal
