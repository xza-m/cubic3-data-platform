# 学生学科能力维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_pub_student_subject_insight_df |
| 实体对象 | 学生、学科 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

根据 IRT 模型分数以本科率区间比例划分学科能力分层（S+、S、A、B、C）。

## 使用说明

获取最新分区日期数据，使用 `student_id`、`subject_name` 关联即可。

```sql
SELECT student_id, subject_name, level_tag, ability_mean, accuracy
FROM dim_pub_student_subject_insight_df
WHERE ds = MAX_PT('dim_pub_student_subject_insight_df')
  AND subject_name = '数学'
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dim_ucenter_user_student_df | student_id | 学生基础信息 |
| dwd_study_first_answer_records_snap_di | student_id | 学生的答题记录 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| student_id | 学生 ID | **联合主键**，可关联学生维度表 |
| subject_name | 学科名称 | **联合主键** |
| ability_mean | IRT 能力值 (Theta) | |
| ability_std | 能力值标准差 | 0-1，越小越好 |
| stability_val | 能力稳定性 | 基于 std 转化 |
| answer_count | 答题数量 | 最近六个月 |
| accuracy | 最近周期正确率 | |
| ability_percentile | 能力分位数 | 0-1 |
| level_tag | 能力分层标识 | S+/S/A/B/C |
| status_tag | 学习状态标识 | 突破期/发展期/动荡期/观察期 |
| diagnosis_tag | 行为诊断标识 | 稳步精进/眼高手低/浅层学习/无效学习 |

## 能力分层说明

| 等级 | 说明 | 特点 |
|------|------|------|
| S+ | 顶尖水平 | 能力值处于最高区间 |
| S | 优秀水平 | 能力值较高 |
| A | 良好水平 | 能力值中上 |
| B | 中等水平 | 能力值中等 |
| C | 待提升 | 能力值较低 |

## 常用过滤条件

```sql
-- 指定能力等级
WHERE level_tag IN ('S+', 'S')

-- 答题量足够的学生
WHERE answer_count >= 50

-- 能力稳定的学生
WHERE ability_std < 0.3
```
