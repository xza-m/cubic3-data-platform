"""Agent Runtime provider 密钥的最小加密存储（内网单机）。

加密用 Fernet，密钥来自 env `AI_SECRET_KEY`（部署生成一次：`python -c "from cryptography.fernet
import Fernet; print(Fernet.generate_key().decode())"`）。
- encrypt：未配置 `AI_SECRET_KEY` 时抛错（拒绝明文落库）。
- decrypt：未配置 key 或密文不匹配（典型于 key 轮换）时返回空串并**告警日志**；
  注意 db 路径不回退 env，调用方拿到空串后会落到缺省/缺配置态（见 runtime_config_service._openai_api_key）。
"""
from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


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
        logger.warning(
            "AI_SECRET_KEY 未配置，已存 provider 密钥无法解密；该 provider 密钥将不可用"
        )
        return ""
    try:
        return cipher.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.error(
            "provider 密钥解密失败（疑似 AI_SECRET_KEY 轮换/不匹配），该 provider 密钥不可用",
            ciphertext_len=len(ciphertext),
        )
        return ""
