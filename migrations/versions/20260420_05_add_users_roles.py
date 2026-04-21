"""add users / roles / permissions tables (W4.D-2)

Revision ID: 20260420_05
Revises: 20260420_04
Create Date: 2026-04-20

Plan: docs/superpowers/plans/2026-04-20-platform-redesign-rollout-implementation.md
      §W4.D-2 (Users / Roles backend CRUD)

建表：
    users / roles / user_roles / user_passwords

种子：
    - 角色 ``admin``  (拥有全部权限) ✶ is_system=True
    - 角色 ``viewer`` (只读权限)     ✶ is_system=True
    - bootstrap 用户 ``admin`` ✶ is_system=True
      密码默认从 env ``ADMIN_DEFAULT_PASSWORD`` 取值，否则使用 ``"admin123"``
"""
from __future__ import annotations

import os
from datetime import datetime

import bcrypt
import sqlalchemy as sa
from alembic import op


revision = "20260420_05"
down_revision = "20260420_04"
branch_labels = None
depends_on = None


_ALL_PERMISSIONS = [
    "datasource:read",
    "datasource:write",
    "dataset:read",
    "dataset:write",
    "data:read",
    "data:write",
    "query:read",
    "query:write",
    "semantic:read",
    "semantic:write",
    "ontology:read",
    "ontology:write",
    "users:manage",
    "roles:manage",
]

_VIEWER_PERMISSIONS = [
    "datasource:read",
    "dataset:read",
    "data:read",
    "query:read",
    "semantic:read",
    "ontology:read",
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("username", sa.String(length=64), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="active",
            ),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("username", name="uq_users_username"),
        )
        op.create_index("idx_users_status", "users", ["status"])

    if "roles" not in existing:
        op.create_table(
            "roles",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "permissions",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            ),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("code", name="uq_roles_code"),
        )

    if "user_roles" not in existing:
        op.create_table(
            "user_roles",
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("role_id", sa.BigInteger(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("user_id", "role_id"),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE",
                name="fk_user_roles_user",
            ),
            sa.ForeignKeyConstraint(
                ["role_id"], ["roles.id"], ondelete="CASCADE",
                name="fk_user_roles_role",
            ),
            sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        )

    if "user_passwords" not in existing:
        op.create_table(
            "user_passwords",
            sa.Column("user_id", sa.BigInteger(), primary_key=True),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE",
                name="fk_user_passwords_user",
            ),
        )

    # ------------------------------------------------------------------
    # 种子数据
    # ------------------------------------------------------------------

    # SQLAlchemy core 表对象（避免依赖 ORM）
    roles_t = sa.table(
        "roles",
        sa.column("id", sa.BigInteger),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("permissions", sa.JSON),
        sa.column("is_system", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    users_t = sa.table(
        "users",
        sa.column("id", sa.BigInteger),
        sa.column("username", sa.String),
        sa.column("display_name", sa.String),
        sa.column("email", sa.String),
        sa.column("status", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    user_roles_t = sa.table(
        "user_roles",
        sa.column("user_id", sa.BigInteger),
        sa.column("role_id", sa.BigInteger),
        sa.column("created_at", sa.DateTime),
    )

    user_passwords_t = sa.table(
        "user_passwords",
        sa.column("user_id", sa.BigInteger),
        sa.column("password_hash", sa.String),
        sa.column("updated_at", sa.DateTime),
    )

    now = datetime.utcnow()

    # 种子：角色（仅在不存在时插入）
    existing_role_codes = {
        row[0] for row in bind.execute(sa.text("SELECT code FROM roles")).fetchall()
    }

    role_seed = []
    if "admin" not in existing_role_codes:
        role_seed.append(
            {
                "code": "admin",
                "name": "管理员",
                "description": "系统管理员，拥有全部权限",
                "permissions": _ALL_PERMISSIONS,
                "is_system": True,
                "created_at": now,
                "updated_at": now,
            }
        )
    if "viewer" not in existing_role_codes:
        role_seed.append(
            {
                "code": "viewer",
                "name": "只读访客",
                "description": "只读权限，可查看大部分资源",
                "permissions": _VIEWER_PERMISSIONS,
                "is_system": True,
                "created_at": now,
                "updated_at": now,
            }
        )
    if role_seed:
        op.bulk_insert(roles_t, role_seed)

    # 种子：bootstrap 用户 admin
    has_admin = bind.execute(
        sa.text("SELECT 1 FROM users WHERE username = 'admin' LIMIT 1")
    ).fetchone()

    if not has_admin:
        op.bulk_insert(
            users_t,
            [
                {
                    "username": "admin",
                    "display_name": "系统管理员",
                    "email": None,
                    "status": "active",
                    "is_system": True,
                    "created_at": now,
                    "updated_at": now,
                }
            ],
        )

        admin_id = bind.execute(
            sa.text("SELECT id FROM users WHERE username = 'admin' LIMIT 1")
        ).scalar()
        admin_role_id = bind.execute(
            sa.text("SELECT id FROM roles WHERE code = 'admin' LIMIT 1")
        ).scalar()

        plain = os.environ.get("ADMIN_DEFAULT_PASSWORD") or "admin123"
        password_hash = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")

        op.bulk_insert(
            user_passwords_t,
            [
                {
                    "user_id": admin_id,
                    "password_hash": password_hash,
                    "updated_at": now,
                }
            ],
        )
        if admin_role_id is not None:
            op.bulk_insert(
                user_roles_t,
                [{"user_id": admin_id, "role_id": admin_role_id, "created_at": now}],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    for tbl in ("user_roles", "user_passwords", "users", "roles"):
        if tbl in existing:
            op.drop_table(tbl)
