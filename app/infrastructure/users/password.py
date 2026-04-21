# app/infrastructure/users/password.py
"""
密码哈希（W4.D-2）

使用 ``bcrypt`` 直接实现 ``hash`` / ``verify``。bcrypt 已是 cryptographic
工业标准，比 passlib 更轻量。
"""
from __future__ import annotations

import bcrypt


class BcryptHasher:
    """符合 ``PasswordHasher`` Protocol 的实现。"""

    def __init__(self, rounds: int = 12) -> None:
        self.rounds = rounds

    def hash(self, plain: str) -> str:
        if not isinstance(plain, str) or not plain:
            raise ValueError("password 不能为空")
        salt = bcrypt.gensalt(rounds=self.rounds)
        return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")

    def verify(self, plain: str, hashed: str) -> bool:
        if not plain or not hashed:
            return False
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except (ValueError, TypeError):
            return False


__all__ = ["BcryptHasher"]
