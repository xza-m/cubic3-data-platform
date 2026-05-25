"""Codex runtime 命令 allowlist 策略。"""
from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import PurePosixPath, PureWindowsPath
from typing import Any, Dict, List


@dataclass(frozen=True)
class CommandRule:
    rule_id: str
    command: str
    args_pattern: List[str]
    requires_approval: bool


@dataclass(frozen=True)
class CommandDecision:
    allowed: bool
    requires_approval: bool
    rule_id: str | None
    reason: str


class CommandPolicy:
    """只校验命令是否在 allowlist 中，不执行 approval 流程。"""

    def __init__(self, *, rules: List[CommandRule], network: str):
        self._rules = rules
        self._network = network

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "CommandPolicy":
        rules = [
            CommandRule(
                rule_id=str(item.get("id") or f"rule_{index + 1}"),
                command=str(item.get("command") or ""),
                args_pattern=[str(arg) for arg in item.get("args_pattern") or []],
                requires_approval=bool(item.get("requires_approval")),
            )
            for index, item in enumerate(payload.get("allowed_commands") or [])
        ]
        return cls(rules=rules, network=str(payload.get("network") or "disabled"))

    def evaluate(self, argv: List[str], *, cwd: str) -> CommandDecision:
        if not argv:
            return CommandDecision(False, False, None, "empty command")
        command = argv[0]
        args = argv[1:]
        for rule in self._rules:
            if rule.command != command:
                continue
            if self._matches(args, rule.args_pattern):
                forbidden_reason = self._validate_rule_specific_args(command, args)
                if forbidden_reason is not None:
                    return CommandDecision(False, False, rule.rule_id, forbidden_reason)
                if rule.requires_approval:
                    return CommandDecision(
                        False,
                        True,
                        rule.rule_id,
                        "command requires approval",
                    )
                return CommandDecision(True, False, rule.rule_id, "allowed")
        return CommandDecision(False, False, None, f"command={command} cwd={cwd}")

    def assert_allowed(self, argv: List[str], *, cwd: str) -> None:
        decision = self.evaluate(argv, cwd=cwd)
        if decision.allowed:
            return
        if decision.requires_approval:
            raise PermissionError(
                f"RUNTIME_TOOL_APPROVAL_REQUIRED: rule_id={decision.rule_id} cwd={cwd}"
            )
        raise PermissionError(f"RUNTIME_TOOL_FORBIDDEN: {decision.reason}")

    @staticmethod
    def _matches(args: List[str], pattern: List[str]) -> bool:
        arg_index = 0
        for pattern_index, expected in enumerate(pattern):
            if expected == "**":
                return pattern_index == len(pattern) - 1
            if arg_index >= len(args):
                return False
            if expected == "*":
                arg_index += 1
                continue
            if not fnmatch(args[arg_index], expected):
                return False
            arg_index += 1
        return arg_index == len(args)

    @staticmethod
    def _validate_rule_specific_args(command: str, args: List[str]) -> str | None:
        if command == "python" and len(args) >= 2 and args[:2] == ["-m", "pytest"]:
            return _validate_pytest_args(args[2:])
        return None


_DANGEROUS_PYTEST_OPTIONS = {
    "--override-ini",
    "--rootdir",
    "--basetemp",
    "--confcutdir",
    "-c",
    "--pyargs",
}


def _validate_pytest_args(args: List[str]) -> str | None:
    if not args:
        return "pytest path is required"
    has_test_path = False
    for arg in args:
        option_name, option_value = _split_option(arg)
        if option_name in _DANGEROUS_PYTEST_OPTIONS:
            return f"dangerous pytest option: {option_name}"
        if option_value is not None and _contains_path_escape(option_value):
            return f"unsafe pytest option value: {option_name}"
        if arg.startswith("-"):
            continue
        path_reason = _validate_pytest_path(arg)
        if path_reason is not None:
            return path_reason
        has_test_path = True
    if not has_test_path:
        return "pytest path is required"
    return None


def _split_option(arg: str) -> tuple[str, str | None]:
    if not arg.startswith("-") or "=" not in arg:
        return arg, None
    option_name, option_value = arg.split("=", 1)
    return option_name, option_value


def _contains_path_escape(value: str) -> bool:
    raw_path = value.split("::", 1)[0]
    normalized = raw_path.replace("\\", "/")
    segments = normalized.split("/")
    return (
        PurePosixPath(normalized).is_absolute()
        or PureWindowsPath(raw_path).is_absolute()
        or ".." in segments
    )


def _validate_pytest_path(value: str) -> str | None:
    raw_path = value.split("::", 1)[0]
    normalized = raw_path.replace("\\", "/")
    segments = normalized.split("/")
    if (
        not raw_path
        or PurePosixPath(normalized).is_absolute()
        or PureWindowsPath(raw_path).is_absolute()
        or any(segment in {"", ".", ".."} for segment in segments)
    ):
        return f"unsafe pytest path: {value}"
    if segments[0] != "tests":
        return f"pytest path outside allowed directories: {value}"
    return None
