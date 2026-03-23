"""
AgentService 工厂

负责从 AppInstance.config 加载运行时配置，创建绑定了数据源适配器的 AgentService。
DI 容器中注册的是静态组件（LLM、KnowledgeService 等），
而 AgentService 需要运行时的 AppInstance 配置，因此通过工厂延迟创建。
"""
from __future__ import annotations

from typing import Any

from app.application.agent.agent_service import AgentService
from app.application.agent.services.agent_loop_service import AgentLoopService
from app.application.agent.services.prompt_builder import PromptBuilder
from app.application.agent.services.tool_registry import ToolRegistry
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.entities import DataSource
from app.extensions import db
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def get_data_agent_service(
    loop: AgentLoopService,
    prompt_builder: PromptBuilder,
    tool_registry: ToolRegistry,
) -> AgentService | None:
    """
    从数据库加载 DataAgent AppInstance 配置，构建 AgentService

    Returns:
        AgentService 实例；若 DataAgent 未启用则返回 None
    """
    from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository

    repo = AppInstanceRepository(session=db.session)
    instances, total = repo.find_all(app_code='data_agent', enabled=True, page_size=1)
    if not instances:
        logger.warning("DataAgent 未配置或未启用")
        return None

    instance = instances[0]
    config: dict[str, Any] = instance.config or {}

    # 解析分层配置
    knowledge = config.get("knowledge", {})
    datasource_id = knowledge.get("datasource_id")

    default_adapter = None
    default_database = None

    if datasource_id:
        ds = db.session.query(DataSource).filter_by(id=datasource_id).first()
        if ds:
            default_adapter = AdapterFactory.create_adapter(
                ds.source_type, ds.connection_config
            )
            # MaxCompute 的 database 就是 project
            default_database = ds.connection_config.get("project") or ds.connection_config.get("database")
        else:
            logger.warning("DataAgent 配置的数据源不存在", datasource_id=datasource_id)

    return AgentService(
        loop=loop,
        prompt_builder=prompt_builder,
        tool_registry=tool_registry,
        config=config,
        default_adapter=default_adapter,
        default_database=default_database,
    )


def get_data_agent_config() -> dict[str, Any] | None:
    """获取 DataAgent AppInstance 配置（轻量级，不创建适配器）"""
    from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository

    repo = AppInstanceRepository(session=db.session)
    instances, _ = repo.find_all(app_code='data_agent', enabled=True, page_size=1)
    if not instances:
        return None
    return instances[0].config or {}
