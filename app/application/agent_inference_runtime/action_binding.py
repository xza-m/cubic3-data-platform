"""Agent action 到 runtime 的平台级绑定策略。"""
from __future__ import annotations

from app.domain.agent_inference_runtime.types import RuntimeActionBinding, RuntimeName


class ActionRuntimeBindingRegistry:
    """集中维护业务 action 的 runtime 策略，避免前端和业务服务各自判断。"""

    _FIXED_OPENAI_ACTIONS = {
        "asset.field.infer_semantics",
        "semantic.modeling.chat",
        "semantic.modeling.generate_candidates",
        "semantic.modeling.generate_spec",
        "semantic.modeling.preview_candidate",
        "semantic.modeling.explain_fields",
    }
    _FIXED_OPENAI_REASONS = {
        "asset.field.infer_semantics": "asset_field_semantics_low_latency",
    }
    _FIXED_CODEX_ACTIONS = {
        "semantic.modeling.review",
        "semantic.modeling.review_model",
        "semantic.modeling.review_proposal",
        "semantic.modeling.repair",
        "semantic.modeling.repair_cube_mapping",
        "semantic.modeling.repair_validation_failure",
        "semantic.modeling.audit",
        "semantic.modeling.batch_audit",
    }
    _CODEX_ACTION_NAMES = {
        "review",
        "review_proposal",
        "repair",
        "repair_validation_failure",
        "audit",
        "batch_audit",
    }
    _CODEX_ACTION_PREFIXES = ("review_", "repair_", "audit_")
    _EXPERT_ACTIONS = {"semantic.modeling.expert_debug"}
    _VISIBLE_ACTIONS = (
        "asset.field.infer_semantics",
        "semantic.modeling.generate_candidates",
        "semantic.modeling.review_proposal",
        "semantic.modeling.expert_debug",
    )

    def resolve(self, action: str) -> RuntimeActionBinding:
        if action in self._EXPERT_ACTIONS:
            return RuntimeActionBinding(
                action=action,
                default_runtime="openai_compatible",
                allowed_runtimes=["openai_compatible", "codex_sdk"],
                expose_selector=True,
                requires_connection=False,
                reason="expert_runtime_choice",
            )
        if action in self._FIXED_OPENAI_ACTIONS:
            return RuntimeActionBinding(
                action=action,
                default_runtime="openai_compatible",
                allowed_runtimes=["openai_compatible"],
                expose_selector=False,
                requires_connection=False,
                reason=self._FIXED_OPENAI_REASONS.get(action, "fixed_openai_low_latency"),
            )
        if action in self._FIXED_CODEX_ACTIONS or self._is_codex_action(action):
            return RuntimeActionBinding(
                action=action,
                default_runtime="codex_sdk",
                allowed_runtimes=["codex_sdk"],
                expose_selector=False,
                requires_connection=True,
                reason="fixed_codex_workspace",
            )
        return RuntimeActionBinding(
            action=action,
            default_runtime="openai_compatible",
            allowed_runtimes=["openai_compatible"],
            expose_selector=False,
            requires_connection=False,
            reason="fixed_openai_low_latency",
        )

    def visible_bindings(self) -> list[RuntimeActionBinding]:
        return [self.resolve(action) for action in self._VISIBLE_ACTIONS]

    def is_allowed(self, *, action: str, runtime_name: RuntimeName) -> bool:
        return runtime_name in self.resolve(action).allowed_runtimes

    @classmethod
    def _is_codex_action(cls, action: str) -> bool:
        action_name = action.rsplit(".", 1)[-1]
        return action_name in cls._CODEX_ACTION_NAMES or action_name.startswith(
            cls._CODEX_ACTION_PREFIXES
        )
