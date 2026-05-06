"""
自动扫描 Flask 路由并生成 OpenAPI 路径定义
"""
import re
from typing import Dict, List, Any
from flask import Flask
from app.interfaces.api.openapi_metadata import get_openapi_metadata, merge_operation_metadata


def scan_routes_to_openapi(app: Flask) -> Dict[str, Any]:
    """
    扫描 Flask 应用的所有路由并生成 OpenAPI 路径定义
    
    Args:
        app: Flask 应用实例
        
    Returns:
        OpenAPI paths 字典
    """
    paths = {}
    
    for rule in app.url_map.iter_rules():
        # 只处理 API 路由和健康检查
        if not (rule.rule.startswith('/api/') or rule.rule == '/health'):
            continue
        
        # 跳过文档路由本身
        if '/api/docs/' in rule.rule:
            continue
        
        # 转换 Flask 路径参数格式为 OpenAPI 格式
        # <int:id> -> {id}, <path:table> -> {table}
        path = re.sub(r'<(?:int|string|float|path|uuid):([^>]+)>', r'{\1}', rule.rule)
        path = re.sub(r'<([^>]+)>', r'{\1}', path)
        
        if path not in paths:
            paths[path] = {}
        
        # 获取函数文档字符串
        endpoint_func = app.view_functions.get(rule.endpoint)
        docstring = endpoint_func.__doc__ if endpoint_func and endpoint_func.__doc__ else ""
        
        # 解析文档字符串
        summary, description = _parse_docstring(docstring, rule.endpoint)
        
        # 确定标签
        tag = _get_tag_for_path(rule.rule)
        
        # 提取路径参数
        path_params = re.findall(r'\{([^}]+)\}', path)
        
        # 为每个 HTTP 方法生成文档
        for method in rule.methods:
            if method in ['HEAD', 'OPTIONS']:
                continue
            
            method_lower = method.lower()
            operation = _generate_operation(
                method=method,
                tag=tag,
                summary=summary,
                description=description,
                endpoint=rule.endpoint,
                path_params=path_params,
                docstring=docstring
            )
            metadata = get_openapi_metadata(rule.endpoint, method, path)
            if metadata:
                operation = merge_operation_metadata(operation, metadata)
            paths[path][method_lower] = operation
    
    return paths


def _parse_docstring(docstring: str, default_summary: str) -> tuple[str, str]:
    """
    解析函数文档字符串
    
    Args:
        docstring: 函数文档字符串
        default_summary: 默认摘要（通常是函数名）
        
    Returns:
        (summary, description) 元组
    """
    if not docstring:
        return default_summary, ""
    
    lines = [line.strip() for line in docstring.split('\n') if line.strip()]
    
    if not lines:
        return default_summary, ""
    
    summary = lines[0]
    
    # 查找描述部分（跳过参数说明等）
    description_lines = []
    for line in lines[1:]:
        if any(keyword in line for keyword in ['Args:', 'Returns:', 'Query Parameters:', 'Request Body:', 'Example:']):
            break
        description_lines.append(line)
    
    description = '\n'.join(description_lines).strip()
    
    return summary, description


def _get_tag_for_path(path: str) -> str:
    """根据路径确定 API 标签（使用中文）"""
    tag_mapping = {
        '/datasources': "数据源管理",
        '/datasets': "数据集管理",
        '/extraction': "提取任务",
        '/conversations': "对话中心",
        '/queries': "查询中心",
        '/sql_lab': "查询中心",
        '/feishu': "飞书集成",
        '/files': "文件管理",
        '/apps': "应用中心",
        '/app_instances': "应用中心",
        '/app_executions': "应用中心",
        '/channels': "配置中心",
        '/subscriptions': "配置中心",
        '/metadata': "数据集管理",
    }
    
    for key, tag in tag_mapping.items():
        if key in path:
            return tag
    
    if path == '/health':
        return "健康检查"
    
    return "其他"


def _generate_operation(
    method: str,
    tag: str,
    summary: str,
    description: str,
    endpoint: str,
    path_params: List[str],
    docstring: str
) -> Dict[str, Any]:
    """
    生成单个 API 操作的 OpenAPI 定义
    
    Args:
        method: HTTP 方法
        tag: API 标签
        summary: 操作摘要
        description: 操作描述
        endpoint: Flask 端点名称
        path_params: 路径参数列表
        docstring: 函数文档字符串
        
    Returns:
        OpenAPI operation 对象
    """
    operation = {
        "tags": [tag],
        "summary": summary,
        "description": description,
        "operationId": f"{endpoint}_{method.lower()}",
        "parameters": _generate_parameters(path_params, docstring),
        "responses": _generate_responses()
    }
    
    # 为 POST/PUT/PATCH 添加请求体
    if method in ['POST', 'PUT', 'PATCH']:
        operation["requestBody"] = _generate_request_body(docstring)
    
    return operation


def _generate_parameters(path_params: List[str], docstring: str) -> List[Dict[str, Any]]:
    """生成参数列表"""
    parameters = []
    
    # 添加路径参数
    for param in path_params:
        param_type = "integer" if param.endswith("_id") or param == "id" else "string"
        parameters.append({
            "name": param,
            "in": "path",
            "required": True,
            "schema": {"type": param_type},
            "description": f"{param} 参数"
        })
    
    # 从文档字符串中提取查询参数
    if "Query Parameters:" in docstring or "query" in docstring.lower():
        # 常见的查询参数模式
        query_param_patterns = {
            "page": {"type": "integer", "description": "页码", "default": 1},
            "page_size": {"type": "integer", "description": "每页数量", "default": 20},
            "limit": {"type": "integer", "description": "返回数量限制"},
            "offset": {"type": "integer", "description": "偏移量"},
            "search": {"type": "string", "description": "搜索关键词"},
            "source_type": {"type": "string", "description": "数据源类型"},
            "source_id": {"type": "integer", "description": "数据源ID"},
            "dataset_id": {"type": "integer", "description": "数据集ID"},
            "is_active": {"type": "boolean", "description": "是否活跃"},
            "owner": {"type": "string", "description": "负责人"},
            "status": {"type": "string", "description": "状态"},
            "sort_by": {"type": "string", "description": "排序字段"},
            "order": {"type": "string", "description": "排序方向", "enum": ["asc", "desc"]},
        }
        
        for param_name, param_config in query_param_patterns.items():
            if param_name in docstring.lower():
                param_def = {
                    "name": param_name,
                    "in": "query",
                    "required": False,
                    "schema": {"type": param_config["type"]},
                    "description": param_config["description"]
                }
                
                if "default" in param_config:
                    param_def["schema"]["default"] = param_config["default"]
                
                if "enum" in param_config:
                    param_def["schema"]["enum"] = param_config["enum"]
                
                parameters.append(param_def)
    
    return parameters


def _generate_request_body(docstring: str) -> Dict[str, Any]:
    """生成请求体定义"""
    return {
        "required": True,
        "content": {
            "application/json": {
                "schema": {
                    "type": "object",
                    "description": "请求体参数，详见接口文档"
                }
            }
        }
    }


def _generate_responses() -> Dict[str, Any]:
    """生成标准响应定义"""
    return {
        "200": {
            "description": "请求成功",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ApiResponse"}
                }
            }
        },
        "201": {
            "description": "创建成功",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ApiResponse"}
                }
            }
        },
        "400": {
            "description": "请求参数错误",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        },
        "401": {
            "description": "未授权",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        },
        "403": {
            "description": "禁止访问",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        },
        "404": {
            "description": "资源不存在",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        },
        "422": {
            "description": "请求语义合法性校验失败",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        },
        "500": {
            "description": "服务器内部错误",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                }
            }
        }
    }
