# 元数据字典维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_pub_meta_dict_df |
| 实体对象 | 字典类型、字典键 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

业务上特定领域的枚举值含义。

## 使用说明

获取最新分区日期数据，关联特定业务（`meta_dict_type`）的业务键（`meta_dict_key`）即可。

```sql
-- 查询学段枚举
SELECT meta_dict_key, meta_dict_name
FROM dim_pub_meta_dict_df
WHERE ds = MAX_PT('dim_pub_meta_dict_df')
  AND meta_dict_type = 'phase'
```

## 支持的字典类型

| 字典类型 | 说明 | 使用场景 |
|----------|------|----------|
| phase | 学段 | 小学/初中/高中 |
| subject | 学科 | 数学/语文/英语等 |
| answer_mode | 作答方式 | 选择/填空/主观等 |
| evaluation_type | 判题类型 | 系统判题/自评判题 |
| answer_result | 判题结果 | 正确/错误/部分正确等 |
| accept_ai_evaluation | 是否认可 AI 批改结果 | 是/否 |

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_question_snapshot | question_type, answer_mode | 题目类型、作答方式 |
| dwd_study_first_answer_records_snap_di | study_type, answer_mode | 学习类型、作答方式 |
| dwd_study_sessions_snap_f | study_type | 学习类型 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| meta_dict_type | 字典类型 | **联合主键**，标识字典类型 |
| meta_dict_key | 字典键 | **联合主键**，标识字典键 |
| meta_dict_name | 字典值 | 枚举值的中文含义 |

## 使用示例

```sql
-- 关联答题记录获取学习类型名称
SELECT 
    a.answer_record_id,
    a.study_type,
    d.meta_dict_name AS study_type_name
FROM dwd_study_first_answer_records_snap_di a
LEFT JOIN dim_pub_meta_dict_df d
    ON a.study_type = d.meta_dict_key
    AND d.meta_dict_type = 'study_type'
    AND d.ds = MAX_PT('dim_pub_meta_dict_df')
WHERE a.answer_date = '20240101'
```
