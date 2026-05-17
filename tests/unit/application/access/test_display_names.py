from __future__ import annotations

from types import SimpleNamespace

from app.application.access.display_names import (
    PrincipalDisplayNameResolver,
    display_name_from_principal,
    is_principal_like,
)


class _Repo:
    def __init__(self, rows, aliases=None):
        self.rows = rows
        self.aliases = aliases or []
        self.requested_ids = None
        self.requested_external_ids = None

    def list_principals_by_ids(self, principal_ids):
        self.requested_ids = list(principal_ids)
        ids = set(self.requested_ids)
        return [row for row in self.rows if row.principal_id in ids]

    def list_aliases_by_external_ids(self, external_ids):
        self.requested_external_ids = list(external_ids)
        return self.aliases


class _FailingRepo:
    def list_principals_by_ids(self, principal_ids):
        raise RuntimeError("access table missing")


def test_display_name_prefers_feishu_name_then_contact_fields():
    assert display_name_from_principal(SimpleNamespace(display_name="张三", email="a@example.com", employee_no="E001")) == "张三"
    assert display_name_from_principal(SimpleNamespace(display_name="", email="a@example.com", employee_no="E001")) == "a@example.com"
    assert display_name_from_principal(SimpleNamespace(display_name="", email="", employee_no="E001")) == "E001"


def test_resolver_only_resolves_principal_like_ids_without_duplicates():
    row = SimpleNamespace(principal_id="feishu:tenant:on_001", display_name="张三", email=None, employee_no=None)
    repo = _Repo([row])
    resolver = PrincipalDisplayNameResolver(repo)

    result = resolver.resolve_many([
        "feishu:tenant:on_001",
        "feishu:tenant:on_001",
        "plain-user",
        "",
        None,
    ])

    assert is_principal_like("feishu:tenant:on_001") is True
    assert is_principal_like("plain-user") is False
    assert repo.requested_ids == ["feishu:tenant:on_001"]
    assert result == {"feishu:tenant:on_001": "张三"}


def test_resolver_can_resolve_raw_feishu_external_id_through_alias():
    row = SimpleNamespace(principal_id="feishu:tenant:on_001", display_name="张三", email=None, employee_no=None)
    alias = SimpleNamespace(principal_id="feishu:tenant:on_001", external_id="ou_001")
    repo = _Repo([row], aliases=[alias])
    resolver = PrincipalDisplayNameResolver(repo)

    result = resolver.resolve_many(["ou_001"])

    assert repo.requested_external_ids == ["ou_001"]
    assert result == {"ou_001": "张三"}


def test_resolver_returns_empty_mapping_when_access_tables_are_unavailable():
    resolver = PrincipalDisplayNameResolver(_FailingRepo())

    assert resolver.resolve_many(["feishu:tenant:on_001"]) == {}
