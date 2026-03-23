# 学习域数据

## 概览

学习域包含学生学习行为相关的事实表，是数仓中最核心的业务域。

| 表名 | 业务 | 分区字段 | 表类型 | 文档 |
|------|------|----------|--------|------|
| dwd_study_sessions_snap_f | 学习会话 | 无 | delta table | [查看](dwd-study-sessions.md) |
| dwd_study_lesson_progress_snap | AI 课学习进度（会话粒度） | create_date | delta table | [查看](dwd-lesson-progress.md) |
| dwd_study_lesson_widget_snap | AI 课学习进度（组件粒度） | completed_date | delta table | [查看](dwd-lesson-widget.md) |
| dwd_study_first_answer_records_snap_di | 学生答题记录 | answer_date | delta table | [查看](dwd-answer-records.md) |
| dwd_kt_rec_answer_record_flow_di | 算法 KT 推题 | ds | 普通表 | [查看](dwd-kt-recommend.md) |
| dwd_study_tbl_study_lesson_qa | 问一问记录 | ds | 普通表 | [查看](dwd-lesson-qa.md) |
| dwd_study_energy_detail_di | 能量发放记录 | energy_date | delta table | [查看](dwd-energy-detail.md) |

## 业务过程

| 业务过程 | 说明 | 核心表 |
|----------|------|--------|
| AI 课学习 | 学生观看 AI 课视频、完成课中练习 | dwd_study_lesson_progress_snap |
| 答题练习 | 学生在各场景下的答题行为 | dwd_study_first_answer_records_snap_di |
| 巩固练习 | 课后针对性练习 | dwd_study_first_answer_records_snap_di |
| 拓展练习 | 课后拓展性练习 | dwd_study_first_answer_records_snap_di |
| 问一问 | AI 课中的 AI 问答 | dwd_study_tbl_study_lesson_qa |
| 能量激励 | 学习行为后的能量发放 | dwd_study_energy_detail_di |

## 表关系概览

```
学习会话(dwd_study_sessions_snap_f)
  ├── AI课进度(dwd_study_lesson_progress_snap)  [study_session_id]
  │     └── 组件进度(dwd_study_lesson_widget_snap)  [study_progress_id]
  ├── 答题记录(dwd_study_first_answer_records_snap_di)  [study_session_id]
  │     └── KT推题(dwd_kt_rec_answer_record_flow_di)  [recommend_id]
  ├── 问一问(dwd_study_tbl_study_lesson_qa)  [session_id]
  └── 能量发放(dwd_study_energy_detail_di)  [study_session_id]
```

## 学习类型说明

| study_type | 说明 |
|------------|------|
| ai_course | AI 课学习 |
| consolidation_practice | 巩固练习 |
| extend_practice | 拓展练习 |
| correct_wrong | 错题练习 |
