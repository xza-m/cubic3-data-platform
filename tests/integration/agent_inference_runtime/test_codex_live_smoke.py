from __future__ import annotations

import os

import pytest


@pytest.mark.skipif(
    os.getenv("AGENT_CODEX_LIVE") != "1",
    reason="set AGENT_CODEX_LIVE=1 to run live Codex smoke",
)
def test_codex_live_smoke_requires_endpoint_or_unix_socket():
    assert os.getenv("AGENT_CODEX_ENDPOINT") or os.getenv("AGENT_CODEX_UNIX_SOCKET")
