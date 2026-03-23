"""
知识文档加载服务

负责从 knowledge/ 目录读取 Markdown 知识文档，
供 read_knowledge 工具和 PromptBuilder 使用。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_KNOWLEDGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "knowledge"
)


class KnowledgeService:
    """知识文档读取服务（渐进式知识加载的基础）"""

    def __init__(self, knowledge_dir: str | None = None):
        self._base = Path(knowledge_dir or DEFAULT_KNOWLEDGE_DIR)

    def read(self, relative_path: str) -> str:
        """
        读取指定路径的知识文档内容

        Args:
            relative_path: 相对于 knowledge/ 的路径，如 "domains/study/dwd-answer-records.md"

        Returns:
            文档内容（Markdown 文本）

        Raises:
            FileNotFoundError: 文档不存在
        """
        target = (self._base / relative_path).resolve()

        # 安全校验：防止路径穿越
        if not str(target).startswith(str(self._base.resolve())):
            raise FileNotFoundError(f"非法路径: {relative_path}")

        if not target.is_file():
            raise FileNotFoundError(f"知识文档不存在: {relative_path}")

        content = target.read_text(encoding="utf-8")
        logger.info("加载知识文档", path=relative_path, size=len(content))
        return content

    def load_skill_md(self) -> str:
        """
        加载 SKILL.md（路由表文档）

        Returns:
            SKILL.md 内容，不存在时返回空字符串
        """
        skill_path = self._base / "SKILL.md"
        if not skill_path.is_file():
            logger.warning("SKILL.md 不存在", dir=str(self._base))
            return ""
        return skill_path.read_text(encoding="utf-8")

    def search(self, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        """
        在所有知识文档中搜索关键词，返回匹配的文件路径和上下文片段。

        Args:
            query: 搜索词，多个词用空格分隔（任一命中即匹配）
            max_results: 最多返回的文档数

        Returns:
            按匹配数降序排列的结果列表，每项含 path / title / matches
        """
        if not self._base.is_dir():
            return []

        keywords = [kw.lower() for kw in query.split() if kw.strip()]
        if not keywords:
            return []

        _SKIP = {"SKILL.md", "README.md"}
        scored: list[tuple[int, dict[str, Any]]] = []

        for path in self._base.rglob("*.md"):
            if path.name in _SKIP:
                continue

            rel = str(path.relative_to(self._base))
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except Exception:
                continue

            title = ""
            for ln in lines:
                stripped = ln.strip().lstrip("#").strip()
                if stripped:
                    title = stripped
                    break

            matches: list[dict[str, Any]] = []
            for idx, line in enumerate(lines, 1):
                lower = line.lower()
                if any(kw in lower for kw in keywords):
                    matches.append({"line": idx, "text": line.strip()[:120]})

            if matches:
                scored.append((len(matches), {
                    "path": f"knowledge/{rel}",
                    "title": title,
                    "match_count": len(matches),
                    "matches": matches[:6],
                }))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:max_results]]

    def list_documents(self) -> list[dict[str, Any]]:
        """列出所有可用的知识文档"""
        docs = []
        if not self._base.is_dir():
            return docs

        for path in sorted(self._base.rglob("*.md")):
            rel = path.relative_to(self._base)
            docs.append({
                "path": str(rel),
                "size": path.stat().st_size,
            })
        return docs
