from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cubic3_dp_cli.client import Cubic3DpError

CONFIG_VERSION = 1
DEFAULT_PROFILE = "default"
DEFAULT_BASE_URL = "http://localhost:5000"


@dataclass(frozen=True)
class CliProfile:
    name: str
    base_url: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    access_expires_at: str | None = None
    refresh_expires_at: str | None = None
    api_key: str | None = None
    auth_type: str | None = None
    updated_at: str | None = None


class CliConfigStore:
    """管理 CLI 本地配置。

    配置里可能包含 token pair / api key，因此创建时强制使用 0600 权限。
    """

    def __init__(self, path: Path):
        self.path = path

    @classmethod
    def from_env(cls, explicit_path: str | None = None) -> "CliConfigStore":
        configured = explicit_path or os.getenv("CUBIC3_DP_CONFIG")
        if configured:
            return cls(Path(configured).expanduser())
        config_home = Path(os.getenv("XDG_CONFIG_HOME", "~/.config")).expanduser()
        return cls(config_home / "cubic3-dp" / "config.json")

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": CONFIG_VERSION, "active_profile": DEFAULT_PROFILE, "profiles": {}}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise Cubic3DpError(f"CLI 配置文件解析失败: {self.path}: {exc}") from exc
        if not isinstance(data, dict):
            raise Cubic3DpError(f"CLI 配置文件格式错误: {self.path}")
        data.setdefault("version", CONFIG_VERSION)
        data.setdefault("active_profile", DEFAULT_PROFILE)
        data.setdefault("profiles", {})
        if not isinstance(data["profiles"], dict):
            raise Cubic3DpError(f"CLI 配置 profiles 必须是 object: {self.path}")
        return data

    def active_profile_name(self, explicit_profile: str | None = None) -> str:
        if explicit_profile:
            return explicit_profile
        return str(self.load().get("active_profile") or DEFAULT_PROFILE)

    def get_profile(self, profile_name: str | None = None) -> CliProfile:
        data = self.load()
        name = profile_name or str(data.get("active_profile") or DEFAULT_PROFILE)
        raw = data.get("profiles", {}).get(name, {})
        if not isinstance(raw, dict):
            raw = {}
        return CliProfile(
            name=name,
            base_url=_string_or_none(raw.get("base_url")),
            access_token=_string_or_none(raw.get("access_token")),
            refresh_token=_string_or_none(raw.get("refresh_token")),
            access_expires_at=_string_or_none(raw.get("access_expires_at")),
            refresh_expires_at=_string_or_none(raw.get("refresh_expires_at")),
            api_key=_string_or_none(raw.get("api_key")),
            auth_type=_string_or_none(raw.get("auth_type")),
            updated_at=_string_or_none(raw.get("updated_at")),
        )

    def save_auth(
        self,
        *,
        profile_name: str,
        base_url: str,
        access_token: str | None = None,
        refresh_token: str | None = None,
        access_expires_at: str | None = None,
        refresh_expires_at: str | None = None,
        api_key: str | None = None,
        auth_type: str,
    ) -> CliProfile:
        data = self.load()
        profiles = data.setdefault("profiles", {})
        current = profiles.get(profile_name, {})
        if not isinstance(current, dict):
            current = {}
        current.update(
            {
                "base_url": base_url,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "access_expires_at": access_expires_at,
                "refresh_expires_at": refresh_expires_at,
                "api_key": api_key,
                "auth_type": auth_type,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        profiles[profile_name] = current
        data["active_profile"] = profile_name
        self._write(data)
        return self.get_profile(profile_name)

    def clear_auth(self, *, profile_name: str) -> CliProfile:
        data = self.load()
        profiles = data.setdefault("profiles", {})
        current = profiles.get(profile_name, {})
        if not isinstance(current, dict):
            current = {}
        current.pop("access_token", None)
        current.pop("refresh_token", None)
        current.pop("access_expires_at", None)
        current.pop("refresh_expires_at", None)
        current.pop("api_key", None)
        current["auth_type"] = None
        current["updated_at"] = datetime.now(timezone.utc).isoformat()
        profiles[profile_name] = current
        data["active_profile"] = profile_name
        self._write(data)
        return self.get_profile(profile_name)

    def _write(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        try:
            self.path.chmod(0o600)
        except OSError:
            # Windows 或受限文件系统上 chmod 可能不可用；不影响 CLI 主路径。
            pass


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
