# 语义层建设 PRD

> 状态：高价值设计文档，部分能力已落地，部分章节仍属规划或演进目标。
> 使用时请同时对照当前语义中心实现、相关架构/ADR 文档和现有 API/前端代码。

## 一、背景与目标

### 1.1 现状问题

当前 DataAgent 的知识体系采用 **Markdown 文档 + LLM 工具调用** 模式：

| 问题 | 说明 |
|------|------|
| 知识分散 | 14 份 Markdown 文档各自描述表结构、字段、关联关系，缺乏统一元数据模型 |
| 指标无定义 | 正确率、完成率、能量拦截率等指标由 LLM 每次现场拼写 SQL，口径不一致 |
| 关联靠记忆 | JOIN 路径散落在 `table-relationships.md`，LLM 经常遗漏或拼错 JOIN 条件 |
| 不可编译 | 知识仅面向人阅读，无法被程序解析、校验或自动生成 SQL |
| 同步困难 | 物理表变更（新增字段、类型修改）无法自动感知，需手工更新 Markdown |

### 1.2 目标

构建 **Cube.js 风格的轻量级语义层**，替代现有 Markdown 知识体系：

| 目标 | 说明 |
|------|------|
| 结构化 | Cube 定义采用 YAML 格式，字段、指标、关联关系全部机器可读 |
| 可编译 | Agent 构造 DSL → Query Compiler 编译为 SQL，消除 LLM 拼写 SQL 的不确定性 |
| 指标一致 | 每个 Measure 有唯一定义（`sql` 表达式 + 聚合类型），不同查询引用同一指标保证口径一致 |
| 关联自动化 | JOIN 关系在 Cube 中声明，Compiler 通过 JoinGraph 自动推导最短路径 |
| 可同步 | 定时任务对比 YAML 定义与物理表 Schema，自动检测漂移 |
| 多消费者 | 语义层同时服务 DataAgent（飞书/DataChat）和未来的 BI 查询中心 |

### 1.3 非目标

- 不替代 MaxCompute 的 SQL 引擎，Compiler 生成的仍是标准 MaxCompute SQL
- 不支持写操作（INSERT/UPDATE/DELETE）
- 不做实时数据流处理，仅面向离线/近线数仓
- P1 不建设 Canvas UI 和开发者工具高级功能（预留接口，P2 实现）

---

## 二、核心概念

### 2.1 概念定义

| 概念 | 说明 | 类比 |
|------|------|------|
| **Cube** | 围绕一张事实表或维度表构建的语义单元，包含维度、指标、关联、分段 | Cube.js 的 Cube |
| **Dimension** | 描述实体属性的字段，用于分组和过滤 | GROUP BY / WHERE 中的列 |
| **Measure** | 聚合指标，定义了计算逻辑（SQL 表达式 + 聚合函数） | SUM(...)、COUNT(...)、AVG(...) |
| **Segment** | 预定义的过滤条件片段，可在查询中按名引用 | WHERE 子句的命名快捷方式 |
| **Join** | Cube 之间的关联关系，声明 JOIN 类型和条件 | SQL JOIN |
| **Partition** | 分区策略，声明分区字段和默认分区表达式 | MaxCompute 分区表 |
| **Default Filter** | 默认过滤条件，每次查询自动注入 | 排除测试数据等 |
| **Enum** | 字段的枚举值说明，帮助 LLM 理解业务含义 | 数据字典 |
| **View** | 基于多个 Cube 的策展层，挑选维度/指标并指定 JOIN 路径暴露给特定消费者 | Cube.js View / 虚拟数据集的语义上位替代 |
| **Recipe** | 查询配方，包含典型业务问题和对应的标准 DSL，系统自动从 DSL 中提取关联的 Cube/View 并构建反向索引，作为 Few-shot 示例注入 LLM | Cursor Skill 中的示例 / dbt Metrics 的 example queries |

> 当前实现基线（2026-03）
> - `Cube` 是分析执行真相源，`Ontology` 是业务语义真相源。
> - `Domain` 收窄为业务上下文、资产组织、候选范围和 Agent 提示的承载对象，不作为指标、关系、动作或 Join 的第三套真相源。
> - `Domain.cubes[]` / 业务上下文资产画布只作为 `Cube <-> Domain` 资产归属和候选范围事实，`Cube.domain_id` 仅作为兼容投影字段保留。
> - Domain 不再提供 Join 建模入口；历史 `joins` 字段只允许被读入和审计，不参与发布、校验、画布、查询编译或正式 Agent 命中。
> - `View` 在当前工作台按“特殊 Cube”收敛到列表、详情、编译与物化链路。
> - `Recipe` 继续保持轻量消费对象，主要服务查询示例和上下文注入。
> - “同一领域内重复实例化同一个 Cube 且使用不同 Join 条件”不属于当前范围。

### 2.2 Dimension 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `string` | 普通字符串维度 | user_name、school_name |
| `number` | 数值维度 | user_grade_id、difficulty_level |
| `time` | 时间维度，支持日期粒度换算 | answer_date、create_time |
| `boolean` | 布尔维度 | is_leaf、deleted |

### 2.3 Measure 聚合类型

| 类型 | SQL 行为 | 示例 |
|------|----------|------|
| `count` | COUNT(*) | 答题总数 |
| `count_distinct` | COUNT(DISTINCT expr) | 去重学生数 |
| `sum` | SUM(expr) | 总能量 |
| `avg` | AVG(expr) | 平均答题耗时 |
| `min` / `max` | MIN/MAX(expr) | 最早/最晚答题时间 |
| `number` | 无聚合，基于其他 Measure 计算 | 正确率 = correct_count / total_count |

### 2.4 Join 类型

| 类型 | SQL 行为 | 使用场景 |
|------|----------|----------|
| `left` | LEFT JOIN | 事实表 → 维度表（维度可能缺失） |
| `inner` | INNER JOIN | 事实表 → 事实表（要求两边都有数据） |
| `left_each` | LEFT JOIN（一对多） | 保留主表全量，允许扇出 |

---

## 三、Cube YAML Schema 规范

### 3.1 完整 Schema 结构

```yaml
# cube 唯一标识（snake_case）
name: answer_records

# 人类可读名称（中文）
title: 学生答题记录

# 业务描述
description: |
  学生首次答题记录事实表，观察学生答题情况的核心依据。
  answer_date 为答题提交日期，未完成答题归档在 99991231 分区。

# 物理表名
table: dwd_study_first_answer_records_snap_di

# 数据源标识（可选，默认 maxcompute）
data_source: maxcompute    # maxcompute | clickhouse | postgresql | mysql

# 分区策略
partition:
  field: answer_date          # 分区字段名
  type: date                  # date | string
  format: "yyyyMMdd"         # 日期格式（MaxCompute 分区格式）
  max_range_days: 90          # 最大查询范围（天）
  latest_expr: null           # 无 MAX_PT，按日期范围查

# 默认过滤（每次查询自动注入）
default_filters:
  - sql: "answer_result IN (1, 2)"
    description: "仅统计已判题（正确或错误）"

# ============ 维度 ============
dimensions:
  answer_record_id:
    title: 答题记录ID
    type: string
    sql: "{CUBE}.answer_record_id"
    primary_key: true

  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id

  question_id:
    title: 题目ID
    type: string
    sql: "{CUBE}.question_id"
    foreign_key:
      cube: question
      field: question_id

  knowledge_id:
    title: 知识点ID
    type: string
    sql: "{CUBE}.knowledge_id"

  knowledge_name:
    title: 知识点名称
    type: string
    sql: "{CUBE}.knowledge_name"

  subject_id:
    title: 学科ID
    type: string
    sql: "{CUBE}.subject_id"

  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"

  study_type_name:
    title: 学习类型
    type: string
    sql: "{CUBE}.study_type_name"

  answer_result:
    title: 答题结果
    type: number
    sql: "{CUBE}.answer_result"
    enum_source:                     # 从字典表动态加载
      type: meta_dict
      dict_type: "answer_result"

  question_difficulty:
    title: 题目难度
    type: number
    sql: "{CUBE}.question_difficulty"
    enum:                            # 不在字典表中，静态定义
      1: 较简单
      2: 简单
      3: 中等
      4: 较难
      5: 困难

  answer_date:
    title: 答题日期
    type: time
    sql: "{CUBE}.answer_date"

  answer_time:
    title: 答题时间
    type: time
    sql: "{CUBE}.answer_time"

  answer_duration:
    title: 答题耗时(ms)
    type: number
    sql: "{CUBE}.answer_duration"

  study_session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.study_session_id"
    foreign_key:
      cube: study_sessions
      field: study_session_id

  recommend_id:
    title: 推题策略ID
    type: string
    sql: "{CUBE}.recommend_id"
    foreign_key:
      cube: kt_recommend
      field: recommend_id

# ============ 指标 ============
measures:
  total_count:
    title: 答题总数
    type: count
    sql: "{CUBE}.answer_record_id"

  correct_count:
    title: 正确题数
    type: sum
    sql: "CASE WHEN {CUBE}.answer_result = 1 THEN 1 ELSE 0 END"

  wrong_count:
    title: 错误题数
    type: sum
    sql: "CASE WHEN {CUBE}.answer_result = 2 THEN 1 ELSE 0 END"

  accuracy:
    title: 正确率
    type: number
    sql: "ROUND({correct_count} * 100.0 / NULLIF({total_count}, 0), 2)"
    description: "正确题数 / 总答题数 × 100%"
    format: percent

  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.student_id"

  avg_duration:
    title: 平均答题耗时(ms)
    type: avg
    sql: "{CUBE}.answer_duration"

# ============ 分段 ============
segments:
  only_correct_wrong:
    title: 仅已判题
    sql: "{CUBE}.answer_result IN (1, 2)"

  system_evaluation:
    title: 仅系统判题
    sql: "{CUBE}.evaluation_type = 1"

# ============ 关联 ============
joins:
  student:
    cube: student
    type: left
    relationship: "N:1"            # 多条答题记录 → 一个学生（安全 JOIN）
    sql: "{CUBE}.student_id = {student}.user_id"

  question:
    cube: question
    type: left
    relationship: "N:1"
    sql: "{CUBE}.question_id = {question}.question_id"

  knowledge:
    cube: knowledge
    type: left
    relationship: "N:1"
    sql: "{CUBE}.knowledge_id = {knowledge}.node_id"

  study_sessions:
    cube: study_sessions
    type: left
    relationship: "N:1"
    sql: "{CUBE}.study_session_id = {study_sessions}.study_session_id"

  kt_recommend:
    cube: kt_recommend
    type: left
    relationship: "1:1"
    sql: "{CUBE}.recommend_id = {kt_recommend}.recommend_id"
```

### 3.2 Schema 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Cube 唯一标识，snake_case |
| `title` | 是 | 中文标题 |
| `description` | 否 | 业务描述，帮助 LLM 理解用途 |
| `table` | 是 | 物理表名 |
| `data_source` | 否 | 数据源标识：`maxcompute`（默认）/ `clickhouse` / `postgresql` / `mysql`。Compiler 据此选择 SQL 方言和执行 adapter。P1 仅支持 maxcompute |
| `partition` | 否 | 分区策略，无分区表可省略 |
| `partition.field` | 是 | 分区字段名 |
| `partition.type` | 是 | `date`（可换算日期）或 `string` |
| `partition.format` | 否 | 日期格式，默认 `yyyyMMdd` |
| `partition.max_range_days` | 否 | 最大查询天数范围，默认 90 |
| `partition.latest_expr` | 否 | 获取最新分区的表达式，如 `MAX_PT('{table}')` |
| `default_filters` | 否 | 默认注入的 WHERE 条件列表 |
| `dimensions` | 是 | 维度字段映射 |
| `dimensions.*.sql` | 是 | SQL 表达式，`{CUBE}` 为当前表别名占位符 |
| `dimensions.*.primary_key` | 否 | 是否主键 |
| `dimensions.*.foreign_key` | 否 | 外键引用（`cube` + `field`） |
| `dimensions.*.enum` | 否 | 静态枚举值说明（key: value 映射），适用于不在字典表中的固有属性 |
| `dimensions.*.enum_source` | 否 | 动态枚举来源，从 `dim_pub_meta_dict_df` 自动加载。与 `enum` 互斥，优先级高于 `enum` |
| `dimensions.*.enum_source.type` | 是 | 来源类型，目前仅支持 `meta_dict` |
| `dimensions.*.enum_source.dict_type` | 是 | 字典表中的 `meta_dict_type` 值，如 `answer_result`、`phase` |
| `measures` | 是 | 指标定义映射 |
| `measures.*.type` | 是 | 聚合类型：count / count_distinct / sum / avg / min / max / number |
| `measures.*.sql` | 是 | SQL 表达式；`number` 类型可引用其他 Measure（`{measure_name}`） |
| `measures.*.format` | 否 | 格式化提示：`percent` / `currency` / `duration` |
| `segments` | 否 | 预定义过滤条件 |
| `joins` | 否 | 关联关系 |
| `joins.*.type` | 是 | `left` / `inner` / `left_each` |
| `joins.*.sql` | 是 | JOIN 条件，可引用 `{target_cube}` 别名 |
| `joins.*.relationship` | 否 | 基数关系：`N:1`（事实→维度）/ `1:N`（维度→事实）/ `1:1`，默认 `N:1`。Compiler 据此判断是否需要 Subquery JOIN 以防止 Fan-out |
| `joins.*.context` | 否 | 语义上下文标签，用于消歧。当两个 Cube 间存在多条等长路径时，Compiler 根据 context 选择正确路径 |

### 3.3 `{CUBE}` 与 `{measure_name}` 占位符规则

- `{CUBE}` → 编译时替换为当前 Cube 的表别名（如 `answer_records`）
- `{other_cube}` → 编译时替换为 JOIN 目标 Cube 的表别名
- `{measure_name}` → 仅在 `type: number` 的 Measure 中使用，编译时内联展开为对应 Measure 的聚合表达式

### 3.4 枚举值联动设计（enum vs enum_source）

Cube YAML 中的维度枚举分为两种来源：

#### 静态枚举（`enum`）

不在元数据字典表中的固有属性，直接在 YAML 中硬编码：

```yaml
user_is_test:
  title: 是否测试用户
  type: number
  sql: "{CUBE}.user_is_test"
  enum:
    1: 正式用户
    0: 测试用户
```

适用场景：`user_is_test`、`user_status`、`school_status`、`widget_status`、`widget_type`、`exit_type`、`lesson_status`、`tree_type`、`query_source`、`question_difficulty`、`level_tag`、`status_tag`、`diagnosis_tag` 等。

#### 动态枚举（`enum_source`）

已存在于 `dim_pub_meta_dict_df` 字典表中的业务枚举，声明来源后由 Loader 自动加载：

```yaml
answer_result:
  title: 答题结果
  type: number
  sql: "{CUBE}.answer_result"
  enum_source:
    type: meta_dict
    dict_type: "answer_result"
```

适用场景：

| dict_type | 说明 | 引用该枚举的 Cube |
|-----------|------|------------------|
| `answer_result` | 判题结果 | answer_records, kt_recommend |
| `phase` | 学段 | question, knowledge, student_ability |
| `subject` | 学科 | question |
| `answer_mode` | 作答方式 | question, answer_records |
| `evaluation_type` | 判题类型 | answer_records |
| `study_type` | 学习类型 | answer_records, study_sessions |

#### Loader 加载逻辑

```python
# loader.py
class CubeLoader:
    def load_all(self) -> dict[str, CubeDefinition]:
        cubes = self._parse_yaml_files()
        self._resolve_dynamic_enums(cubes)
        return cubes

    def _resolve_dynamic_enums(self, cubes: dict[str, CubeDefinition]):
        """启动时从字典表批量加载所有动态枚举"""
        needed_types = set()
        for cube in cubes.values():
            for dim in cube.dimensions.values():
                if dim.enum_source and dim.enum_source.type == "meta_dict":
                    needed_types.add(dim.enum_source.dict_type)

        if not needed_types:
            return

        # 一次查询获取所有需要的字典类型（避免 N+1）
        type_list = ", ".join(f"'{t}'" for t in needed_types)
        rows = self._adapter.execute_query(
            f"SELECT meta_dict_type, meta_dict_key, meta_dict_name "
            f"FROM dim_pub_meta_dict_df "
            f"WHERE ds = MAX_PT('dim_pub_meta_dict_df') "
            f"AND meta_dict_type IN ({type_list})"
        )
        # 按 type 分组
        dict_map: dict[str, dict] = {}
        for row in rows:
            dict_map.setdefault(row['meta_dict_type'], {})[row['meta_dict_key']] = row['meta_dict_name']

        # 回填到各 Dimension
        for cube in cubes.values():
            for dim in cube.dimensions.values():
                if dim.enum_source and dim.enum_source.type == "meta_dict":
                    dim.enum = dict_map.get(dim.enum_source.dict_type, {})
```

#### 设计要点

| 要点 | 说明 |
|------|------|
| `enum` 与 `enum_source` 互斥 | 同一 Dimension 只能使用其中一种，`enum_source` 优先 |
| 批量加载 | 一次 SQL 获取所有 `dict_type`，避免 N+1 查询 |
| 内存缓存 | 加载结果缓存在 CubeLoader 内存中，应用生命周期内有效 |
| 对上层透明 | `describe_cube` 返回时，两种方式统一合并为 `enum` 字段，Agent 和前端不感知差异 |
| 定时刷新（P2） | 可配合物理层同步定时任务每日刷新一次枚举缓存 |

---

## 三-B、View YAML Schema 规范

### 3B.1 View 定位

View 是 Cube 之上的**策展层**，用于：

| 用途 | 说明 |
|------|------|
| **指标治理** | 将多个 Cube 的维度/指标按业务主题组合，暴露给特定消费者（Agent、BI、教研团队） |
| **JOIN 路径消歧** | 通过 `join_path` 点号链显式指定 JOIN 路径，避免 JoinGraph 自动推导时的歧义 |
| **访问控制** | `public: false` 可隐藏底层 Cube，仅通过 View 对外暴露（P2） |
| **虚拟数据集桥接** | View 可物化为虚拟数据集（`datasets` 表），供数据提取任务消费 |

当前工作台实现里，`View` 仍然是独立 YAML 对象，但在导航、摘要和详情体验上按“特殊 Cube”处理，优先复用 `Inventory / Detail / DevTools` 这套工作台模型，而不是再扩张一套独立建模入口。

**View 与虚拟数据集的关系**：

```
View (YAML 定义)
  │
  ├── Agent 消费: DSL 查询引用 View → Compiler 编译 → SQL → 执行
  │
  └── 数据中心消费: View → 物化为虚拟数据集 (datasets.sql_query) → 提取任务
```

View 是虚拟数据集的**上游语义定义**，而非平行概念。新建策展视图推荐通过 View 创建，老虚拟数据集（手写 SQL）继续保留不做迁移。

### 3B.2 完整 Schema 结构

```yaml
# View 唯一标识（snake_case）
name: student_answer_analysis

# 人类可读名称
title: 学生答题分析视图

# 业务描述
description: |
  面向教研团队的答题分析视图，聚合答题记录、学生、学校信息。
  提供按学科、年级、学校维度的答题正确率和耗时分析。

# 是否对 Agent / API 可见（默认 true）
public: true

# 引用的 Cube 及其 JOIN 路径
cubes:
  # 根 Cube（事实表）
  - join_path: answer_records
    includes:
      - answer_date
      - subject_name
      - question_category_name
      - total_count
      - correct_count
      - accuracy
      - avg_duration

  # 通过 answer_records → student 的 N:1 JOIN
  - join_path: answer_records.student
    prefix: true                    # 字段名加 student_ 前缀
    includes:
      - user_name
      - grade_name
      - user_role_name
    excludes:
      - user_is_test               # 排除测试标识

  # 通过 answer_records → student → school 的链式 JOIN
  - join_path: answer_records.student.school
    prefix: true                    # 字段名加 school_ 前缀
    includes:
      - school_name
      - school_area_name
      - school_stage_name

# 字段分组（P2 扩展）
# folders:
#   - name: 答题指标
#     includes: [total_count, correct_count, accuracy, avg_duration]
#   - name: 学生信息
#     includes: [student_user_name, student_grade_name]
```

### 3B.3 Schema 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | View 唯一标识，snake_case，在所有 Cube 和 View 中唯一 |
| `title` | string | 是 | 人类可读名称（中文） |
| `description` | string | 是 | 业务描述 |
| `public` | boolean | 否 | 是否可被 Agent/API 查询，默认 `true` |
| `cubes` | list | 是 | 引用的 Cube 列表 |
| `cubes[].join_path` | string | 是 | JOIN 路径，点号分隔（如 `answer_records.student.school`） |
| `cubes[].includes` | list/string | 是 | 暴露的字段列表，`"*"` 表示全部 |
| `cubes[].excludes` | list | 否 | 排除的字段列表（仅 `includes: "*"` 时生效） |
| `cubes[].prefix` | boolean | 否 | 是否给字段名加 Cube 名前缀，默认 `false` |
| `folders` | list | 否 | 字段分组，P2 扩展 |

### 3B.4 View 完整示例

```yaml
# infrastructure/semantic/views/teaching_overview.yml
name: teaching_overview
title: 教学总览视图
description: |
  面向运营管理的教学总览，汇聚课程进度、学习时长、答题情况。

public: true

cubes:
  - join_path: lesson_progress
    includes:
      - lesson_date
      - total_lessons
      - completed_lessons
      - completion_rate
      - avg_progress_pct

  - join_path: lesson_progress.student
    prefix: true
    includes: "*"
    excludes:
      - user_is_test
      - deleted

  - join_path: lesson_progress.course
    prefix: true
    includes:
      - lesson_name
      - lesson_subject_name
      - lesson_type_name

  - join_path: study_sessions
    includes:
      - total_duration
      - avg_duration
      - session_count
```

### 3B.5 View → 虚拟数据集物化

View 可通过"物化"操作自动生成虚拟数据集，桥接现有数据提取管线：

```python
# application/semantic/commands/materialize_view.py
@dataclass(frozen=True)
class MaterializeViewCommand:
    view_name: str

class MaterializeViewHandler:
    def __init__(self, view_repo: IViewRepository,
                 compiler: QueryCompiler,
                 dataset_service: DatasetService):
        self._views = view_repo
        self._compiler = compiler
        self._datasets = dataset_service

    def execute(self, cmd: MaterializeViewCommand) -> int:
        view = self._views.get(cmd.view_name)

        # 将 View 展开为 DSL（includes 全部字段，无 filters）
        dsl = self._expand_view_to_dsl(view)

        # Compiler 编译为 SQL
        result = self._compiler.compile(dsl)

        # 创建/更新虚拟数据集
        dataset_id = self._datasets.upsert_virtual_dataset(
            dataset_code=f"view_{view.name}",
            dataset_name=view.title,
            description=view.description,
            sql_query=result.sql,
            source_id=self._get_primary_source_id(),
        )
        return dataset_id
```

| 操作 | 说明 |
|------|------|
| 首次物化 | 创建新的虚拟数据集，`dataset_code = view_{name}` |
| 重复物化 | 根据 `dataset_code` 查找已有记录，更新 `sql_query` |
| View 删除 | 不自动删除已物化的虚拟数据集（防止提取任务中断） |
| 字段列表 | 从 View `includes` 推导，自动写入 `schema_snapshot` |

---

## 三-C、Query Recipe 规范

### 3C.1 Recipe 定位

Recipe（查询配方）是语义层的 **Few-shot 示例集**，解决 LLM 构造 DSL 不准确的核心问题。每个 Recipe 包含若干"自然语言问题 → 标准 DSL"的配对，系统从 DSL 中自动提取引用的 Cube/View 名称并构建反向索引，在 `describe_cube` 返回时自动附带匹配的 Recipe。

当前实现中，`Recipe` 的目标仍然是“轻量消费对象”，因此重点放在状态摘要、关联 Cube 索引和 `DevTools` 消费，不进入正式建模或领域编排流。

| 作用 | 说明 |
|------|------|
| **提升 DSL 准确率** | LLM 看到同类问题的标准 DSL 后，能更精准地模仿构造 |
| **沉淀业务经验** | 高频查询模式（正确率分析、趋势统计、排名对比）有据可查 |
| **避坑提示** | `notes` 字段标注易错点（如"用 user_name 不要用 student_id"） |
| **零额外工具调用** | 不需要独立的 `search_recipes` 工具，随 `describe_cube` 自动下发 |
| **零维护绑定** | 不需要手动声明关联 Cube，系统从 DSL 自动提取 |

#### 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 存储方式 | 独立 YAML 文件（`recipes/`目录） | Recipe 天然跨 Cube（如 `answer_records` + `student` + `school`），内嵌任一 Cube YAML 都不合适 |
| Cube 关联方式 | DSL 自动提取（无 `cube`/`cubes` 字段） | DSL 的 measures/dimensions/filters 中已包含所有 Cube 引用，显式声明是重复数据且易不一致；自动提取零维护 |
| 注入优先级 | measures 引用优先于 filters 引用 | measures 引用说明该 Cube 是查询主表（核心场景），filters 引用仅为过滤条件（辅助场景） |
| Token 预算 | 单次 `describe_cube` 最多返回 5 个 Recipe | 每个 example 约 150~200 token，5 个上限约 750~1000 token |

### 3C.2 Recipe YAML Schema

```yaml
# Recipe 唯一标识（snake_case）
name: answer_accuracy_by_subject

# 人类可读名称
title: 各学科答题正确率

# 分类标签（仅用于前端分组展示，不参与注入匹配）
tags: [answer, accuracy, subject, student]

# Few-shot 示例列表（系统自动从 DSL 中提取引用的 Cube/View 名称）
examples:
  - question: "查一下倪佳俊同学最近7天各学科的答题正确率"
    dsl:
      measures:
        - answer_records.total_count
        - answer_records.correct_count
        - answer_records.accuracy
      dimensions:
        - answer_records.subject_name
      filters:
        - dimension: student.user_name
          operator: equals
          values: ["倪佳俊"]
      time_dimensions:
        - dimension: answer_records.answer_date
          date_range: ["2026-02-21", "2026-02-27"]
      order: [["answer_records.accuracy", "desc"]]
      limit: 1000
    notes: "按学生姓名过滤用 student.user_name，不要用 student_id"

  - question: "三年级全部学生上周数学答题正确率排名"
    dsl:
      measures:
        - answer_records.total_count
        - answer_records.accuracy
      dimensions:
        - student.user_name
      filters:
        - dimension: student.grade_name
          operator: equals
          values: ["三年级"]
        - dimension: answer_records.subject_name
          operator: equals
          values: ["数学"]
      time_dimensions:
        - dimension: answer_records.answer_date
          date_range: ["2026-02-17", "2026-02-23"]
      order: [["answer_records.accuracy", "desc"]]
      limit: 100
```

### 3C.3 Schema 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Recipe 唯一标识 |
| `title` | string | 是 | 人类可读名称 |
| `tags` | list[string] | 是 | 分类标签，仅用于前端分组展示，不参与注入匹配 |
| `examples` | list | 是 | Few-shot 示例列表，至少 1 个 |
| `examples[].question` | string | 是 | 用户自然语言问题 |
| `examples[].dsl` | object | 是 | 对应的标准 DSL（格式与五、查询 DSL 规范一致） |
| `examples[].notes` | string | 否 | 注意事项/易错点提示 |

### 3C.4 Recipe 完整示例

```yaml
# infrastructure/semantic/recipes/energy_block_analysis.yml
name: energy_block_analysis
title: 能量拦截原因分析
tags: [energy, block, reject]

examples:
  - question: "最近一周能量拦截的主要原因是什么"
    dsl:
      measures:
        - energy_detail.block_count
        - energy_detail.blocked_energy
      dimensions:
        - energy_detail.reject_reason
      time_dimensions:
        - dimension: energy_detail.energy_date
          date_range: ["2026-02-21", "2026-02-27"]
      order: [["energy_detail.block_count", "desc"]]
      limit: 50
    notes: "reject_reason 可能为空字符串，需注意过滤"

  - question: "本月各事件类型的能量发放和拦截对比"
    dsl:
      measures:
        - energy_detail.total_theoretical
        - energy_detail.total_granted
        - energy_detail.total_blocked
      dimensions:
        - energy_detail.event_type
      time_dimensions:
        - dimension: energy_detail.energy_date
          date_range: ["2026-02-01", "2026-02-28"]
      order: [["energy_detail.total_granted", "desc"]]
      limit: 100
```

```yaml
# infrastructure/semantic/recipes/kt_accuracy.yml
name: kt_accuracy
title: KT推题正确率分析
tags: [kt, recommend, accuracy]

examples:
  - question: "最近7天各学科KT推题正确率"
    dsl:
      measures:
        - kt_recommend.total_count
        - kt_recommend.correct_count
        - kt_recommend.accuracy
      dimensions:
        - kt_recommend.subject_name
      time_dimensions:
        - dimension: kt_recommend.ds
          date_range: ["2026-02-21", "2026-02-27"]
      order: [["kt_recommend.accuracy", "desc"]]
      limit: 100
    notes: "KT推题的分区字段是 ds，不是 answer_date"
```

### 3C.5 Few-shot 注入机制

Recipe 通过 `describe_cube` 工具返回自动注入 LLM 上下文，无需额外工具调用。

#### 自动提取流程

```
Recipe 加载时（YamlRecipeRepository.load_all）:
  遍历所有 Recipe 文件
  对每个 Recipe:
    遍历 examples[].dsl 的 measures / dimensions / filters / time_dimensions
    → 提取所有 "cube_name.field" 中的 cube_name
    → 构建反向索引: { cube_name → [recipe1, recipe2, ...] }
```

#### 注入流程

```
用户提问 "倪佳俊各学科正确率"
  │
  ▼
LLM 调用 describe_cube("answer_records")
  │
  ▼
Repository 加载 Cube 定义 + 查反向索引获取引用了 answer_records 的 Recipe
  │  ┌─ 优先级: measures 中引用该 Cube 的 Recipe 排在前面（主查询场景）
  │  └─ 上限: 单次 describe_cube 最多返回 5 个 Recipe（控制 token 预算）
  ▼
返回值:
  {
    "name": "answer_records",
    "dimensions": { ... },
    "measures": { ... },
    "query_recipes": [          ← 自动附带
      {
        "question": "某同学最近N天各学科答题正确率",
        "dsl": { ... },
        "notes": "按学生姓名过滤用 student.user_name"
      },
      ...
    ]
  }
  │
  ▼
LLM 参考 recipes 中的 DSL 模式，构造当前问题的 DSL
```

#### 优先级排序逻辑

```python
def get_by_cube(self, cube_name: str) -> list[RecipeDefinition]:
    """返回 DSL 中引用了指定 Cube 的 Recipe，按相关度排序"""
    candidates = self._cube_index.get(cube_name, [])

    def priority(recipe: RecipeDefinition) -> int:
        for ex in recipe.examples:
            measures_cubes = {m.split('.')[0] for m in ex.dsl.get('measures', [])}
            if cube_name in measures_cubes:
                return 0  # 最高优先级：measures 中引用
        return 1  # 较低优先级：仅在 filters/dimensions 中出现

    return sorted(candidates, key=priority)[:5]
```

**Token 预算**：每个 Recipe 的单个 example 约 150~200 token，单次 `describe_cube` 最多返回 5 个 Recipe（约 750~1000 token），在可控范围内。

### 3C.6 与旧知识库的迁移关系

| 旧文件 | 去向 |
|--------|------|
| `query-templates.md` 中的 8 个 SQL 模板 | 转写为 `recipes/*.yml` 中的 DSL 配方 |
| `query-rules.md` 中的强制规则 | 已被 Compiler 自动化（分区注入、LIMIT 兜底、default_filter） |
| `query-rules.md` 中的推荐规则 | 精简后保留到 System Prompt |

---

## 四、完整 Cube 定义（14 个 Cube）

基于现有知识库中 14 张表，逐一定义 Cube。每个 Cube 的维度和指标根据实际业务语义设计。

### 4.1 student — 学生维度

```yaml
name: student
title: 学生
description: 学生基础信息维度表，包含学生所属班级、年级、学校。
table: dim_ucenter_user_student_df

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dim_ucenter_user_student_df')"

default_filters:
  - sql: "user_is_test = 1"
    description: "排除测试用户（user_is_test=1 为正式用户）"

dimensions:
  user_id:
    title: 用户ID
    type: string
    sql: "{CUBE}.user_id"
    primary_key: true
  user_name:
    title: 用户名
    type: string
    sql: "{CUBE}.user_name"
  user_account:
    title: 用户账号
    type: string
    sql: "{CUBE}.user_account"
  user_phone:
    title: 用户电话
    type: string
    sql: "{CUBE}.user_phone"
  user_grade_id:
    title: 年级ID
    type: number
    sql: "{CUBE}.user_grade_id"
  user_grade_name:
    title: 年级名称
    type: string
    sql: "{CUBE}.user_grade_name"
  user_class_id:
    title: 班级ID
    type: string
    sql: "{CUBE}.user_class_id"
  organization_id:
    title: 学校ID
    type: string
    sql: "{CUBE}.organization_id"
    foreign_key:
      cube: school
      field: school_id
  user_is_test:
    title: 是否测试用户
    type: number
    sql: "{CUBE}.user_is_test"
    enum:
      1: 正式用户
      0: 测试用户
  user_status:
    title: 用户状态
    type: number
    sql: "{CUBE}.user_status"
    enum:
      1: 尚未启用
      2: 试用
      3: 付费
      4: 停用
      5: 未付费或过期
  user_number:
    title: 学号
    type: string
    sql: "{CUBE}.user_number"
  create_time:
    title: 创建时间
    type: time
    sql: "{CUBE}.create_time"

measures:
  student_total:
    title: 学生总数
    type: count
    sql: "{CUBE}.user_id"
  student_distinct:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.user_id"

segments:
  paying_users:
    title: 仅付费用户
    sql: "{CUBE}.user_status = 3"

joins:
  school:
    cube: school
    type: left
    sql: "{CUBE}.organization_id = {school}.school_id"
```

### 4.2 school — 学校维度

```yaml
name: school
title: 学校
description: 学校基础信息维度表。
table: dim_ucenter_organization_school_df

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dim_ucenter_organization_school_df')"

default_filters:
  - sql: "school_is_test = 1"
    description: "排除测试学校（school_is_test=1 为正式学校）"

dimensions:
  school_id:
    title: 学校ID
    type: string
    sql: "{CUBE}.school_id"
    primary_key: true
  school_name:
    title: 学校名称
    type: string
    sql: "{CUBE}.school_name"
  school_number:
    title: 学校CODE
    type: string
    sql: "{CUBE}.school_number"
  school_edu_level_name:
    title: 学段
    type: string
    sql: "{CUBE}.school_edu_level_name"
  school_edu_system_name:
    title: 办学性质
    type: string
    sql: "{CUBE}.school_edu_system_name"
  school_feature_name:
    title: 学校特色
    type: string
    sql: "{CUBE}.school_feature_name"
  school_region_name:
    title: 学校区域
    type: string
    sql: "{CUBE}.school_region_name"
  school_is_test:
    title: 是否测试学校
    type: number
    sql: "{CUBE}.school_is_test"
  school_status:
    title: 学校状态
    type: number
    sql: "{CUBE}.school_status"
    enum:
      1: 尚未启用
      2: 试用中
      3: 付费使用
      4: 停止合作
      5: 未付费

measures:
  school_total:
    title: 学校总数
    type: count
    sql: "{CUBE}.school_id"
  school_distinct:
    title: 去重学校数
    type: count_distinct
    sql: "{CUBE}.school_id"

segments:
  paying_schools:
    title: 仅付费学校
    sql: "{CUBE}.school_status = 3"
```

### 4.3 answer_records — 答题记录

> 完整定义见 3.1 节示例。

### 4.4 study_sessions — 学习会话

```yaml
name: study_sessions
title: 学习会话
description: |
  学生学习相关的会话管理。全量快照事务表，无分区。
table: dwd_study_sessions_snap_f

# 无分区

dimensions:
  study_session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.study_session_id"
    primary_key: true
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  student_name:
    title: 学生姓名
    type: string
    sql: "{CUBE}.student_name"
  subject_id:
    title: 学科ID
    type: string
    sql: "{CUBE}.subject_id"
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  study_type_name:
    title: 学习类型
    type: string
    sql: "{CUBE}.study_type_name"
  session_status:
    title: 会话状态
    type: string
    sql: "{CUBE}.session_status"
  school_id:
    title: 学校ID
    type: string
    sql: "{CUBE}.school_id"
    foreign_key:
      cube: school
      field: school_id
  school_name:
    title: 学校名称
    type: string
    sql: "{CUBE}.school_name"
  grade_name:
    title: 年级名称
    type: string
    sql: "{CUBE}.grade_name"
  class_name:
    title: 班级名称
    type: string
    sql: "{CUBE}.class_name"
  knowledge_id:
    title: 知识点ID
    type: string
    sql: "{CUBE}.knowledge_id"
  knowledge_name:
    title: 知识点名称
    type: string
    sql: "{CUBE}.knowledge_name"
  total_duration:
    title: 总时长
    type: number
    sql: "{CUBE}.total_duration"
  start_time:
    title: 开始时间
    type: time
    sql: "{CUBE}.start_time"
  end_time:
    title: 结束时间
    type: time
    sql: "{CUBE}.end_time"
  create_time:
    title: 创建时间
    type: time
    sql: "{CUBE}.create_time"

measures:
  session_count:
    title: 会话数
    type: count
    sql: "{CUBE}.study_session_id"
  session_distinct:
    title: 去重会话数
    type: count_distinct
    sql: "{CUBE}.study_session_id"
  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.student_id"
  avg_duration:
    title: 平均会话时长
    type: avg
    sql: "{CUBE}.total_duration"
  total_duration_sum:
    title: 总学习时长
    type: sum
    sql: "{CUBE}.total_duration"

joins:
  student:
    cube: student
    type: left
    sql: "{CUBE}.student_id = {student}.user_id"
  school:
    cube: school
    type: left
    sql: "{CUBE}.school_id = {school}.school_id"
```

### 4.5 lesson_progress — AI课学习进度

```yaml
name: lesson_progress
title: AI课学习进度
description: |
  学生AI课学习会话的进度管理，记录各会话的组件学习进度、时长。
table: dwd_study_lesson_progress_snap

partition:
  field: create_date
  type: date
  format: "yyyyMMdd"
  max_range_days: 90

dimensions:
  study_progress_id:
    title: 学习进度ID
    type: string
    sql: "{CUBE}.study_progress_id"
    primary_key: true
  study_session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.study_session_id"
    foreign_key:
      cube: study_sessions
      field: study_session_id
  lesson_id:
    title: 课程ID
    type: string
    sql: "{CUBE}.lesson_id"
    foreign_key:
      cube: course
      field: lesson_id
  lesson_version:
    title: 课程版本
    type: string
    sql: "{CUBE}.lesson_version"
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  knowledge_id:
    title: 知识点ID
    type: string
    sql: "{CUBE}.knowledge_id"
  completed_widget_count:
    title: 已完成组件数
    type: number
    sql: "{CUBE}.completed_widget_count"
  total_widget_count:
    title: 总组件数
    type: number
    sql: "{CUBE}.total_widget_count"
  lesson_duration:
    title: 课程学习时长(ms)
    type: number
    sql: "{CUBE}.lesson_duration"
  create_date:
    title: 创建日期
    type: time
    sql: "{CUBE}.create_date"

measures:
  progress_count:
    title: 进度记录数
    type: count
    sql: "{CUBE}.study_progress_id"
  completed_count:
    title: 完成课程数
    type: sum
    sql: "CASE WHEN {CUBE}.completed_widget_count = {CUBE}.total_widget_count THEN 1 ELSE 0 END"
  completion_rate:
    title: 课程完成率
    type: number
    sql: "ROUND({completed_count} * 100.0 / NULLIF({progress_count}, 0), 2)"
    format: percent
  avg_lesson_duration:
    title: 平均课程时长(ms)
    type: avg
    sql: "{CUBE}.lesson_duration"
  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.student_id"

joins:
  study_sessions:
    cube: study_sessions
    type: left
    sql: "{CUBE}.study_session_id = {study_sessions}.study_session_id"
  course:
    cube: course
    type: left
    sql: "{CUBE}.lesson_id = {course}.lesson_id"
  student:
    cube: student
    type: left
    sql: "{CUBE}.student_id = {student}.user_id"
```

### 4.6 lesson_widget — AI课组件进度

```yaml
name: lesson_widget
title: AI课组件进度
description: |
  AI课会话拆分到组件粒度的学习进度。
  未完成组件存储在 99991231 墓碑分区。
table: dwd_study_lesson_widget_snap

partition:
  field: completed_date
  type: date
  format: "yyyyMMdd"
  max_range_days: 90

dimensions:
  study_progress_id:
    title: 学习进度ID
    type: string
    sql: "{CUBE}.study_progress_id"
    foreign_key:
      cube: lesson_progress
      field: study_progress_id
  widget_index:
    title: 组件序号
    type: number
    sql: "{CUBE}.widget_index"
  study_session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.study_session_id"
    foreign_key:
      cube: study_sessions
      field: study_session_id
  lesson_id:
    title: 课程ID
    type: string
    sql: "{CUBE}.lesson_id"
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  widget_status:
    title: 组件状态
    type: string
    sql: "{CUBE}.widget_status"
    enum:
      completed: 已完成
      locked: 锁定
      unlocked: 未锁定
  widget_type:
    title: 组件类型
    type: string
    sql: "{CUBE}.widget_type"
    enum:
      video: 视频
      exercise: 练习
      interactive: 互动
      guide: 引导
  widget_name:
    title: 组件名称
    type: string
    sql: "{CUBE}.widget_name"
  widget_duration:
    title: 组件时长(ms)
    type: number
    sql: "{CUBE}.widget_duration"
  completed_date:
    title: 完成日期
    type: time
    sql: "{CUBE}.completed_date"

measures:
  widget_count:
    title: 组件总数
    type: count
    sql: "{CUBE}.widget_index"
  completed_widget_count:
    title: 已完成组件数
    type: sum
    sql: "CASE WHEN {CUBE}.widget_status = 'completed' THEN 1 ELSE 0 END"
  avg_widget_duration:
    title: 平均组件时长(ms)
    type: avg
    sql: "{CUBE}.widget_duration"

segments:
  completed_only:
    title: 仅已完成
    sql: "{CUBE}.widget_status = 'completed'"

joins:
  lesson_progress:
    cube: lesson_progress
    type: left
    sql: "{CUBE}.study_progress_id = {lesson_progress}.study_progress_id"
  study_sessions:
    cube: study_sessions
    type: left
    sql: "{CUBE}.study_session_id = {study_sessions}.study_session_id"
```

### 4.7 energy_detail — 能量发放

```yaml
name: energy_detail
title: 能量发放记录
description: |
  能量发放流水表。结算发放时如触发检测上限或风控策略会扣除相应能量。
table: dwd_study_energy_detail_di

partition:
  field: energy_date
  type: date
  format: "yyyyMMdd"
  max_range_days: 90

dimensions:
  id:
    title: 主键ID
    type: string
    sql: "{CUBE}.id"
    primary_key: true
  user_id:
    title: 用户ID
    type: string
    sql: "{CUBE}.user_id"
    foreign_key:
      cube: student
      field: user_id
  user_name:
    title: 用户名称
    type: string
    sql: "{CUBE}.user_name"
  school_id:
    title: 学校ID
    type: string
    sql: "{CUBE}.school_id"
    foreign_key:
      cube: school
      field: school_id
  school_name:
    title: 学校名称
    type: string
    sql: "{CUBE}.school_name"
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  event_type:
    title: 事件类型
    type: string
    sql: "{CUBE}.event_type"
  study_session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.study_session_id"
    foreign_key:
      cube: study_sessions
      field: study_session_id
  reject_reason:
    title: 拒绝原因
    type: string
    sql: "{CUBE}.reject_reason"
  exit_type:
    title: 退出类型
    type: string
    sql: "{CUBE}.exit_type"
    enum:
      manual: 中途退出
      completed: 完成退出
      answer: 答题
  energy_date:
    title: 能量发放日期
    type: time
    sql: "{CUBE}.energy_date"

measures:
  record_count:
    title: 记录数
    type: count
    sql: "{CUBE}.id"
  total_theoretical:
    title: 理论应得能量
    type: sum
    sql: "{CUBE}.theoretical_energy"
  total_granted:
    title: 实际发放能量
    type: sum
    sql: "{CUBE}.actual_granted_energy"
  total_blocked:
    title: 拦截能量
    type: number
    sql: "{total_theoretical} - {total_granted}"
  block_rate:
    title: 能量拦截率
    type: number
    sql: "ROUND(({total_theoretical} - {total_granted}) * 100.0 / NULLIF({total_theoretical}, 0), 2)"
    format: percent
  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.user_id"

joins:
  student:
    cube: student
    type: left
    sql: "{CUBE}.user_id = {student}.user_id"
  school:
    cube: school
    type: left
    sql: "{CUBE}.school_id = {school}.school_id"
  study_sessions:
    cube: study_sessions
    type: left
    sql: "{CUBE}.study_session_id = {study_sessions}.study_session_id"
```

### 4.8 kt_recommend — KT推题

```yaml
name: kt_recommend
title: KT推题记录
description: |
  KT模型自适应推题全链路：推题请求→推题过程→推题结果→答题结果。
  推题和答题存在跨天。
table: dwd_kt_rec_answer_record_flow_di

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  max_range_days: 90

dimensions:
  recommend_id:
    title: 推荐记录ID
    type: string
    sql: "{CUBE}.recommend_id"
    primary_key: true
  answer_record_id:
    title: 答题记录ID
    type: string
    sql: "{CUBE}.answer_record_id"
    foreign_key:
      cube: answer_records
      field: answer_record_id
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  question_id:
    title: 题目ID
    type: string
    sql: "{CUBE}.question_id"
    foreign_key:
      cube: question
      field: question_id
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  study_type_name:
    title: 学习类型
    type: string
    sql: "{CUBE}.study_type_name"
  level_tag:
    title: 学生能力分层
    type: string
    sql: "{CUBE}.level_tag"
    enum:
      S+: 顶尖水平
      S: 优秀水平
      A: 良好水平
      B: 中等水平
      C: 待提升
  answer_result:
    title: 答题结果
    type: number
    sql: "{CUBE}.answer_result"
  question_difficulty:
    title: 题目难度
    type: number
    sql: "{CUBE}.question_difficulty"
  question_probability:
    title: KT预测值
    type: number
    sql: "{CUBE}.question_probability"
  school_name:
    title: 学校名称
    type: string
    sql: "{CUBE}.school_name"

measures:
  total_count:
    title: 推题总数
    type: count
    sql: "{CUBE}.recommend_id"
  correct_count:
    title: 正确题数
    type: sum
    sql: "CASE WHEN {CUBE}.answer_result = 1 THEN 1 ELSE 0 END"
  accuracy:
    title: 推题正确率
    type: number
    sql: "ROUND({correct_count} * 100.0 / NULLIF({total_count}, 0), 2)"
    format: percent
  avg_probability:
    title: 平均预测值
    type: avg
    sql: "{CUBE}.question_probability"
  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.student_id"

joins:
  student:
    cube: student
    type: left
    sql: "{CUBE}.student_id = {student}.user_id"
  question:
    cube: question
    type: left
    sql: "{CUBE}.question_id = {question}.question_id"
```

### 4.9 question — 题目维度

```yaml
name: question
title: 题目
description: 题库维度表，母子题以母题粒度组合。
table: dwd_question_snapshot

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dwd_question_snapshot')"

dimensions:
  question_id:
    title: 题目ID
    type: string
    sql: "{CUBE}.question_id"
    primary_key: true
  content:
    title: 题干内容
    type: string
    sql: "{CUBE}.content"
  difficulty_level:
    title: 难度等级
    type: number
    sql: "{CUBE}.difficulty_level"
    enum:
      1: 较简单
      2: 简单
      3: 中等
      4: 较难
      5: 困难
  subject_enum:
    title: 学科
    type: string
    sql: "{CUBE}.subject_enum"
  phase:
    title: 学段
    type: string
    sql: "{CUBE}.phase"
  question_type:
    title: 题目类型
    type: string
    sql: "{CUBE}.question_type"
  answer_mode:
    title: 作答方式
    type: string
    sql: "{CUBE}.answer_mode"

measures:
  question_total:
    title: 题目总数
    type: count
    sql: "{CUBE}.question_id"
  question_distinct:
    title: 去重题目数
    type: count_distinct
    sql: "{CUBE}.question_id"
```

### 4.10 knowledge — 知识点维度

```yaml
name: knowledge
title: 知识点
description: 基础树与业务树结构关系。使用 node_id 关联知识点ID。
table: dim_question_all_tree_info_df

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dim_question_all_tree_info_df')"

dimensions:
  node_id:
    title: 节点ID
    type: string
    sql: "{CUBE}.node_id"
    primary_key: true
  node_name:
    title: 节点名称
    type: string
    sql: "{CUBE}.node_name"
  tree_type:
    title: 树类型
    type: string
    sql: "{CUBE}.tree_type"
    enum:
      base: 基础树
      biz: 业务树
  tree_id:
    title: 树ID
    type: string
    sql: "{CUBE}.tree_id"
  node_level:
    title: 节点层级
    type: number
    sql: "{CUBE}.node_level"
  node_path:
    title: 节点路径
    type: string
    sql: "{CUBE}.node_path"
  is_leaf:
    title: 是否叶子节点
    type: boolean
    sql: "{CUBE}.is_leaf"
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  phase_name:
    title: 学段名称
    type: string
    sql: "{CUBE}.phase_name"

measures:
  node_count:
    title: 节点数
    type: count
    sql: "{CUBE}.node_id"
  leaf_count:
    title: 叶子节点数
    type: sum
    sql: "CASE WHEN {CUBE}.is_leaf = true THEN 1 ELSE 0 END"

segments:
  base_tree_only:
    title: 仅基础树
    sql: "{CUBE}.tree_type = 'base'"
  leaf_only:
    title: 仅叶子节点
    sql: "{CUBE}.is_leaf = true"
```

### 4.11 student_ability — 学生学科能力

```yaml
name: student_ability
title: 学生学科能力
description: 基于IRT模型的学生学科能力分层（S+/S/A/B/C）。
table: dim_pub_student_subject_insight_df

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dim_pub_student_subject_insight_df')"

dimensions:
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  level_tag:
    title: 能力分层
    type: string
    sql: "{CUBE}.level_tag"
    enum:
      S+: 顶尖水平
      S: 优秀水平
      A: 良好水平
      B: 中等水平
      C: 待提升
  status_tag:
    title: 学习状态
    type: string
    sql: "{CUBE}.status_tag"
    enum:
      突破期: 突破期
      发展期: 发展期
      动荡期: 动荡期
      观察期: 观察期
  diagnosis_tag:
    title: 行为诊断
    type: string
    sql: "{CUBE}.diagnosis_tag"
    enum:
      稳步精进: 稳步精进
      眼高手低: 眼高手低
      浅层学习: 浅层学习
      无效学习: 无效学习
  ability_mean:
    title: IRT能力值
    type: number
    sql: "{CUBE}.ability_mean"
  accuracy:
    title: 正确率
    type: number
    sql: "{CUBE}.accuracy"
  answer_count:
    title: 答题数量
    type: number
    sql: "{CUBE}.answer_count"

measures:
  student_count:
    title: 学生数
    type: count_distinct
    sql: "{CUBE}.student_id"
  avg_ability:
    title: 平均能力值
    type: avg
    sql: "{CUBE}.ability_mean"
  avg_accuracy:
    title: 平均正确率
    type: avg
    sql: "{CUBE}.accuracy"

joins:
  student:
    cube: student
    type: left
    sql: "{CUBE}.student_id = {student}.user_id"
```

### 4.12 meta_dict — 元数据字典

```yaml
name: meta_dict
title: 元数据字典
description: 业务枚举值含义。关联 meta_dict_type + meta_dict_key。
table: dim_pub_meta_dict_df

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  latest_expr: "MAX_PT('dim_pub_meta_dict_df')"

dimensions:
  meta_dict_type:
    title: 字典类型
    type: string
    sql: "{CUBE}.meta_dict_type"
  meta_dict_key:
    title: 字典键
    type: string
    sql: "{CUBE}.meta_dict_key"
  meta_dict_name:
    title: 字典值
    type: string
    sql: "{CUBE}.meta_dict_name"

measures:
  dict_count:
    title: 字典记录数
    type: count
    sql: "{CUBE}.meta_dict_key"
```

### 4.13 course — 课程维度

```yaml
name: course
title: AI课程
description: AI课程最新版本的组课信息及基础信息。无分区表。
table: dim_course_lesson_snap_f

# 无分区（豁免表）

default_filters:
  - sql: "deleted = 0"
    description: "排除已删除课程"

dimensions:
  lesson_id:
    title: 课程ID
    type: string
    sql: "{CUBE}.lesson_id"
    primary_key: true
  lesson_name:
    title: 课程名称
    type: string
    sql: "{CUBE}.lesson_name"
  phase_name:
    title: 学段名称
    type: string
    sql: "{CUBE}.phase_name"
  subject_name:
    title: 学科名称
    type: string
    sql: "{CUBE}.subject_name"
  lesson_type:
    title: 课程类型
    type: string
    sql: "{CUBE}.lesson_type"
  lesson_status:
    title: 课程状态
    type: string
    sql: "{CUBE}.lesson_status"
    enum:
      publish: 已上架
      wait: 未上架
      change: 修改待上架
  widget_count:
    title: 组件数量
    type: number
    sql: "{CUBE}.widget_count"
  total_duration:
    title: 课程总时长(s)
    type: number
    sql: "{CUBE}.total_duration"
  publish_time:
    title: 上架时间
    type: time
    sql: "{CUBE}.publish_time"

measures:
  course_total:
    title: 课程总数
    type: count
    sql: "{CUBE}.lesson_id"
  published_count:
    title: 已上架课程数
    type: sum
    sql: "CASE WHEN {CUBE}.lesson_status = 'publish' THEN 1 ELSE 0 END"

segments:
  published_only:
    title: 仅已上架
    sql: "{CUBE}.lesson_status = 'publish'"
```

### 4.14 lesson_qa — 问一问记录

```yaml
name: lesson_qa
title: 问一问记录
description: AI课学习中学生通过问一问模块进行的AI问答记录。
table: dwd_study_tbl_study_lesson_qa

partition:
  field: ds
  type: date
  format: "yyyyMMdd"
  max_range_days: 90

default_filters:
  - sql: "is_deleted = 0"
    description: "排除已删除记录"

dimensions:
  study_lesson_qa_id:
    title: 答疑记录ID
    type: string
    sql: "{CUBE}.study_lesson_qa_id"
    primary_key: true
  session_id:
    title: 学习会话ID
    type: string
    sql: "{CUBE}.session_id"
    foreign_key:
      cube: study_sessions
      field: study_session_id
  student_id:
    title: 学生ID
    type: string
    sql: "{CUBE}.student_id"
    foreign_key:
      cube: student
      field: user_id
  lesson_id:
    title: 课程ID
    type: string
    sql: "{CUBE}.lesson_id"
    foreign_key:
      cube: course
      field: lesson_id
  knowledge_id:
    title: 知识点ID
    type: string
    sql: "{CUBE}.knowledge_id"
  subject_id:
    title: 学科ID
    type: string
    sql: "{CUBE}.subject_id"
  user_question:
    title: 用户问题
    type: string
    sql: "{CUBE}.user_question"
  tokens_num:
    title: Tokens数量
    type: number
    sql: "{CUBE}.tokens_num"
  query_source:
    title: 输入方式
    type: string
    sql: "{CUBE}.query_source"
    enum:
      input_text: 键盘输入
      input_voice: 语音输入
      preset_general: 预设问题
  is_thinking:
    title: 是否思考模式
    type: number
    sql: "{CUBE}.is_thinking"
    enum:
      0: 否
      1: 是
  send_time:
    title: 发送时间
    type: time
    sql: "{CUBE}.send_time"

measures:
  qa_count:
    title: 问答数
    type: count
    sql: "{CUBE}.study_lesson_qa_id"
  student_count:
    title: 去重学生数
    type: count_distinct
    sql: "{CUBE}.student_id"
  total_tokens:
    title: 总Token数
    type: sum
    sql: "{CUBE}.tokens_num"
  avg_tokens:
    title: 平均Token数
    type: avg
    sql: "{CUBE}.tokens_num"

joins:
  study_sessions:
    cube: study_sessions
    type: left
    sql: "{CUBE}.session_id = {study_sessions}.study_session_id"
  student:
    cube: student
    type: left
    sql: "{CUBE}.student_id = {student}.user_id"
  course:
    cube: course
    type: left
    sql: "{CUBE}.lesson_id = {course}.lesson_id"
```

---

## 五、查询 DSL 规范

### 5.1 DSL 结构

Agent 将用户自然语言翻译为以下 JSON DSL，交给 Query Compiler 编译为 SQL：

```json
{
  "measures": ["answer_records.accuracy", "answer_records.total_count"],
  "dimensions": ["answer_records.subject_name"],
  "segments": ["answer_records.only_correct_wrong"],
  "filters": [
    {
      "dimension": "student.user_name",
      "operator": "equals",
      "values": ["倪佳俊"]
    }
  ],
  "time_dimensions": [
    {
      "dimension": "answer_records.answer_date",
      "granularity": "day",
      "date_range": ["2026-02-21", "2026-02-27"]
    }
  ],
  "order": [
    ["answer_records.answer_date", "asc"]
  ],
  "limit": 1000
}
```

### 5.2 DSL 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `measures` | string[] | 是 | 引用格式 `cube_name.measure_name` |
| `dimensions` | string[] | 否 | 引用格式 `cube_name.dimension_name` |
| `segments` | string[] | 否 | 引用格式 `cube_name.segment_name` |
| `filters` | object[] | 否 | 维度过滤条件 |
| `filters[].dimension` | string | 是 | 维度引用 |
| `filters[].operator` | string | 是 | 操作符（见下表） |
| `filters[].values` | any[] | 是 | 值列表 |
| `time_dimensions` | object[] | 否 | 时间维度条件 |
| `time_dimensions[].dimension` | string | 是 | 时间维度引用 |
| `time_dimensions[].granularity` | string | 否 | `day` / `week` / `month`（为空则不按时间分组） |
| `time_dimensions[].date_range` | string[] | 是 | `[start, end]`，格式 `yyyy-MM-dd` |
| `order` | [string, string][] | 否 | 排序，每项 `[reference, "asc"|"desc"]` |
| `limit` | int | 否 | 默认 50000 |

### 5.3 Filter 操作符

| 操作符 | SQL 行为 | 示例 |
|--------|----------|------|
| `equals` | `= value` 或 `IN (values)` | `user_name = '倪佳俊'` |
| `notEquals` | `!= value` 或 `NOT IN (values)` | |
| `gt` / `gte` / `lt` / `lte` | `>` / `>=` / `<` / `<=` | `difficulty_level >= 3` |
| `contains` | `LIKE '%value%'` | `school_name LIKE '%实验%'` |
| `notContains` | `NOT LIKE '%value%'` | |
| `startsWith` / `endsWith` | `LIKE 'value%'` / `LIKE '%value'` | |
| `set` / `notSet` | `IS NOT NULL` / `IS NULL` | |
| `inDateRange` | `BETWEEN start AND end` | 时间维度专用 |

### 5.4 示例：倪佳俊同学最近7天各学科答题正确率

**用户输入**：`查一下倪佳俊同学最近7天各学科的答题正确率`

**Agent 构造的 DSL**：

```json
{
  "measures": ["answer_records.total_count", "answer_records.correct_count", "answer_records.accuracy"],
  "dimensions": ["answer_records.subject_name"],
  "filters": [
    {
      "dimension": "student.user_name",
      "operator": "equals",
      "values": ["倪佳俊"]
    }
  ],
  "time_dimensions": [
    {
      "dimension": "answer_records.answer_date",
      "date_range": ["2026-02-21", "2026-02-27"]
    }
  ],
  "order": [["answer_records.subject_name", "asc"]],
  "limit": 1000
}
```

**Compiler 编译输出的 SQL**：

```sql
SELECT
  answer_records.subject_name AS `answer_records__subject_name`,
  COUNT(answer_records.answer_record_id) AS `answer_records__total_count`,
  SUM(CASE WHEN answer_records.answer_result = 1 THEN 1 ELSE 0 END) AS `answer_records__correct_count`,
  ROUND(
    SUM(CASE WHEN answer_records.answer_result = 1 THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(answer_records.answer_record_id), 0),
    2
  ) AS `answer_records__accuracy`
FROM dwd_study_first_answer_records_snap_di answer_records
LEFT JOIN dim_ucenter_user_student_df student
  ON answer_records.student_id = student.user_id
  AND student.ds = MAX_PT('dim_ucenter_user_student_df')
  AND student.user_is_test = 1
WHERE answer_records.answer_date BETWEEN '20260221' AND '20260227'
  AND answer_records.answer_result IN (1, 2)
  AND student.user_name = '倪佳俊'
GROUP BY answer_records.subject_name
ORDER BY answer_records.subject_name ASC
LIMIT 1000
```

### 5.5 示例：近7天各学科KT推题正确率

**DSL**：

```json
{
  "measures": ["kt_recommend.total_count", "kt_recommend.correct_count", "kt_recommend.accuracy"],
  "dimensions": ["kt_recommend.subject_name"],
  "time_dimensions": [
    {
      "dimension": "kt_recommend.ds",
      "date_range": ["2026-02-21", "2026-02-27"]
    }
  ],
  "order": [["kt_recommend.accuracy", "desc"]]
}
```

---

## 六、Query Compiler 技术设计

### 6.1 编译流水线

```
DSL (JSON)
  │
  ▼
┌─────────────────┐
│ 0. View Resolve │  若 cube 字段引用的是 View，展开为底层 Cube 引用
│                 │  → 替换 measures/dimensions 为 Cube.field 全限定名
│                 │  → 将 View 中的 join_path 注入 DSL（消除歧义）
└────────┬────────┘
         ▼
┌─────────────────┐
│ 1. Parse DSL    │  解析 JSON，校验字段引用合法性
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. Resolve Cubes│  从引用中提取涉及的 Cube 集合
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. Infer JOINs  │  JoinGraph 推导最短 JOIN 路径
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. Build SELECT │  展开 Measures / Dimensions 为 SQL 表达式
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. Build FROM   │  主 Cube 表 + JOIN 链
│    + JOINs      │  自动注入维度表分区条件和 default_filters
└────────┬────────┘
         ▼
┌─────────────────┐
│ 6. Build WHERE  │  合并: partition + default_filters + segments + filters + time_dimensions
└────────┬────────┘
         ▼
┌─────────────────┐
│ 7. Build GROUP  │  按 dimensions + time granularity 分组
└────────┬────────┘
         ▼
┌─────────────────┐
│ 8. Build ORDER  │  排序 + LIMIT
│    + LIMIT      │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 9. Inject Rules │  最终安全校验（只读、LIMIT 兜底、分区范围检查）
└─────────────────┘
         ▼
      SQL String
```

### 6.2 核心类设计

```python
# app/semantic/models.py
@dataclass
class CubeDefinition:
    name: str
    title: str
    description: str
    table: str
    partition: PartitionConfig | None
    default_filters: list[FilterConfig]
    dimensions: dict[str, DimensionDef]
    measures: dict[str, MeasureDef]
    segments: dict[str, SegmentDef]
    joins: dict[str, JoinDef]

@dataclass
class PartitionConfig:
    field: str
    type: str                     # "date" | "string"
    format: str                   # "yyyyMMdd"
    max_range_days: int           # 默认 90
    latest_expr: str | None       # 如 "MAX_PT('table_name')"

@dataclass
class DimensionDef:
    title: str
    type: str                     # string | number | time | boolean
    sql: str
    primary_key: bool = False
    foreign_key: ForeignKeyRef | None = None
    enum: dict | None = None

@dataclass
class MeasureDef:
    title: str
    type: str                     # count | count_distinct | sum | avg | min | max | number
    sql: str
    description: str | None = None
    format: str | None = None     # percent | currency | duration

@dataclass
class QueryDSL:
    measures: list[str]
    dimensions: list[str] = field(default_factory=list)
    segments: list[str] = field(default_factory=list)
    filters: list[FilterClause] = field(default_factory=list)
    time_dimensions: list[TimeDimension] = field(default_factory=list)
    order: list[tuple[str, str]] = field(default_factory=list)
    limit: int = 50000
```

```python
# app/semantic/loader.py
class CubeLoader:
    """从 YAML 文件加载 Cube 定义"""

    def __init__(self, cubes_dir: str):
        self._cubes_dir = cubes_dir
        self._cubes: dict[str, CubeDefinition] = {}

    def load_all(self) -> dict[str, CubeDefinition]:
        """扫描目录下所有 .yml 文件，解析为 CubeDefinition"""
        ...

    def get_cube(self, name: str) -> CubeDefinition:
        ...

    def list_cubes(self) -> list[dict]:
        """返回 [{name, title, description}] 摘要列表"""
        ...

    def describe_cube(self, name: str) -> dict:
        """返回单个 Cube 的完整定义（含维度、指标、关联）"""
        ...
```

```python
# app/semantic/join_graph.py
class JoinGraph:
    """基于 Cube JOIN 声明构建的无向图，用于推导最短 JOIN 路径"""

    def __init__(self, cubes: dict[str, CubeDefinition]):
        self._graph: dict[str, dict[str, JoinEdge]] = {}
        self._build_graph(cubes)

    def find_join_path(self, source: str, targets: set[str]) -> list[JoinEdge]:
        """从 source cube 出发，找到覆盖所有 target cubes 的最短路径（BFS/Steiner Tree）"""
        ...
```

```python
# app/semantic/dialects.py
class SQLDialect(ABC):
    """SQL 方言抽象 — P1 仅实现 MaxCompute，P2 扩展其他数据源"""

    @abstractmethod
    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str: ...

    @abstractmethod
    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str: ...

    @abstractmethod
    def latest_partition_expr(self, table: str) -> str: ...

    @abstractmethod
    def default_limit(self) -> int: ...

class MaxComputeDialect(SQLDialect):
    """P1 唯一实现 — 封装 DATETRUNC/WEEKOFYEAR/MAX_PT 等 MaxCompute 专用函数"""
    ...
```

```python
# app/semantic/compiler.py
class QueryCompiler:
    """将 QueryDSL 编译为 SQL"""

    def __init__(self, loader: CubeLoader, join_graph: JoinGraph,
                 dialect: SQLDialect = None):
        self._loader = loader
        self._join_graph = join_graph
        self._dialect = dialect or MaxComputeDialect()

    def compile(self, dsl: QueryDSL) -> CompileResult:
        """10 步编译流水线（含 Step 0 View Resolution）"""
        dsl = self._resolve_view(dsl)      # Step 0: View 展开
        cubes = self._resolve_cubes(dsl)
        primary_cube = self._determine_primary(cubes, dsl)
        join_path = self._join_graph.find_join_path(primary_cube, cubes - {primary_cube})

        select_clause = self._build_select(dsl, cubes)
        from_clause = self._build_from(primary_cube, join_path)
        where_clause = self._build_where(dsl, cubes)
        group_clause = self._build_group_by(dsl)
        order_clause = self._build_order(dsl)
        limit_clause = self._build_limit(dsl)

        sql = f"SELECT\n  {select_clause}\nFROM {from_clause}"
        if where_clause:
            sql += f"\nWHERE {where_clause}"
        if group_clause:
            sql += f"\nGROUP BY {group_clause}"
        if order_clause:
            sql += f"\nORDER BY {order_clause}"
        sql += f"\nLIMIT {limit_clause}"

        return self._inject_safety_rules(sql)

    def _resolve_view(self, dsl: QueryDSL) -> QueryDSL:
        """Step 0: View Resolution
        若 DSL 的 cube 字段引用的是 View，展开为底层 Cube 引用：
        1. 加载 View YAML
        2. 校验 DSL 中的 measures/dimensions 是否在 View includes 范围内
        3. 将 View join_path 注入 DSL（消除歧义）
        4. 替换字段名为 Cube.field 全限定名
        5. 若 cube 不是 View 则原样返回
        """
        view = self._view_repo.get_optional(dsl.cube)
        if view is None:
            return dsl  # 不是 View，走正常 Cube 逻辑

        resolved_measures = []
        resolved_dimensions = []
        field_map = view.build_field_map()  # {exposed_name: "cube.original_field"}
        for m in dsl.measures:
            if m not in field_map:
                raise FieldNotInViewError(view.name, m)
            resolved_measures.append(field_map[m])
        for d in dsl.dimensions:
            if d not in field_map:
                raise FieldNotInViewError(view.name, d)
            resolved_dimensions.append(field_map[d])

        return QueryDSL(
            cube=view.root_cube,
            measures=resolved_measures,
            dimensions=resolved_dimensions,
            filters=dsl.filters,
            time_dimensions=dsl.time_dimensions,
            order=dsl.order,
            limit=dsl.limit,
            _join_hints=view.join_paths,  # 注入显式 JOIN 路径提示
        )

    def _expand_measure(self, cube_name: str, measure_name: str) -> str:
        """递归展开 type=number 的 Measure 引用为聚合表达式"""
        ...

    def _resolve_partition_condition(self, cube: CubeDefinition, time_dims: list) -> str:
        """根据分区策略生成分区条件"""
        ...

    def _inject_safety_rules(self, sql: str) -> str:
        """最终安全校验：只读检查、LIMIT 兜底"""
        ...
```

```python
# app/semantic/date_utils.py
def parse_date_range(date_range: list[str], partition_format: str) -> tuple[str, str]:
    """将 DSL 中的 ISO 日期转换为分区格式
    例: ['2026-02-21', '2026-02-27'] + 'yyyyMMdd' → ('20260221', '20260227')
    """
    ...

def resolve_relative_date(expr: str, current_date: date) -> tuple[str, str]:
    """解析相对日期表达式（Agent 端已转换为绝对日期，此为兜底）"""
    ...
```

### 6.3 Measure 展开策略

对于 `type: number` 的复合指标，Compiler 需要递归展开引用：

```
accuracy 定义:
  sql: "ROUND({correct_count} * 100.0 / NULLIF({total_count}, 0), 2)"

展开过程:
  {correct_count} → SUM(CASE WHEN answer_records.answer_result = 1 THEN 1 ELSE 0 END)
  {total_count}   → COUNT(answer_records.answer_record_id)

最终 SELECT:
  ROUND(
    SUM(CASE WHEN answer_records.answer_result = 1 THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(answer_records.answer_record_id), 0),
    2
  ) AS `answer_records__accuracy`
```

### 6.4 JOIN 路径推导与歧义消解

**输入**：DSL 中涉及 `answer_records` 和 `student` 两个 Cube

**JoinGraph 推导**：

```
answer_records --[student_id = user_id]--> student
```

如果查询同时涉及 `answer_records`、`student`、`school`：

```
answer_records --> student --> school
                 (student_id=user_id)  (organization_id=school_id)
```

JoinGraph 使用 BFS 找最短路径。

#### 6.4.1 歧义性消解（Join Graph Ambiguity）

**问题**：星型/雪花模型中，A 和 C 之间可能存在多条等长路径（如 `answer_records → study_sessions → school` 和 `answer_records → student → school`），代表不同的业务含义（"答题所在学校" vs "学生所属学校"）。

**消解策略**（按优先级）：

1. **显式路径（DSL 高级特性）**：DSL 中可选指定 `join_path`，Agent 在无法确定时使用：

```json
{
  "measures": ["answer_records.total_count"],
  "dimensions": ["school.school_name"],
  "join_path": ["answer_records", "student", "school"],
  "time_dimensions": [...]
}
```

2. **context 匹配**：YAML 中 JOIN 定义的 `context` 字段标记语义上下文，Compiler 根据 DSL 中引用的维度/指标推断最匹配的路径。例如：

```yaml
# study_sessions.yml 中
joins:
  school_via_session:
    cube: school
    type: left
    relationship: "N:1"
    context: "会话所在学校"
    sql: "{CUBE}.school_id = {school}.school_id"
```

3. **默认规则**（无显式路径也无 context 匹配时）：
   - 优先选择 `N:1`（事实→维度）方向的路径
   - 同方向时优先 `left` JOIN
   - 仍并列则选声明顺序靠前的路径
   - 限制最大 JOIN 深度为 3 层，超过则报 `JoinPathTooDeepError`

### 6.5 Fan-out 防护（对称聚合）

**问题**：多表 JOIN 导致的数据发散（Fan-out）是语义层编译器最经典的深水区。当事实表 A JOIN 事实表 B（1:N 关系）后计算 A 的 SUM 指标，A 的行会被 B 扇出，导致指标重复计算。

**示例**：

```
student JOIN study_sessions（1:N）
如果此时 SUM(student.some_field)，每个学生的值会被其会话数放大。
```

**防护策略**：

Compiler 根据 YAML 中声明的 `relationship` 字段判断 JOIN 安全性：

| 场景 | relationship | 策略 |
|------|-------------|------|
| 事实表 → 维度表 | `N:1` | 安全，直接 JOIN |
| 维度表 → 事实表 | `1:N` | **Subquery JOIN**：先在事实表上完成 GROUP BY，再 JOIN |
| 事实表 → 事实表 | `1:N` / `N:N` | **Subquery JOIN**：每侧独立聚合后再 JOIN |
| 一对一 | `1:1` | 安全，直接 JOIN |

**Subquery JOIN 生成示例**：

假设查询需要"每个学生的学习会话数 + 答题正确率"：

```json
{
  "measures": ["study_sessions.session_count", "answer_records.accuracy"],
  "dimensions": ["student.user_name"],
  "filters": [...],
  "time_dimensions": [...]
}
```

Compiler 检测到 `student` 同时 JOIN 两张 1:N 的事实表，生成 Subquery JOIN：

```sql
SELECT
  s.user_name AS `student__user_name`,
  sess_agg.session_count AS `study_sessions__session_count`,
  ans_agg.accuracy AS `answer_records__accuracy`
FROM dim_ucenter_user_student_df s
LEFT JOIN (
  -- 先在 study_sessions 上聚合
  SELECT student_id, COUNT(*) AS session_count
  FROM dwd_study_sessions_snap_f
  WHERE create_time >= '2026-02-21'
  GROUP BY student_id
) sess_agg ON s.user_id = sess_agg.student_id
LEFT JOIN (
  -- 先在 answer_records 上聚合
  SELECT student_id,
    ROUND(SUM(CASE WHEN answer_result=1 THEN 1 ELSE 0 END)*100.0
      / NULLIF(COUNT(*),0), 2) AS accuracy
  FROM dwd_study_first_answer_records_snap_di
  WHERE answer_date BETWEEN '20260221' AND '20260227'
    AND answer_result IN (1, 2)
  GROUP BY student_id
) ans_agg ON s.user_id = ans_agg.student_id
WHERE s.ds = MAX_PT('dim_ucenter_user_student_df')
  AND s.user_is_test = 1
```

**核心规则**：

> **Measure 归属原则**：每个 Measure 的聚合计算**只能**发生在其所属 Cube 的行集上。当 Compiler 检测到某个 Measure 所属 Cube 与主查询 Cube 的关系为 `1:N` 时，自动将该 Measure 的计算下推到子查询中。

**实现要点**：

```python
# compiler.py 中 Fan-out 检测逻辑
def _check_fanout_risk(self, primary_cube: str, measure_cubes: set[str]) -> dict[str, str]:
    """返回需要 Subquery 的 Cube 及原因"""
    risky = {}
    for cube_name in measure_cubes:
        if cube_name == primary_cube:
            continue
        join_def = self._find_join(primary_cube, cube_name)
        if join_def and join_def.relationship in ("1:N", "N:N"):
            risky[cube_name] = join_def.relationship
    return risky
```

### 6.6 分区条件自动注入

| 场景 | 注入行为 |
|------|----------|
| 主 Cube 有分区 + DSL 含 time_dimensions | 使用 date_range 生成 `BETWEEN` 条件 |
| 主 Cube 有分区 + DSL 无 time_dimensions | 报错：`分区表必须指定时间范围` |
| JOIN 目标维度表有 `latest_expr` | 注入 `AND {table}.ds = MAX_PT('{table}')` |
| JOIN 目标维度表无 `latest_expr` 且有分区 | 自动取主表时间范围 |
| 无分区表 | 不注入分区条件 |

### 6.7 时间粒度 SQL 转换（Time Granularity）

DSL 中 `time_dimensions[].granularity` 字段控制时间维度的分组粒度。由于 MaxCompute SQL 方言与 MySQL 等有差异，Compiler 必须硬编码实现以下转换规则。

#### 分区字段为字符串型（format: yyyyMMdd）

分区字段（如 `answer_date`、`energy_date`）在 MaxCompute 中存储为 STRING 类型，格式为 `'20260227'`。

| 粒度 | SELECT 表达式 | GROUP BY 表达式 | 说明 |
|------|--------------|----------------|------|
| `day` | `{col}` | `{col}` | 原样，不转换 |
| `week` | `CONCAT(SUBSTR({col},1,4), 'W', LPAD(WEEKOFYEAR(TO_DATE({col},'yyyyMMdd')),2,'0'))` | 同左 | 输出 `2026W09` 格式 |
| `month` | `SUBSTR({col}, 1, 6)` | `SUBSTR({col}, 1, 6)` | 截断到 `202602` |
| `quarter` | `CONCAT(SUBSTR({col},1,4), 'Q', CEIL(CAST(SUBSTR({col},5,2) AS INT)/3.0))` | 同左 | 输出 `2026Q1` |
| `year` | `SUBSTR({col}, 1, 4)` | `SUBSTR({col}, 1, 4)` | 截断到 `2026` |

#### 分区字段为 DATETIME/TIMESTAMP 型

对于 `create_time`、`start_time` 等 DATETIME 类型字段：

| 粒度 | SELECT 表达式 | 说明 |
|------|--------------|------|
| `day` | `TO_CHAR({col}, 'yyyy-MM-dd')` | |
| `week` | `TO_CHAR(DATETRUNC({col}, 'WW'), 'yyyy-MM-dd')` | 截断到该周一 |
| `month` | `TO_CHAR(DATETRUNC({col}, 'MM'), 'yyyy-MM')` | |
| `quarter` | `CONCAT(YEAR({col}), 'Q', QUARTER({col}))` | |
| `year` | `TO_CHAR({col}, 'yyyy')` | |

#### Compiler 实现

```python
# app/semantic/date_utils.py
GRANULARITY_SQL = {
    "string": {
        "day":     lambda col: col,
        "week":    lambda col: f"CONCAT(SUBSTR({col},1,4),'W',LPAD(WEEKOFYEAR(TO_DATE({col},'yyyyMMdd')),2,'0'))",
        "month":   lambda col: f"SUBSTR({col}, 1, 6)",
        "quarter": lambda col: f"CONCAT(SUBSTR({col},1,4),'Q',CEIL(CAST(SUBSTR({col},5,2) AS INT)/3.0))",
        "year":    lambda col: f"SUBSTR({col}, 1, 4)",
    },
    "datetime": {
        "day":     lambda col: f"TO_CHAR({col}, 'yyyy-MM-dd')",
        "week":    lambda col: f"TO_CHAR(DATETRUNC({col}, 'WW'), 'yyyy-MM-dd')",
        "month":   lambda col: f"TO_CHAR(DATETRUNC({col}, 'MM'), 'yyyy-MM')",
        "quarter": lambda col: f"CONCAT(YEAR({col}), 'Q', QUARTER({col}))",
        "year":    lambda col: f"TO_CHAR({col}, 'yyyy')",
    },
}

def apply_granularity(col_expr: str, granularity: str, col_type: str) -> str:
    """将时间维度列按粒度转换为 MaxCompute SQL 表达式"""
    type_key = "string" if col_type in ("string", "date") else "datetime"
    fn = GRANULARITY_SQL[type_key].get(granularity)
    if not fn:
        raise GranularityNotSupportedError(granularity, col_type)
    return fn(col_expr)
```

当 DSL 中指定了 `granularity` 时，该时间维度同时出现在 SELECT 和 GROUP BY 中（转换后的表达式），并自动增加 ORDER BY 以保证时序。

### 6.8 Default Filter 注入

每个 Cube 的 `default_filters` 在编译时自动注入到 WHERE 子句。对于 JOIN 目标 Cube，default_filters 注入到 JOIN ... ON 子句中。

### 6.9 错误处理

| 错误类型 | 行为 |
|----------|------|
| Cube 不存在 | 返回 `CubeNotFoundError(cube_name)` |
| Dimension/Measure 不存在 | 返回 `FieldNotFoundError(cube, field)` |
| 分区表未指定时间范围 | 返回 `PartitionRequiredError(cube)` |
| 时间范围超限 | 返回 `DateRangeExceededError(cube, max_days)` |
| Measure 循环引用 | 返回 `CircularReferenceError(measure_chain)` |
| JOIN 路径不可达 | 返回 `JoinPathNotFoundError(source, target)` |
| JOIN 路径过深 | 返回 `JoinPathTooDeepError(path, max_depth=3)` |
| Fan-out 未声明 relationship | 返回 `FanoutRiskError(source, target, "请在 YAML 中声明 relationship")` |
| 时间粒度不支持 | 返回 `GranularityNotSupportedError(granularity, col_type)` |

### 6.10 查询执行重试策略

`query` 工具执行 SQL 时可能遇到数据源临时性故障。Compiler 编译阶段的错误（上述 6.9）属于不可重试错误，直接返回。仅对**执行阶段**的临时性错误进行自动重试。

#### 错误分类

| 类别 | 错误类型 | 行为 |
|------|---------|------|
| **可重试** | MaxCompute TaskTimeout（任务排队超时） | 自动重试 |
| **可重试** | HTTP 503/504（服务暂不可用） | 自动重试 |
| **可重试** | 网络连接超时 / ConnectionReset | 自动重试 |
| **不可重试** | SQL 语法错误（ODPS-0123XXX） | 直接返回错误 |
| **不可重试** | 权限不足（AccessDenied） | 直接返回错误 |
| **不可重试** | 表/字段不存在 | 直接返回错误 |
| **不可重试** | Compiler 编译错误（6.9 中所有类型） | 直接返回错误 |

#### 重试策略

```python
MAX_RETRIES = 1          # 最多自动重试 1 次
RETRY_DELAY_SEC = 3      # 重试间隔 3 秒

def execute_with_retry(sql: str, adapter: DataSourceAdapter) -> QueryResult:
    for attempt in range(MAX_RETRIES + 1):
        try:
            return adapter.execute_query(sql)
        except RetriableError as e:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SEC * (attempt + 1))
                continue
            raise QueryExecutionError(
                message=e.message,
                retriable=True,
                suggestion="查询执行超时，建议缩小时间范围或稍后重试"
            )
        except NonRetriableError as e:
            raise QueryExecutionError(
                message=e.message,
                retriable=False,
                suggestion="SQL 执行失败，请检查查询条件"
            )
```

#### Agent 侧感知

`query` 工具返回错误时携带 `retriable` 标记，Agent 可据此决定下一步：

| `retriable` | Agent 行为 |
|-------------|-----------|
| `true` | 回复用户"查询暂时超时，正在重试…"，下一轮可再次调用 `query` |
| `false` | 回复用户错误原因 + 修复建议，不重试 |

### 6.11 Compiler 测试用例矩阵

覆盖 Compiler 核心编译逻辑的 15 个 edge case，Phase 1.6 编写对应单元测试：

| 编号 | 场景 | 输入 DSL 要点 | 预期 SQL 关键特征 |
|------|------|--------------|------------------|
| T01 | 单 Cube 无 JOIN | answer_records 的 total_count + accuracy | 无 JOIN，单表 GROUP BY |
| T02 | 单 Cube + 1 层 N:1 JOIN | answer_records + student.user_name 过滤 | LEFT JOIN student + 分区注入 |
| T03 | 2 层链式 JOIN | answer_records → student → school | 两级 LEFT JOIN 链 |
| T04 | 3 层 JOIN（深度上限） | answer_records → study_sessions → lesson_progress → course | 三级 JOIN，不报错 |
| T05 | 超深度 JOIN（应报错） | 4 层 JOIN 路径 | 抛出 JoinPathTooDeepError |
| T06 | Fan-out Subquery JOIN | student + study_sessions.session_count + answer_records.accuracy | 两侧子查询聚合后 JOIN |
| T07 | View 展开 | DSL 引用 student_answer_analysis View | View 字段映射为 Cube 全限定名 |
| T08 | Time Granularity — STRING 分区 | answer_date + granularity=week | WEEKOFYEAR 表达式 |
| T09 | Time Granularity — DATETIME | create_time + granularity=month | DATETRUNC 表达式 |
| T10 | 无分区表 | study_sessions（无 partition） | 无分区条件，无 time_dimensions 也不报错 |
| T11 | 分区表无 time_dimensions（应报错） | answer_records 无 time_dimensions | 抛出 PartitionRequiredError |
| T12 | Measure 递归展开 | accuracy 引用 correct_count 和 total_count | ROUND(SUM(...)/NULLIF(COUNT(...),0),2) |
| T13 | Default Filter 注入 | answer_records（answer_result IN 1,2） | WHERE 中包含 default_filter |
| T14 | Segment 注入 | answer_records.only_correct_wrong | WHERE 中包含 segment SQL |
| T15 | LIMIT 兜底 | DSL 未指定 limit | SQL 含 LIMIT 50000 |

---

## 七、Agent 集成设计

### 7.1 工作流变更

**现有流程**（LLM 直接写 SQL）：

```
用户提问 → search_knowledge → read_knowledge → describe_table → LLM 拼写 SQL → execute_sql
```

**新流程**（LLM 构造 DSL）：

```
用户提问 → list_cubes（含 Views） → describe_cube / describe_view
  → LLM 构造 DSL JSON（cube 字段可引用 View 名）
  → query(dsl) → Compiler 展开 View → 编译 SQL → 执行 → 返回结果
```

### 7.2 工具替换

| 旧工具 | 新工具 | 说明 |
|--------|--------|------|
| `search_knowledge` | `list_cubes` | 返回所有 Cube + View 摘要（name, title, description, kind） |
| `read_knowledge` | `describe_cube` | 返回单个 Cube 或 View 的完整定义 |
| `describe_table` | 移除 | Cube 定义已包含字段信息 |
| `list_tables` | 移除 | `list_cubes` 替代 |
| `execute_sql` | `query` | 接受 DSL JSON，cube 字段可引用 View 名，内部编译执行 |

**新工具定义**：

```python
tools = [
    {
        "name": "list_cubes",
        "description": "列出所有可用的语义 Cube 和 View。返回每项的名称、标题、业务描述和类型（cube/view）。View 是多个 Cube 的策展视图，可直接在 query 工具中使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "可选关键词，按名称/标题/描述过滤"
                },
                "kind": {
                    "type": "string",
                    "enum": ["all", "cube", "view"],
                    "description": "筛选类型：all（默认）、cube、view"
                }
            }
        }
    },
    {
        "name": "describe_cube",
        "description": "获取指定 Cube 或 View 的完整定义。Cube 返回维度、指标、分段、关联关系，并自动附带 DSL 中引用了该 Cube/View 的 Query Recipes（Few-shot 示例，从 DSL 自动提取关联）；View 返回暴露的字段列表和引用的 Cube 链路。",
        "parameters": {
            "type": "object",
            "required": ["cube_name"],
            "properties": {
                "cube_name": {
                    "type": "string",
                    "description": "Cube 或 View 名称，如 answer_records 或 student_answer_analysis"
                }
            }
        }
    },
    {
        "name": "query",
        "description": "基于语义层执行查询。传入 DSL（measures/dimensions/filters/time_dimensions），系统自动编译为 SQL 并执行。",
        "parameters": {
            "type": "object",
            "required": ["dsl"],
            "properties": {
                "dsl": {
                    "type": "object",
                    "description": "查询 DSL，格式见 describe_cube 返回中的示例",
                    "properties": {
                        "measures": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "指标列表，格式: cube_name.measure_name"
                        },
                        "dimensions": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "维度列表，格式: cube_name.dimension_name"
                        },
                        "segments": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "分段列表，格式: cube_name.segment_name"
                        },
                        "filters": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "dimension": {"type": "string"},
                                    "operator": {"type": "string"},
                                    "values": {"type": "array"}
                                }
                            }
                        },
                        "time_dimensions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "dimension": {"type": "string"},
                                    "granularity": {"type": "string"},
                                    "date_range": {"type": "array", "items": {"type": "string"}}
                                }
                            }
                        },
                        "order": {
                            "type": "array",
                            "items": {"type": "array", "items": {"type": "string"}}
                        },
                        "limit": {"type": "integer"}
                    }
                }
            }
        }
    },
    {
        "name": "execute_sql",
        "description": "直接执行 SQL（仅用于 Compiler 无法处理的复杂查询作为兜底）。",
        "parameters": {
            "type": "object",
            "required": ["sql"],
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "只读 SQL 查询语句"
                }
            }
        }
    }
]
```

### 7.3 System Prompt 调整

在 System Prompt 中注入 **Cube + View 目录摘要**（约 600 token），LLM 无需调用 `list_cubes` 即可快速定位相关 Cube 或 View：

```
## 可用语义 Cube & View

| 名称 | 类型 | 标题 | 描述 |
|------|------|------|------|
| student | cube | 学生 | 学生基础信息维度表 |
| school | cube | 学校 | 学校基础信息维度表 |
| answer_records | cube | 答题记录 | 学生首次答题记录事实表 |
| study_sessions | cube | 学习会话 | 学生学习相关的会话管理 |
| lesson_progress | cube | AI课学习进度 | 会话粒度的AI课进度 |
| lesson_widget | cube | AI课组件进度 | 组件粒度的AI课进度 |
| energy_detail | cube | 能量发放 | 能量发放流水表 |
| kt_recommend | cube | KT推题 | KT模型自适应推题全链路 |
| question | cube | 题目 | 题库维度表 |
| knowledge | cube | 知识点 | 基础树与业务树结构 |
| student_ability | cube | 学生学科能力 | IRT模型学科能力分层 |
| meta_dict | cube | 元数据字典 | 业务枚举值含义 |
| course | cube | AI课程 | AI课程组课信息 |
| lesson_qa | cube | 问一问 | AI课问一问记录 |
| student_answer_analysis | view | 学生答题分析 | 聚合答题+学生+学校，面向教研团队 |
| teaching_overview | view | 教学总览 | 汇聚课程进度+学习时长+答题情况 |

根据用户问题定位 Cube → describe_cube 确认维度/指标 → 构造 DSL → query 执行。

## 典型查询场景（describe_cube 会自动附带对应 Recipes）

| Cube | 典型场景 |
|------|---------|
| answer_records | 各学科答题正确率、年级排名、正确率趋势 |
| energy_detail | 能量拦截原因分析、发放vs拦截对比 |
| kt_recommend | KT推题正确率、各学科推题量趋势 |
| lesson_progress | 课程完课率、学习时长统计 |
| study_sessions | 日活/周活统计、学习会话时长分布 |

调用 describe_cube 后，参考返回中 query_recipes 字段的 DSL 示例来构造查询。
```

### 7.4 Fallback 策略

当 Compiler 无法处理的复杂查询（如跨 Cube 子查询、窗口函数、CTE 等），Agent 仍可降级使用 `execute_sql` 工具直接执行 SQL。System Prompt 中指导 LLM：

> 优先使用 `query` 工具（DSL 查询）。仅当查询需要窗口函数、子查询、UNION 等 DSL 不支持的特性时，降级为 `execute_sql`，此时需先 `describe_cube` 确认表结构。

### 7.5 MaxCompute 延迟应对与加速层演进

#### 问题

MaxCompute 是离线计算引擎，SQL 执行链路：提交任务 → 排队 → 资源分配 → 计算 → 返回结果。简单查询通常 10~30 秒，涉及多表 JOIN + 大范围分区时可达 1~3 分钟。这对飞书对话式交互的体验伤害极大。

#### 短期策略（P1 实施）

1. **预估时长提示**：`query` 工具执行前，Compiler 根据 DSL 复杂度（涉及 Cube 数、时间范围天数、是否 Subquery JOIN）预估执行时间，Agent 回复中包含安抚话术：

```
⏳ 正在通过 MaxCompute 引擎计算，预计需要 20~40 秒...
```

预估规则：

| 场景 | 预估时长 |
|------|----------|
| 单 Cube、无 JOIN、<= 7 天 | 10~20 秒 |
| 2~3 Cube JOIN、<= 30 天 | 20~40 秒 |
| 3+ Cube、Subquery JOIN、> 30 天 | 40~90 秒 |

2. **渐进式卡片更新**：已有的飞书渐进式卡片机制（`on_progress` 回调）在 `query` 执行阶段显示进度，减少等待焦虑。

3. **结果缓存**：相同 DSL（JSON 序列化后 hash）+ 相同日期范围的查询结果缓存在 Redis 中（TTL = 10 分钟），重复查询直接返回。

```python
# tool_registry.py 中 query 工具
cache_key = f"semantic:query:{hashlib.md5(json.dumps(dsl, sort_keys=True).encode()).hexdigest()}"
cached = redis_client.get(cache_key)
if cached:
    return json.loads(cached)
# ... 编译执行 ...
redis_client.setex(cache_key, 600, json.dumps(result))
```

#### 中长期策略（P2+ 预留接口）

4. **Pre-aggregation（预聚合/物化视图）**：语义层未来支持在 Cube YAML 中声明 `pre_aggregations`，将高频查询模式物化为中间表或加速引擎中的物化视图：

```yaml
# answer_records.yml（P2 扩展）
pre_aggregations:
  daily_subject_accuracy:
    measures: [total_count, correct_count, accuracy]
    dimensions: [subject_name]
    time_dimension: answer_date
    granularity: day
    refresh: "0 6 * * *"          # 每天 6:00 刷新
    engine: hologres               # 目标加速引擎
```

5. **加速层路由**：Compiler 在编译 DSL 时，检查是否命中某个 `pre_aggregation` 定义。命中则将 SQL 路由到加速引擎（Hologres / StarRocks），未命中则走 MaxCompute。对 Agent 和用户完全透明。

```
DSL → Compiler
  ├── 命中 pre_aggregation → 生成加速引擎 SQL → Hologres（秒级）
  └── 未命中 → 生成 MaxCompute SQL → MaxCompute（10s~分钟级）
```

> **P1 阶段不实施加速层**，但 Compiler 架构预留 `engine` 参数，Cube YAML Schema 预留 `pre_aggregations` 字段。

---

## 八、物理层同步

### 8.1 同步机制

定时任务（每日一次）对比 Cube YAML 定义与 MaxCompute 物理表 Schema，检测漂移：

```python
# app/semantic/sync_service.py
class SchemaSyncService:
    """物理层 Schema 同步检测"""

    def __init__(self, loader: CubeLoader, adapter: DataSourceAdapter):
        self._loader = loader
        self._adapter = adapter

    def check_drift(self) -> list[DriftReport]:
        """对比 YAML 定义与物理表 Schema"""
        reports = []
        for cube in self._loader.load_all().values():
            physical_schema = self._adapter.get_table_schema(cube.table)
            physical_cols = {c['name']: c['type'] for c in physical_schema['columns']}

            yaml_cols = set()
            for dim in cube.dimensions.values():
                col = self._extract_column(dim.sql)
                if col:
                    yaml_cols.add(col)

            # 检测
            missing_in_physical = yaml_cols - set(physical_cols.keys())
            new_in_physical = set(physical_cols.keys()) - yaml_cols
            # type_mismatches = ...

            if missing_in_physical or new_in_physical:
                reports.append(DriftReport(
                    cube=cube.name,
                    table=cube.table,
                    missing_columns=list(missing_in_physical),
                    new_columns=list(new_in_physical),
                ))
        return reports
```

### 8.2 漂移处理

| 漂移类型 | 处理方式 |
|----------|----------|
| YAML 引用字段不存在于物理表 | 标记为 ERROR，发送告警（飞书消息） |
| 物理表新增字段未在 YAML 中定义 | 标记为 WARNING，提示数据开发补充 |
| 字段类型不匹配 | 标记为 WARNING |

---

## 九、目录结构

> 遵循项目现有 Clean Architecture 分层（domain / application / infrastructure / interfaces），语义层模块按层拆分，而非放入扁平 `app/semantic/`。

```
app/
├── domain/
│   └── semantic/                           # 领域层 — 纯业务逻辑，零外部依赖
│       ├── __init__.py
│       ├── entities.py                     # CubeDefinition, ViewDefinition, RecipeDefinition,
│       │                                   # DimensionDef, MeasureDef, JoinDef, SegmentDef,
│       │                                   # QueryDSL, FilterClause, TimeDimension, DriftReport
│       ├── compiler.py                     # QueryCompiler — DSL → SQL 编译（含 View Resolution）
│       ├── dialects.py                    # SQLDialect 抽象 + MaxComputeDialect（P1 唯一实现）
│       ├── join_graph.py                   # JoinGraph — BFS 最短路径推导 + 歧义消解
│       └── ports/                          # 端口（抽象接口）
│           ├── cube_repository.py          # ICubeRepository: list_all / get / save / delete
│           ├── view_repository.py          # IViewRepository: list_all / get / save / delete
│           ├── recipe_repository.py        # IRecipeRepository: get_by_cube(name) → list[Recipe]（内部通过反向索引） / list_all
│           └── schema_inspector.py         # ISchemaInspector: get_table_columns / fetch_dict_enums
│
├── application/
│   ├── semantic/                           # 应用层 — 用例编排，CQRS Handler
│   │   ├── commands/
│   │   │   ├── compile_dsl.py              # CompileDSLCommand + CompileDSLHandler
│   │   │   ├── compile_debug.py            # CompileDebugCommand — 逐步调试编译
│   │   │   ├── execute_query.py            # ExecuteQueryCommand + ExecuteQueryHandler
│   │   │   ├── sync_schema.py              # SyncSchemaCommand + SyncSchemaHandler
│   │   │   ├── update_cube.py              # UpdateCubeCommand + UpdateCubeHandler
│   │   │   ├── delete_cube.py              # DeleteCubeCommand + DeleteCubeHandler
│   │   │   ├── materialize_view.py         # MaterializeViewCommand — View → 虚拟数据集
│   │   │   ├── update_view.py              # UpdateViewCommand + UpdateViewHandler
│   │   │   └── delete_view.py              # DeleteViewCommand + DeleteViewHandler
│   │   ├── queries/
│   │   │   ├── list_cubes.py               # ListCubesQuery — 返回 Cubes + Views
│   │   │   ├── describe_cube.py            # DescribeCubeQuery — 支持 Cube 和 View，自动附带 Recipes
│   │   │   └── get_graph.py                # GetGraphQuery + GetGraphHandler
│   │   └── services/
│   │       └── enum_resolver.py            # EnumResolverService — 动态枚举批量加载
│   │
│   └── agent/
│       ├── services/
│       │   └── tool_registry.py            # 新增 list_cubes / describe_cube / query 工具
│       └── prompts/
│           └── templates.py                # 更新 System Prompt（注入 Cube 目录）
│
├── infrastructure/
│   └── semantic/                           # 基础设施层 — 端口实现
│       ├── yaml_cube_repository.py         # YamlCubeRepository（实现 ICubeRepository）
│       │                                   # 负责 YAML 文件读写、Pydantic 校验
│       ├── yaml_view_repository.py         # YamlViewRepository（实现 IViewRepository）
│       ├── yaml_recipe_repository.py       # YamlRecipeRepository（实现 IRecipeRepository）
│       │                                   # 加载时自动提取 DSL 中的 Cube 引用，构建 _cube_index 反向索引
│       ├── maxcompute_schema_inspector.py  # MaxComputeSchemaInspector（实现 ISchemaInspector）
│       │                                   # 封装 DataSourceAdapter 的 get_table_schema / execute_query
│       ├── cubes/                          # Cube YAML 定义目录
│       │   ├── student.yml
│       │   ├── school.yml
│       │   ├── answer_records.yml
│       │   ├── study_sessions.yml
│       │   ├── lesson_progress.yml
│       │   ├── lesson_widget.yml
│       │   ├── energy_detail.yml
│       │   ├── kt_recommend.yml
│       │   ├── question.yml
│       │   ├── knowledge.yml
│       │   ├── student_ability.yml
│       │   ├── meta_dict.yml
│       │   ├── course.yml
│       │   └── lesson_qa.yml
│       ├── views/                          # View YAML 定义目录
│       │   ├── student_answer_analysis.yml
│       │   └── teaching_overview.yml
│       └── recipes/                        # Query Recipe YAML 定义目录
│           ├── answer_accuracy_by_subject.yml
│           ├── energy_block_analysis.yml
│           └── kt_accuracy.yml
│
├── interfaces/
│   └── api/
│       └── v1/
│           └── semantic.py                 # Blueprint: /api/v1/semantic/*（18+ 个端点）
│
├── shared/
│   └── date_utils.py                       # 日期工具（语义层 + 通用）
│
└── di/
    └── container.py                        # 新增 semantic 模块依赖注册
```

### 9.1 端口接口定义

```python
# domain/semantic/ports/cube_repository.py
from abc import ABC, abstractmethod
from domain.semantic.entities import CubeDefinition

class ICubeRepository(ABC):
    """Cube 定义的持久化端口"""

    @abstractmethod
    def list_all(self) -> dict[str, CubeDefinition]: ...

    @abstractmethod
    def get(self, name: str) -> CubeDefinition: ...

    @abstractmethod
    def save(self, name: str, yaml_content: str) -> None: ...

    @abstractmethod
    def delete(self, name: str) -> None: ...


# domain/semantic/ports/schema_inspector.py
class ISchemaInspector(ABC):
    """物理表 Schema 检查端口"""

    @abstractmethod
    def get_table_columns(self, table: str) -> dict[str, str]:
        """返回 {column_name: column_type}"""
        ...

    @abstractmethod
    def fetch_dict_enums(self, dict_types: set[str]) -> dict[str, dict[str, str]]:
        """批量获取字典表枚举 {dict_type: {key: name}}"""
        ...
```

### 9.2 DI 容器集成

```python
# di/container.py 追加
from dependency_injector import containers, providers
from domain.semantic.compiler import QueryCompiler
from domain.semantic.join_graph import JoinGraph
from infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from infrastructure.semantic.yaml_view_repository import YamlViewRepository
from infrastructure.semantic.yaml_recipe_repository import YamlRecipeRepository
from infrastructure.semantic.maxcompute_schema_inspector import MaxComputeSchemaInspector
from domain.semantic.dialects import MaxComputeDialect

class SemanticContainer(containers.DeclarativeContainer):
    config = providers.Configuration()
    datasource_adapter = providers.Dependency()

    schema_inspector = providers.Singleton(
        MaxComputeSchemaInspector,
        adapter=datasource_adapter,
    )
    cube_repository = providers.Singleton(
        YamlCubeRepository,
        cubes_dir=config.semantic_cubes_dir,
        schema_inspector=schema_inspector,
    )
    view_repository = providers.Singleton(
        YamlViewRepository,
        views_dir=config.semantic_views_dir,
    )
    recipe_repository = providers.Singleton(
        YamlRecipeRepository,
        recipes_dir=config.semantic_recipes_dir,
    )
    join_graph = providers.Singleton(
        JoinGraph,
        cubes=cube_repository.provided.list_all,
    )
    dialect = providers.Singleton(MaxComputeDialect)
    query_compiler = providers.Singleton(
        QueryCompiler,
        repository=cube_repository,
        view_repo=view_repository,
        join_graph=join_graph,
        dialect=dialect,
    )
    # Handlers（DescribeCubeHandler 注入 recipe_repository 以附带 few-shot）
```

---

## 十、实施计划

### Phase 1.1 — 基础框架 + 数据模型（2天）

- [ ] 创建 `app/domain/semantic/`、`app/infrastructure/semantic/` 目录结构
- [ ] 实现 `entities.py`：CubeDefinition、**ViewDefinition**、**RecipeDefinition**、DimensionDef、MeasureDef、JoinDef、QueryDSL 等 Pydantic 模型
- [ ] 实现 `YamlCubeRepository`：YAML 文件加载、校验、list_cubes/describe_cube
- [ ] 实现 `YamlViewRepository`：View YAML 文件加载、校验、字段映射构建
- [ ] 实现 `YamlRecipeRepository`：Recipe YAML 加载、自动提取 DSL 中 Cube 引用构建反向索引、`get_by_cube` 查询
- [ ] 编写 Cube/View/Recipe YAML Schema 校验（必填字段检查、引用合法性）

### Phase 1.2 — 14 个 Cube + 2 个 View + Recipe 定义（1.5天）

- [ ] 根据本 PRD 第四章定义，创建 14 个 Cube `.yml` 文件
- [ ] 根据三-B 章定义，创建 `student_answer_analysis` 和 `teaching_overview` 两个 View `.yml` 文件
- [ ] 根据三-C 章定义，为核心 Cube 创建 Recipe `.yml` 文件（优先 `answer_records`、`energy_detail`、`kt_recommend`）
- [ ] 将旧 `query-templates.md` 中的 SQL 模板转写为 Recipe DSL 配方
- [ ] 校验所有 Cube 的字段引用与物理表一致
- [ ] 校验关联关系的完整性（双向 JOIN 可达）
- [ ] 校验 View 引用的字段均存在于对应 Cube 中

### Phase 1.3 — JoinGraph + Compiler（4天）

- [ ] 实现 `join_graph.py`：图构建、BFS 最短路径推导、歧义消解（context 匹配 + 默认规则）
- [ ] 实现 `compiler.py`：10 步编译流水线（含 Step 0 View Resolution）
- [ ] 实现 `date_utils.py`：日期格式转换 + **Time Granularity SQL 转换**（day/week/month/quarter/year，区分 STRING 和 DATETIME 类型）
- [ ] Measure 递归展开
- [ ] 分区条件自动注入（主表 + JOIN 维度表）
- [ ] Default Filter 注入
- [ ] **Fan-out 防护**：基于 `relationship` 字段检测 1:N 风险，自动生成 Subquery JOIN
- [ ] 错误处理（CubeNotFoundError、PartitionRequiredError、FanoutRiskError、GranularityNotSupportedError 等）

### Phase 1.4 — Agent 工具集成（2天）

- [ ] 在 `tool_registry.py` 中注册 `list_cubes`、`describe_cube`、`query` 工具
- [ ] `describe_cube` 返回时自动附带 `query_recipes`（`YamlRecipeRepository.get_by_cube` 通过 DSL 反向索引查询）
- [ ] `query` 工具内部：解析 DSL → Compiler 编译 → execute_query → 返回结果
- [ ] 保留 `execute_sql` 作为兜底
- [ ] 更新 `templates.py`：System Prompt 注入 Cube 目录摘要 + 典型查询场景表
- [ ] **查询结果缓存**：相同 DSL hash 的结果 Redis 缓存（TTL 10 分钟）
- [ ] **延迟预估**：Compiler 根据 DSL 复杂度预估执行时长，注入 Agent 安抚话术

### Phase 1.5 — 物理层同步（1天）

- [ ] 实现 `sync_service.py`：Schema 对比检测
- [ ] 注册定时任务（每日执行）
- [ ] 漂移告警（飞书消息推送）

### Phase 1.6 — 测试与调优（2天）

- [ ] 编写 Compiler 单元测试（覆盖 6.11 测试用例矩阵 T01~T15 共 15 个场景）
- [ ] 端到端测试：用户提问 → DSL → SQL → 结果
- [ ] 验证 Recipe few-shot 注入效果：对比有/无 Recipe 时 LLM 生成的 DSL 准确率
- [ ] 与旧知识库模式 A/B 对比，验证指标一致性
- [ ] 调优 System Prompt + Recipe 示例，确保 LLM 正确构造 DSL

### Phase 2 — Canvas UI + DevTools + 加速层（后续）

- [ ] 关系画布：Cube + View 节点可视化、ELK 自动布局
- [ ] 拖拽建立实体关联关系
- [ ] 开发者工具：YAML 编辑器 Tab（文件树 + Monaco + Diff + 校验）
- [ ] 开发者工具：编译调试器 Tab（逐步编译 + JOIN 路径可视化）
- [ ] View 物化功能：物化为虚拟数据集按钮 + 后端 API
- [ ] Schema 同步 ↔ YAML 编辑器联动
- [ ] **Pre-aggregation 支持**：YAML 中声明预聚合规则，定时物化到加速引擎
- [ ] **加速层路由**：Compiler 检测 DSL 是否命中 pre_aggregation，命中则路由到 Hologres/StarRocks
- [ ] **DSL 扩展**：支持 `join_path` 显式路径指定（高级特性）

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **Fan-out 数据发散** | 聚合指标被 1:N JOIN 放大，结果偏大 | YAML 强制声明 `relationship`；Compiler 检测 1:N 时自动生成 Subquery JOIN；单元测试对比直接查 vs JOIN 查的指标一致性 |
| **JOIN 路径歧义** | 同一对 Cube 多条路径代表不同业务含义，选错路径导致结果错误 | YAML 中 `context` 字段标记语义；DSL 支持 `join_path` 显式指定；默认规则优先 N:1 方向 |
| **MaxCompute 延迟** | 飞书对话场景用户等待 10s~分钟级，体验差 | 短期：预估时长 + 安抚话术 + 渐进式卡片 + 结果缓存（Redis TTL 10min）；中长期：pre_aggregation + OLAP 加速层路由 |
| **Time Granularity 方言差异** | MaxCompute 日期函数与 MySQL 等不同，粒度截断出错 | 硬编码 MaxCompute 专用转换规则（`DATETRUNC`/`WEEKOFYEAR`/`SUBSTR`）；单元测试覆盖每种粒度 |
| LLM 构造 DSL 不准确 | 查询结果错误 | **Query Recipes Few-shot 注入**：`describe_cube` 自动附带 DSL 中引用了该 Cube 的配方示例（反向索引匹配）；Compiler 编译前校验字段引用合法性；System Prompt 典型场景引导；保留 execute_sql 兜底 |
| DSL 表达能力不足 | 复杂查询无法用 DSL 表示 | 保留 execute_sql 工具作为降级路径；逐步扩展 DSL 支持能力 |
| Cube YAML 与物理表不同步 | 编译的 SQL 执行失败 | 每日物理层同步检测 + 告警 |
| Measure 定义口径有误 | 指标计算结果不可信 | Cube 定义由数据开发 Review；单元测试覆盖核心指标 |
| JOIN 路径推导错误 | SQL 笛卡尔积或结果偏少 | JoinGraph 单元测试；限制 JOIN 层数（默认最多 3 层）；JOIN 结果行数校验 |
| 迁移期间新旧不一致 | 过渡期查询结果差异 | 并行运行新旧两套，A/B 对比后切换 |
| **View 物化与虚拟数据集不一致** | View 定义更新后，已物化的虚拟数据集 SQL 过时 | 物化操作为手动触发（非自动同步）；UI 标记物化状态（"已过期"）；P2 支持自动重新物化 |
| **View 字段映射错误** | View includes 中的字段被 Cube 侧重命名或删除 | View 加载时校验字段引用合法性；Schema 同步检测同时覆盖 View 引用完整性 |
| **多数据源方言差异** | P2 扩展 ClickHouse/PostgreSQL 时，SQL 函数和分区语法不同 | P1 通过 `SQLDialect` 抽象隔离方言逻辑；扩展时仅需实现新 Dialect 子类，不改 Compiler 主逻辑 |

---

## 十二、前端设计

语义层前端嵌入现有平台侧边栏（与数据中心、查询中心同级），提供 **Cube 管理、关系画布、开发者工具** 三大功能入口。其中**开发者工具**统一整合查询 Playground、Schema 同步、YAML 编辑器、编译调试器四个 Tab。设计严格遵循 Web Interface Guidelines 规范，确保无障碍性、URL 状态同步、键盘可达、暗色模式适配。

### 12.1 设计理念与设计系统

#### 12.1.1 设计方向

采用 **"Precision Data"** 美学方向——精确、克制、数据密集型，参考 Linear / Vercel Dashboard / dbt Cloud 的工具设计语言：

- **信息密度优先**：数据工程师需要一屏尽览尽可能多的信息，而非大量留白
- **层次分明**：通过色彩浓度、字重、间距建立清晰的视觉层级
- **代码友好**：YAML / SQL / JSON 展示区使用等宽字体，配合语法高亮

#### 12.1.2 扩展 Design Tokens

在现有 `index.css` 的 CSS 变量体系上，新增语义中心专用 tokens：

```css
/* index.css 追加 */
:root {
  /* 语义中心：Cube 类型色 */
  --semantic-fact: 239 84% 67%;        /* indigo-500 - 事实表 */
  --semantic-fact-bg: 239 84% 96%;     /* indigo-50 */
  --semantic-dim: 160 84% 39%;         /* teal-600 - 维度表 */
  --semantic-dim-bg: 166 76% 95%;      /* teal-50 */
  /* 语义中心：状态色 */
  --semantic-ok: 142 76% 36%;          /* green-600 */
  --semantic-warn: 38 92% 50%;         /* amber-500 */
  --semantic-error: 0 84% 60%;         /* red-500 */
  /* 等宽字体 */
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
.dark {
  --semantic-fact: 224 76% 48%;
  --semantic-fact-bg: 224 47% 11%;
  --semantic-dim: 166 72% 40%;
  --semantic-dim-bg: 166 40% 10%;
}
```

#### 12.1.3 字体规范

| 场景 | 字体 | 备注 |
|------|------|------|
| 正文 / 标签 | 继承平台 `Inter` 系统字体栈 | 保持一致 |
| 代码 / SQL / YAML / DSL | `var(--font-mono)` | 需 preload JetBrains Mono |
| 数字列 / 统计值 | 继承正文 + `font-variant-numeric: tabular-nums` | 数字等宽对齐 |

```html
<!-- index.html 追加 preload -->
<link rel="preload" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" as="style" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" />
```

#### 12.1.4 排版细节（Typography Rules）

全局遵守以下规则，所有语义中心组件适用：

| 规则 | 说明 |
|------|------|
| 省略号 | 使用 `…`（U+2026），不用 `...` |
| 加载文案 | 统一 `"编译中…"` / `"执行中…"` / `"检测中…"` 结尾带 `…` |
| 数字列 | `font-variant-numeric: tabular-nums` |
| 标题防孤行 | 标题元素加 `text-wrap: balance` |
| 长文本截断 | 表格列 / 卡片标题使用 Tailwind `truncate`，Flex 子元素加 `min-w-0` |
| 引号 | 中文用直角引号「」，英文用弯引号 "" |
| 非断空格 | 数值+单位之间用 `&nbsp;`，如 `14&nbsp;个维度` |

### 12.2 全局规范

#### 12.2.1 URL 状态同步（Navigation & State）

所有有状态 UI 必须同步到 URL query params，支持 Cmd/Ctrl+Click、浏览器前进/后退、书签分享。使用 `nuqs`（或自行封装 `useSearchParams`）实现双向绑定：

| 页面 | URL 参数 | 示例 |
|------|----------|------|
| CubeList | `?q=answer&type=fact&sort=name` | 搜索 + 类型筛选 + 排序 |
| CubeDetail | `?tab=dimensions` | 当前 Tab |
| DevTools | `?tab=playground&cube=answer_records` | Tab + Playground 选中的 Cube/View |
| DevTools | `?tab=sync&status=warning` | Tab + Schema 同步状态筛选 |
| DevTools | `?tab=editor&file=answer_records` | Tab + 编辑器当前文件 |
| DevTools | `?tab=compiler` | Tab |

**实现模式**：

```tsx
// hooks/useUrlState.ts — 通用 URL 状态 Hook
import { useSearchParams } from 'react-router-dom'

export function useUrlState<T extends string>(key: string, defaultValue: T) {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) as T) || defaultValue
  const setValue = (v: T) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      v === defaultValue ? next.delete(key) : next.set(key, v)
      return next
    }, { replace: true })
  }
  return [value, setValue] as const
}
```

#### 12.2.2 无障碍（Accessibility）

| 规则 | 实施 |
|------|------|
| 语义 HTML | 页面标题用 `<h1>`（页面名）→ `<h2>`（区块）→ `<h3>`（子区块），严格层级 |
| Skip Link | `AppLayout` 主内容区前添加 `<a href="#main-content" className="sr-only focus:not-sr-only">跳转到主内容</a>` |
| Icon Button | 所有纯图标按钮必须 `aria-label`，如 `<Button aria-label="自动布局">` |
| 装饰性图标 | 卡片前的类型图标（事实表/维度表）加 `aria-hidden="true"` |
| 表单控件 | 所有 `<input>` / `<select>` 必须关联 `<label>`（`htmlFor` 或 wrapping） |
| 异步反馈 | Toast 通知使用 `aria-live="polite"`（已有 shadcn Toaster 支持） |
| Focus Ring | 所有交互元素使用 `focus-visible:ring-2 focus-visible:ring-ring`，禁止裸 `outline-none` |
| 画布键盘 | RelationCanvas 支持 Tab 遍历节点、Enter 打开详情、方向键平移视口 |

#### 12.2.3 暗色模式（Dark Mode）

现有平台 `index.css` 已定义 `.dark` 变量集、`tailwind.config.js` 配置 `darkMode: ["class"]`。语义中心所有组件：

- 使用 Tailwind `dark:` 前缀适配暗色，不硬编码颜色值
- Monaco Editor 根据 `document.documentElement.classList.contains('dark')` 切换 `vs-dark` / `vs` 主题
- React Flow 画布背景 / 节点 / 连线颜色通过 CSS 变量适配
- `<html>` 标签在暗色模式下设置 `color-scheme: dark`（修复原生 scrollbar、select 等控件在暗色下的表现）
- `<meta name="theme-color">` 随主题切换（亮色 `#ffffff`，暗色 `#0a0a0a`）：

```tsx
// hooks/useThemeColor.ts
useEffect(() => {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? '#0a0a0a' : '#ffffff')
}, [isDark])
```

#### 12.2.4 动画与运动（Animation）

| 规则 | 实施 |
|------|------|
| Reduced Motion | 所有动画外层包裹 `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }` |
| 合成属性优先 | 仅动画 `transform` / `opacity`，不动画 `width` / `height` / `margin` |
| 显式列出属性 | `transition-property: opacity, transform;`，禁止 `transition: all` |
| 可中断 | CSS transition 天然可中断；JS 动画（如 React Flow 平移）响应用户输入立即停止 |

入场动画统一使用现有 `animate-fade-in`（0.3s ease-out），复杂列表使用 staggered delay：

```tsx
// 卡片列表交错入场
{cubes.map((cube, i) => (
  <CubeCard
    key={cube.name}
    style={{ animationDelay: `${i * 50}ms` }}
    className="animate-fade-in opacity-0 fill-mode-forwards"
  />
))}
```

#### 12.2.5 性能（Performance）

| 场景 | 策略 |
|------|------|
| Cube 列表（< 50 项） | 正常渲染，无需虚拟化 |
| 维度/指标表格（> 50 行） | 使用 `virtua` 或 `content-visibility: auto` 虚拟化 |
| DevTools Playground 结果表格 | 大量行时使用虚拟化 `<VirtualizedTable>` |
| DevTools YAML 编辑器 | Monaco Editor 懒加载（`@monaco-editor/react` 已支持），仅在 Tab 激活时渲染 |
| 关系画布 | React Flow 自带虚拟化节点渲染 |
| 页面懒加载 | 所有语义中心页面通过 `React.lazy()` + `Suspense` 加载（与现有模式一致） |
| 资源预连接 | `<link rel="preconnect" href="https://fonts.googleapis.com" />` |

#### 12.2.6 表单与输入（Forms）

| 规则 | 实施 |
|------|------|
| `autocomplete` | 搜索框 `autocomplete="off"`，过滤器 `autocomplete="off"` |
| Placeholder | 以 `…` 结尾，如 `"搜索 Cube 名称…"` |
| 不阻止粘贴 | 所有 input 不绑定 `onPaste + preventDefault` |
| 提交按钮状态 | 默认可用 → 请求中 spinner + disabled → 成功/失败 Toast |
| 错误定位 | 表单校验失败时 `focus()` 到第一个错误字段，内联红色错误提示 |
| 未保存警告 | YAML 编辑器有未保存修改时，`beforeunload` 事件 + React Router `useBlocker` 拦截导航 |

#### 12.2.7 破坏性操作（Destructive Actions）

所有破坏性操作必须二次确认，使用 shadcn `AlertDialog`：

| 操作 | 确认方式 |
|------|----------|
| 删除 Cube | AlertDialog：标题 `"确认删除"` + 描述影响 + 输入 Cube name 确认 |
| 忽略漂移 | AlertDialog：描述漂移字段 + 确认按钮 `"确认忽略"` |
| 覆盖 YAML | 编辑器中 "保存" 前展示 diff 对比 |
| 触发全量同步 | 二次确认 `"将检测所有 Cube 的物理表变更"` |

#### 12.2.8 空状态设计（Empty States）

每个列表/表格都需设计空状态，不渲染残缺 UI：

| 场景 | 空状态设计 |
|------|-----------|
| Cube 列表为空 | 居中插图 + 文案 `"还没有 Cube 定义"` + `"新建第一个 Cube"` 按钮 |
| 维度/指标 Tab 无数据 | 表格区域灰色文案 `"该 Cube 暂无维度定义"` |
| Playground 初始状态 | 右侧面板居中提示 `"选择 Cube / View 和指标，点击运行查看结果"` |
| 同步面板无漂移 | 全部绿勾 + `"所有 Cube 与物理表完全同步"` |
| 查询结果 0 行 | 表格区域 `"查询返回 0 行数据"` + 建议检查过滤条件 |
| YAML 编辑器无选中 | 居中提示 `"从左侧文件树选择一个 Cube 或 View"` |
| 编译调试器初始状态 | 右侧居中提示 `"输入 DSL JSON 并点击编译"` |

#### 12.2.9 Hover 与交互反馈

- 所有按钮/链接必须有 `hover:` 状态（亮度变化或背景色）
- Hover / Active / Focus 状态对比度递增：`rest → hover(+对比) → active(+对比) → focus(ring)`
- 卡片 hover 使用 `hover:shadow-md hover:border-primary/20 transition-shadow`
- 表格行 hover 使用 `hover:bg-muted/50`

#### 12.2.10 触摸与滚动（Touch & Scroll）

| 规则 | 实施 |
|------|------|
| Modal/Sheet 滚动隔离 | AlertDialog / Sheet 内容区加 `overscroll-behavior: contain` |
| 触摸延迟消除 | 全局 `touch-action: manipulation`（避免双击缩放延迟） |
| 高亮色控制 | 全局 `-webkit-tap-highlight-color: transparent`（已在 index.css 中配置） |

#### 12.2.11 错误消息规范

所有用户可见的错误消息遵循统一格式：**描述问题 + 给出修复建议/下一步**。

| 场景 | 示例 |
|------|------|
| 编译失败 | `"字段 student_id 不存在于 Cube answer_records 中。请检查维度名称拼写。"` |
| 查询超时 | `"查询执行超时（>120s）。建议缩小时间范围或减少 JOIN 数量。"` |
| YAML 校验失败 | `"dimensions.user_name 缺少必填字段 sql。请补充 SQL 表达式。"` |
| 删除被引用 Cube | `"无法删除 student：被 answer_records、study_sessions 关联引用。请先移除相关 JOIN。"` |

### 12.3 导航与路由

#### 12.3.1 侧边栏菜单扩展

在 `AppLayout.tsx` 的 `menuItems` 中新增"语义中心"菜单组：

```tsx
// AppLayout.tsx menuItems 追加
{
  key: 'semantic-center',
  icon: Hexagon,    // lucide-react
  label: '语义中心',
  color: 'teal',
  children: [
    { path: '/semantic/cubes', icon: Box, label: 'Cube 管理' },
    { path: '/semantic/canvas', icon: GitBranch, label: '关系画布' },
    { path: '/semantic/devtools', icon: Wrench, label: '开发者工具' },
  ]
}
```

#### 12.3.2 路由注册

```tsx
// App.tsx 新增（lazy 加载）
const CubeList = lazy(() => import('./pages/Semantic/CubeList'))
const CubeDetail = lazy(() => import('./pages/Semantic/CubeDetail'))
const RelationCanvas = lazy(() => import('./pages/Semantic/RelationCanvas'))
const DevTools = lazy(() => import('./pages/Semantic/DevTools'))

// Routes 内
<Route path="semantic">
  <Route index element={<Navigate to="cubes" replace />} />
  <Route path="cubes" element={<CubeList />} />
  <Route path="cubes/:name" element={<CubeDetail />} />
  <Route path="canvas" element={<RelationCanvas />} />
  <Route path="devtools" element={<DevTools />} />
</Route>
```

所有路由使用 `<Link>` / `<NavLink>` 做导航（支持 Cmd+Click 新标签打开），不使用 `onClick` + `navigate()` 替代链接。

### 12.4 Cube 管理页（/semantic/cubes）

#### 12.4.1 页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│ <h1> Cube 管理                                                   │
│ <p> 管理语义层所有 Cube 定义，维护维度、指标与关联关系              │
├─────────────────────────────────────────────────────────────────┤
│ 工具栏                                                           │
│ ┌─────────────────────┐  ┌─────────┐ ┌─────────┐  [+ 新建 Cube]│
│ │ 🔍 搜索 Cube 名称…    │  │ 类型 ▾  │ │ 状态 ▾  │              │
│ └─────────────────────┘  └─────────┘ └─────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4            │
│                                                                  │
│ ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐│
│ │ ■ 答题记录         │  │ ● 学生            │  │ ● 学校           ││
│ │ answer_records    │  │ student          │  │ school          ││
│ │                   │  │                  │  │                 ││
│ │ 14 维度 · 6 指标  │  │ 12 维度 · 2 指标 │  │ 10 维度 · 2 指标││
│ │ 5 关联            │  │ 1 关联           │  │ 0 关联          ││
│ │                   │  │                  │  │                 ││
│ │ ✓ 同步正常         │  │ ✓ 同步正常        │  │ ⚠ 1 个漂移      ││
│ └──────────────────┘  └──────────────────┘  └─────────────────┘│
│                                                                  │
│ ┌──────────────────┐  ┌──────────────────┐  ...                 │
│ │ ■ 学习会话         │  │ ■ 课程进度         │                     │
│ │ study_sessions    │  │ lesson_progress   │                     │
│ └──────────────────┘  └──────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.4.2 CubeCard 组件规格

```tsx
// components/Semantic/CubeCard.tsx 关键实现
interface CubeCardProps {
  cube: CubeSummary
  style?: React.CSSProperties  // 用于 staggered animation-delay
}

export function CubeCard({ cube, style }: CubeCardProps) {
  const isFact = cube.type === 'fact'
  return (
    <Link
      to={`/semantic/cubes/${cube.name}`}
      className={cn(
        'group block rounded-xl border p-5 transition-all',
        'hover:shadow-md hover:border-primary/20',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'animate-fade-in opacity-0 fill-mode-forwards',
      )}
      style={style}
    >
      {/* 类型标识 + 标题 */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            isFact
              ? 'bg-[hsl(var(--semantic-fact-bg))] text-[hsl(var(--semantic-fact))]'
              : 'bg-[hsl(var(--semantic-dim-bg))] text-[hsl(var(--semantic-dim))]',
          )}
          aria-hidden="true"
        >
          {isFact ? <BarChart3 className="w-4 h-4" /> : <Box className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate text-wrap-balance">
            {cube.title}
          </h3>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {cube.name}
          </p>
        </div>
      </div>

      {/* 统计数据 — tabular-nums */}
      <div className="flex gap-4 text-xs text-muted-foreground mb-3"
           style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span>{fmtNumber(cube.dimensions)}&nbsp;维度</span>
        <span>{fmtNumber(cube.measures)}&nbsp;指标</span>
        <span>{fmtNumber(cube.joins)}&nbsp;关联</span>
      </div>

      {/* 同步状态 */}
      <SyncStatusBadge status={cube.syncStatus} />
    </Link>
  )
}
```

**设计要点**：
- 整张卡片是 `<Link>`，支持 Cmd+Click 新标签打开
- Focus ring 通过 `focus-visible:ring-2` 实现
- 类型图标 `aria-hidden="true"`（装饰性）
- 数字列 `tabular-nums`
- 文字截断 `truncate` + 父级 `min-w-0`

#### 12.4.3 空状态

当 Cube 列表为空时（新项目初始化后）：

```tsx
<div className="flex flex-col items-center justify-center py-20 text-center">
  <Hexagon className="w-12 h-12 text-muted-foreground/30 mb-4" aria-hidden="true" />
  <h2 className="text-lg font-semibold mb-1">还没有 Cube 定义</h2>
  <p className="text-sm text-muted-foreground mb-6 max-w-sm">
    Cube 是语义层的核心单元，围绕一张表定义维度、指标和关联关系。
  </p>
  <Button asChild>
    <Link to="/semantic/cubes/new">新建第一个 Cube</Link>
  </Button>
</div>
```

### 12.5 Cube 详情页（/semantic/cubes/:name）

#### 12.5.1 页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│ ← 返回列表    <h1> 学生答题记录                [编辑 YAML] [删除]│
│ <p> answer_records · dwd_study_first_answer_records_snap_di     │
├─────────────────────────────────────────────────────────────────┤
│ 元信息摘要栏                                                     │
│ ┌───────────┐ ┌───────────────────┐ ┌────────────────────────┐ │
│ │ 分区字段    │ │ 默认过滤           │ │ 同步状态                │ │
│ │ answer_date│ │ answer_result ∈   │ │ ✓ 正常                  │ │
│ │ yyyyMMdd   │ │ {1, 2}           │ │ 上次检测: 02/28 06:00   │ │
│ └───────────┘ └───────────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Tabs: [维度] [指标] [分段] [关联] [YAML]      ?tab=dimensions   │
│─────────────────────────────────────────────────────────────────│
│                                                                  │
│  <Table> 维度列表 (14)                                           │
│  ┌──────────────┬────────┬────────┬──────────┬───────────────┐  │
│  │ 字段          │ 标题    │ 类型    │ 键       │ 枚举           │  │
│  ├──────────────┼────────┼────────┼──────────┼───────────────┤  │
│  │ answer_re…   │ 记录ID  │ string │ PK       │               │  │
│  │ student_id   │ 学生ID  │ string │ FK→student│              │  │
│  │ answer_result│ 答题结果 │ number │          │ Popover: 6 值 │  │
│  │ subject_name │ 学科    │ string │          │               │  │
│  │ …            │ …      │ …      │ …        │ …             │  │
│  └──────────────┴────────┴────────┴──────────┴───────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.5.2 Tab 同步到 URL

当前 Tab 通过 `?tab=dimensions` 同步到 URL，支持直接链接到特定 Tab：

```tsx
const [tab, setTab] = useUrlState('tab', 'dimensions')

<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="dimensions">维度</TabsTrigger>
    <TabsTrigger value="measures">指标</TabsTrigger>
    <TabsTrigger value="segments">分段</TabsTrigger>
    <TabsTrigger value="joins">关联</TabsTrigger>
    <TabsTrigger value="yaml">YAML</TabsTrigger>
  </TabsList>
  {/* TabsContent ... */}
</Tabs>
```

#### 12.5.3 枚举值 Popover

点击枚举 Badge 弹出 `Popover`，展示完整枚举映射：

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="ghost" size="sm" className="text-xs gap-1"
            aria-label={`查看${dim.title}枚举值`}>
      <Tag className="w-3 h-3" aria-hidden="true" />
      {dim.enumCount}&nbsp;个值
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-64">
    <h4 className="font-semibold text-sm mb-2">{dim.title} 枚举</h4>
    {dim.enumSource && (
      <p className="text-xs text-muted-foreground mb-2">
        来源：字典表自动同步 ({dim.enumSource.dict_type})
      </p>
    )}
    <div className="space-y-1 text-xs font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {Object.entries(dim.enum).map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span className="text-muted-foreground">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  </PopoverContent>
</Popover>
```

#### 12.5.4 YAML 编辑器 Tab

```tsx
// components/Semantic/CubeYamlEditor.tsx 关键实现
import Editor from '@monaco-editor/react'

export function CubeYamlEditor({ cubeName, initialYaml, onSave }: Props) {
  const [value, setValue] = useState(initialYaml)
  const [dirty, setDirty] = useState(false)
  const isDark = document.documentElement.classList.contains('dark')

  // 未保存变更拦截导航
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          直接编辑 YAML 定义，保存前将自动校验 Schema 合法性。
          {dirty && <span className="text-amber-500 ml-2">● 有未保存修改</span>}
        </p>
        <Button
          onClick={() => handleSave(value)}
          disabled={!dirty || saving}
          aria-label="保存 YAML 修改"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : null}
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Editor
          height="60vh"
          language="yaml"
          theme={isDark ? 'vs-dark' : 'vs'}
          value={value}
          onChange={(v) => { setValue(v ?? ''); setDirty(v !== initialYaml) }}
          options={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>

      {/* 路由拦截弹窗 */}
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              离开页面将丢失 YAML 编辑内容，确认离开？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              继续编辑
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

#### 12.5.5 删除 Cube 确认

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive" size="sm" aria-label={`删除 Cube ${cubeName}`}>
      <Trash2 className="w-4 h-4 mr-1" aria-hidden="true" /> 删除
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除 Cube</AlertDialogTitle>
      <AlertDialogDescription>
        删除 <code className="font-mono">{cubeName}</code> 将移除所有维度、指标和关联定义，此操作不可撤销。
        请输入 Cube 名称确认：
      </AlertDialogDescription>
    </AlertDialogHeader>
    <Input
      placeholder={cubeName}
      value={confirmName}
      onChange={(e) => setConfirmName(e.target.value)}
      spellCheck={false}
      autoComplete="off"
    />
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        disabled={confirmName !== cubeName || deleting}
        onClick={handleDelete}
      >
        {deleting ? '删除中…' : '确认删除'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 12.6 关系画布（/semantic/canvas）

#### 12.6.1 页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│ <h1> 关系画布                                                    │
│ 工具栏: [自动布局] [适应窗口] [导出 PNG] [全屏]                    │
├────────────────────────────────────────────────────┬────────────┤
│                                                    │ 右侧面板    │
│            React Flow 画布区域                      │ (选中节点/  │
│                                                    │  连线时展开) │
│     ┌──────────┐     N:1     ┌──────────┐         │            │
│     │  student  │◄──────────│ answer_   │         │ Cube 摘要   │
│     │  学生     │            │ records  │         │ 类型: 事实表 │
│     │ 12D · 2M │            │ 14D · 6M │         │ 维度: 14    │
│     └─────┬────┘            └────┬─────┘         │ 指标: 6     │
│           │ N:1                  │ N:1            │             │
│           ▼                      ▼                │ [查看详情 →] │
│     ┌──────────┐          ┌──────────┐           │             │
│     │  school   │          │ question  │           │             │
│     │  学校     │          │  题目     │           │             │
│     └──────────┘          └──────────┘           │             │
│                                                    │             │
│  minimap (右下角)                                   │             │
│  ┌──────────┐                                      │             │
│  │  ·  ·  · │                                      │             │
│  └──────────┘                                      │             │
│                                                    │             │
├────────────────────────────────────────────────────┴────────────┤
│ 底部状态栏: 14 个 Cube · 18 个关联 · 缩放 100%                    │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.6.2 技术选型

| 库 | 版本 | 用途 |
|----|------|------|
| `@xyflow/react` | ^12 | 画布基础，节点/连线渲染，缩放平移，MiniMap |
| `elkjs` | ^0.9 | ELK 层次布局算法（比 dagre 更适合 ER 图的分层排列） |

#### 12.6.3 CubeNode 自定义节点

```tsx
// components/Semantic/CubeNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface CubeNodeData {
  name: string
  title: string
  type: 'fact' | 'dimension'
  dimensions: number
  measures: number
}

export function CubeNode({ data, selected }: NodeProps<CubeNodeData>) {
  const isFact = data.type === 'fact'
  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-48',
        selected && 'ring-2 ring-ring',
        isFact ? 'border-[hsl(var(--semantic-fact))]' : 'border-[hsl(var(--semantic-dim))]',
      )}
      role="button"
      tabIndex={0}
      aria-label={`Cube: ${data.title} (${data.name}), ${data.dimensions} 维度, ${data.measures} 指标`}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'w-6 h-6 rounded-md flex items-center justify-center text-xs',
            isFact
              ? 'bg-[hsl(var(--semantic-fact-bg))] text-[hsl(var(--semantic-fact))]'
              : 'bg-[hsl(var(--semantic-dim-bg))] text-[hsl(var(--semantic-dim))]',
          )}
          aria-hidden="true"
        >
          {isFact ? '■' : '●'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{data.title}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{data.name}</p>
        </div>
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground"
           style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span>{data.dimensions}D</span>
        <span>{data.measures}M</span>
      </div>
    </div>
  )
}
```

#### 12.6.4 JoinEdge 自定义连线

连线上标注关系类型（N:1 / 1:1）和 JOIN 类型标签：

```tsx
// components/Semantic/JoinEdge.tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export function JoinEdge({ sourceX, sourceY, targetX, targetY, data, ...rest }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      <BaseEdge path={edgePath} {...rest} className="!stroke-border" />
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-auto rounded-md bg-card border px-1.5 py-0.5
                     text-[10px] font-mono text-muted-foreground shadow-sm
                     hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          role="button"
          tabIndex={0}
          aria-label={`关联: ${data.relationship}, ${data.join_type}`}
        >
          {data.relationship}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
```

#### 12.6.5 键盘导航

画布支持以下键盘操作（React Flow 内置 + 自定义）：

| 按键 | 行为 |
|------|------|
| `Tab` / `Shift+Tab` | 遍历画布中的节点 |
| `Enter` / `Space` | 选中节点，打开右侧面板 |
| `Escape` | 关闭右侧面板，取消选中 |
| `Arrow Keys` | 平移画布视口 |
| `+` / `-` | 缩放画布 |
| `0` | 重置缩放到适应窗口 |

#### 12.6.6 右侧详情面板

选中节点或连线时滑出（`Sheet` from right）：

```tsx
<Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
  <SheetContent className="w-80" aria-label="Cube 详情面板">
    <SheetHeader>
      <SheetTitle>{selectedCube.title}</SheetTitle>
    </SheetHeader>
    <div className="space-y-4 py-4">
      <div className="text-sm">
        <span className="text-muted-foreground">物理表：</span>
        <code className="font-mono text-xs">{selectedCube.table}</code>
      </div>
      {/* 维度/指标摘要 */}
      <div className="grid grid-cols-2 gap-2 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-2xl font-bold">{selectedCube.dimensions}</div>
          <div className="text-xs text-muted-foreground">维度</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-2xl font-bold">{selectedCube.measures}</div>
          <div className="text-xs text-muted-foreground">指标</div>
        </div>
      </div>
      <Button variant="outline" asChild className="w-full">
        <Link to={`/semantic/cubes/${selectedCube.name}`}>
          查看详情 <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  </SheetContent>
</Sheet>
```

### 12.7 开发者工具（/semantic/devtools）

将查询 Playground、Schema 同步、YAML 编辑器、编译调试器统一为 **DevTools** 页面，通过 Tab 切换，Tab 状态同步到 URL `?tab=` 参数。

#### 12.7.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ <h1> 开发者工具                                                   │
│ <p> 语义层开发、调试与运维工具集                                    │
├─────────────────────────────────────────────────────────────────┤
│ [Playground] [Schema 同步] [YAML 编辑器] [编译调试器]              │
│      ↑ active tab（URL: ?tab=playground）                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│           （Tab 内容区域，详见各 Tab 规格）                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
// pages/Semantic/DevTools.tsx
function DevTools() {
  const [tab, setTab] = useUrlState('tab', 'playground')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ textWrap: 'balance' }}>
          开发者工具
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          语义层开发、调试与运维工具集
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="playground">
            <Play className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Playground
          </TabsTrigger>
          <TabsTrigger value="sync">
            <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Schema 同步
          </TabsTrigger>
          <TabsTrigger value="editor">
            <FileCode className="w-4 h-4 mr-1.5" aria-hidden="true" />
            YAML 编辑器
          </TabsTrigger>
          <TabsTrigger value="compiler">
            <Bug className="w-4 h-4 mr-1.5" aria-hidden="true" />
            编译调试器
          </TabsTrigger>
        </TabsList>
        <TabsContent value="playground"><PlaygroundTab /></TabsContent>
        <TabsContent value="sync"><SchemaSyncTab /></TabsContent>
        <TabsContent value="editor"><YamlEditorTab /></TabsContent>
        <TabsContent value="compiler"><CompileDebugTab /></TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 12.7.2 Tab A: 查询 Playground（?tab=playground）

左右分栏布局（可拖拽调整宽度），左侧 DSL 构建器，右侧结果面板：

```
┌──────────────────────────┬──────────────────────────────────────┐
│ DSL 构建器                │ 编译 & 执行结果                        │
│                          │                                      │
│ <label>Cube / View</label>│ 工具栏:                               │
│ [Select: answer_records ▾]│ [编译] [运行 ▶]                       │
│  ┌─ Cubes ──────────┐   │ 状态: ✓ 已编译 | 预估 20~40s           │
│  │ answer_records    │   │                                      │
│  │ study_sessions    │   │ <h3>编译后 SQL</h3>                   │
│  ├─ Views ──────────┤   │ ┌──────────────────────────────────┐│
│  │ student_answer_…  │   │ │ SELECT                            ││
│  │ teaching_overview │   │ │   subject_name,                   ││
│  └──────────────────┘   │ │   COUNT(*) AS total_count, ...    ││
│                          │ │ FROM dwd_study_first_...          ││
│ <h3>指标</h3>             │ │ LEFT JOIN dim_ucenter_user_...    ││
│ ☑ total_count  答题总数   │ │ WHERE answer_date >= '20260221'   ││
│ ☑ accuracy     正确率     │ │ GROUP BY subject_name            ││
│ ☐ correct_count 正确数    │ │ LIMIT 1000                        ││
│                          │ └──────────────────────────────────┘│
│ <h3>维度</h3>             │                                      │
│ ☑ subject_name  学科      │ <h3>编译诊断</h3>                     │
│ ☐ student_name  学生姓名  │ ✓ 字段引用合法                        │
│                          │ ✓ 分区条件已注入                      │
│ <h3>时间范围</h3>          │ ✓ Fan-out 安全 (全部 N:1)            │
│ [answer_date ▾]          │ ✓ LIMIT 1000                       │
│ [2026-02-21]~[2026-02-27]│                                      │
│ <label>粒度</label>       │ <h3>查询结果</h3> (1.2s, 3 行)       │
│ [不分组 ▾]                │ ┌──────┬──────┬────────┐           │
│                          │ │ 学科  │ 总数  │ 正确率  │           │
│ <h3>过滤条件</h3>          │ ├──────┼──────┼────────┤           │
│ [+ 添加过滤]              │ │ 数学  │ 1,234│ 72.1%  │           │
│ student.user_name = 倪佳俊│ │ 英语  │  890 │ 68.5%  │           │
│                          │ │ 语文  │  567 │ 81.2%  │           │
│ <h3>DSL JSON</h3>         │ └──────┴──────┴────────┘           │
│ Monaco JSON Editor       │                                      │
└──────────────────────────┴──────────────────────────────────────┘
```

核心交互规格：

| 功能 | 说明 | 无障碍 |
|------|------|--------|
| Cube / View 选择 | `<Select>` 下拉，按 Cubes / Views 分组；选中 View 时自动展示其暴露字段 | `<label htmlFor="cube-select">` |
| 指标/维度勾选 | `<Checkbox>` + `<label>` 成对，勾选即更新 DSL JSON | 每个 Checkbox 关联 label |
| 过滤条件 | `+ 添加过滤` 按钮打开 `Popover`，选择字段 → 操作符 → 输入值 | 各控件带 label |
| 编译 | 点击"编译"调用 `/compile`，成功后右侧展示 SQL + 诊断 | 按钮状态：编译中… spinner |
| 执行 | 点击"运行"调用 `/query`，展示结果表格 | 按钮状态：执行中… spinner + disabled |
| DSL JSON 编辑 | Monaco JSON Editor，编辑后实时同步到可视化构建器 | 无障碍由 Monaco 内部处理 |
| 初始空状态 | 右侧面板居中 `"选择 Cube / View 和指标，点击运行查看结果"` | 文案指引 |

运行按钮状态机：

```
[空闲: "运行 ▶"]
  → 点击
[请求中: "执行中…" + spinner + disabled]
  → 成功
[结果展示 + Toast "查询完成，返回 N 行"]
  → 失败
[错误 Toast + 内联错误信息 + 按钮恢复可用]
```

结果表格使用现有 `DataTable` 组件，行数 > 100 时自动开启虚拟化。数字列统一 `tabular-nums`：

```tsx
<DataTable
  columns={resultColumns}
  data={queryResult.rows}
  emptyText="查询返回 0 行数据，请检查过滤条件"
  showPagination={queryResult.rows.length > 20}
/>
```

#### 12.7.3 Tab B: Schema 同步（?tab=sync）

```
┌─────────────────────────────────────────────────────────────────┐
│ 状态概览栏                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐   最后检测: 02/28 06:00 │
│ │ 12 正常   │ │ 1 警告    │ │ 1 错误    │   [立即检测]             │
│ │ ✓         │ │ ⚠        │ │ ✕        │                         │
│ └──────────┘ └──────────┘ └──────────┘                         │
├─────────────────────────────────────────────────────────────────┤
│ 筛选: [全部 ▾] [正常] [警告] [错误]           ?status=all        │
│                                                                  │
│ <Table>                                                          │
│ ┌──────────────┬─────────────────────────┬──────┬──────────────┐│
│ │ Cube          │ 物理表                   │ 状态  │ 操作          ││
│ ├──────────────┼─────────────────────────┼──────┼──────────────┤│
│ │ answer_records│ dwd_study_first_…       │ ✓ 正常│              ││
│ │ student       │ dim_ucenter_user_…      │ ✓ 正常│              ││
│ │ school        │ dim_ucenter_org_…       │ ⚠ 警告│ [展开]        ││
│ │ kt_recommend  │ dwd_kt_rec_…           │ ✕ 错误│ [展开]        ││
│ └──────────────┴─────────────────────────┴──────┴──────────────┘│
│                                                                  │
│ 展开漂移详情 (Accordion):                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⚠ school — 物理表新增 2 个字段                                │ │
│ │ + school_contact_phone (STRING)  + school_logo (STRING)     │ │
│ │ [添加到 YAML]  [在编辑器中打开]  [忽略漂移]                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

"立即检测" 按钮状态：

```tsx
<Button
  onClick={handleCheck}
  disabled={checking}
  aria-label="立即执行 Schema 漂移检测"
>
  {checking ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
      检测中…
    </>
  ) : (
    <>
      <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
      立即检测
    </>
  )}
</Button>
```

"忽略漂移" 二次确认：

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="sm">忽略漂移</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认忽略漂移</AlertDialogTitle>
      <AlertDialogDescription>
        忽略后该漂移将不再告警，直到下次物理表变更触发新的漂移检测。确认忽略 <code>{cubeName}</code> 的漂移？
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={() => resolveDrift('ignore')}>
        确认忽略
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Schema 同步面板中的"在编辑器中打开"按钮可直接跳转到 `?tab=editor&cube={name}`，联动 YAML 编辑器 Tab。

空状态（全部同步正常）：

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <CheckCircle2 className="w-12 h-12 text-[hsl(var(--semantic-ok))]/50 mb-4" aria-hidden="true" />
  <h2 className="text-lg font-semibold mb-1">所有 Cube 与物理表完全同步</h2>
  <p className="text-sm text-muted-foreground">
    上次检测时间：{fmtDate(lastChecked)}，共 {fmtNumber(totalCubes)} 个 Cube 全部通过。
  </p>
</div>
```

#### 12.7.4 Tab C: YAML 编辑器（?tab=editor）

左侧文件树 + 右侧 Monaco YAML 编辑器的 IDE 风格布局：

```
┌──────────────┬──────────────────────────────────────────────────┐
│ 文件树        │ Monaco YAML Editor                               │
│              │ ┌──────────────────────────────────────────────┐ │
│ ▾ Cubes (14) │ │ name: answer_records                         │ │
│   student    │ │ title: 学生答题记录                            │ │
│   school     │ │ table: dwd_study_first_answer_records_...     │ │
│ ▸ answer_…*  │ │ ...                                          │ │
│   ...        │ │                                               │ │
│              │ └──────────────────────────────────────────────┘ │
│ ▾ Views (2)  │                                                  │
│   student_…  │ 工具栏:                                          │
│   teaching_… │ [保存 ⌘S] [校验] [Diff 预览] [格式化]           │
│              │ 状态: ● 未保存修改                                │
│ ─────────── │                                                  │
│ [+ Cube]     │ 校验结果:                                        │
│ [+ View]     │ ✓ YAML 语法正确                                  │
│              │ ✓ 字段引用合法                                    │
│              │ ⚠ school_logo 未定义枚举（可选）                   │
└──────────────┴──────────────────────────────────────────────────┘
```

| 功能 | 说明 | 无障碍 |
|------|------|--------|
| 文件树 | 列出 `cubes/` 和 `views/` 下所有 `.yml` 文件，按类型分组 | 树结构使用 `role="tree"` + `role="treeitem"` |
| 选中文件 | 点击文件名加载到右侧编辑器，URL 更新 `?tab=editor&file=answer_records` | focus 管理 |
| 未保存标记 | 文件名后显示 `*` 标记，工具栏显示 "● 未保存修改" | 颜色+文字双重提示 |
| 保存 | `Cmd/Ctrl+S` 快捷键 + 工具栏按钮，调用 `PUT /api/v1/semantic/cubes/:name` | 按钮状态：保存中… |
| 校验 | 调用后端校验 API，内联显示错误/警告 | 错误信息 `role="alert"` |
| Diff 预览 | 保存前弹出 Monaco DiffEditor 显示变更对比 | 对话框 focus trap |
| 新建 | `+ Cube` / `+ View` 按钮，弹出对话框填写名称后创建空模板 | 对话框 focus trap |
| 未保存拦截 | 切换文件或离开页面时，`useBlocker` + `beforeunload` 拦截 | 确认对话框 |

#### 12.7.5 Tab D: 编译调试器（?tab=compiler）

输入 DSL JSON，逐步展示 Compiler 10 步流水线的中间结果：

```
┌──────────────────────────┬──────────────────────────────────────┐
│ DSL 输入 (Monaco JSON)    │ 编译步骤 (Stepper)                    │
│                          │                                      │
│ {                        │ Step 0: View 解析         — 跳过     │
│   "cube": "answer_…",   │   （直接引用 Cube，非 View）            │
│   "measures": [          │                                      │
│     "answer_records.…"   │ Step 1: DSL 解析          ✓ 通过     │
│   ],                     │   → 1 measure, 1 dimension           │
│   "dimensions": [        │                                      │
│     "answer_records.…"   │ Step 2: Cube 解析         ✓ 通过     │
│   ],                     │   → answer_records (事实表)            │
│   "time_dimensions": [{  │                                      │
│     "dimension": "…",    │ Step 3: JOIN 路径推导     ✓ 通过     │
│     "granularity": "day",│   → answer_records -N:1-> student     │
│     "date_range": […]    │   路径可视化:                          │
│   }]                     │   ┌────────────┐    ┌────────┐       │
│ }                        │   │answer_rec… │───>│student │       │
│                          │   └────────────┘N:1 └────────┘       │
│ [编译] [重置]             │                                      │
│                          │ Step 4: Fan-out 检测     ✓ 安全     │
│                          │   → 全部 N:1, 无扇出风险              │
│                          │                                      │
│                          │ Step 5: SELECT 构建      ✓           │
│                          │   → [展开查看 SELECT 表达式]           │
│                          │                                      │
│                          │ Step 6: 分区注入          ✓ 已注入   │
│                          │   → answer_date >= '20260221'         │
│                          │                                      │
│                          │ Step 7: Default Filter   ✓ 已注入   │
│                          │   → user_is_test != 1                 │
│                          │                                      │
│                          │ Step 8: Time Granularity  ✓ day     │
│                          │   → SUBSTR(answer_date, 1, 8)        │
│                          │                                      │
│                          │ Step 9: SQL 生成 + 安全校验  ✓       │
│                          │   [展开查看完整 SQL]                   │
│                          │   LIMIT 1000 ✓                       │
└──────────────────────────┴──────────────────────────────────────┘
```

| 功能 | 说明 | 无障碍 |
|------|------|--------|
| DSL 输入 | Monaco JSON Editor，支持语法高亮和自动补全 | Monaco 内置无障碍 |
| 编译 | 调用 `POST /api/v1/semantic/compile/debug`，返回每步中间结果 | 按钮状态：编译中… |
| 步骤展示 | 使用 Stepper/Accordion 展示每步结果，支持展开/折叠 | `role="list"` + `aria-expanded` |
| JOIN 路径可视化 | 步骤 3 内嵌 mini 关系图（简化版 React Flow 或 SVG） | 图形 `aria-label` 描述路径 |
| 错误高亮 | 编译失败时，失败步骤标红 + 错误信息内联 | 错误信息 `role="alert"` |
| 重置 | 清空输入和结果 | — |

### 12.8 Loading 骨架屏

所有页面在数据加载期间展示骨架屏（Skeleton），而非白屏或全屏 Spinner：

```tsx
// CubeList 骨架
function CubeListSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// 使用
const { data, isLoading } = useQuery({ queryKey: ['cubes'], queryFn: fetchCubes })
if (isLoading) return <CubeListSkeleton />
```

### 12.9 后端 API 设计

前端所需的 API 端点，注册在 `/api/v1/semantic/` 下：

| 方法 | 路径 | 说明 |
|------|------|------|
| **Cube** | | |
| GET | `/api/v1/semantic/cubes` | Cube + View 列表（摘要，`?kind=all\|cube\|view`） |
| GET | `/api/v1/semantic/cubes/:name` | Cube 详情（完整定义，含解析后的 enum） |
| PUT | `/api/v1/semantic/cubes/:name` | 更新 Cube YAML（在线编辑） |
| POST | `/api/v1/semantic/cubes` | 新建 Cube |
| DELETE | `/api/v1/semantic/cubes/:name` | 删除 Cube |
| **View** | | |
| GET | `/api/v1/semantic/views` | View 列表 |
| GET | `/api/v1/semantic/views/:name` | View 详情（展开后的字段列表 + 引用 Cube 链路） |
| PUT | `/api/v1/semantic/views/:name` | 更新 View YAML |
| POST | `/api/v1/semantic/views` | 新建 View |
| DELETE | `/api/v1/semantic/views/:name` | 删除 View |
| POST | `/api/v1/semantic/views/:name/materialize` | 将 View 物化为虚拟数据集 |
| **关系图** | | |
| GET | `/api/v1/semantic/graph` | 关系图数据（nodes + edges，含 View 节点） |
| **编译 & 查询** | | |
| POST | `/api/v1/semantic/compile` | 编译 DSL → SQL（不执行，返回 SQL + 诊断） |
| POST | `/api/v1/semantic/compile/debug` | 逐步编译调试（返回每步中间结果） |
| POST | `/api/v1/semantic/query` | 编译 + 执行，返回结果 |
| **Schema 同步** | | |
| GET | `/api/v1/semantic/sync/status` | 同步状态总览 |
| POST | `/api/v1/semantic/sync/check` | 触发立即检测 |
| GET | `/api/v1/semantic/sync/drift` | 漂移详情列表 |
| POST | `/api/v1/semantic/sync/drift/:cube/resolve` | 处理漂移（添加/忽略） |
| **文件管理** | | |
| GET | `/api/v1/semantic/files` | 列出所有 Cube/View YAML 文件（文件树） |
| GET | `/api/v1/semantic/files/:type/:name` | 读取 YAML 文件原始内容 |
| POST | `/api/v1/semantic/files/:type/:name/validate` | 校验 YAML 内容合法性 |

**关键响应示例**：

```json
// GET /api/v1/semantic/cubes — kind=all 时返回 Cubes + Views
{
  "items": [
    {
      "name": "answer_records",
      "kind": "cube",
      "title": "学生答题记录",
      "type": "fact",
      "table": "dwd_study_first_answer_records_snap_di",
      "dimensions": 14,
      "measures": 6,
      "joins": 5,
      "sync_status": "ok",
      "updated_at": "2026-02-28T10:30:00Z"
    },
    {
      "name": "student_answer_analysis",
      "kind": "view",
      "title": "学生答题分析视图",
      "root_cube": "answer_records",
      "exposed_fields": 12,
      "cubes_involved": ["answer_records", "student", "school"],
      "updated_at": "2026-02-28T11:00:00Z"
    }
  ],
  "total": 16
}
```

```json
// GET /api/v1/semantic/graph
{
  "nodes": [
    { "id": "answer_records", "title": "答题记录", "type": "fact",
      "dimensions": 14, "measures": 6 },
    { "id": "student", "title": "学生", "type": "dimension",
      "dimensions": 12, "measures": 2 }
  ],
  "edges": [
    { "source": "answer_records", "target": "student",
      "relationship": "N:1", "join_type": "left",
      "sql": "answer_records.student_id = student.user_id" }
  ]
}
```

```json
// POST /api/v1/semantic/compile
{
  "sql": "SELECT ...",
  "diagnostics": [
    { "level": "ok", "message": "字段引用合法" },
    { "level": "ok", "message": "分区条件已注入" },
    { "level": "ok", "message": "Fan-out 安全" },
    { "level": "ok", "message": "LIMIT 1000" }
  ],
  "estimated_duration_sec": [20, 40],
  "cubes_involved": ["answer_records", "student"]
}
```

```json
// POST /api/v1/semantic/compile/debug — 逐步调试
{
  "steps": [
    {
      "step": 0,
      "name": "View Resolution",
      "status": "skipped",
      "message": "直接引用 Cube，非 View"
    },
    {
      "step": 1,
      "name": "Parse DSL",
      "status": "ok",
      "detail": { "measures": 2, "dimensions": 1, "filters": 0 }
    },
    {
      "step": 3,
      "name": "Infer JOINs",
      "status": "ok",
      "detail": {
        "path": [
          { "from": "answer_records", "to": "student", "relationship": "N:1", "type": "left" }
        ]
      }
    },
    {
      "step": 4,
      "name": "Fan-out Detection",
      "status": "ok",
      "message": "全部 N:1, 无扇出风险"
    }
  ],
  "final_sql": "SELECT ...",
  "diagnostics": [...]
}
```

```json
// POST /api/v1/semantic/views/:name/materialize
{
  "dataset_id": 42,
  "dataset_code": "view_student_answer_analysis",
  "sql_query": "SELECT ...",
  "field_count": 12
}
```

### 12.10 页面与组件清单

| 页面/组件 | 路径 | 说明 |
|-----------|------|------|
| **Cube 管理** | | |
| `CubeList` | `pages/Semantic/CubeList.tsx` | Cube + View 卡片列表 + 搜索过滤（URL 状态同步） |
| `CubeListSkeleton` | `pages/Semantic/CubeList.tsx` | 加载骨架屏 |
| `CubeCard` | `components/Semantic/CubeCard.tsx` | 卡片组件（`<Link>`, focus ring, truncate, kind badge） |
| `SyncStatusBadge` | `components/Semantic/SyncStatusBadge.tsx` | 同步状态 Badge（ok/warn/error） |
| `CubeDetail` | `pages/Semantic/CubeDetail.tsx` | Cube 详情 Tab 页（URL Tab 同步） |
| `DeleteCubeDialog` | `components/Semantic/DeleteCubeDialog.tsx` | 删除确认 AlertDialog（输入 name 确认） |
| `EnumPopover` | `components/Semantic/EnumPopover.tsx` | 枚举值 Popover |
| **关系画布** | | |
| `RelationCanvas` | `pages/Semantic/RelationCanvas.tsx` | React Flow 关系画布 + 键盘导航 |
| `CubeNode` | `components/Semantic/CubeNode.tsx` | 画布 Cube 节点（aria-label, focus, 类型色） |
| `ViewNode` | `components/Semantic/ViewNode.tsx` | 画布 View 节点（虚线边框，显示引用 Cube 列表） |
| `JoinEdge` | `components/Semantic/JoinEdge.tsx` | 画布 JOIN 连线（relationship label） |
| `CanvasDetailSheet` | `components/Semantic/CanvasDetailSheet.tsx` | 右侧 Cube/View 摘要 Sheet |
| **开发者工具** | | |
| `DevTools` | `pages/Semantic/DevTools.tsx` | 开发者工具容器（Tabs + URL Tab 同步） |
| `PlaygroundTab` | `components/Semantic/DevTools/PlaygroundTab.tsx` | DSL 构建 + 编译 + 执行（支持 Cube 和 View） |
| `DslBuilder` | `components/Semantic/DevTools/DslBuilder.tsx` | 可视化 DSL 构建面板（Checkbox + Label） |
| `FilterBuilder` | `components/Semantic/DevTools/FilterBuilder.tsx` | 过滤条件构建器 |
| `CompileDiagnostics` | `components/Semantic/DevTools/CompileDiagnostics.tsx` | 编译诊断信息（ok/warn/error 图标） |
| `SchemaSyncTab` | `components/Semantic/DevTools/SchemaSyncTab.tsx` | 同步状态面板（状态筛选 URL 同步） |
| `DriftDetail` | `components/Semantic/DevTools/DriftDetail.tsx` | 漂移详情 Accordion |
| `IgnoreDriftDialog` | `components/Semantic/DevTools/IgnoreDriftDialog.tsx` | 忽略漂移确认 AlertDialog |
| `YamlEditorTab` | `components/Semantic/DevTools/YamlEditorTab.tsx` | 文件树 + Monaco YAML 编辑器 |
| `FileTree` | `components/Semantic/DevTools/FileTree.tsx` | Cube/View 文件树（分组展示） |
| `CompileDebugTab` | `components/Semantic/DevTools/CompileDebugTab.tsx` | 逐步编译调试器（Stepper + 中间结果） |
| `CompileStepCard` | `components/Semantic/DevTools/CompileStepCard.tsx` | 单步编译结果卡片（状态图标 + 详情折叠） |
| **公共** | | |
| `useUrlState` | `hooks/useUrlState.ts` | URL query param 双向绑定 Hook |
| `format` | `lib/format.ts` | `fmtDate` / `fmtNumber` (Intl API) |

### 12.11 前端实施分期

| 阶段 | 内容 | 依赖 | 工时 |
|------|------|------|------|
| **P0** | 全局基础：`useUrlState` Hook、`format.ts`、Design Tokens、JetBrains Mono preload、骨架屏 | 无 | 0.5 天 |
| **P1.1** | Cube + View 列表 + 卡片（含 kind badge）+ 搜索过滤 + 空状态 + URL 同步 | 后端 GET cubes API | 2 天 |
| **P1.2** | Cube 详情页（只读 Tabs + 枚举 Popover + URL Tab 同步） | 后端 GET cubes/:name API | 1.5 天 |
| **P1.3** | DevTools 容器 + Playground Tab（DSL 构建器 + Cube/View 下拉 + 编译预览 + 执行 + 结果表格） | 后端 compile/query API | 3 天 |
| **P1.4** | DevTools Schema 同步 Tab（同步面板 + 漂移 Accordion + 忽略 AlertDialog + 空状态） | 后端 sync API | 1.5 天 |
| **P2.1** | DevTools YAML 编辑器 Tab（文件树 + Monaco + 未保存拦截 + Diff + 校验 + 新建 Cube/View） | 后端 files + PUT API | 2.5 天 |
| **P2.2** | DevTools 编译调试器 Tab（Stepper + 中间结果 + JOIN 路径 mini 可视化） | 后端 compile/debug API | 2 天 |
| **P2.3** | 关系画布（React Flow + CubeNode + ViewNode + JoinEdge + ELK 布局 + 键盘导航） | 后端 graph API | 2.5 天 |
| **P2.4** | 画布交互增强（拖拽建关联、路径高亮、右键菜单） | P2.3 | 3 天 |
| **P2.5** | Schema 同步 ↔ YAML 编辑器联动（"在编辑器中打开" + 漂移一键处理） | P1.4 + P2.1 | 1 天 |
| **P3.1** | View 物化功能（前端"物化为虚拟数据集"按钮 + 后端 materialize API） | View CRUD API | 1 天 |
