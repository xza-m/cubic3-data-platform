"""
周报日报推送执行器

执行 SQL 查询并格式化为报告数据
推送逻辑由订阅中心处理
"""
from datetime import datetime
from typing import Dict, Any, List
from jinja2 import Template

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import DataSource
from app.infrastructure.adapters.datasources.factory import AdapterFactory as DataSourceAdapterFactory
from app.extensions import db


@register_executor('report_push')
class ReportPushExecutor(AppExecutor):
    """
    周报日报推送执行器
    
    职责：
    - 执行 SQL 查询获取报告数据
    - 格式化结果
    
    不负责：
    - 推送到具体渠道（由订阅中心处理）
    """
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """执行周报日报数据生成"""
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            datasource_id = config.get('datasource_id')
            sql_query = config.get('sql_query')
            report_type = config.get('report_type', 'daily')
            message_template = config.get('message_template',
                '📈 {{report_type}}数据报告\n时间：{{date}}\n\n{{table}}'
            )
            
            result.add_log(f"开始生成{report_type}报告")
            
            # 1. 查询数据源
            result.add_log(f"正在查询数据源 {datasource_id}...")
            datasource = db.session.query(DataSource).filter_by(id=datasource_id).first()
            if not datasource:
                raise Exception(f"数据源 {datasource_id} 不存在")
            
            result.add_log(f"✓ 数据源：{datasource.name}")
            
            # 2. 执行 SQL 查询
            result.add_log("正在执行 SQL 查询...")
            adapter = DataSourceAdapterFactory.create_adapter(
                datasource.source_type,
                datasource.connection_config or {},
            )
            query_result = adapter.execute_query(sql_query)
            
            rows = query_result.get('rows', [])
            columns = query_result.get('columns', [])
            result.add_log(f"✓ 查询成功，返回 {len(rows)} 行数据")
            
            # 3. 格式化结果为 Markdown 表格
            result.add_log("正在格式化结果...")
            if len(rows) == 0:
                table_md = "_暂无数据_"
            else:
                table_md = self._format_as_markdown_table(columns, rows)
            
            # 4. 渲染消息
            template = Template(message_template)
            rendered_message = template.render(
                report_type=self._get_report_type_name(report_type),
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                table=table_md
            )
            
            # 5. 准备输出结果（供订阅中心使用）
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 基础信息
                'datasource_id': datasource_id,
                'datasource_name': datasource.name,
                'report_type': report_type,
                'report_type_name': self._get_report_type_name(report_type),
                
                # 查询结果
                'row_count': len(rows),
                'columns': columns,
                'rows': rows[:100],  # 最多返回 100 行
                
                # 格式化内容
                'table_markdown': table_md,
                'rendered_message': rendered_message,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None
            }
            result.add_log("✓ 报告数据生成完成，结果已准备好供订阅分发")
            
        except Exception as e:
            result.status = ExecutionStatus.FAILED
            result.error_message = str(e)
            result.add_log(f"✗ 执行失败：{e}")
        
        return result
    
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """验证配置"""
        result = ValidationResult(is_valid=True)
        
        if not config.get('datasource_id'):
            result.add_error('datasource_id', '缺少数据源 ID')
        if not config.get('sql_query'):
            result.add_error('sql_query', '缺少 SQL 查询')
        
        # 注意：feishu 配置不再是必需的，推送由订阅中心管理
        
        return result
    
    def get_config_schema(self) -> Dict[str, Any]:
        """获取配置 JSON Schema"""
        return {
            "type": "object",
            "required": ["datasource_id", "sql_query"],
            "properties": {
                "datasource_id": {
                    "type": "integer",
                    "title": "数据源 ID"
                },
                "sql_query": {
                    "type": "string",
                    "title": "SQL 查询"
                },
                "report_type": {
                    "type": "string",
                    "title": "报告类型",
                    "enum": ["daily", "weekly", "monthly", "custom"],
                    "default": "daily"
                },
                "message_template": {
                    "type": "string",
                    "title": "消息模板",
                    "description": "支持变量: {{report_type}}, {{date}}, {{table}}"
                }
            }
        }
    
    def _format_as_markdown_table(self, columns: List[str], rows: List[List]) -> str:
        """格式化为 Markdown 表格"""
        if not columns or not rows:
            return "_无数据_"
        
        header = "| " + " | ".join(str(col) for col in columns) + " |"
        separator = "|" + "|".join([" --- "] * len(columns)) + "|"
        
        data_rows = []
        for row in rows[:100]:
            row_str = "| " + " | ".join(str(val) if val is not None else "" for val in row) + " |"
            data_rows.append(row_str)
        
        table_md = "\n".join([header, separator] + data_rows)
        
        if len(rows) > 100:
            table_md += f"\n\n_（结果已截断，仅显示前 100 行，共 {len(rows)} 行）_"
        
        return table_md
    
    def _get_report_type_name(self, report_type: str) -> str:
        """获取报告类型的显示名称"""
        names = {
            'daily': '日报',
            'weekly': '周报',
            'monthly': '月报',
            'custom': '自定义报告'
        }
        return names.get(report_type, report_type)
