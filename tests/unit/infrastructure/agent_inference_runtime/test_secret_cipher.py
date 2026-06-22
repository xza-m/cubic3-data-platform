"""最小 secret 存储:Fernet 加解密 + RuntimeConfigService 解密接线测试。"""
from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.domain.agent_inference_runtime.types import RuntimeProviderConfigSnapshot
from app.infrastructure.agent_inference_runtime import secret_cipher


@pytest.fixture
def secret_key(monkeypatch):
    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv("AI_SECRET_KEY", key)
    return key


class _DbOverrideRepo:
    """只返回一条 db 密文 override 的伪仓储。"""

    def __init__(self, snapshot):
        self._snapshot = snapshot

    def get_provider_config(self, runtime_name):
        return self._snapshot if runtime_name == self._snapshot.runtime_name else None


class TestSecretCipher:
    def test_round_trip(self, secret_key):
        token = secret_cipher.encrypt_secret("sk-real-key")
        assert token != "sk-real-key"
        assert secret_cipher.decrypt_secret(token) == "sk-real-key"

    def test_encrypt_without_key_raises(self, monkeypatch):
        monkeypatch.delenv("AI_SECRET_KEY", raising=False)
        with pytest.raises(secret_cipher.SecretCipherError):
            secret_cipher.encrypt_secret("sk-real-key")

    def test_decrypt_without_key_returns_empty(self, monkeypatch):
        monkeypatch.delenv("AI_SECRET_KEY", raising=False)
        assert secret_cipher.decrypt_secret("anything") == ""

    def test_decrypt_empty_returns_empty(self, secret_key):
        assert secret_cipher.decrypt_secret(None) == ""
        assert secret_cipher.decrypt_secret("") == ""


class TestRuntimeConfigServiceDecryption:
    def test_management_config_decrypts_db_secret(self, secret_key):
        snapshot = RuntimeProviderConfigSnapshot(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.test/v1",
            model="gpt-4o",
            secret_ref="db",
            secret_ciphertext=secret_cipher.encrypt_secret("sk-db-stored"),
            extra={},
            updated_by="alice",
            updated_at=None,
        )
        service = RuntimeConfigService(
            repository=_DbOverrideRepo(snapshot),
            openai_config={"api_key": "sk-env-bootstrap", "api_base": "", "model": ""},
            codex_config={},
        )

        cfg = service.management_config("openai_compatible")

        # DB 密文优先于 env bootstrap
        assert cfg["api_key"] == "sk-db-stored"
        assert cfg["api_base"] == "https://api.openai.test/v1"
        assert cfg["model"] == "gpt-4o"

    def test_public_dict_masks_db_secret(self, secret_key):
        snapshot = RuntimeProviderConfigSnapshot(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint=None,
            model=None,
            secret_ref="db",
            secret_ciphertext=secret_cipher.encrypt_secret("sk-db-stored"),
            extra={},
            updated_by="alice",
            updated_at=None,
        )
        public = snapshot.to_public_dict()
        assert public["api_key"] == "********"
        assert "secret_ciphertext" not in public
