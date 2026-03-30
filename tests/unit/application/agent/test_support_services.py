from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from unittest.mock import patch

from app.application.agent.services.conversation_memory import ConversationMemory
from app.application.agent.services.knowledge_service import KnowledgeService
from app.application.agent.services.prompt_builder import PromptBuilder
from app.domain.agent.entities import AgentContext


def test_knowledge_service_read_and_load_skill_md(tmp_path: Path) -> None:
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    (knowledge_dir / "SKILL.md").write_text("---\nname: data-agent\n---\n正文", encoding="utf-8")
    (knowledge_dir / "domains").mkdir()
    (knowledge_dir / "domains" / "orders.md").write_text("# 订单域\n订单统计", encoding="utf-8")

    service = KnowledgeService(str(knowledge_dir))

    assert service.read("domains/orders.md") == "# 订单域\n订单统计"
    assert "name: data-agent" in service.load_skill_md()


def test_knowledge_service_read_rejects_illegal_or_missing_paths(tmp_path: Path) -> None:
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    service = KnowledgeService(str(knowledge_dir))

    try:
        service.read("../secret.md")
        raise AssertionError("预期非法路径应抛出异常")
    except FileNotFoundError as exc:
        assert "非法路径" in str(exc)

    try:
        service.read("missing.md")
        raise AssertionError("预期缺失文档应抛出异常")
    except FileNotFoundError as exc:
        assert "知识文档不存在" in str(exc)


def test_knowledge_service_search_and_list_documents(tmp_path: Path) -> None:
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    (knowledge_dir / "README.md").write_text("# 索引", encoding="utf-8")
    (knowledge_dir / "SKILL.md").write_text("skill", encoding="utf-8")
    (knowledge_dir / "a.md").write_text("# A 文档\n订单 分析\n订单", encoding="utf-8")
    (knowledge_dir / "b.md").write_text("# B 文档\n分析", encoding="utf-8")

    service = KnowledgeService(str(knowledge_dir))

    results = service.search("订单 分析", max_results=5)
    docs = service.list_documents()

    assert results[0]["path"] == "knowledge/a.md"
    assert results[0]["match_count"] >= results[1]["match_count"]
    assert {item["path"] for item in docs} == {"SKILL.md", "README.md", "a.md", "b.md"}


def test_knowledge_service_load_skill_md_warns_when_missing(tmp_path: Path) -> None:
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    service = KnowledgeService(str(knowledge_dir))

    with patch("app.application.agent.services.knowledge_service.logger") as mock_logger:
        assert service.load_skill_md() == ""

    mock_logger.warning.assert_called_once()


def test_knowledge_service_search_handles_missing_dir_blank_query_and_unreadable_files(tmp_path: Path) -> None:
    service = KnowledgeService(str(tmp_path / "missing"))
    assert service.search("订单") == []
    assert service.list_documents() == []

    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir()
    good = knowledge_dir / "good.md"
    bad = knowledge_dir / "bad.md"
    good.write_text("# Good\n订单", encoding="utf-8")
    bad.write_text("# Bad\n订单", encoding="utf-8")
    service = KnowledgeService(str(knowledge_dir))

    original_read_text = Path.read_text

    def fake_read_text(path_obj: Path, *args, **kwargs):
        if path_obj.name == "bad.md":
            raise UnicodeDecodeError("utf-8", b"x", 0, 1, "bad")
        return original_read_text(path_obj, *args, **kwargs)

    with patch.object(Path, "read_text", autospec=True, side_effect=fake_read_text):
        assert service.search("   ") == []
        results = service.search("订单")

    assert [item["path"] for item in results] == ["knowledge/good.md"]


def test_prompt_builder_builds_feishu_prompt_and_fallback() -> None:
    knowledge = MagicMock()
    knowledge.load_skill_md.return_value = "---\nname: agent-skill\n---\n请先查知识库"
    builder = PromptBuilder(knowledge)

    prompt = builder.build(AgentContext(channel="feishu"))
    fallback_prompt = builder.build(AgentContext(channel="unknown"))

    assert '<skill name="agent-skill">' in prompt
    assert "请先查知识库" in prompt
    assert "智能数据分析 Agent" in fallback_prompt


def test_prompt_builder_builds_datachat_prompt_and_schema_formatting() -> None:
    builder = PromptBuilder(MagicMock())

    prompt = builder.build(
        AgentContext(channel="datachat"),
        schema_info={
            "table_name": "dws_orders",
            "source_type": "postgresql",
            "fields": [
                {"physical_name": "user_id", "data_type": "bigint", "description": "用户 ID"},
                {"name": "order_cnt", "type": "bigint"},
            ],
        },
    )

    assert "表名：dws_orders" in prompt
    assert "数据库类型：postgresql" in prompt
    assert "- user_id (bigint): 用户 ID" in prompt
    assert "- order_cnt (bigint)" in prompt
    assert "只使用 SELECT 查询" in prompt
    assert PromptBuilder._format_schema({}) == "（未提供数据集 schema 信息）"
    assert PromptBuilder._parse_skill("plain body") == ("unnamed", "plain body")


def test_conversation_memory_load_append_clear_cover_happy_and_error_paths() -> None:
    redis_client = MagicMock()
    redis_client.get.side_effect = [
        [{"role": "user", "content": "hi"}],
        [{"role": "user", "content": "u1"} for _ in range(11)],
    ]
    memory = ConversationMemory(redis_client)

    assert memory._key("s1") == "agent:conv:s1"
    assert memory.load("s1") == [{"role": "user", "content": "hi"}]

    memory.append("s1", [{"role": "assistant", "content": "ok"}])
    _, stored_history = redis_client.set.call_args.args[:2]
    assert len(stored_history) == memory.MAX_MESSAGES
    assert stored_history[-1] == {"role": "assistant", "content": "ok"}
    assert redis_client.set.call_args.kwargs["ttl"] == memory.DEFAULT_TTL

    memory.clear("s1")
    redis_client.delete.assert_called_once_with("agent:conv:s1")


def test_conversation_memory_gracefully_handles_redis_failures() -> None:
    redis_client = MagicMock()
    redis_client.get.side_effect = RuntimeError("redis down")
    redis_client.set.side_effect = RuntimeError("set failed")
    redis_client.delete.side_effect = RuntimeError("delete failed")
    memory = ConversationMemory(redis_client)

    assert memory.load("s1") == []
    memory.append("s1", [{"role": "user", "content": "hi"}])
    memory.clear("s1")
