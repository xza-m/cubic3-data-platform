from __future__ import annotations

import json

import pytest

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_ws_protocol import (
    CodexJsonRpcCodec,
    CodexWsProtocolError,
    build_initialize_params,
    build_thread_start_params,
    build_turn_start_params,
    decode_provider_run_id,
    encode_provider_run_id,
    map_turn_status,
)


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"message": "review"},
        context_pack={"proposal": {"id": "proposal_1"}},
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_jsonrpc_codec_builds_incrementing_requests_and_parses_response():
    codec = CodexJsonRpcCodec()

    request = codec.request("initialize", {"clientInfo": {"name": "cubic3", "version": "test"}})
    next_request = codec.request("thread/start", {"cwd": "/repo/cubic3"})

    assert request == {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"clientInfo": {"name": "cubic3", "version": "test"}},
    }
    assert next_request["id"] == 2
    assert codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})) == {"ok": True}
    assert codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 2, "result": ["ok"]})) == {"value": ["ok"]}


def test_jsonrpc_codec_raises_provider_error():
    codec = CodexJsonRpcCodec()

    with pytest.raises(CodexWsProtocolError) as exc_info:
        codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "bad"}}))

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"
    assert exc_info.value.details["provider_code"] == -32000


def test_jsonrpc_codec_skips_notifications_and_rejects_unexpected_response_id():
    codec = CodexJsonRpcCodec()

    assert (
        codec.parse_response(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "method": "thread/started",
                    "params": {"threadId": "provider_thread_1"},
                }
            ),
            expected_id=2,
        )
        is None
    )

    with pytest.raises(CodexWsProtocolError) as exc_info:
        codec.parse_response(
            json.dumps({"jsonrpc": "2.0", "id": 99, "result": {"ok": True}}),
            expected_id=2,
        )

    assert exc_info.value.code == "RUNTIME_PROVIDER_RESPONSE_ID_MISMATCH"


def test_jsonrpc_codec_rejects_malformed_response():
    codec = CodexJsonRpcCodec()

    with pytest.raises(CodexWsProtocolError) as exc_info:
        codec.parse_response("{not json")

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"


def test_jsonrpc_codec_rejects_missing_result():
    codec = CodexJsonRpcCodec()

    with pytest.raises(CodexWsProtocolError) as exc_info:
        codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 1}))

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"


def test_protocol_builds_initialize_thread_and_turn_params():
    request = _request()

    initialize = build_initialize_params()
    assert initialize["capabilities"]["experimentalApi"] is True
    assert initialize["capabilities"]["requestAttestation"] is False
    assert initialize["capabilities"]["optOutNotificationMethods"] == []
    thread = build_thread_start_params(
        request.runtime_context_ref,
        project_root="/repo/cubic3",
        runtime_workspace_roots=["/repo/cubic3"],
    )
    assert thread["cwd"] == "/repo/cubic3"
    assert thread["runtimeWorkspaceRoots"] == ["/repo/cubic3"]
    assert thread["approvalPolicy"] == "never"
    assert thread["permissions"] == "read-only"
    assert thread["ephemeral"] is False
    assert thread["sessionStartSource"] == "startup"
    assert thread["experimentalRawEvents"] is True
    assert thread["persistExtendedHistory"] is False
    turn = build_turn_start_params(request, provider_thread_id="thread_provider_1")
    assert turn["threadId"] == "thread_provider_1"
    assert turn["input"][0]["type"] == "text"
    assert "semantic.modeling.review_proposal" in turn["input"][0]["text"]
    assert turn["responsesapiClientMetadata"]["app_id"] == "semantic_modeling"
    assert turn["responsesapiClientMetadata"]["action"] == "semantic.modeling.review_proposal"
    assert turn["responsesapiClientMetadata"]["principal_id"] == "alice"
    text_payload = json.loads(turn["input"][0]["text"])
    assert set(text_payload) == {
        "app",
        "action",
        "principal",
        "input",
        "context",
        "runtime_context",
        "output_schema",
    }
    assert text_payload["app"] == "semantic_modeling"
    assert text_payload["action"] == "semantic.modeling.review_proposal"
    assert text_payload["principal"] == "alice"
    assert text_payload["input"] == {"message": "review"}
    assert text_payload["context"] == {"proposal": {"id": "proposal_1"}}
    assert text_payload["runtime_context"] == {
        "project_id": "cubic3-data-platform",
        "session_id": "session_1",
        "thread_id": "thread_1",
        "turn_id": "turn_1",
    }
    assert text_payload["output_schema"] == "semantic.modeling.review.output.v1"
    assert "app_id" not in text_payload
    assert "principal_id" not in text_payload
    assert "context_pack" not in text_payload
    assert "runtime_context_ref" not in text_payload


def test_provider_run_id_round_trip_and_status_mapping():
    provider_run_id = encode_provider_run_id("thread_provider_1", "turn_provider_1")

    assert "=" not in provider_run_id
    assert decode_provider_run_id(provider_run_id) == ("thread_provider_1", "turn_provider_1")
    assert map_turn_status("completed") == "succeeded"
    assert map_turn_status("inProgress") == "running"
    assert map_turn_status("failed") == "failed"
    assert map_turn_status("interrupted") == "cancelled"
    assert map_turn_status("unknown") == "failed"
