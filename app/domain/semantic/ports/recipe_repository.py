from abc import ABC, abstractmethod
from typing import List

from app.domain.semantic.entities import RecipeDefinition


class IRecipeRepository(ABC):

    @abstractmethod
    def list_all(self) -> List[RecipeDefinition]: ...

    @abstractmethod
    def get_by_cube(self, cube_name: str) -> List[RecipeDefinition]:
        """返回 DSL 中引用了指定 Cube/View 的 Recipe，按相关度排序，最多 5 个"""
        ...

    @abstractmethod
    def save(self, recipe: RecipeDefinition) -> None: ...

    @abstractmethod
    def delete(self, name: str) -> bool: ...
