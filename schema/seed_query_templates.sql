-- 预设查询模板数据
-- 创建日期: 2026-01-21

-- 用户分析类模板
INSERT INTO query_templates (template_name, template_description, sql_template, parameters, category, tags, created_by)
VALUES 
(
    '用户增长趋势分析',
    '统计指定时间范围内的用户新增趋势，支持按日、周、月三种粒度进行分析',
    'SELECT 
    DATE(created_at) as date,
    COUNT(*) as new_users
FROM {{table_name}}
WHERE created_at BETWEEN ''{{start_date}}'' AND ''{{end_date}}''
GROUP BY DATE(created_at)
ORDER BY date',
    '[{"name": "table_name", "type": "text", "default": "users", "label": "用户表名"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}, {"name": "end_date", "type": "date", "default": "2024-12-31", "label": "结束日期"}]'::jsonb,
    '用户分析',
    '["用户", "增长", "趋势"]'::jsonb,
    'system'
),
(
    '活跃用户统计',
    '统计日活跃用户（DAU）、周活跃用户（WAU）、月活跃用户（MAU）',
    'SELECT 
    COUNT(DISTINCT CASE WHEN DATE(last_login_at) = CURRENT_DATE THEN user_id END) as dau,
    COUNT(DISTINCT CASE WHEN last_login_at >= CURRENT_DATE - INTERVAL ''7 days'' THEN user_id END) as wau,
    COUNT(DISTINCT CASE WHEN last_login_at >= CURRENT_DATE - INTERVAL ''30 days'' THEN user_id END) as mau
FROM {{table_name}}',
    '[{"name": "table_name", "type": "text", "default": "users", "label": "用户表名"}]'::jsonb,
    '用户分析',
    '["活跃用户", "DAU", "MAU"]'::jsonb,
    'system'
);

-- 销售分析类模板
INSERT INTO query_templates (template_name, template_description, sql_template, parameters, category, tags, created_by)
VALUES 
(
    '日销售额统计',
    '按日期统计销售额、订单数、客单价',
    'SELECT 
    DATE(order_time) as date,
    COUNT(*) as order_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount
FROM {{table_name}}
WHERE order_time BETWEEN ''{{start_date}}'' AND ''{{end_date}}''
    AND status = ''completed''
GROUP BY DATE(order_time)
ORDER BY date',
    '[{"name": "table_name", "type": "text", "default": "orders", "label": "订单表名"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}, {"name": "end_date", "type": "date", "default": "2024-12-31", "label": "结束日期"}]'::jsonb,
    '销售分析',
    '["销售", "日报", "GMV"]'::jsonb,
    'system'
),
(
    '销售漏斗分析',
    '分析从浏览到购买的转化漏斗',
    'SELECT 
    COUNT(DISTINCT CASE WHEN action = ''view'' THEN user_id END) as view_count,
    COUNT(DISTINCT CASE WHEN action = ''add_cart'' THEN user_id END) as cart_count,
    COUNT(DISTINCT CASE WHEN action = ''checkout'' THEN user_id END) as checkout_count,
    COUNT(DISTINCT CASE WHEN action = ''purchase'' THEN user_id END) as purchase_count
FROM {{table_name}}
WHERE action_time BETWEEN ''{{start_date}}'' AND ''{{end_date}}''',
    '[{"name": "table_name", "type": "text", "default": "user_actions", "label": "行为表名"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}, {"name": "end_date", "type": "date", "default": "2024-12-31", "label": "结束日期"}]'::jsonb,
    '销售分析',
    '["漏斗", "转化率", "购买"]'::jsonb,
    'system'
);

-- 产品分析类模板
INSERT INTO query_templates (template_name, template_description, sql_template, parameters, category, tags, created_by)
VALUES 
(
    '商品销量Top10',
    '统计销量最高的商品',
    'SELECT 
    product_id,
    product_name,
    COUNT(*) as sales_count,
    SUM(amount) as total_sales
FROM {{table_name}}
WHERE order_time BETWEEN ''{{start_date}}'' AND ''{{end_date}}''
    AND status = ''completed''
GROUP BY product_id, product_name
ORDER BY sales_count DESC
LIMIT 10',
    '[{"name": "table_name", "type": "text", "default": "order_items", "label": "订单明细表"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}, {"name": "end_date", "type": "date", "default": "2024-12-31", "label": "结束日期"}]'::jsonb,
    '产品分析',
    '["商品", "销量", "排行"]'::jsonb,
    'system'
),
(
    '库存预警查询',
    '查询库存低于安全水位的商品',
    'SELECT 
    product_id,
    product_name,
    current_stock,
    safe_stock,
    (safe_stock - current_stock) as shortage
FROM {{table_name}}
WHERE current_stock < safe_stock
ORDER BY shortage DESC',
    '[{"name": "table_name", "type": "text", "default": "products", "label": "商品表名"}]'::jsonb,
    '产品分析',
    '["库存", "预警", "补货"]'::jsonb,
    'system'
);

-- 运营分析类模板
INSERT INTO query_templates (template_name, template_description, sql_template, parameters, category, tags, created_by)
VALUES 
(
    '留存率分析',
    '计算用户留存率（次日、7日、30日留存）',
    'WITH user_first_day AS (
    SELECT user_id, MIN(DATE(action_time)) as first_day
    FROM {{table_name}}
    GROUP BY user_id
)
SELECT 
    first_day,
    COUNT(DISTINCT u.user_id) as new_users,
    COUNT(DISTINCT CASE WHEN DATE(a.action_time) = u.first_day + 1 THEN a.user_id END) as d1_retained,
    COUNT(DISTINCT CASE WHEN DATE(a.action_time) = u.first_day + 7 THEN a.user_id END) as d7_retained,
    COUNT(DISTINCT CASE WHEN DATE(a.action_time) = u.first_day + 30 THEN a.user_id END) as d30_retained
FROM user_first_day u
LEFT JOIN {{table_name}} a ON u.user_id = a.user_id
WHERE u.first_day BETWEEN ''{{start_date}}'' AND ''{{end_date}}''
GROUP BY first_day
ORDER BY first_day',
    '[{"name": "table_name", "type": "text", "default": "user_actions", "label": "行为表名"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}, {"name": "end_date", "type": "date", "default": "2024-12-31", "label": "结束日期"}]'::jsonb,
    '运营分析',
    '["留存", "留存率", "用户运营"]'::jsonb,
    'system'
),
(
    'RFM客户分群',
    '基于最近一次消费（Recency）、消费频率（Frequency）、消费金额（Monetary）进行客户分群',
    'WITH customer_rfm AS (
    SELECT 
        user_id,
        EXTRACT(DAY FROM (CURRENT_DATE - MAX(order_time))) as recency,
        COUNT(*) as frequency,
        SUM(amount) as monetary
    FROM {{table_name}}
    WHERE order_time >= ''{{start_date}}''
    GROUP BY user_id
)
SELECT 
    CASE 
        WHEN recency <= 30 AND frequency >= 5 AND monetary >= 1000 THEN ''高价值客户''
        WHEN recency <= 30 AND frequency >= 3 THEN ''活跃客户''
        WHEN recency > 90 AND frequency >= 5 THEN ''沉睡高价值客户''
        WHEN recency > 90 THEN ''流失客户''
        ELSE ''普通客户''
    END as customer_segment,
    COUNT(*) as customer_count,
    AVG(recency) as avg_recency,
    AVG(frequency) as avg_frequency,
    AVG(monetary) as avg_monetary
FROM customer_rfm
GROUP BY customer_segment
ORDER BY customer_count DESC',
    '[{"name": "table_name", "type": "text", "default": "orders", "label": "订单表名"}, {"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}]'::jsonb,
    '运营分析',
    '["RFM", "客户分群", "客户价值"]'::jsonb,
    'system'
);
