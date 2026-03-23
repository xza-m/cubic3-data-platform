"""JoinGraph — BFS 最短路径推导 + 歧义消解"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Tuple

from app.domain.semantic.entities import CubeDefinition, JoinDef


MAX_JOIN_DEPTH = 3


class JoinEdge:
    __slots__ = ("source", "target", "join_def")

    def __init__(self, source: str, target: str, join_def: JoinDef):
        self.source = source
        self.target = target
        self.join_def = join_def


class JoinPathTooDeepError(Exception):
    def __init__(self, path: List[str]):
        self.path = path
        super().__init__(f"JOIN path too deep ({len(path)-1} levels, max {MAX_JOIN_DEPTH}): {' → '.join(path)}")


class JoinPathNotFoundError(Exception):
    def __init__(self, source: str, target: str):
        super().__init__(f"No JOIN path from '{source}' to '{target}'")


class JoinGraph:

    def __init__(self, cubes: List[CubeDefinition]):
        self._adj: Dict[str, List[JoinEdge]] = defaultdict(list)
        self._cubes = {c.name: c for c in cubes}
        for cube in cubes:
            for alias, jdef in cube.joins.items():
                edge = JoinEdge(cube.name, jdef.cube, jdef)
                self._adj[cube.name].append(edge)

    def find_path(self, source: str, target: str, context: Optional[str] = None) -> List[JoinEdge]:
        """BFS 最短路径，返回边列表。支持 context 歧义消解。"""
        if source == target:
            return []

        visited: Set[str] = {source}
        queue: deque[Tuple[str, List[JoinEdge]]] = deque([(source, [])])

        while queue:
            node, path = queue.popleft()
            for edge in self._adj.get(node, []):
                if edge.target in visited:
                    continue
                new_path = path + [edge]
                if edge.target == target:
                    if len(new_path) > MAX_JOIN_DEPTH:
                        raise JoinPathTooDeepError([source] + [e.target for e in new_path])
                    return new_path
                visited.add(edge.target)
                queue.append((edge.target, new_path))

        raise JoinPathNotFoundError(source, target)

    def resolve_join_paths(self, cube_names: Set[str], root: Optional[str] = None) -> List[JoinEdge]:
        """给定一组 Cube 名称，推导从 root 到其他所有 Cube 的 JOIN 边。
        root 未指定时选择出度最大的 Cube。"""
        if len(cube_names) <= 1:
            return []

        if root is None:
            root = max(cube_names, key=lambda n: len(self._adj.get(n, [])))

        all_edges: List[JoinEdge] = []
        seen_targets: Set[str] = {root}

        for name in cube_names:
            if name == root or name in seen_targets:
                continue
            path = self.find_path(root, name)
            for edge in path:
                if edge.target not in seen_targets:
                    all_edges.append(edge)
                    seen_targets.add(edge.target)
        return all_edges

    def find_path_through(self, waypoints: List[str]) -> List[JoinEdge]:
        """沿用户指定的 waypoints 序列逐段查找 JOIN 边。

        waypoints = ["answer_records", "student", "school"]
        → answer_records→student 的直连边 + student→school 的直连边

        每对相邻节点必须存在直连 JOIN 定义，否则抛 JoinPathNotFoundError。
        总深度不超过 MAX_JOIN_DEPTH。
        """
        if len(waypoints) < 2:
            return []

        edges: List[JoinEdge] = []
        for i in range(len(waypoints) - 1):
            src, tgt = waypoints[i], waypoints[i + 1]
            edge = self._find_direct_edge(src, tgt)
            if edge is None:
                raise JoinPathNotFoundError(src, tgt)
            edges.append(edge)

        if len(edges) > MAX_JOIN_DEPTH:
            raise JoinPathTooDeepError(waypoints)

        return edges

    def _find_direct_edge(self, source: str, target: str) -> Optional[JoinEdge]:
        """在邻接表中查找 source → target 的直连边。"""
        for edge in self._adj.get(source, []):
            if edge.target == target:
                return edge
        return None

    def get_cube(self, name: str) -> Optional[CubeDefinition]:
        return self._cubes.get(name)
