"""Agent Runtime provider 密钥的最小加密存储（内网单机）。

加密用 Fernet，密钥来自 env `AI_SECRET_KEY`（部署生成一次：`python -c "from cryptography.fernet
import Fernet; print(Fernet.generate_key().decode())"`）。未配置密钥时：encrypt 抛错（拒绝明文落库），
decrypt 返回空串（优雅降级，回退到 env/bootstrap 密钥）。
"""
from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


class SecretCipherError(RuntimeError):
    """密钥加密配置缺失或无效。"""


def _fernet() -> Fernet | None:
    key = os.getenv("AI_SECRET_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode("ascii") if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:  # 非法 key 长度/格式
        raise SecretCipherError(f"AI_SECRET_KEY 无效: {exc}") from exc


def encrypt_secret(plaintext: str) -> str:
    cipher = _fernet()
    if cipher is None:
        raise SecretCipherError("AI_SECRET_KEY 未配置，无法加密 API Key")
    return cipher.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    cipher = _fernet()
    if cipher is None:
        return ""
    try:
        return cipher.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""
