"""
查询结果推送执行器

执行 SQL 查询并格式化结果
推送逻辑由订阅中心处理
"""
from datetime import datetime
from typing import Dict, Any, List
from jinja2 import Template
import json

from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import DataSource
from app.infrastructure.adapters.datasources.factory import AdapterFactory as DataSourceAdapterFactory
from app.extensions import db


@register_executor('query_result_push')
class QueryResultPushExecutor(AppExecutor):
    """
    查询结果推送执行器
    
    职责：
    - 执行 SQL 查询
    - 格式化结果为多种格式
    
    不负责：
    - 推送到具体渠道（由订阅中心处理）
    """
    
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """执行查询结果获取"""
        result = ExecutionResult(status=ExecutionStatus.RUNNING)
        
        try:
            config = context.config
            datasource_id = config.get('datasource_id')
            sql_query = config.get('sql_query')
            max_rows = config.get('max_rows', 100)
            output_format = config.get('format', 'table')
            message_template = config.get('message_template',
                '📊 查询结果\n时间：{{date}}\n\n{{result}}'
            )
            
            result.add_log("开始执行查询")
            
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
            columns = query_result.get('columns', [])
            total_rows = len(rows)
            result.add_log(f"✓ 查询成功，返回 {total_rows} 行数据")
            
            # 3. 格式化结果
            result.add_log(f"正在格式化结果为 {output_format} 格式...")
            
            truncated_rows = rows[:max_rows]
            is_truncated = total_rows > max_rows
            
            if output_format == 'table':
                formatted_result = self._format_as_table(columns, truncated_rows)
            elif output_format == 'text':
                formatted_result = self._format_as_text(columns, truncated_rows)
            elif output_format == 'json':
                formatted_result = self._format_as_json(columns, truncated_rows)
            else:
                formatted_result = self._format_as_table(columns, truncated_rows)
            
            if is_truncated:
                formatted_result += f"\n\n_（结果已截断，仅显示前 {max_rows} 行，共 {total_rows} 行）_"
            
            # 4. 渲染消息
            template = Template(message_template)
            rendered_message = template.render(
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                result=formatted_result
            )
            
            # 5. 准备输出结果（供订阅中心使用）
            result.status = ExecutionStatus.SUCCESS
            result.output = {
                # 基础信息
                'datasource_id': datasource_id,
                'datasource_name': datasource.name,
                
                # 查询结果
                'total_rows': total_rows,
                'sent_rows': len(truncated_rows),
                'is_truncated': is_truncated,
                'columns': columns,
                'rows': truncated_rows,
                
                # 格式化内容
                'format': output_format,
                'formatted_result': formatted_result,
                'rendered_message': rendered_message,
                
                # 元信息
                'timestamp': datetime.now().isoformat(),
                'instance_name': context.instance.name if context.instance else None
            }
            result.add_log("✓ 查询结果获取完成，结果已准备好供订阅分发")
            
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
        
        max_rows = config.get('max_rows', 100)
        if max_rows > 1000:
            result.add_warning('max_rows', '最大行数超过 1000，建议降低以避免消息过长')
        
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
                "max_rows": {
                    "type": "integer",
                    "title": "最大行数",
                    "default": 100,
                    "minimum": 1,
                    "maximum": 1000
                },
                "format": {
                    "type": "string",
                    "title": "输出格式",
                    "enum": ["table", "text", "json"],
                    "default": "table"
                },
                "message_template": {
                    "type": "string",
                    "title": "消息模板",
                    "description": "支持变量: {{date}}, {{result}}"
                }
            }
        }
    
    def _format_as_table(self, columns: List[str], rows: List[List]) -> str:
        """格式化为 Markdown 表格"""
        if not rows:
            return "_无数据_"
        
        header = "| " + " | ".join(str(col) for col in columns) + " |"
        separator = "|" + "|".join([" --- "] * len(columns)) + "|"
        
        data_rows = []
        for row in rows:
            row_str = "| " + " | ".join(str(val) if val is not None else "" for val in row) + " |"
            data_rows.append(row_str)
        
        return "\n".join([header, separator] + data_rows)
    
    def _format_as_text(self, columns: List[str], rows: List[List]) -> str:
        """格式化为纯文本"""
        if not rows:
            return "无数据"
        
        lines = []
        for i, row in enumerate(rows, 1):
            line = f"[{i}] " + ", ".join(f"{col}={val}" for col, val in zip(columns, row))
            lines.append(line)
        
        return "\n".join(lines)
    
    def _format_as_json(self, columns: List[str], rows: List[List]) -> str:
        """格式化为 JSON"""
        if not rows:
            return "[]"
        
        data = []
        for row in rows:
            obj = {col: val for col, val in zip(columns, row)}
            data.append(obj)
        
        return "```json\n" + json.dumps(data, indent=2, ensure_ascii=False) + "\n```"
