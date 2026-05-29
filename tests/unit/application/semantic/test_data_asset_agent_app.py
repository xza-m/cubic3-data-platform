from __future__ import annotations

from app.application.semantic.data_asset_agent_app import DataAssetAgentApp


class _RuntimeService:
    def __init__(self):
        self.requests = []

    def invoke(self, request):
        self.requests.append(request)
        return type(
            "Result",
            (),
            {
                "structured_output": {
                    "candidates": [
                        {
                            "field_name": "p75_difficulty",
                            "semantic_role": "metric",
                            "data_type": "decimal",
                        }
                    ]
                }
            },
        )()


def test_infer_field_semantics_uses_asset_context_and_openai_runtime():
    runtime = _RuntimeService()
    app = DataAssetAgentApp(runtime_service=runtime)

    result = app.infer_field_semantics(
        table_id="table_1",
        fields=[
            {
                "name": "p75_difficulty",
                "physical_type": "DECIMAL(10,4)",
                "sample_values": ["0.7500"],
            }
        ],
        principal_id="alice",
    )

    request = runtime.requests[0]
    assert request.app_id == "data_assets"
    assert request.action == "asset.field.infer_semantics"
    assert request.preferred_runtime == "openai_compatible"
    assert request.runtime_context_ref.session_id == "asset_table_table_1"
    assert request.input["fields"][0]["physical_type"] == "DECIMAL(10,4)"
    assert request.asset_revision_refs[0].asset_id == "table_1"
    assert request.asset_revision_refs[0].asset_type == "data_asset_table"
    assert result["candidates"][0]["semantic_role"] == "metric"
