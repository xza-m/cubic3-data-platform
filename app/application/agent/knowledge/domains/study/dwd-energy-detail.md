# 能量发放记录事实表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_energy_detail_di |
| 分区字段 | energy_date（能量发放日期） |
| 表类型 | delta table |

## 业务定义

在巩固练习、拓展练习等场景，为提升学生的学习动力，会发放能量激励，该表为能量发放的流水表，在能量计算时会结算发放所属该粒度的能量记录，如果触发能量检测上限或者风控策略，会扣除相应能量。

## 使用说明

`energy_date` 为业务日期，含义为能量发放日期。

**使用场景**：反作弊策略效果分析、能量问题排查。

```sql
SELECT 
    user_id,
    event_type,
    theoretical_energy,
    actual_granted_energy,
    reject_reason
FROM dwd_study_energy_detail_di
WHERE energy_date BETWEEN '20240101' AND '20240107'
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dim_ucenter_user_student_df | user_id | 学生维度 |
| dim_ucenter_organization_school_df | school_id | 学校维度 |
| dwd_study_sessions_snap_f | study_session_id | 学习会话 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| id | 主键 ID | |
| user_id | 用户 ID | 外键，可关联学生维度表 |
| user_name | 用户名称 | |
| class_id | 班级 ID | 外键 |
| class_name | 班级名称 | |
| grade_id | 年级 ID | |
| grade_name | 年级名称 | |
| school_id | 学校 ID | 外键，可关联学校维度表 |
| school_name | 学校名称 | |
| subject_type_name | 文理分班信息 | |
| subject_id | 学科 ID | |
| subject_name | 学科名称 | |
| knowledge_id | 知识点 ID | 外键，可关联知识点维度表 |
| knowledge_name | 知识点名称 | |
| event_type | 事件类型 | ai_course/consolidation_practice/extend_practice/correct_wrong 等 |
| study_session_id | 学习会话 ID | 外键，可关联学习会话事实表 |
| theoretical_energy | 理论应得能量 | 基于掌握度计算，不考虑限制 |
| actual_granted_energy | 实际发放的能量 | 考虑每日限制后 |
| is_granted | 是否实际发放 | 无效字段 |
| reject_reason | 拒绝原因 | user_limit_500、knowledge_limit_100 等 |
| total_questions | 总题数 | |
| correct_questions | 正确题数 | |
| exit_type | 退出类型 | manual-中途退出, completed-完成退出, answer-答题 |
| created_at | 创建时间 | |
| updated_at | 更新时间 | |

## 能量计算说明

- **理论能量** (`theoretical_energy`)：基于掌握度计算的应得能量
- **实际能量** (`actual_granted_energy`)：考虑限制后的实际发放能量
- **拦截能量**：`theoretical_energy - actual_granted_energy`

## 拒绝原因说明

| reject_reason | 说明 |
|---------------|------|
| user_limit_500 | 用户每日能量上限 500 |
| knowledge_limit_100 | 知识点每日能量上限 100 |
| 其他 | 风控策略拦截 |

## 常用查询

```sql
-- 统计能量发放和拦截情况
SELECT 
    event_type,
    COUNT(*) AS record_count,
    SUM(theoretical_energy) AS total_theoretical,
    SUM(actual_granted_energy) AS total_granted,
    SUM(theoretical_energy - actual_granted_energy) AS total_blocked
FROM dwd_study_energy_detail_di
WHERE energy_date BETWEEN '20240101' AND '20240107'
GROUP BY event_type
```
