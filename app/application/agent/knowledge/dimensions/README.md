# 维度表索引

## 概览

| 表名 | 实体 | 分区字段 | 文档 |
|------|------|----------|------|
| dim_ucenter_user_student_df | 学生 | ds | [查看](dim-student.md) |
| dim_ucenter_organization_school_df | 学校 | ds | [查看](dim-school.md) |
| dwd_question_snapshot | 题目 | ds | [查看](dim-question.md) |
| dim_question_all_tree_info_df | 知识点 | ds | [查看](dim-knowledge.md) |
| dim_course_lesson_snap_f | 课程 | 无 | [查看](dim-course.md) |
| dim_pub_meta_dict_df | 元数据字典 | ds | [查看](dim-meta-dict.md) |
| dim_pub_student_subject_insight_df | 学生学科能力 | ds | [查看](dim-student-ability.md) |

## 维度关系

```
学生(dim_ucenter_user_student_df)
  └── 学校(dim_ucenter_organization_school_df)  [organization_id = school_id]
  └── 学科能力(dim_pub_student_subject_insight_df)  [student_id]

题目(dwd_question_snapshot)
  └── 知识点(dim_question_all_tree_info_df)  [base_tree_node_ids]
  └── 元数据字典(dim_pub_meta_dict_df)  [question_type, answer_mode 等]

课程(dim_course_lesson_snap_f)
  └── 知识点(dim_question_all_tree_info_df)  [biz_tree_node_info]
```
