"""
CUBIC3 智能问数执行器

内部仍沿用 data_agent 注册码，执行模式为消息驱动，不支持调度执行。
Executor 仅用于配置校验和平台应用注册。
"""
from typing import Dict, Any

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import DataSource
from app.extensions import db


@register_executor('data_agent')
class DataAgentExecutor(AppExecutor):
    """
    CUBIC3 智能问数配置校验执行器

    职责：
    - validate_config：校验 knowledge.datasource_id 等配置项
    - execute：no-op（CUBIC3 由消息事件驱动，不支持调度执行）
    """

    def execute(self, context: ExecutionContext) -> ExecutionResult:
        return ExecutionResult(
            status=ExecutionStatus.SUCCESS,
            output={"status": "agent_ready", "message": "CUBIC3 由消息驱动，不支持调度执行"},
        )

    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        result = ValidationResult(is_valid=True)

        knowledge = config.get('knowledge') or {}
        datasource_id = knowledge.get('datasource_id')
        if not datasource_id:
            result.add_error('knowledge.datasource_id', '必须绑定一个数仓数据源')
        else:
            ds = db.session.query(DataSource).filter_by(id=datasource_id).first()
            if not ds:
                result.add_error('knowledge.datasource_id', f'数据源 {datasource_id} 不存在')
            elif ds.source_type != 'maxcompute':
                result.add_warning('knowledge.datasource_id',
                                   f'飞书信道推荐绑定 MaxCompute 数据源，当前为 {ds.source_type}')

        agent = config.get('agent') or {}
        max_rounds = agent.get('max_loop_rounds', 10)
        if not isinstance(max_rounds, int) or max_rounds < 1 or max_rounds > 20:
            result.add_error('agent.max_loop_rounds', '推理轮次须为 1-20 的整数')

        return result

    def get_config_schema(self) -> Dict[str, Any]:
        from app.infrastructure.seed import BUILTIN_APP_DEFINITIONS
        defn = next(d for d in BUILTIN_APP_DEFINITIONS if d['code'] == 'data_agent')
        return defn['config_schema']
