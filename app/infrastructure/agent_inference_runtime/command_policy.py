"""Codex runtime 命令 allowlist 策略。"""
from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from typing import Any, Dict, List


@dataclass(frozen=True)
class CommandRule:
    command: str
    args_pattern: List[str]
    requires_approval: bool


class CommandPolicy:
    """只校验命令是否在 allowlist 中，不执行 approval 流程。"""

    def __init__(self, *, rules: List[CommandRule], network: str):
        self._rules = rules
        self._network = network

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "CommandPolicy":
        rules = [
            CommandRule(
                command=str(item.get("command") or ""),
                args_pattern=[str(arg) for arg in item.get("args_pattern") or []],
                requires_approval=bool(item.get("requires_approval")),
            )
            for item in payload.get("allowed_commands") or []
        ]
        return cls(rules=rules, network=str(payload.get("network") or "disabled"))

    def assert_allowed(self, argv: List[str], *, cwd: str) -> None:
        if not argv:
            raise PermissionError("RUNTIME_TOOL_FORBIDDEN: empty command")
        command = argv[0]
        args = argv[1:]
        for rule in self._rules:
            if rule.command != command:
                continue
            if self._matches(args, rule.args_pattern):
                return
        raise PermissionError(f"RUNTIME_TOOL_FORBIDDEN: command={command} cwd={cwd}")

    @staticmethod
    def _matches(args: List[str], pattern: List[str]) -> bool:
        for index, expected in enumerate(pattern):
            if expected == "*":
                return True
            if index >= len(args) or not fnmatch(args[index], expected):
                return False
        return len(args) == len(pattern)
