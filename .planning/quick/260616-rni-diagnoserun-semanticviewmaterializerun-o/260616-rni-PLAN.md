---
phase: quick-260616-rni
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/infrastructure/semantic/models.py
  - app/domain/semantic/diagnose_run.py
  - app/domain/semantic/views_materialize.py
  - app/__init__.py
  - app/infrastructure/semantic/diagnose_run_repo.py
  - app/infrastructure/semantic/view_materialize_repo.py
  - app/interfaces/api/v1/semantic/runtime.py
  - tests/conftest.py
  - tests/unit/infrastructure/semantic/test_view_materialize_repo.py
  - tests/unit/domain/semantic/test_views_materialize.py
autonomous: true
requirements: [ARCH-LAYERING]

must_haves:
  truths:
    - "DiagnoseRun 与 SemanticViewMaterializeRun 两个 ORM 类不再定义在 app/domain/semantic/ 下"
    - "两个类的类名与表名保持不变，所有 repository / service / API / 测试仍能正常引用"
    - "应用工厂 create_app('testing') 启动时无 import 错误，两张表的建表元数据仍被注册"
    - "相关 pytest（diagnose_run / view_materialize）全部通过"
  artifacts:
    - path: "app/infrastructure/semantic/models.py"
      provides: "DiagnoseRun ORM 定义新落点"
      contains: "class DiagnoseRun"
    - path: "app/infrastructure/semantic/models.py"
      provides: "SemanticViewMaterializeRun ORM 定义新落点"
      contains: "class SemanticViewMaterializeRun"
  key_links:
    - from: "app/infrastructure/semantic/diagnose_run_repo.py"
      to: "app/infrastructure/semantic/models.py"
      via: "from app.infrastructure.semantic.models import DiagnoseRun"
      pattern: "from app.infrastructure.semantic.models import DiagnoseRun"
    - from: "app/infrastructure/semantic/view_materialize_repo.py"
      to: "app/infrastructure/semantic/models.py"
      via: "from app.infrastructure.semantic.models import SemanticViewMaterializeRun"
      pattern: "from app.infrastructure.semantic.models import SemanticViewMaterializeRun"
    - from: "app/__init__.py"
      to: "app/infrastructure/semantic/models.py"
      via: "启动时导入 models.py 注册建表元数据（diagnose_run 不再单独从 domain 导入）"
      pattern: "from .infrastructure.semantic.models import"
---

<objective>
将两个仅用于持久化的 ORM 类（`DiagnoseRun`、`SemanticViewMaterializeRun`）从领域层 `app/domain/semantic/` 迁移到基础设施层 `app/infrastructure/semantic/models.py`，消除「新实体禁止继承 db.Model」（CONVENTIONS.md 分层规则）的分层泄漏。

这两个类是 2026-04-21 新增的纯持久化记录（只有 `to_dict()`，无任何领域行为），属于约定明确禁止落在 domain 的情形。不触碰 `app/domain/entities/` 下 28 个存量实体（约定允许存量逐步迁移）。

Purpose: 让领域层重新满足「不直接依赖 SQLAlchemy 适配器实现」的分层约束，blast radius 最小化（保留类名与表名）。
Output: 两个类迁至 models.py，两个 domain 文件删除，所有引用（含测试）改指向新位置，建表注册不变，无新增 migration。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/codebase/CONVENTIONS.md

<interfaces>
<!-- 迁移目标文件 models.py 的现有约定（执行器据此追加，无需探索）：

models.py 顶部现有导入（行 1-7）：
```python
from __future__ import annotations
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, UniqueConstraint, text
from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow
```
注意：
- 当前 import 缺少 BigInteger，迁移的两个类主键用 BigInteger，需补入 sqlalchemy 的 import 行。
- 当前未导入 datetime；DiagnoseRun 的 created_at 用 default=datetime.utcnow，为忠实迁移需补 from datetime import datetime。
- models.py 共 389 行，已含 SemanticAssetORM 等 16 个 ORM 类，且在 app/__init__.py 与 tests/conftest.py 中被显式导入注册建表元数据。
- 两个待迁移类各自用 _PK_TYPE = BigInteger().with_variant(Integer, "sqlite") 作为主键类型，可在 models.py 内定义一个模块级 _PK_TYPE 变量供两个类共用。

待迁移类的完整定义（原样保留类名 / 表名 / 字段 / to_dict）：

DiagnoseRun（原 app/domain/semantic/diagnose_run.py）：
- __tablename__ = "semantic_diagnose_runs"，__table_args__ = {"extend_existing": True}
- 字段：id(_PK_TYPE,pk,autoincrement) / user_id(BigInteger,nn,index) / input_kind(String32,nn) /
  input_text(Text,nn) / parse_ok(Boolean) / validate_ok(Boolean) / sql_text(Text) / error(Text) /
  duration_ms(Integer) / definition_hash(String128) / created_at(DateTime,nn,default=datetime.utcnow)
- to_dict() 序列化全部字段，created_at 用 .isoformat()

SemanticViewMaterializeRun（原 app/domain/semantic/views_materialize.py）：
- __tablename__ = "semantic_view_materialize_runs"，__table_args__ = {"extend_existing": True}
- 字段：id(_PK_TYPE,pk,autoincrement) / view_id(BigInteger,nn,index) / status(String16,nn) /
  started_at(DateTime,nn) / finished_at(DateTime) / error(Text)
- to_dict() 序列化全部字段，started_at / finished_at 用 .isoformat()
-->
</interfaces>

<reference_map>
<!-- 全仓引用图谱（已 grep 核实，执行器据此逐处更新，勿遗漏）：

需要从「旧 domain 路径」改为「app.infrastructure.semantic.models」的导入点：
1. app/infrastructure/semantic/diagnose_run_repo.py:6
2. app/infrastructure/semantic/view_materialize_repo.py:13
3. app/interfaces/api/v1/semantic/runtime.py:330（函数内 import，# noqa）
4. tests/conftest.py:74（DiagnoseRun，# noqa B-back-9）
5. tests/conftest.py:75（SemanticViewMaterializeRun，# noqa B-back-3）
6. tests/unit/infrastructure/semantic/test_view_materialize_repo.py:11
7. tests/unit/domain/semantic/test_views_materialize.py（6 处函数内 import：行 13/30/43/54/64）

特殊处理 app/__init__.py:146：
  from .domain.semantic.diagnose_run import DiagnoseRun  # noqa
  此行可直接删除——models.py 已在 app/__init__.py 后续行（约 169 行起）通过
  from .infrastructure.semantic.models import (...) 块被导入，建表元数据已注册。
  删除该行即可，避免冗余的旧路径引用。
  （SemanticViewMaterializeRun 在 __init__.py 中本就没有单独导入，无需处理。）

无需改动的引用（已指向 service/repo，与本次迁移无关）：
- app/application/semantic/diagnose_run_service.py（只引用 DiagnoseRunRepo / 字符串名）
- 各 repo 文件内对类的「使用」（非 import）会随 import 修正自然生效。

migration：表名不变 → 无需新 migration；
migrations/versions/20260420_02_add_view_materialize.py 引用的是表名字符串，不受影响。
-->
</reference_map>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 将两个 ORM 类追加到 models.py 并补齐 import</name>
  <files>app/infrastructure/semantic/models.py</files>
  <action>
在 app/infrastructure/semantic/models.py 中完成迁移落点：

1. 补齐 import：
   - sqlalchemy 导入行加入 BigInteger（原行：from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, UniqueConstraint, text，按字母序插入 BigInteger）。
   - 文件顶部新增 from datetime import datetime（放在 from __future__ import annotations 之后、sqlalchemy 导入之前，遵循标准库优先的分组习惯）。

2. 在现有 import 区块下方、第一个 ORM 类之前，定义模块级：
   _PK_TYPE = BigInteger().with_variant(Integer, "sqlite")

3. 在文件末尾追加两个类，原样保留类名、表名、字段定义、__table_args__ 与 to_dict()（见 <interfaces> 块的完整定义）：
   - class DiagnoseRun(db.Model)，__tablename__ = "semantic_diagnose_runs"，created_at 用 default=datetime.utcnow（忠实迁移，勿改为 models.py 现有的 utcnow）。
   - class SemanticViewMaterializeRun(db.Model)，__tablename__ = "semantic_view_materialize_runs"。
   两个类均保留 docstring（可精简但保留语义），id 主键用 _PK_TYPE。

不要修改 models.py 中现有的 16 个 ORM 类，不要改动现有 utcnow 用法。
  </action>
  <verify>
    <automated>python -c "from app.infrastructure.semantic.models import DiagnoseRun, SemanticViewMaterializeRun; assert DiagnoseRun.__tablename__=='semantic_diagnose_runs'; assert SemanticViewMaterializeRun.__tablename__=='semantic_view_materialize_runs'; print('OK')"</automated>
  </verify>
  <done>models.py 含 DiagnoseRun 与 SemanticViewMaterializeRun 两个类，表名不变，可直接从 app.infrastructure.semantic.models 导入；BigInteger 与 datetime 已正确导入。</done>
</task>

<task type="auto">
  <name>Task 2: 更新全部引用并删除两个 domain 文件</name>
  <files>app/__init__.py, app/infrastructure/semantic/diagnose_run_repo.py, app/infrastructure/semantic/view_materialize_repo.py, app/interfaces/api/v1/semantic/runtime.py, tests/conftest.py, tests/unit/infrastructure/semantic/test_view_materialize_repo.py, tests/unit/domain/semantic/test_views_materialize.py, app/domain/semantic/diagnose_run.py, app/domain/semantic/views_materialize.py</files>
  <action>
按 <reference_map> 逐处更新导入，把旧 domain 路径改为 app.infrastructure.semantic.models：

1. app/infrastructure/semantic/diagnose_run_repo.py:6
   from app.domain.semantic.diagnose_run import DiagnoseRun
   → from app.infrastructure.semantic.models import DiagnoseRun

2. app/infrastructure/semantic/view_materialize_repo.py:13
   from app.domain.semantic.views_materialize import SemanticViewMaterializeRun
   → from app.infrastructure.semantic.models import SemanticViewMaterializeRun

3. app/interfaces/api/v1/semantic/runtime.py:330（函数内 import，保留 # noqa）
   from app.domain.semantic.diagnose_run import DiagnoseRun  # noqa
   → from app.infrastructure.semantic.models import DiagnoseRun  # noqa

4. tests/conftest.py:74-75（保留 # noqa 注释，可酌情调整对齐空格）
   - 行 74：→ from app.infrastructure.semantic.models import DiagnoseRun  # noqa  B-back-9
   - 行 75：→ from app.infrastructure.semantic.models import SemanticViewMaterializeRun  # noqa  B-back-3

5. tests/unit/infrastructure/semantic/test_view_materialize_repo.py:11
   from app.domain.semantic.views_materialize import SemanticViewMaterializeRun
   → from app.infrastructure.semantic.models import SemanticViewMaterializeRun

6. tests/unit/domain/semantic/test_views_materialize.py — 6 处函数内 import（行 13/30/43/54/64）
   全部 from app.domain.semantic.views_materialize import SemanticViewMaterializeRun
   → from app.infrastructure.semantic.models import SemanticViewMaterializeRun
   （仅改导入路径，测试逻辑与断言不变；文件原位保留，行为不受影响。）

7. app/__init__.py:146 — 直接删除整行
   from .domain.semantic.diagnose_run import DiagnoseRun  # noqa
   （models.py 已在后续 from .infrastructure.semantic.models import (...) 块导入注册，无需此行。删除后确认上下行缩进与块完整。）

8. 删除两个旧 domain 文件：
   - app/domain/semantic/diagnose_run.py
   - app/domain/semantic/views_materialize.py
   用 git rm 或 rm 删除。

完成后用 grep 自检确认全仓已无对旧路径的引用。
  </action>
  <verify>
    <automated>grep -rn "domain.semantic.diagnose_run\|domain.semantic.views_materialize" app/ tests/ && echo "FAIL: 仍有旧路径引用" && exit 1 || echo "PASS: 无旧路径引用"; test ! -f app/domain/semantic/diagnose_run.py && test ! -f app/domain/semantic/views_materialize.py && echo "PASS: 旧文件已删除"</automated>
  </verify>
  <done>全仓无对 domain.semantic.diagnose_run / domain.semantic.views_materialize 的引用；两个旧 domain 文件已删除；7 处导入已改指向 models.py；app/__init__.py:146 冗余行已删。</done>
</task>

<task type="auto">
  <name>Task 3: 冒烟验证与定向回归</name>
  <files>（验证任务，不修改源码；如冒烟暴露遗漏则回到 Task 1/2 修正）</files>
  <action>
对本次迁移做闭环验证（只关注本次改动相关项；仓库当前有大量无关 WIP 改动与既有 lint 噪音，不要被无关失败阻塞）：

1. 应用工厂启动冒烟（确认 import 链完整 + 建表元数据注册正常）：
   python -c "from app import create_app; app = create_app('testing'); print('create_app OK')"
   若项目无 'testing' 配置名，回退用 make smoke 或 python -c "from app import create_app; create_app()" 的等价入口。

2. 定向 pytest（迁移直接相关的测试文件）：
   python -m pytest -q \
     tests/unit/domain/semantic/test_views_materialize.py \
     tests/unit/infrastructure/semantic/test_view_materialize_repo.py \
     tests/unit/infrastructure/semantic/test_diagnose_run_repo.py \
     tests/unit/application/semantic/test_diagnose_run_service.py \
     tests/integration/semantic/test_diagnose_runs.py \
     tests/integration/semantic/test_view_materialize.py \
     tests/integration/semantic/test_semantic_view_diagnose_errors.py
   全部应通过。若有失败，先判断是否由本次迁移导致（import 路径 / 表注册）；无关的环境/凭证类失败按 STATE.md 既有约束跳过，但本次改动相关项必须绿。

3. 静态/分层检查（最低必跑路由）：
   优先 make verify-detect 看路由建议；若可行跑 make typecheck（或后端等价静态检查）。
   只确认本次改动文件无新增类型/导入错误，不要求修复仓库既有无关告警。
  </action>
  <verify>
    <automated>python -c "from app import create_app; create_app('testing'); print('create_app OK')" && python -m pytest -q tests/unit/domain/semantic/test_views_materialize.py tests/unit/infrastructure/semantic/test_view_materialize_repo.py tests/unit/infrastructure/semantic/test_diagnose_run_repo.py tests/unit/application/semantic/test_diagnose_run_service.py</automated>
  </verify>
  <done>create_app('testing') 无 import 错误；上述定向 pytest 全部通过；本次改动文件无新增静态错误。</done>
</task>

</tasks>

<verification>
- python -c 单独 import 两个类成功，表名为 semantic_diagnose_runs / semantic_view_materialize_runs。
- grep 全仓无 domain.semantic.diagnose_run / domain.semantic.views_materialize 引用。
- app/domain/semantic/diagnose_run.py 与 views_materialize.py 已删除。
- create_app('testing') 启动无错误，两张表建表元数据已注册（DiagnoseRun / SemanticViewMaterializeRun 在 metadata 中）。
- 迁移相关 pytest 全绿。
- 无新增 migration（表名未变）。
</verification>

<success_criteria>
- 两个 ORM 类落在 app/infrastructure/semantic/models.py，领域层不再有继承 db.Model 的新类泄漏。
- 类名与表名保持不变，blast radius 最小，所有 repo/service/API/测试引用已更新且通过。
- 应用可正常构造，建表注册不变，无需 DB migration。
- 验证只针对本次改动，未被仓库既有无关 lint / WIP 噪音阻塞。
</success_criteria>

<output>
After completion, create `.planning/quick/260616-rni-diagnoserun-semanticviewmaterializerun-o/260616-rni-SUMMARY.md`
</output>
