-- 事件级联配置模板 (添加到所有应用定义)
-- 日期: 2026-01-23
-- 说明: 为所有应用定义添加 trigger_on_event 配置项到 config_schema

-- 定义事件触发的 JSON Schema 片段
-- 此配置允许应用实例监听其他应用的事件并自动触发
/*
"trigger_on_event": {
  "type": "object",
  "title": "事件触发配置（可选）",
  "description": "配置此应用实例监听其他应用的事件并自动触发执行",
  "properties": {
    "enabled": {
      "type": "boolean",
      "title": "启用事件触发",
      "default": false
    },
    "event_types": {
      "type": "array",
      "title": "监听的事件类型",
      "items": {
        "type": "string",
        "enum": [
          "app.execution.completed",
          "app.execution.failed",
          "extraction.completed"
        ]
      },
      "default": ["app.execution.completed"]
    },
    "conditions": {
      "type": "object",
      "title": "触发条件",
      "description": "事件必须满足所有条件才会触发此应用",
      "properties": {
        "instance_id": {
          "type": "integer",
          "title": "触发的应用实例 ID"
        },
        "app_code": {
          "type": "string",
          "title": "触发的应用类型"
        }
      }
    },
    "delay_seconds": {
      "type": "integer",
      "title": "延迟触发（秒）",
      "description": "事件发生后延迟多少秒触发此应用",
      "default": 0,
      "minimum": 0,
      "maximum": 3600
    }
  }
}
*/

-- 注意: 由于 PostgreSQL 不支持直接在 jsonb 深层嵌套中添加字段，
-- 以下 SQL 提供了更新方式的示例（手动执行或作为迁移脚本）

-- 更新 bi_dashboard_push 应用的 config_schema，添加 trigger_on_event
UPDATE app_definitions 
SET config_schema = jsonb_set(
    config_schema,
    '{properties,trigger_on_event}',
    '{
      "type": "object",
      "title": "事件触发配置（可选）",
      "description": "配置此应用实例监听其他应用的事件并自动触发执行",
      "properties": {
        "enabled": {
          "type": "boolean",
          "title": "启用事件触发",
          "default": false
        },
        "event_types": {
          "type": "array",
          "title": "监听的事件类型",
          "items": {
            "type": "string",
            "enum": ["app.execution.completed", "app.execution.failed", "extraction.completed"]
          },
          "default": ["app.execution.completed"]
        },
        "conditions": {
          "type": "object",
          "title": "触发条件",
          "properties": {
            "instance_id": {"type": "integer", "title": "触发的应用实例 ID"},
            "app_code": {"type": "string", "title": "触发的应用类型"}
          }
        },
        "delay_seconds": {
          "type": "integer",
          "title": "延迟触发（秒）",
          "default": 0,
          "minimum": 0,
          "maximum": 3600
        }
      }
    }'::jsonb
)
WHERE code = 'bi_dashboard_push';

-- 为所有其他应用添加相同的配置
UPDATE app_definitions 
SET config_schema = jsonb_set(
    config_schema,
    '{properties,trigger_on_event}',
    '{
      "type": "object",
      "title": "事件触发配置（可选）",
      "properties": {
        "enabled": {"type": "boolean", "title": "启用事件触发", "default": false},
        "event_types": {
          "type": "array",
          "title": "监听的事件类型",
          "items": {"type": "string", "enum": ["app.execution.completed", "app.execution.failed", "extraction.completed"]},
          "default": ["app.execution.completed"]
        },
        "conditions": {
          "type": "object",
          "title": "触发条件",
          "properties": {
            "instance_id": {"type": "integer", "title": "触发的应用实例 ID"},
            "app_code": {"type": "string", "title": "触发的应用类型"}
          }
        },
        "delay_seconds": {"type": "integer", "title": "延迟触发（秒）", "default": 0, "minimum": 0, "maximum": 3600}
      }
    }'::jsonb
)
WHERE code != 'bi_dashboard_push' AND config_schema IS NOT NULL;
