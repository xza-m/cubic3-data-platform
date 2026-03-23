"""
System Prompt 构建服务

根据信道和上下文信息构建差异化的 System Prompt：
- 飞书信道：加载 SKILL.md，剥离 frontmatter 后用 <skill> 标签包裹注入
- DataChat 信道：直接注入数据集 schema，一步到位生成 SQL
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.application.agent.prompts.templates import (
    FEISHU_SYSTEM_PROMPT,
    DATACHAT_SYSTEM_PROMPT,
)
from app.application.agent.services.knowledge_service import KnowledgeService
from app.domain.agent.entities import AgentContext
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n*", re.DOTALL)


class PromptBuilder:
    """按信道策略构建 System Prompt"""

    def __init__(self, knowledge_service: KnowledgeService):
        self._knowledge = knowledge_service

    def build(self, context: AgentContext, schema_info: dict[str, Any] | None = None) -> str:
        """
        根据信道构建 System Prompt

        Args:
            context: Agent 请求上下文
            schema_info: DataChat 信道的数据集 schema 信息（仅 datachat 需要）

        Returns:
            完整的 System Prompt 字符串
        """
        if context.channel == "feishu":
            return self._build_feishu_prompt()
        elif context.channel == "datachat":
            return self._build_datachat_prompt(schema_info or {})
        else:
            logger.warning("未知信道，使用飞书默认 Prompt", channel=context.channel)
            return self._build_feishu_prompt()

    @staticmethod
    def _parse_skill(raw: str) -> tuple[str, str]:
        """从 SKILL.md 原文中提取 name 和正文（剥离 frontmatter）"""
        m = _FRONTMATTER_RE.match(raw)
        if m:
            frontmatter = m.group(1)
            name_match = re.search(r"^name:\s*(.+)$", frontmatter, re.MULTILINE)
            name = name_match.group(1).strip() if name_match else "unnamed"
            body = raw[m.end():]
            return name, body
        return "unnamed", raw

    def _build_feishu_prompt(self) -> str:
        """飞书信道：加载 SKILL.md，剥离 frontmatter 后用 <skill> 标签包裹"""
        skill_md = self._knowledge.load_skill_md()

        if skill_md:
            name, body = self._parse_skill(skill_md)
            skill_section = f'<skill name="{name}">\n{body}\n</skill>'
        else:
            skill_section = "（Skill 未配置，请直接使用可用工具探索数据。）"

        return FEISHU_SYSTEM_PROMPT.format(
            skill_section=skill_section,
            current_date=date.today().strftime("%Y-%m-%d"),
        )

    def _build_datachat_prompt(self, schema_info: dict[str, Any]) -> str:
        """DataChat 信道：注入数据集 schema"""
        schema_section = self._format_schema(schema_info)
        return DATACHAT_SYSTEM_PROMPT.format(schema_section=schema_section)

    @staticmethod
    def _format_schema(schema_info: dict[str, Any]) -> str:
        """将数据集 schema 格式化为 Prompt 中的文本块"""
        if not schema_info:
            return "（未提供数据集 schema 信息）"

        lines = []
        table_name = schema_info.get("table_name", "unknown")
        source_type = schema_info.get("source_type", "unknown")
        lines.append(f"- 表名：{table_name}")
        lines.append(f"- 数据库类型：{source_type}")
        lines.append("")
        lines.append("字段列表：")

        for col in schema_info.get("fields", []):
            name = col.get("physical_name", col.get("name", "?"))
            dtype = col.get("data_type", col.get("type", "?"))
            desc = col.get("description", col.get("comment", ""))
            line = f"- {name} ({dtype})"
            if desc:
                line += f": {desc}"
            lines.append(line)

        return "\n".join(lines)
