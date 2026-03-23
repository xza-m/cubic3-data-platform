"""
内置应用定义种子数据

应用启动时自动检测 app_definitions 表，为空则填充默认数据。
使用 ON CONFLICT DO NOTHING 保证幂等，已有数据不会被覆盖。
"""
import logging
from app.extensions import db

logger = logging.getLogger(__name__)

# 事件触发配置（所有应用共享）
_TRIGGER_ON_EVENT_SCHEMA = {
    "type": "object",
    "title": "事件触发配置（可选）",
    "description": "配置此应用实例监听其他应用的事件并自动触发执行",
    "properties": {
        "enabled": {"type": "boolean", "title": "启用事件触发", "default": False},
        "event_types": {
            "type": "array",
            "title": "监听的事件类型",
            "items": {
                "type": "string",
                "enum": [
                    "app.execution.completed",
                    "app.execution.failed",
                    "extraction.completed",
                ],
            },
            "default": ["app.execution.completed"],
        },
        "conditions": {
            "type": "object",
            "title": "触发条件",
            "properties": {
                "instance_id": {"type": "integer", "title": "触发的应用实例 ID"},
                "app_code": {"type": "string", "title": "触发的应用类型"},
            },
        },
        "delay_seconds": {
            "type": "integer",
            "title": "延迟触发（秒）",
            "default": 0,
            "minimum": 0,
            "maximum": 3600,
        },
    },
}

BUILTIN_APP_DEFINITIONS = [
    {
        "code": "bi_dashboard_push",
        "name": "BI看板推送",
        "category": "bi_integration",
        "description": "调用 Superset 截图 API 获取看板截图并推送至飞书群聊",
        "icon": "BarChartOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["superset"],
            "properties": {
                "superset": {
                    "type": "object",
                    "title": "Superset 配置",
                    "required": ["base_url", "dashboard_id", "username", "password"],
                    "properties": {
                        "base_url": {
                            "type": "string",
                            "title": "Superset URL",
                            "format": "uri",
                            "default": "http://superset:8088",
                        },
                        "dashboard_id": {
                            "type": "integer",
                            "title": "看板 ID",
                            "minimum": 1,
                        },
                        "username": {"type": "string", "title": "用户名"},
                        "password": {
                            "type": "string",
                            "title": "密码",
                            "format": "password",
                        },
                        "screenshot_width": {
                            "type": "integer",
                            "title": "截图宽度（像素）",
                            "default": 1920,
                            "minimum": 800,
                            "maximum": 3840,
                        },
                    },
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "dataset_card_push",
        "name": "数据集卡片推送",
        "category": "data_notification",
        "description": "查询数据集元数据并生成飞书交互式卡片推送",
        "icon": "TableOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["dataset_id"],
            "properties": {
                "dataset_id": {
                    "type": "integer",
                    "title": "数据集 ID",
                    "minimum": 1,
                },
                "include_stats": {
                    "type": "boolean",
                    "title": "包含统计信息",
                    "default": True,
                },
                "include_fields": {
                    "type": "boolean",
                    "title": "包含字段列表",
                    "default": True,
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "report_push",
        "name": "周报日报推送",
        "category": "data_report",
        "description": "执行 SQL 查询并格式化为文本推送到飞书",
        "icon": "FileTextOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["datasource_id", "sql_query"],
            "properties": {
                "datasource_id": {
                    "type": "integer",
                    "title": "数据源 ID",
                    "minimum": 1,
                },
                "sql_query": {
                    "type": "string",
                    "title": "SQL 查询",
                    "format": "textarea",
                },
                "report_type": {
                    "type": "string",
                    "title": "报告类型",
                    "enum": ["daily", "weekly", "monthly", "custom"],
                    "default": "daily",
                },
                "message_template": {
                    "type": "string",
                    "title": "消息模板",
                    "format": "textarea",
                    "default": "📈 {{report_type}}数据报告\n时间：{{date}}\n\n{{table}}",
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "anomaly_monitor",
        "name": "异常数据监控",
        "category": "data_alert",
        "description": "执行 SQL 查询并根据阈值判断是否告警",
        "icon": "AlertOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["datasource_id", "sql_query", "threshold"],
            "properties": {
                "datasource_id": {
                    "type": "integer",
                    "title": "数据源 ID",
                    "minimum": 1,
                },
                "sql_query": {
                    "type": "string",
                    "title": "监控 SQL 查询",
                    "format": "textarea",
                    "description": "查询结果应返回单个数值字段",
                },
                "threshold": {
                    "type": "object",
                    "title": "阈值配置",
                    "required": ["operator", "value"],
                    "properties": {
                        "operator": {
                            "type": "string",
                            "title": "比较运算符",
                            "enum": [">", "<", ">=", "<=", "==", "!="],
                            "default": ">",
                        },
                        "value": {"type": "number", "title": "阈值"},
                    },
                },
                "alert_template": {
                    "type": "string",
                    "title": "告警模板",
                    "format": "textarea",
                    "default": "⚠️ 数据异常告警\n时间：{{date}}\n监控指标：{{value}} {{operator}} {{threshold}}\n详情：{{details}}",
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "query_result_push",
        "name": "查询结果推送",
        "category": "data_notification",
        "description": "执行 SQL 查询并格式化结果推送到飞书",
        "icon": "SendOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["datasource_id", "sql_query"],
            "properties": {
                "datasource_id": {
                    "type": "integer",
                    "title": "数据源 ID",
                    "minimum": 1,
                },
                "sql_query": {
                    "type": "string",
                    "title": "SQL 查询",
                    "format": "textarea",
                },
                "format": {
                    "type": "string",
                    "title": "输出格式",
                    "enum": ["table", "text", "json"],
                    "default": "table",
                },
                "max_rows": {
                    "type": "integer",
                    "title": "最大行数",
                    "default": 100,
                    "minimum": 1,
                    "maximum": 1000,
                },
                "message_template": {
                    "type": "string",
                    "title": "消息模板",
                    "format": "textarea",
                    "default": "📊 查询结果\n时间：{{date}}\n\n{{result}}",
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "data_agent",
        "name": "CUBIC3 智能问数",
        "category": "agent",
        "description": "基于 CUBIC3 语义与知识体系的自然语言查询能力，支持飞书应用和 DataChat 双信道接入",
        "icon": "RobotOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "required": ["knowledge"],
            "properties": {
                "llm": {
                    "type": "object",
                    "title": "LLM 配置（覆盖全局默认）",
                    "description": "不填则使用全局 LLM_* 环境变量",
                    "properties": {
                        "model": {
                            "type": "string",
                            "title": "模型",
                            "description": "覆盖全局 LLM_MODEL，如 qwen-plus、deepseek-chat",
                        },
                        "temperature": {
                            "type": "number",
                            "title": "Temperature",
                            "default": 0.0,
                            "minimum": 0,
                            "maximum": 1,
                        },
                    },
                },
                "knowledge": {
                    "type": "object",
                    "title": "知识库配置",
                    "required": ["datasource_id"],
                    "properties": {
                        "datasource_id": {
                            "type": "integer",
                            "title": "数仓数据源",
                            "description": "知识文档描述的数据源（从已注册数据源中选择）",
                            "minimum": 1,
                        },
                        "dir": {
                            "type": "string",
                            "title": "知识文档目录",
                            "default": "app/application/agent/knowledge",
                        },
                    },
                },
                "agent": {
                    "type": "object",
                    "title": "Agent 行为参数",
                    "properties": {
                        "max_loop_rounds": {
                            "type": "integer",
                            "title": "最大推理轮次",
                            "default": 10,
                            "minimum": 1,
                            "maximum": 20,
                        },
                        "session_timeout": {
                            "type": "integer",
                            "title": "单次会话超时（秒）",
                            "default": 120,
                        },
                        "max_history_messages": {
                            "type": "integer",
                            "title": "DataChat 历史消息数",
                            "default": 10,
                            "minimum": 0,
                            "maximum": 50,
                        },
                    },
                },
                "allowed_user_ids": {
                    "type": "array",
                    "title": "飞书授权用户",
                    "description": "飞书用户 open_id 白名单，留空则允许所有已安装用户",
                    "items": {"type": "string"},
                    "default": [],
                },
            },
        },
    },
    {
        "code": "extraction_notify",
        "name": "数据提取通知",
        "category": "data_notification",
        "description": "监听数据提取完成事件并推送通知",
        "icon": "BellOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "properties": {
                "extraction_task_id": {
                    "type": "integer",
                    "title": "提取任务 ID（可选）",
                    "minimum": 1,
                    "description": "留空则监听所有提取任务",
                },
                "notify_on_success": {
                    "type": "boolean",
                    "title": "成功时通知",
                    "default": True,
                },
                "notify_on_failure": {
                    "type": "boolean",
                    "title": "失败时通知",
                    "default": True,
                },
                "success_template": {
                    "type": "string",
                    "title": "成功通知模板",
                    "format": "textarea",
                    "default": "✅ 数据提取完成\n任务：{{task_name}}\n提取行数：{{row_count}}\n耗时：{{duration}}",
                },
                "failure_template": {
                    "type": "string",
                    "title": "失败通知模板",
                    "format": "textarea",
                    "default": "❌ 数据提取失败\n任务：{{task_name}}\n失败原因：{{error}}",
                },
                "trigger_on_event": _TRIGGER_ON_EVENT_SCHEMA,
            },
        },
    },
    {
        "code": "schema_drift_check",
        "name": "Schema Drift 检测",
        "category": "system_maintenance",
        "description": "定时检测语义层 Cube 定义与物理表 Schema 的一致性，发现偏移时通过飞书 webhook 推送通知",
        "icon": "SyncOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "properties": {
                "webhook_url": {
                    "type": "string",
                    "title": "飞书 Webhook URL",
                    "description": "检测到 Schema 偏移时推送通知的飞书群机器人 Webhook 地址",
                    "format": "uri",
                },
            },
        },
    },
    {
        "code": "table_cache_refresh",
        "name": "表缓存刷新",
        "category": "system_maintenance",
        "description": "定时刷新已过期的数据源表列表缓存，保持元数据新鲜",
        "icon": "ReloadOutlined",
        "author": "System",
        "version": "1.0.0",
        "config_schema": {
            "type": "object",
            "properties": {},
        },
    },
]


BUILTIN_SYSTEM_INSTANCES = [
    {
        "app_code": "table_cache_refresh",
        "name": "表缓存每日刷新",
        "description": "每天凌晨 2:00 刷新过期表缓存",
        "config": {},
        "schedule_type": "cron",
        "schedule_config": {"cron": "0 2 * * *"},
        "owner": "system",
    },
    {
        "app_code": "schema_drift_check",
        "name": "Schema Drift 每日检测",
        "description": "每天凌晨 3:30 检测语义层 Cube 与物理表一致性",
        "config": {
            "webhook_url": "",
        },
        "schedule_type": "cron",
        "schedule_config": {"cron": "30 3 * * *"},
        "owner": "system",
    },
]


def seed_app_definitions():
    """
    填充内置应用定义（幂等操作）

    仅插入 code 不存在的记录，已有数据不会被覆盖。
    """
    from app.domain.entities.app_definition import AppDefinition

    try:
        existing_codes = {
            row[0] for row in db.session.query(AppDefinition.code).all()
        }

        inserted = 0
        updated = 0
        for app_def in BUILTIN_APP_DEFINITIONS:
            if app_def["code"] not in existing_codes:
                record = AppDefinition(
                    code=app_def["code"],
                    name=app_def["name"],
                    category=app_def["category"],
                    description=app_def["description"],
                    config_schema=app_def["config_schema"],
                    icon=app_def["icon"],
                    author=app_def["author"],
                    version=app_def["version"],
                    enabled=True,
                )
                db.session.add(record)
                inserted += 1
            else:
                record = db.session.query(AppDefinition).filter_by(code=app_def["code"]).first()
                if record and record.config_schema != app_def["config_schema"]:
                    record.config_schema = app_def["config_schema"]
                    record.description = app_def["description"]
                    updated += 1

        if inserted > 0 or updated > 0:
            db.session.commit()
            logger.info(f"内置应用定义：新增 {inserted}，更新 {updated}")
        else:
            logger.debug("内置应用定义已存在且无变化，跳过")

    except Exception as e:
        db.session.rollback()
        logger.warning(f"填充内置应用定义失败: {e}")


def seed_system_instances():
    """
    为系统维护类应用自动创建默认实例（幂等）

    按 app_code + name 去重，已存在则跳过。
    """
    from app.domain.entities.app_instance import AppInstance

    try:
        existing = {
            (row.app_code, row.name)
            for row in db.session.query(AppInstance.app_code, AppInstance.name).all()
        }

        inserted = 0
        for inst_def in BUILTIN_SYSTEM_INSTANCES:
            key = (inst_def["app_code"], inst_def["name"])
            if key in existing:
                continue

            record = AppInstance(
                app_code=inst_def["app_code"],
                name=inst_def["name"],
                description=inst_def.get("description", ""),
                config=inst_def.get("config", {}),
                schedule_type=inst_def["schedule_type"],
                schedule_config=inst_def.get("schedule_config", {}),
                enabled=True,
                owner=inst_def.get("owner", "system"),
            )
            db.session.add(record)
            inserted += 1

        if inserted > 0:
            db.session.commit()
            logger.info(f"已自动创建 {inserted} 个系统维护实例")
        else:
            logger.debug("系统维护实例已存在，跳过创建")

    except Exception as e:
        db.session.rollback()
        logger.warning(f"创建系统维护实例失败: {e}")
