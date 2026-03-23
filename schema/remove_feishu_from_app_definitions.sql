-- ============================================================================
-- 迁移脚本：从应用定义中移除飞书渠道配置
-- 
-- 目的：解耦应用和渠道，渠道配置统一由订阅管理
-- 日期：2026-02-04
-- ============================================================================

BEGIN;

-- 1. bi_dashboard_push: BI看板推送
-- 移除 feishu 配置，保留 superset 配置
UPDATE app_definitions
SET config_schema = '{
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
          "default": "http://superset:8088"
        },
        "username": {
          "type": "string",
          "title": "用户名"
        },
        "password": {
          "type": "string",
          "title": "密码",
          "format": "password"
        },
        "dashboard_id": {
          "type": "integer",
          "title": "看板 ID",
          "minimum": 1
        },
        "screenshot_width": {
          "type": "integer",
          "title": "截图宽度（像素）",
          "default": 1920,
          "minimum": 800,
          "maximum": 3840
        }
      }
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'bi_dashboard_push';

-- 2. dataset_card_push: 数据集卡片推送
-- 移除 feishu 配置，保留 dataset_id
UPDATE app_definitions
SET config_schema = '{
  "type": "object",
  "required": ["dataset_id"],
  "properties": {
    "dataset_id": {
      "type": "integer",
      "title": "数据集 ID",
      "minimum": 1
    },
    "include_stats": {
      "type": "boolean",
      "title": "包含统计信息",
      "default": true
    },
    "include_fields": {
      "type": "boolean",
      "title": "包含字段列表",
      "default": true
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'dataset_card_push';

-- 3. report_push: 周报日报推送
-- 移除 feishu 配置，保留 datasource_id, sql_query, report_type
UPDATE app_definitions
SET config_schema = '{
  "type": "object",
  "required": ["datasource_id", "sql_query"],
  "properties": {
    "datasource_id": {
      "type": "integer",
      "title": "数据源 ID",
      "minimum": 1
    },
    "sql_query": {
      "type": "string",
      "title": "SQL 查询",
      "format": "textarea"
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
      "format": "textarea",
      "default": "📈 {{report_type}}数据报告\\n时间：{{date}}\\n\\n{{table}}"
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'report_push';

-- 4. anomaly_monitor: 异常数据监控
-- 移除 feishu 配置，保留 datasource_id, sql_query, threshold
UPDATE app_definitions
SET config_schema = '{
  "type": "object",
  "required": ["datasource_id", "sql_query", "threshold"],
  "properties": {
    "datasource_id": {
      "type": "integer",
      "title": "数据源 ID",
      "minimum": 1
    },
    "sql_query": {
      "type": "string",
      "title": "监控 SQL 查询",
      "format": "textarea",
      "description": "查询结果应返回单个数值字段"
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
          "default": ">"
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
      "format": "textarea",
      "default": "⚠️ 数据异常告警\\n时间：{{date}}\\n监控指标：{{value}} {{operator}} {{threshold}}\\n详情：{{details}}"
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'anomaly_monitor';

-- 5. query_result_push: 查询结果推送
-- 移除 feishu 配置，保留 datasource_id, sql_query, format, max_rows
UPDATE app_definitions
SET config_schema = '{
  "type": "object",
  "required": ["datasource_id", "sql_query"],
  "properties": {
    "datasource_id": {
      "type": "integer",
      "title": "数据源 ID",
      "minimum": 1
    },
    "sql_query": {
      "type": "string",
      "title": "SQL 查询",
      "format": "textarea"
    },
    "format": {
      "type": "string",
      "title": "输出格式",
      "enum": ["table", "text", "json"],
      "default": "table"
    },
    "max_rows": {
      "type": "integer",
      "title": "最大行数",
      "default": 100,
      "minimum": 1,
      "maximum": 1000
    },
    "message_template": {
      "type": "string",
      "title": "消息模板",
      "format": "textarea",
      "default": "📊 查询结果\\n时间：{{date}}\\n\\n{{result}}"
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'query_result_push';

-- 6. extraction_notify: 数据提取通知
-- 移除 feishu 配置，保留 extraction_task_id, notify_on_success, notify_on_failure
UPDATE app_definitions
SET config_schema = '{
  "type": "object",
  "properties": {
    "extraction_task_id": {
      "type": "integer",
      "title": "提取任务 ID（可选）",
      "minimum": 1,
      "description": "留空则监听所有提取任务"
    },
    "notify_on_success": {
      "type": "boolean",
      "title": "成功时通知",
      "default": true
    },
    "notify_on_failure": {
      "type": "boolean",
      "title": "失败时通知",
      "default": true
    },
    "success_template": {
      "type": "string",
      "title": "成功通知模板",
      "format": "textarea",
      "default": "✅ 数据提取完成\\n任务：{{task_name}}\\n提取行数：{{row_count}}\\n耗时：{{duration}}"
    },
    "failure_template": {
      "type": "string",
      "title": "失败通知模板",
      "format": "textarea",
      "default": "❌ 数据提取失败\\n任务：{{task_name}}\\n失败原因：{{error}}"
    }
  }
}'::jsonb,
    updated_at = NOW()
WHERE code = 'extraction_notify';

COMMIT;

-- 验证结果
SELECT code, name, 
       config_schema->'required' as required_fields,
       config_schema->'properties' ? 'feishu' as has_feishu
FROM app_definitions
ORDER BY code;
