# 学习会话事实表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_sessions_snap_f |
| 分区字段 | **无**（豁免分区条件） |
| 表类型 | delta table |

## 业务定义

学生一切学习（除背单词）相关的会话连接管理。

## 使用说明

全量快照事务表，采用非分区 delta 表模式，每日自动 MERGE 变更会话的状态和进度，稍微打宽了几个重要维度的属性值。

**使用场景**：学习会话相关分析，学习会话问题排查。

```sql
SELECT 
    study_session_id,
    student_id,
    subject_name,
    study_type_name,
    session_status,
    total_duration
FROM dwd_study_sessions_snap_f
WHERE student_id = '123456'
LIMIT 100
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dim_ucenter_user_student_df | student_id | 学生维度 |
| dim_ucenter_organization_school_df | school_id | 学校维度 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |
| dwd_study_first_answer_records_snap_di | study_session_id | 会话下的答题记录 |
| dwd_study_lesson_progress_snap | study_session_id | 会话的 AI 课进度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| study_session_id | 学习会话 ID | **业务主键** |
| student_id | 学生 ID | 学生外键，可关联学生维度表 |
| student_name | 学生姓名 | |
| subject_id | 学科 ID | 学科外键，可关联元数据表 |
| subject_name | 学科名称 | |
| phase_id | 学段 ID | 学段外键，可关联元数据表 |
| phase_name | 学段名称 | |
| study_type | 学习类型 | 学习类型外键，可关联元数据表 |
| study_type_name | 学习类型名称 | |
| session_status | 会话状态 | |
| task_id | 任务 ID | |
| session_config | 会话配置 | |
| start_time | 开始时间 | |
| end_time | 结束时间 | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |
| total_duration | 总时长 | |
| class_id | 班级 ID | 班级外键 |
| class_name | 班级名称 | |
| grade_name | 年级名称 | |
| subject_type_name | 文理分班信息 | |
| school_id | 学校 ID | 学校外键，可关联学校机构维度表 |
| school_name | 学校名称 | |
| knowledge_id | 知识点 ID | 知识点外键，可关联知识点维度表 |
| knowledge_name | 知识点名称 | |
| knowledge_difficulty | 知识点难度 | |
| student_task_id | 学生任务 ID | |
| root_session_id | 根会话 ID | 用来关联学生知识点任务类型的全部会话 |

## 常用过滤条件

```sql
-- 指定学习类型
WHERE study_type_name = '巩固练习'

-- 指定学科
WHERE subject_name = '数学'

-- 指定时间范围
WHERE create_time >= '2024-01-01'
```
