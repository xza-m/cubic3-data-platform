"""Access Identity SQL 仓储。"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.infrastructure.access.models import (
    AccessApiKeyORM,
    AccessDelegationEventORM,
    AccessPrincipalAliasORM,
    AccessPrincipalORM,
    AccessPrincipalScopeORM,
    AccessRoleBindingORM,
    AccessServicePrincipalORM,
)
from app.shared.utils.time import utcnow


class SqlAccessRepository:
    """统一身份治理仓储，保持 ORM 细节在基础设施层。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # Principal / Alias
    # ------------------------------------------------------------------

    def get_principal(self, principal_id: str) -> Optional[AccessPrincipalORM]:
        return self.session.get(AccessPrincipalORM, principal_id)

    def list_principals_by_ids(self, principal_ids: Iterable[str]) -> list[AccessPrincipalORM]:
        ids = [str(item).strip() for item in principal_ids if str(item or "").strip()]
        if not ids:
            return []
        return (
            self.session.query(AccessPrincipalORM)
            .filter(AccessPrincipalORM.principal_id.in_(ids))
            .all()
        )

    def list_aliases_by_external_ids(self, external_ids: Iterable[str]) -> list[AccessPrincipalAliasORM]:
        ids = [str(item).strip() for item in external_ids if str(item or "").strip()]
        if not ids:
            return []
        return (
            self.session.query(AccessPrincipalAliasORM)
            .filter(
                AccessPrincipalAliasORM.external_id.in_(ids),
                AccessPrincipalAliasORM.status == "active",
            )
            .all()
        )

    def find_alias(
        self,
        *,
        idp: str,
        tenant_key: str,
        external_id_type: str,
        external_id: str,
    ) -> Optional[AccessPrincipalAliasORM]:
        return (
            self.session.query(AccessPrincipalAliasORM)
            .filter(
                AccessPrincipalAliasORM.idp == idp,
                AccessPrincipalAliasORM.tenant_key == tenant_key,
                AccessPrincipalAliasORM.external_id_type == external_id_type,
                AccessPrincipalAliasORM.external_id == external_id,
                AccessPrincipalAliasORM.status == "active",
            )
            .first()
        )

    def upsert_principal(
        self,
        *,
        principal_id: str,
        principal_type: str,
        idp: str,
        tenant_key: str,
        display_name: str | None = None,
        email: str | None = None,
        employee_no: str | None = None,
        status: str = "active",
        raw_profile: dict[str, Any] | None = None,
    ) -> AccessPrincipalORM:
        row = self.get_principal(principal_id)
        if row is None:
            row = AccessPrincipalORM(
                principal_id=principal_id,
                principal_type=principal_type,
                idp=idp,
                tenant_key=tenant_key,
                status=status,
            )
            self.session.add(row)
        row.display_name = display_name or row.display_name
        row.email = email or row.email
        row.employee_no = employee_no or row.employee_no
        row.raw_profile = raw_profile or row.raw_profile or {}
        row.status = status or row.status
        row.last_seen_at = utcnow()
        row.updated_at = utcnow()
        self.session.flush()
        return row

    def upsert_alias(
        self,
        *,
        principal_id: str,
        idp: str,
        tenant_key: str,
        external_id_type: str,
        external_id: str,
        status: str = "active",
    ) -> AccessPrincipalAliasORM:
        row = self.find_alias(
            idp=idp,
            tenant_key=tenant_key,
            external_id_type=external_id_type,
            external_id=external_id,
        )
        if row is None:
            row = AccessPrincipalAliasORM(
                principal_id=principal_id,
                idp=idp,
                tenant_key=tenant_key,
                external_id_type=external_id_type,
                external_id=external_id,
                status=status,
            )
            self.session.add(row)
        else:
            row.principal_id = principal_id
            row.status = status
        self.session.flush()
        return row

    def list_aliases(self, principal_id: str) -> list[AccessPrincipalAliasORM]:
        return (
            self.session.query(AccessPrincipalAliasORM)
            .filter(AccessPrincipalAliasORM.principal_id == principal_id)
            .order_by(AccessPrincipalAliasORM.id.asc())
            .all()
        )

    def list_principals(
        self,
        *,
        principal_type: str | None = None,
        tenant_key: str | None = None,
        status: str | None = None,
        q: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AccessPrincipalORM], int]:
        query = self.session.query(AccessPrincipalORM)
        if principal_type:
            query = query.filter(AccessPrincipalORM.principal_type == principal_type)
        if tenant_key:
            query = query.filter(AccessPrincipalORM.tenant_key == tenant_key)
        if status:
            query = query.filter(AccessPrincipalORM.status == status)
        if q:
            keyword = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    AccessPrincipalORM.principal_id.like(keyword),
                    AccessPrincipalORM.display_name.like(keyword),
                    AccessPrincipalORM.email.like(keyword),
                    AccessPrincipalORM.employee_no.like(keyword),
                )
            )
        total = query.count()
        rows = (
            query.order_by(AccessPrincipalORM.created_at.desc(), AccessPrincipalORM.principal_id.asc())
            .offset((max(page, 1) - 1) * max(page_size, 1))
            .limit(max(page_size, 1))
            .all()
        )
        return rows, total

    # ------------------------------------------------------------------
    # Service principal / API Key
    # ------------------------------------------------------------------

    def get_service_principal(self, principal_id: str) -> Optional[AccessServicePrincipalORM]:
        return self.session.get(AccessServicePrincipalORM, principal_id)

    def upsert_service_principal(
        self,
        *,
        principal_id: str,
        service_type: str,
        owner_principal_id: str,
        owner_team: str | None = None,
        description: str | None = None,
        allowed_tenants: list[str] | None = None,
        delegation_rules: dict[str, Any] | None = None,
        status: str = "active",
    ) -> AccessServicePrincipalORM:
        row = self.get_service_principal(principal_id)
        if row is None:
            row = AccessServicePrincipalORM(
                principal_id=principal_id,
                service_type=service_type,
                owner_principal_id=owner_principal_id,
            )
            self.session.add(row)
        row.owner_team = owner_team
        row.description = description
        row.allowed_tenants = list(allowed_tenants or [])
        row.delegation_rules = dict(delegation_rules or {})
        row.status = status
        row.updated_at = utcnow()
        self.session.flush()
        return row

    def list_service_principals(self) -> list[AccessServicePrincipalORM]:
        return (
            self.session.query(AccessServicePrincipalORM)
            .order_by(AccessServicePrincipalORM.created_at.desc())
            .all()
        )

    def add_api_key(self, row: AccessApiKeyORM) -> AccessApiKeyORM:
        self.session.add(row)
        self.session.flush()
        return row

    def get_api_key(self, key_id: str) -> Optional[AccessApiKeyORM]:
        return self.session.get(AccessApiKeyORM, key_id)

    def list_api_keys_for_principal(self, principal_id: str) -> list[AccessApiKeyORM]:
        return (
            self.session.query(AccessApiKeyORM)
            .filter(AccessApiKeyORM.principal_id == principal_id)
            .order_by(AccessApiKeyORM.created_at.desc())
            .all()
        )

    def touch_api_key(self, key: AccessApiKeyORM) -> None:
        key.last_used_at = utcnow()
        key.usage_count = int(key.usage_count or 0) + 1
        self.session.flush()

    # ------------------------------------------------------------------
    # Role binding / audit
    # ------------------------------------------------------------------

    def replace_principal_role_bindings(
        self,
        *,
        principal_id: str,
        bindings: Iterable[dict[str, Any]],
        created_by: str | None = None,
    ) -> list[AccessRoleBindingORM]:
        subject_key = f"principal:{principal_id}"
        self.session.query(AccessRoleBindingORM).filter(
            AccessRoleBindingORM.subject_type == "principal",
            AccessRoleBindingORM.subject_key == subject_key,
        ).delete()
        rows: list[AccessRoleBindingORM] = []
        for item in bindings:
            row = AccessRoleBindingORM(
                subject_type="principal",
                subject_key=subject_key,
                role_code=str(item.get("role_code") or "").strip(),
                role_type=str(item.get("role_type") or "platform").strip(),
                source=str(item.get("source") or "manual").strip(),
                effective_from=item.get("effective_from"),
                effective_to=item.get("effective_to"),
                status=str(item.get("status") or "active").strip(),
                created_by=created_by,
            )
            if not row.role_code:
                continue
            rows.append(row)
            self.session.add(row)
        self.session.flush()
        return rows

    def list_role_bindings_for_subjects(self, subject_keys: list[str]) -> list[AccessRoleBindingORM]:
        if not subject_keys:
            return []
        return (
            self.session.query(AccessRoleBindingORM)
            .filter(
                AccessRoleBindingORM.subject_key.in_(subject_keys),
                AccessRoleBindingORM.status == "active",
            )
            .order_by(AccessRoleBindingORM.id.asc())
            .all()
        )

    def list_role_bindings_for_principal(self, principal_id: str) -> list[AccessRoleBindingORM]:
        return (
            self.session.query(AccessRoleBindingORM)
            .filter(AccessRoleBindingORM.subject_key == f"principal:{principal_id}")
            .order_by(AccessRoleBindingORM.id.asc())
            .all()
        )

    def list_active_principal_role_bindings_by_role(self, role_code: str) -> list[AccessRoleBindingORM]:
        return (
            self.session.query(AccessRoleBindingORM)
            .filter(
                AccessRoleBindingORM.subject_type == "principal",
                AccessRoleBindingORM.role_code == role_code,
                AccessRoleBindingORM.status == "active",
            )
            .order_by(AccessRoleBindingORM.created_at.desc(), AccessRoleBindingORM.id.asc())
            .all()
        )

    def ensure_role_binding(
        self,
        *,
        subject_type: str,
        subject_key: str,
        role_code: str,
        role_type: str,
        source: str = "manual",
        created_by: str | None = None,
    ) -> AccessRoleBindingORM:
        row = (
            self.session.query(AccessRoleBindingORM)
            .filter(
                AccessRoleBindingORM.subject_type == subject_type,
                AccessRoleBindingORM.subject_key == subject_key,
                AccessRoleBindingORM.role_code == role_code,
                AccessRoleBindingORM.role_type == role_type,
                AccessRoleBindingORM.effective_from.is_(None),
                AccessRoleBindingORM.effective_to.is_(None),
            )
            .first()
        )
        if row is None:
            row = AccessRoleBindingORM(
                subject_type=subject_type,
                subject_key=subject_key,
                role_code=role_code,
                role_type=role_type,
                source=source,
                status="active",
                created_by=created_by,
            )
            self.session.add(row)
        else:
            row.status = "active"
            row.source = source or row.source
            row.created_by = created_by or row.created_by
        self.session.flush()
        return row

    # ------------------------------------------------------------------
    # Principal data scope（RLS row_scope 取值来源）
    # ------------------------------------------------------------------

    def list_principal_scopes(self, principal_id: str) -> list[AccessPrincipalScopeORM]:
        return (
            self.session.query(AccessPrincipalScopeORM)
            .filter(AccessPrincipalScopeORM.principal_id == principal_id)
            .order_by(AccessPrincipalScopeORM.attribute.asc(), AccessPrincipalScopeORM.source.asc())
            .all()
        )

    def replace_principal_scopes(
        self,
        *,
        principal_id: str,
        source: str,
        scopes: Iterable[dict[str, Any]],
        created_by: str | None = None,
        synced_at=None,
    ) -> list[AccessPrincipalScopeORM]:
        """整体替换某 principal 在指定 source 下的 scope 配置。"""

        self.session.query(AccessPrincipalScopeORM).filter(
            AccessPrincipalScopeORM.principal_id == principal_id,
            AccessPrincipalScopeORM.source == source,
        ).delete()
        rows: list[AccessPrincipalScopeORM] = []
        for item in scopes:
            attribute = str(item.get("attribute") or "").strip()
            if not attribute:
                continue
            values = [
                str(value).strip()
                for value in (item.get("values") or [])
                if str(value or "").strip()
            ]
            row = AccessPrincipalScopeORM(
                principal_id=principal_id,
                attribute=attribute,
                values=values,
                source=source,
                synced_at=synced_at or utcnow(),
                created_by=created_by,
            )
            rows.append(row)
            self.session.add(row)
        self.session.flush()
        return rows

    def resolve_principal_data_scopes(self, principal_id: str) -> dict[str, list[str]]:
        """合并各来源的 scope，返回 attribute → 去重值列表。"""

        merged: dict[str, list[str]] = {}
        for row in self.list_principal_scopes(principal_id):
            bucket = merged.setdefault(row.attribute, [])
            for value in row.values or []:
                item = str(value or "").strip()
                if item and item not in bucket:
                    bucket.append(item)
        return merged

    def add_delegation_event(
        self,
        *,
        actor_principal_id: str,
        delegated_principal_id: str | None,
        tenant_key: str | None,
        message_id: str | None,
        chat_id: str | None,
        event_id: str | None,
        endpoint: str | None,
        decision: str,
        reason: str | None,
    ) -> None:
        self.session.add(
            AccessDelegationEventORM(
                actor_principal_id=actor_principal_id,
                delegated_principal_id=delegated_principal_id,
                tenant_key=tenant_key,
                message_id=message_id,
                chat_id=chat_id,
                event_id=event_id,
                endpoint=endpoint,
                decision=decision,
                reason=reason,
            )
        )
        self.session.flush()

    def commit(self) -> None:
        self.session.commit()
