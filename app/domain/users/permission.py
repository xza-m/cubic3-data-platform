# app/domain/users/permission.py
"""
权限领域实体（W4.D-2）

权限是只读的常量集合：系统启动时种子载入，运行期不允许动态新增。
角色（Role）通过权限码（``"resource:action"``）引用权限。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Permission:
    """权限项（不可变）。"""

    code: str
    description: Optional[str] = None
    id: Optional[int] = None

    def __post_init__(self) -> None:
        if not self.code:
            raise ValueError("permission.code 不能为空")
        if ":" not in self.code:
            raise ValueError("permission.code 必须形如 'resource:action'")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "description": self.description,
        }


SEED_PERMISSIONS: list[Permission] = [
    Permission(code="datasource:read", description="查看数据源"),
    Permission(code="datasource:write", description="创建或修改数据源"),
    Permission(code="dataset:read", description="查看数据集"),
    Permission(code="dataset:write", description="创建或修改数据集"),
    Permission(code="data:read", description="读取数据（执行查询、预览）"),
    Permission(code="data:write", description="写入数据（提取、调度）"),
    Permission(code="query:read", description="查看查询"),
    Permission(code="query:write", description="创建或修改查询"),
    Permission(code="semantic:read", description="查看语义模型"),
    Permission(code="semantic:write", description="创建或修改语义模型"),
    Permission(code="ontology:read", description="查看本体"),
    Permission(code="ontology:write", description="创建或修改本体"),
    Permission(code="users:manage", description="管理用户（创建 / 更新 / 删除）"),
    Permission(code="roles:manage", description="管理角色和权限"),
]


SEED_PERMISSION_CODES: frozenset[str] = frozenset(p.code for p in SEED_PERMISSIONS)
