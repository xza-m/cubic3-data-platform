"""
API 文档路由
提供 Swagger UI 和 ReDoc 界面
"""
from flask import Blueprint, jsonify, render_template_string
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('api_docs', __name__, url_prefix='/api/docs')


# ============================================================================
# Swagger UI 模板
# ============================================================================

SWAGGER_UI_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CUBIC3 Data Platform API 文档</title>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.0/swagger-ui.css">
    <style>
        body {
            margin: 0;
            padding: 0;
        }
        .topbar {
            display: none;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.0/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.0/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: "{{ spec_url }}",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                persistAuthorization: true,
                displayRequestDuration: true,
                filter: true,
                tryItOutEnabled: true
            });
            window.ui = ui;
        };
    </script>
</body>
</html>
"""


# ============================================================================
# ReDoc 模板
# ============================================================================

REDOC_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CUBIC3 Data Platform API 文档 - ReDoc</title>
    <style>
        body {
            margin: 0;
            padding: 0;
        }
    </style>
</head>
<body>
    <redoc spec-url="{{ spec_url }}"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@2.1.3/bundles/redoc.standalone.js"></script>
</body>
</html>
"""


# ============================================================================
# API 文档路由
# ============================================================================

@bp.route('/')
def index():
    """API 文档首页（重定向到 Swagger UI）"""
    return render_template_string(SWAGGER_UI_TEMPLATE, spec_url='/api/docs/openapi.json')


@bp.route('/swagger')
def swagger_ui():
    """Swagger UI 界面"""
    return render_template_string(SWAGGER_UI_TEMPLATE, spec_url='/api/docs/openapi.json')


@bp.route('/redoc')
def redoc_ui():
    """ReDoc 界面"""
    return render_template_string(REDOC_TEMPLATE, spec_url='/api/docs/openapi.json')


@bp.route('/openapi.json')
def openapi_spec():
    """OpenAPI 规范（JSON 格式）
    
    返回完整的 OpenAPI 3.0 规范文档
    """
    from flask import current_app
    from app.interfaces.api.openapi_config import info, tags, servers, security_schemes
    from app.interfaces.api.route_scanner import scan_routes_to_openapi
    
    # 构建 OpenAPI 规范
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": info.title,
            "version": info.version,
            "description": info.description,
            "contact": info.contact if isinstance(info.contact, dict) else {},
            "license": info.license if isinstance(info.license, dict) else {}
        },
        "servers": [
            {"url": server.url, "description": server.description}
            for server in servers
        ],
        "tags": [
            {"name": tag.name, "description": tag.description}
            for tag in tags
        ],
        "components": {
            "securitySchemes": security_schemes,
            "schemas": _get_schemas()
        },
        "paths": scan_routes_to_openapi(current_app),  # 自动扫描路由
        "security": [
            {"bearerAuth": []}
        ]
    }
    
    return jsonify(spec), 200


def _get_schemas():
    """获取所有 Schema 定义
    
    可按需从 Pydantic 模型扩展
    """
    return {
        "ApiResponse": {
            "type": "object",
            "properties": {
                "code": {"type": "integer", "description": "状态码"},
                "message": {"type": "string", "description": "响应消息"},
                "data": {"type": "object", "description": "响应数据"},
                "trace_id": {"type": "string", "nullable": True, "description": "请求追踪 ID"}
            }
        },
        "ErrorResponse": {
            "type": "object",
            "properties": {
                "code": {"type": "integer", "description": "错误码"},
                "message": {"type": "string", "description": "错误消息"},
                "trace_id": {"type": "string", "nullable": True, "description": "请求追踪 ID"},
                "details": {"type": "object", "description": "错误详情"}
            }
        }
    }
