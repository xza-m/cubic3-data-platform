# GIL 数仓使用指南

## 快速导航

- [维度表索引](dimensions/README.md)
- [学习域数据](domains/study/README.md)
- [查询规范](guides/query-rules.md) - **必读**
- [查询模板](guides/query-templates.md)
- [表关联关系](guides/table-relationships.md)

## 数仓概览

| 项目 | 说明 |
|------|------|
| 业务板块 | K12 在线教育 |
| MaxCompute 项目 | df_cb_258187 |
| 主要数据域 | 用户域、知识点域、课程域、题库域、学习域 |

## 数据域说明

| 数据域 | 说明 | 核心表 |
|--------|------|--------|
| 用户域 | 学生、教师、学校基础信息 | dim_ucenter_user_student_df, dim_ucenter_organization_school_df |
| 知识点域 | 基础树、业务树结构 | dim_question_all_tree_info_df |
| 课程域 | AI 课程信息 | dim_course_lesson_snap_f |
| 题库域 | 题目基础信息 | dwd_question_snapshot |
| 学习域 | 学习会话、答题、进度等 | dwd_study_sessions_snap_f, dwd_study_first_answer_records_snap_di |

## 查询规范

详见 [guides/query-rules.md](guides/query-rules.md)，核心要点：
- 禁止 SELECT *
- 分区表必须指定分区
- 分区范围 ≤ 90 天
- 默认 LIMIT 50000

分区表和豁免表清单请参考 [query-rules.md](guides/query-rules.md#分区表清单)

## 常用查询入口

| 场景 | 推荐表 | 文档 |
|------|--------|------|
| 学生基础信息 | dim_ucenter_user_student_df | [学生维度](dimensions/dim-student.md) |
| 答题效果分析 | dwd_study_first_answer_records_snap_di | [答题记录](domains/study/dwd-answer-records.md) |
| AI 课学习进度 | dwd_study_lesson_progress_snap | [学习进度](domains/study/dwd-lesson-progress.md) |
| 能量发放分析 | dwd_study_energy_detail_di | [能量发放](domains/study/dwd-energy-detail.md) |
