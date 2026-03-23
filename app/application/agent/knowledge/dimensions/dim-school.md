# 学校维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_ucenter_organization_school_df |
| 实体对象 | 学校 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

保存所有学校的基础信息，包含学校基础信息。

## 使用说明

获取最新分区日期数据，使用 `school_id` 关联即可。

```sql
SELECT school_id, school_name, school_edu_level_name, school_region_name
FROM dim_ucenter_organization_school_df
WHERE ds = MAX_PT('dim_ucenter_organization_school_df')
  AND school_is_test = 0  -- 排除测试学校
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dim_ucenter_user_student_df | school_id = organization_id | 学校下的学生 |
| dwd_study_sessions_snap_f | school_id | 学校的学习会话 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| school_id | 学校 ID | **主键**，学校唯一标识 |
| school_name | 学校名称 | |
| school_number | 学校 CODE | |
| school_edu_level | 学段信息（ID） | |
| school_edu_level_name | 学段信息 | 如：小学、初中、高中 |
| school_edu_system | 办学性质（ID） | |
| school_edu_system_name | 办学性质 | |
| school_nature | 校区标签 | |
| school_feature | 学校特色（ID） | |
| school_feature_name | 学校特色 | |
| school_tag | 学校标签 | |
| school_region_name | 学校区域 | 三级行政区划 |
| school_address | 学校地址 | |
| school_is_test | 是否测试学校 | |
| school_status | 学校状态 | 1-尚未启用, 2-试用中, 3-付费使用, 4-停止合作, 5-未付费 |
| create_time | 创建时间 | |
| update_time | 更新时间 | |

## 常用过滤条件

```sql
-- 排除测试学校
WHERE school_is_test = 0

-- 仅付费学校
WHERE school_status = 3

-- 指定学段
WHERE school_edu_level_name = '高中'
```
