"""语义建设 Build Project 仓储端口。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.modeling_build_project import (
    ModelingAssetPackage,
    ModelingBuildProject,
)


class IModelingBuildProjectRepository(ABC):
    @abstractmethod
    def get_project(self, project_id: str) -> Optional[ModelingBuildProject]:
        ...

    @abstractmethod
    def save_project(self, project: ModelingBuildProject) -> None:
        ...

    @abstractmethod
    def list_projects(
        self,
        principal_id: str | None = None,
        *,
        limit: int = 50,
    ) -> List[ModelingBuildProject]:
        ...

    @abstractmethod
    def get_package(self, package_id: str) -> Optional[ModelingAssetPackage]:
        ...

    @abstractmethod
    def list_packages(self, project_id: str) -> List[ModelingAssetPackage]:
        ...

    @abstractmethod
    def save_package(self, package: ModelingAssetPackage) -> None:
        ...

    @abstractmethod
    def save_scan_result(
        self,
        project: ModelingBuildProject,
        packages: List[ModelingAssetPackage],
    ) -> None:
        ...
