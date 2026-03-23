# 课程维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_course_lesson_snap_f |
| 实体对象 | AI 课程 |
| 表类型 | 全量事务快照 |
| 分区字段 | **无**（豁免分区条件） |

## 业务定义

AI 课程最新版本的组课信息及基础信息。

## 使用说明

直接关联 `lesson_id` 即可，无需分区条件。

```sql
SELECT lesson_id, lesson_name, subject_name, total_duration
FROM dim_course_lesson_snap_f
WHERE lesson_status = 'publish'  -- 已上架课程
  AND deleted = 0  -- 未删除
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_lesson_progress_snap | lesson_id + lesson_version | 课程的学习进度 |
| dim_question_all_tree_info_df | biz_tree_node_info | 课程关联的知识点 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| lesson_id | 课程 ID | **主键** |
| lesson_name | 课程名称 | |
| change_lesson_name | 修改后的课程名称 | |
| phase | 学段 | |
| phase_name | 学段名称 | |
| subject | 学科 | |
| subject_name | 学科名称 | |
| lesson_type | 课程类型 | |
| lesson_status | 课程状态 | publish-已上架，wait-未上架，change-修改待上架 |
| biz_tree_node_info | 业务树叶子结点 ID 数组 | |
| lesson_publish_version | 课程版本 ID | |
| ui_template_id | UI 模板 ID | |
| lesson_widget_json | 课程组件 JSON | |
| lesson_widget_progress_json | 课程组件进度 JSON | |
| widget_count | 组件数量 | |
| total_duration | 课程总时长（秒） | |
| creater_id | 创建人 ID | |
| updater_id | 更新人 ID | |
| publisher_id | 上架人 ID | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |
| publish_time | 上架时间 | |
| deleted | 删除标记 | 0-未删除，1-已删除 |
| delete_time | 删除时间 | |

## 常用过滤条件

```sql
-- 已上架课程
WHERE lesson_status = 'publish'

-- 未删除
WHERE deleted = 0

-- 指定学科
WHERE subject_name = '数学'

-- 指定学段
WHERE phase_name = '高中'
```
