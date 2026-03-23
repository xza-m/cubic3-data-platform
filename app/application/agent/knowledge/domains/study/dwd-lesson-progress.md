# AI 课学习进度事实表（会话粒度）

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_lesson_progress_snap |
| 分区字段 | create_date（会话创建日期） |
| 表类型 | delta table |

## 业务定义

学生 AI 课学习会话的进度管理，记录 AI 课中各会话的组件学习进度、时长和其他信息。

## 使用说明

增量快照事务表，采用分区 delta 表模式，每日自动 MERGE 变更会话进度并动态分区写入。

**使用场景**：AI 课学习时长、数量、完成度相关分析，AI 课学习问题排查。

```sql
SELECT 
    study_session_id,
    lesson_id,
    student_id,
    completed_widget_count,
    total_widget_count,
    lesson_duration
FROM dwd_study_lesson_progress_snap
WHERE create_date BETWEEN '20240101' AND '20240107'
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_sessions_snap_f | study_session_id | 关联会话信息 |
| dim_course_lesson_snap_f | lesson_id + lesson_version | 关联课程维度 |
| dim_ucenter_user_student_df | student_id | 学生维度 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |
| dwd_study_lesson_widget_snap | study_progress_id | 组件粒度进度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| study_progress_id | 学习进度 ID | **主键**，标识进度管理 |
| study_session_id | 关联的学习会话 ID | 会话外键 |
| lesson_id | AI 课程 ID | 课程外键 |
| lesson_version | AI 课程版本 | |
| knowledge_id | 知识点 ID | 知识点外键 |
| current_widget_index | 当前组件序号 | |
| total_widget_count | 总组件数 | |
| completed_widget_count | 已完成组件数 | |
| widget_progress | 各组件详细进度 | 各组件进度信息数组，会话与组件为 1:N |
| lesson_duration | 课程学习时长（毫秒） | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |
| student_id | 学生 ID | 学生外键 |
| exercise_session_id | 课中练习会话 ID | |

## 常用查询

```sql
-- 统计某时间段内的课程完成率
SELECT 
    lesson_id,
    COUNT(*) AS session_count,
    SUM(CASE WHEN completed_widget_count = total_widget_count THEN 1 ELSE 0 END) AS completed_count,
    ROUND(SUM(CASE WHEN completed_widget_count = total_widget_count THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS completion_rate
FROM dwd_study_lesson_progress_snap
WHERE create_date BETWEEN '20240101' AND '20240107'
GROUP BY lesson_id
```
