"""
异常数据监控执行器

执行 SQL 查询并根据阈值判断是否触发告警
推送逻辑由订阅中心处理
"""
from datetime import datetime
from typing import Dict, Any
from jinja2 import Template
import operator

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import DataSource
from app.infrastructure.adapters.datasources.factory import AdapterFactory as DataSourceAdapterFactory
from app.extensions import db


@register_executor('anomaly_monitor')
class AnomalyMonitorExecutor(AppExecutor):
    """
    异常数据监控执行器
    
    职责：
    - 执行 SQL 查询获取监控指标
    - 根据阈值判断是否异常
    - 生成告警数据
    
    不负责：
    - 推送告警到具体渠道（由订阅中心处理）
    """
    
    # 支持的比较运算符
    OPERATORS = {
        '>': operator.gt,
        '<': operator.lt,
        '>=': operator.ge,
        '<=': operator.le,
        '==': operator.eq,
        '!=': operator.ne
    }
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """执行异常数据监控"""
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            datasource_id = config.get('datasource_id')
            sql_query = config.get('sql_query')
            threshold_config = config.get('threshold', {})
            alert_template = config.get('alert_template')
            
            result.add_log("开始执行异常数据监控")
            
            # 1. 查询数据源
            result.add_log(f"正在查询数据源 {datasource_id}...")
            datasource = db.session.query(DataSource).filter_by(id=datasource_id).first()
            if not datasource:
                raise Exception(f"数据源 {datasource_id} 不存在")
            
            result.add_log(f"✓ 数据源：{datasource.name}")
            
            # 2. 执行 SQL 查询
            result.add_log("正在执行 SQL 查询...")
            adapter = DataSourceAdapterFactory.create_adapter(datasource)
            query_result = adapter.execute_query(sql_query)
            
            rows = query_result.get('rows', [])
            if len(rows) == 0:
                result.add_log("查询结果为空，跳过监控")
                result.status = ExecutionStatus.SUCCESS
                result.output = {
                    'triggered': False,
                    'reason': '查询结果为空',
                    'timestamp': datetime.now().isoformat()
                }
                return result
            
            # 获取第一行第一列的值作为监控指标
            metric_value = rows[0][0] if rows[0] else None
            result.add_log(f"✓ 查询成功，监控指标值: {metric_value}")
            
            # 3. 阈值判断
            op_str = threshold_config.get('operator', '>')
            threshold_value = threshold_config.get('value')
            
            result.add_log(f"正在检查阈值：{metric_value} {op_str} {threshold_value}")
            
            op_func = self.OPERATORS.get(op_str)
            if not op_func:
                raise Exception(f"不支持的运算符: {op_str}")
            
            is_anomaly = op_func(float(metric_value), float(threshold_value))
            
            if not is_anomaly:
                result.add_log("✓ 未触发告警")
                result.status = ExecutionStatus.SUCCESS
                result.output = {
                    'triggered': False,
                    'metric_value': metric_value,
                    'threshold_value': threshold_value,
                    'operator': op_str,
                    'datasource_name': datasource.name,
                    'timestamp': datetime.now().isoformat()
                }
                return result
            
            result.add_log("⚠️ 触发告警！")
            
            # 4. 准备告警数据（供订阅中心使用）
            alert_card = self._build_alert_card(
                datasource_name=datasource.name,
                metric_value=metric_value,
                operator=op_str,
                threshold_value=threshold_value,
                sql_query=sql_query,
                alert_template=alert_template
            )
            
            alert_text = self._build_alert_text(
                datasource_name=datasource.name,
                metric_value=metric_value,
                operator=op_str,
                threshold_value=threshold_value
            )
            
            # 执行成功
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 告警状态
                'triggered': True,
                'is_anomaly': True,
                
                # 监控信息
                'datasource_id': datasource_id,
                'datasource_name': datasource.name,
                'metric_value': metric_value,
                'threshold_value': threshold_value,
                'operator': op_str,
                
                # 格式化内容
                'feishu_card': alert_card,
                'text_message': alert_text,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None
            }
            result.add_log("✓ 异常监控完成，告警数据已准备好供订阅分发")
            
        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"✗ 执行失败：{e}")
        
        return result
    
    def _build_alert_text(
        self,
        datasource_name: str,
        metric_value: Any,
        operator: str,
        threshold_value: Any
    ) -> str:
        """构建告警文本消息"""
        return (
            f"⚠️ 数据异常告警\n"
            f"监控时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"数据源: {datasource_name}\n"
            f"监控指标: {metric_value}\n"
            f"触发条件: {metric_value} {operator} {threshold_value}"
        )
    
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """验证配置"""
        result = ValidationResult(is_valid=True)
        
        if not config.get('datasource_id'):
            result.add_error('datasource_id', '缺少数据源 ID')
        if not config.get('sql_query'):
            result.add_error('sql_query', '缺少 SQL 查询')
        
        threshold = config.get('threshold', {})
        if not threshold.get('operator'):
            result.add_error('threshold.operator', '缺少比较运算符')
        if threshold.get('value') is None:
            result.add_error('threshold.value', '缺少阈值')
        
        # 注意：feishu 配置不再是必需的，推送由订阅中心管理
        
        return result
    
    def get_config_schema(self) -> Dict[str, Any]:
        """获取配置 JSON Schema"""
        return {
            "type": "object",
            "required": ["datasource_id", "sql_query", "threshold"],
            "properties": {
                "datasource_id": {
                    "type": "integer",
                    "title": "数据源 ID"
                },
                "sql_query": {
                    "type": "string",
                    "title": "监控 SQL 查询"
                },
                "threshold": {
                    "type": "object",
                    "title": "阈值配置",
                    "required": ["operator", "value"],
                    "properties": {
                        "operator": {
                            "type": "string",
                            "title": "比较运算符",
                            "enum": [">", "<", ">=", "<=", "==", "!="]
                        },
                        "value": {
                            "type": "number",
                            "title": "阈值"
                        }
                    }
                },
                "alert_template": {
                    "type": "string",
                    "title": "告警模板",
                    "description": "支持变量: {{date}}, {{value}}, {{operator}}, {{threshold}}, {{details}}"
                }
            }
        }
    
    def _build_alert_card(
        self,
        datasource_name: str,
        metric_value: Any,
        operator: str,
        threshold_value: Any,
        sql_query: str,
        alert_template: str = None
    ) -> Dict[str, Any]:
        """构建告警飞书卡片"""
        if alert_template:
            template = Template(alert_template)
            content = template.render(
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                value=metric_value,
                operator=operator,
                threshold=threshold_value,
                details=f"监控指标 {metric_value} {operator} 阈值 {threshold_value}"
            )
        else:
            content = (
                f"**监控时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"**数据源**: {datasource_name}\n"
                f"**监控指标**: {metric_value}\n"
                f"**触发条件**: {metric_value} {operator} {threshold_value}\n"
                f"**SQL 查询**:\n```sql\n{sql_query}\n```"
            )
        
        card = {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "template": "red",
                "title": {
                    "tag": "plain_text",
                    "content": "⚠️ 数据异常告警"
                }
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": content
                    }
                },
                {
                    "tag": "hr"
                },
                {
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": "请及时查看并处理异常数据"
                        }
                    ]
                }
            ]
        }
        
        return card
