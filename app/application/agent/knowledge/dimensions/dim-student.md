# 学生维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_ucenter_user_student_df |
| 实体对象 | 学生 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

保存所有学生的基础信息，包含学生所属班级、年级、学校信息。

## 使用说明

获取最新分区日期数据，使用 `user_id` 关联即可。

```sql
SELECT user_id, user_name, user_grade_name, organization_id
FROM dim_ucenter_user_student_df
WHERE ds = MAX_PT('dim_ucenter_user_student_df')
  AND user_is_test = 1  -- 排除测试用户
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dim_ucenter_organization_school_df | organization_id = school_id | 学生所属学校 |
| dwd_study_sessions_snap_f | student_id | 学生的学习会话 |
| dwd_study_first_answer_records_snap_di | student_id | 学生的答题记录 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| user_id | 用户 ID | **主键**，学生唯一标识 |
| user_name | 用户名 | |
| user_account | 用户账号 | |
| user_phone | 用户电话 | |
| user_class_id | 用户班级 ID | |
| user_grade_id | 用户年级 ID | |
| user_grade_name | 用户年级名称 | |
| organization_id | 学校 ID | **外键**，可关联学校维度 |
| user_is_test | 是否测试用户 | 1-正式用户，0-测试用户 |
| user_status | 用户状态 | 1-尚未启用, 2-试用, 3-付费, 4-停用, 5-尚未付费或过期 |
| user_number | 用户学号 | |
| user_source | 用户来源 | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |

## 常用过滤条件

```sql
-- 排除测试用户
WHERE user_is_test = 1

-- 仅付费用户
WHERE user_status = 3

-- 指定年级
WHERE user_grade_name = '高一'
```
