-- 应用中心 - 内置应用定义 Seed 数据
-- 创建日期: 2026-01-21

-- 1. BI 看板推送
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'bi_dashboard_push',
    'BI看板推送',
    'bi_integration',
    '调用 Superset 截图 API 获取看板截图并推送至飞书群聊',
    '{
      "type": "object",
      "required": ["superset", "feishu"],
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
            "dashboard_id": {
              "type": "integer",
              "title": "看板 ID",
              "minimum": 1
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
            "screenshot_width": {
              "type": "integer",
              "title": "截图宽度（像素）",
              "default": 1920,
              "minimum": 800,
              "maximum": 3840
            }
          }
        },
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
            },
            "message_template": {
              "type": "string",
              "title": "消息模板",
              "format": "textarea",
              "default": "📊 {{dashboard_name}}\\n时间：{{date}}"
            }
          }
        }
      }
    }'::jsonb,
    'BarChartOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;

-- 2. 数据集卡片推送
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'dataset_card_push',
    '数据集卡片推送',
    'data_notification',
    '查询数据集元数据并生成飞书交互式卡片推送',
    '{
      "type": "object",
      "required": ["dataset_id", "feishu"],
      "properties": {
        "dataset_id": {
          "type": "integer",
          "title": "数据集 ID",
          "minimum": 1
        },
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
            },
            "include_fields": {
              "type": "boolean",
              "title": "包含字段列表",
              "default": true
            },
            "include_stats": {
              "type": "boolean",
              "title": "包含统计信息",
              "default": true
            }
          }
        }
      }
    }'::jsonb,
    'TableOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;

-- 3. 周报日报推送
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'report_push',
    '周报日报推送',
    'data_report',
    '执行 SQL 查询并格式化为文本推送到飞书',
    '{
      "type": "object",
      "required": ["datasource_id", "sql_query", "feishu"],
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
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
            },
            "message_template": {
              "type": "string",
              "title": "消息模板",
              "format": "textarea",
              "default": "📈 {{report_type}}数据报告\\n时间：{{date}}\\n\\n{{table}}"
            }
          }
        }
      }
    }'::jsonb,
    'FileTextOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;

-- 4. 异常数据监控
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'anomaly_monitor',
    '异常数据监控',
    'data_alert',
    '执行 SQL 查询并根据阈值判断是否告警',
    '{
      "type": "object",
      "required": ["datasource_id", "sql_query", "threshold", "feishu"],
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
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
            },
            "alert_template": {
              "type": "string",
              "title": "告警模板",
              "format": "textarea",
              "default": "⚠️ 数据异常告警\\n时间：{{date}}\\n监控指标：{{value}} {{operator}} {{threshold}}\\n详情：{{details}}"
            }
          }
        }
      }
    }'::jsonb,
    'AlertOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;

-- 5. 查询结果推送
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'query_result_push',
    '查询结果推送',
    'data_notification',
    '执行 SQL 查询并格式化结果推送到飞书',
    '{
      "type": "object",
      "required": ["datasource_id", "sql_query", "feishu"],
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
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
            },
            "message_template": {
              "type": "string",
              "title": "消息模板",
              "format": "textarea",
              "default": "📊 查询结果\\n时间：{{date}}\\n\\n{{result}}"
            }
          }
        }
      }
    }'::jsonb,
    'SendOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;

-- 6. 数据提取通知
INSERT INTO app_definitions (code, name, category, description, config_schema, icon, author, version, enabled)
VALUES (
    'extraction_notify',
    '数据提取通知',
    'data_notification',
    '监听数据提取完成事件并推送通知',
    '{
      "type": "object",
      "required": ["feishu"],
      "properties": {
        "extraction_task_id": {
          "type": "integer",
          "title": "提取任务 ID（可选）",
          "description": "留空则监听所有提取任务",
          "minimum": 1
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
        "feishu": {
          "type": "object",
          "title": "飞书配置",
          "required": ["chat_id"],
          "properties": {
            "chat_id": {
              "type": "string",
              "title": "飞书群 ID"
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
        }
      }
    }'::jsonb,
    'BellOutlined',
    'System',
    '1.0.0',
    true
) ON CONFLICT (code) DO NOTHING;
