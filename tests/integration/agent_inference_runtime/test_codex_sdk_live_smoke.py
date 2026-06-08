from __future__ import annotations

import os
import time

import pytest

from app.application.agent_inference_runtime.codex_run_service import CodexRunService
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_sdk_client import CodexSdkClient


pytestmark = pytest.mark.skipif(
    os.getenv("AGENT_CODEX_LIVE") != "1",
    reason="set AGENT_CODEX_LIVE=1 to run Codex SDK live smoke",
)


def test_codex_sdk_live_smoke_reports_health_and_capabilities():
    client = _live_client(timeout_default=10)

    health = client.healthcheck()
    capabilities = client.capabilities()

    assert health["status"] == "ready"
    assert health["provider"] == "codex-sdk"
    assert capabilities["provider"] == "codex-sdk"
    assert "semantic.modeling.review_proposal" in capabilities["actions"]


def test_codex_sdk_live_e2e_runs_review_lifecycle_with_thread_events_and_artifacts():
    client = _live_client(timeout_default=90)
    repo = _RunRepo()
    service = CodexRunService(
        client=client,
        repository=repo,
        run_id_factory=lambda: "run_codex_sdk_live_e2e",
    )

    submitted = service.submit(_review_request())

    assert submitted["run_id"] == "run_codex_sdk_live_e2e"
    assert submitted["provider_run_id"].startswith("codex_sdk_run_")
    stored = repo.get_run("run_codex_sdk_live_e2e")
    assert stored is not None
    assert stored.provider_ref["provider"] == "codex-sdk"
    assert stored.provider_ref["provider_thread_id"]

    result = _poll_until_terminal(service, submitted["run_id"], principal_id="codex-live")

    assert result["status"] == "succeeded", result
    provider_ref = result["provider_ref"]
    assert provider_ref["provider"] == "codex-sdk"
    assert provider_ref["provider_thread_id"]
    assert provider_ref["structured_output"]
    assert result["usage"] is not None

    events = service.read_events(submitted["run_id"], principal_id="codex-live")
    event_types = {item.get("event_type") for item in events["items"]}
    assert "run.started" in event_types
    assert "run.succeeded" in event_types

    artifacts = service.collect_artifacts(submitted["run_id"], principal_id="codex-live")
    artifact_types = {item.get("artifact_type") for item in artifacts["items"]}
    assert {"codex_final_response", "codex_thread_items"}.issubset(artifact_types)


class _RunRepo:
    def __init__(self) -> None:
        self._runs: dict[str, AgentInferenceRuntimeRun] = {}

    def save_run(self, run: AgentInferenceRuntimeRun) -> None:
        self._runs[run.run_id] = run

    def get_run(self, run_id: str) -> AgentInferenceRuntimeRun | None:
        return self._runs.get(run_id)


def _live_client(*, timeout_default: int) -> CodexSdkClient:
    project_root = os.getenv("AGENT_CODEX_PROJECT_ROOT", os.getcwd())
    return CodexSdkClient(
        project_root=project_root,
        runtime_workspace_roots=[project_root],
        model=os.getenv("AGENT_CODEX_MODEL") or None,
        sandbox=os.getenv("AGENT_CODEX_SANDBOX", "read-only"),
        codex_path=os.getenv("AGENT_CODEX_PATH") or None,
        base_url=os.getenv("AGENT_CODEX_BASE_URL") or None,
        timeout_seconds=_positive_int(
            os.getenv("AGENT_CODEX_TIMEOUT_SECONDS"),
            default=timeout_default,
        ),
    )


def _review_request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="codex_sdk_live_e2e_session",
            thread_id="codex_sdk_live_e2e_session",
            turn_id="review_live_e2e",
        ),
        principal_id="codex-live",
        input={
            "proposal_id": "proposal_codex_sdk_live_e2e",
            "intent": "review semantic modeling proposal",
        },
        context_pack={
            "session": {
                "id": "codex_sdk_live_e2e_session",
                "user_goal": "查询最近 7 天学生评论数，按学校汇总",
            },
            "proposal": {
                "proposal_id": "proposal_codex_sdk_live_e2e",
                "target": "semantic_center",
            },
            "current_state": {
                "raw_spec": {
                    "cube": {
                        "name": "student_comment_cube",
                        "dimensions": [{"name": "school_name", "expr": "school_name"}],
                        "measures": [{"name": "comment_count", "expr": "COUNT(comment_id)"}],
                    },
                    "ontology": {
                        "object": {"name": "student_comment"},
                        "metrics": [{"name": "student_comment_total_count"}],
                    },
                }
            },
            "validation_summary": [],
        },
        output_schema="semantic.modeling.review_proposal.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=90, allow_network=False),
        preferred_runtime="codex_sdk",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def _poll_until_terminal(
    service: CodexRunService,
    run_id: str,
    *,
    principal_id: str,
) -> dict:
    deadline = time.monotonic() + _positive_int(os.getenv("AGENT_CODEX_E2E_TIMEOUT_SECONDS"), default=90)
    last_result: dict | None = None
    while time.monotonic() < deadline:
        last_result = service.poll(run_id, principal_id=principal_id)
        if last_result["status"] in {"succeeded", "failed", "cancelled", "timeout"}:
            return last_result
        time.sleep(1)

    if last_result is None:
        last_result = service.poll(run_id, principal_id=principal_id)
    try:
        service.cancel(run_id, principal_id=principal_id)
    except Exception:
        pass
    raise AssertionError(f"Codex SDK live E2E did not finish before timeout: {last_result}")


def _positive_int(value: str | None, *, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default
