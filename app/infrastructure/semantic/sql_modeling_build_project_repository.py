"""SQL 驱动的语义建设 Build Project 仓储。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.domain.semantic.modeling_build_project import (
    ModelingAssetPackage,
    ModelingBuildProject,
)
from app.domain.semantic.ports.modeling_build_project_repository import (
    IModelingBuildProjectRepository,
)
from app.infrastructure.semantic.models import (
    SemanticModelingAssetPackageORM,
    SemanticModelingBuildProjectORM,
)


class SqlModelingBuildProjectRepository(IModelingBuildProjectRepository):
    """生产用 Build Project 仓储，不使用进程内缓存。"""

    def __init__(self, session: Session):
        self.session = session

    def get_project(self, project_id: str) -> Optional[ModelingBuildProject]:
        row = (
            self.session.query(SemanticModelingBuildProjectORM)
            .filter_by(id=project_id)
            .first()
        )
        return ModelingBuildProject(**dict(row.payload_json or {})) if row else None

    def save_project(self, project: ModelingBuildProject) -> None:
        self._upsert_project_row(project)
        self.session.commit()

    def list_projects(
        self,
        principal_id: str | None = None,
        *,
        limit: int = 50,
    ) -> List[ModelingBuildProject]:
        query = self.session.query(SemanticModelingBuildProjectORM)
        if principal_id is not None:
            query = query.filter(SemanticModelingBuildProjectORM.created_by == principal_id)
        rows = (
            query.order_by(SemanticModelingBuildProjectORM.updated_at.desc())
            .limit(limit)
            .all()
        )
        return [ModelingBuildProject(**dict(row.payload_json or {})) for row in rows]

    def get_package(self, package_id: str) -> Optional[ModelingAssetPackage]:
        row = (
            self.session.query(SemanticModelingAssetPackageORM)
            .filter_by(id=package_id)
            .first()
        )
        return ModelingAssetPackage(**dict(row.payload_json or {})) if row else None

    def list_packages(self, project_id: str) -> List[ModelingAssetPackage]:
        rows = (
            self.session.query(SemanticModelingAssetPackageORM)
            .filter_by(project_id=project_id)
            .order_by(SemanticModelingAssetPackageORM.updated_at.desc())
            .all()
        )
        return [ModelingAssetPackage(**dict(row.payload_json or {})) for row in rows]

    def save_package(self, package: ModelingAssetPackage) -> None:
        self._upsert_package_row(package)
        self.session.commit()

    def save_scan_result(
        self,
        project: ModelingBuildProject,
        packages: List[ModelingAssetPackage],
    ) -> None:
        try:
            for package in packages:
                self._upsert_package_row(package)
            self._upsert_project_row(project)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

    def _upsert_project_row(self, project: ModelingBuildProject) -> None:
        project.touch()
        row = (
            self.session.query(SemanticModelingBuildProjectORM)
            .filter_by(id=project.id)
            .first()
        )
        if row is None:
            row = SemanticModelingBuildProjectORM(id=project.id)
            self.session.add(row)
        elif row.created_by and project.created_by != row.created_by:
            raise PermissionError("Build Project ID 已被其他用户占用")
        row.created_by = project.created_by
        row.status = project.status
        row.payload_json = project.model_dump(mode="json")
        row.version = int(row.version or 0) + 1

    def _upsert_package_row(self, package: ModelingAssetPackage) -> None:
        package.touch()
        row = (
            self.session.query(SemanticModelingAssetPackageORM)
            .filter_by(id=package.id)
            .first()
        )
        if row is None:
            row = SemanticModelingAssetPackageORM(
                id=package.id,
                project_id=package.project_id,
            )
            self.session.add(row)
        elif row.project_id != package.project_id:
            raise PermissionError("Asset Package ID 已被其他项目占用")
        row.project_id = package.project_id
        row.status = package.status
        row.risk = package.risk
        row.payload_json = package.model_dump(mode="json")
        row.version = int(row.version or 0) + 1
