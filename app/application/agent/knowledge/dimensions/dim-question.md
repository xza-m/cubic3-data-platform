# 题目维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_question_snapshot |
| 实体对象 | 题目 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

根据业务题库设计抽象结构，其中母子题以母题粒度组合。

## 使用说明

获取最新分区日期数据，使用 `question_id` 关联即可。

```sql
SELECT question_id, content, answer, difficulty_level, subject_enum
FROM dwd_question_snapshot
WHERE ds = MAX_PT('dwd_question_snapshot')
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_first_answer_records_snap_di | question_id | 题目的答题记录 |
| dim_question_all_tree_info_df | base_tree_node_ids | 题目关联的知识点 |
| dim_pub_meta_dict_df | question_type, answer_mode | 题型、作答方式枚举 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| question_id | 题目原始 ID | **主键**，题目唯一标识 |
| content | 题干内容 | 清洗 HTML 标签后的题干 |
| answer | 答案 | 清洗 HTML 标签后的答案 |
| analysis | 解析 | 清洗 HTML 标签后的解析 |
| content_raw | 原始题干内容 | |
| answer_raw | 原始答案 | |
| analysis_raw | 原始解析 | |
| question_type | 题目类型 | 可关联元数据维度表 |
| question_topic | 问题专题 | |
| difficulty_level | 题目难度等级 | 1-5，数字越大难度越高 |
| answer_mode | 作答方式 | 可关联元数据维度表 |
| subject_enum | 学科 | 可关联元数据维度表 |
| phase | 学段 | 可关联元数据维度表 |
| base_tree_id | 基础树 ID | |
| base_tree_node_ids | 知识点 ID 列表 | |
| label_type | 标签题目类型 | 可关联元数据维度表 |
| province_code | 题目省份代码 | |
| city_code | 题目市州代码 | |
| area_code | 题目区县代码 | |
| question_year | 题目年份 | |
| remark | 备注 | 母子题合并题目数 |
| extend_info | 扩展信息 | JSON 格式 |
| create_time | 创建时间 | |
| update_time | 更新时间 | |

## 常用过滤条件

```sql
-- 指定学科
WHERE subject_enum = 'math'

-- 指定难度
WHERE difficulty_level BETWEEN 2 AND 4

-- 指定学段
WHERE phase = 'senior'
```
