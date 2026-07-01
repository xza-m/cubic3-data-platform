---
phase: 260701-gnt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/application/semantic/modeling_proposal_service.py
  - tests/unit/application/semantic/test_modeling_proposal_service.py
  - app/infrastructure/semantic/sql_asset_registry_repository.py
  - tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py
  - deploy.sh
  - README.md
  - Makefile
autonomous: true
requirements: []
must_haves:
  truths:
    - "通过标准 proposal 发布链路（apply -> publish）发布的 cube，发布完成后能被 SemanticDefinitionService.list_cubes() / ICubeRepository.get_cube(name) 读到"
    - "真实容器内跑 cube onboard --publish --yes 后，cube list 能看到新 cube，且相关问题的 intent answerability 从不可答变为可答"
    - "并发场景下两次几乎同时的 upsert 竞争同一 asset key 不会抛出未处理的 IntegrityError，最终只产生一条资产记录"
    - "deploy.sh 的健康检查探测地址与 docker-compose.yml 实际暴露的端口一致，探测失败仍只打印警告不阻断部署"
    - "新人打开顶层 README.md 能在几行内发现 semctl / cube onboard / dp-semantic-builder skill 的入口线索"
    - "仓库内关于本地验证闸门的注释准确反映现状（GitHub Actions 已生效），不再声称 GitLab CI 未就位"
  artifacts:
    - path: "app/application/semantic/modeling_proposal_service.py"
      provides: "_apply_to_sql_registry / _publish_from_sql_registry 在写 SQL registry 的同时把 cube spec 物化进 YAML 仓储；_upsert_sql_registry_asset 具备并发保护"
    - path: "app/infrastructure/semantic/sql_asset_registry_repository.py"
      provides: "create_or_update_asset 具备 advisory lock + IntegrityError 处理，避免并发窗口内裸抛异常"
    - path: "deploy.sh"
      provides: "健康检查探测地址与实际端口映射一致"
    - path: "README.md"
      provides: "语义建模 CLI（semctl）/ skill 入口简介 + 链接；本地闸门注释不再声称 GitLab CI 未就位"
    - path: "Makefile"
      provides: "本地闸门注释准确反映现状（GitHub Actions CI 已生效）"
  key_links:
    - from: "app/application/semantic/modeling_proposal_service.py::_apply_to_sql_registry"
      to: "app/application/semantic/modeling_draft_builder.py::SemanticModelDraftBuilder.apply"
      via: "self._builder.apply(spec) 复用既有 cube_modeling_service.create_cube -> cube_repo.save"
      pattern: "self\\._builder\\.apply\\("
    - from: "app/application/semantic/modeling_proposal_service.py::_publish_from_sql_registry"
      to: "app/application/semantic/modeling_draft_builder.py::SemanticModelDraftBuilder.publish"
      via: "self._builder.publish(spec, publish_targets=...) 复用既有 cube_modeling_service.activate_cube -> cube_repo.save"
      pattern: "self\\._builder\\.publish\\("
    - from: "app/application/semantic/modeling_proposal_service.py::_upsert_sql_registry_asset"
      to: "app/infrastructure/semantic/sql_asset_registry_repository.py::create_or_update_asset"
      via: "advisory lock 保护同 asset_key 并发写"
      pattern: "pg_advisory_xact_lock"
---

<objective>
修复上线可行性评估中确认的 1 个 P0 + 4 个 P1 问题：P0 是 SQL-registry 发布链路与 YAML cube 仓储断层（发布"成功"但问数看不到、答不了），P1 覆盖并发竞态、部署健康检查探测端口错误、README 能力入口缺失、过时的"GitLab CI 未就位"措辞。

根因均已在讨论中查清（详见 task_detail），本 plan 不含调查步骤，直接实施 + 验证。

Purpose: 让语义发布链路真正可信（发布后可问数），并清理阻碍新人/协作者理解现状的部署与文档缺陷。
Output: 5 个独立、可原子提交的修复，每个修复自带对应测试与验证证据。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- P0/P1-1 涉及的关键类型与方法签名，均已从代码库读取，executor 无需再探索 -->

From app/application/semantic/modeling_proposal_service.py（关键片段，行号为当前实测）:
```python
class ModelingProposalService:
    def __init__(
        self, *, repository, builder: "SemanticModelDraftBuilder", readiness_checker,
        asset_registry_repository: Any = None, release_service: Any = None,
        asset_namespace: str = "default", coverage_analyzer=None, validation_matrix_builder=None,
    ):
        self._builder = builder  # SemanticModelDraftBuilder；内部持有 cube_modeling_service
        self._asset_registry_repository = asset_registry_repository
        self._release_service = release_service
        ...

    def _uses_sql_registry(self) -> bool:
        return self._asset_registry_repository is not None and self._release_service is not None

    # apply()/publish() 顶层判断 _uses_sql_registry()，为 True（容器当前恒为 True，见 DI 装配）时
    # 分别走 _apply_to_sql_registry / _publish_from_sql_registry，两者当前只调用
    # asset_registry_repository.append_revision(...) / release_service.publish(...)，
    # 从未调用 self._builder.apply(spec) / self._builder.publish(spec) —— 这是 P0 根因。

    def _apply_to_sql_registry(self, proposal: ModelingProposal) -> Dict[str, Any]:
        spec = deepcopy(proposal.spec or {})
        asset = self._upsert_sql_registry_asset(proposal, spec, status="draft")
        revision = self._asset_registry_repository.append_revision(
            asset.id, spec, proposal_id=proposal.id, actor="semantic_bundle_builder",
        )
        return {...}  # 缺失：从未把 spec 物化进 YAML cube 仓储

    def _publish_from_sql_registry(self, proposal, *, publish_targets, scope_hash) -> Dict[str, Any]:
        ...
        release = self._release_service.publish(...)
        ...
        return result  # 缺失：从未调用 cube_modeling_service.activate_cube 把 cube 状态提升为 active 并落 YAML

    def _upsert_sql_registry_asset(self, proposal, spec, *, status) -> SemanticAsset:
        namespace = self._registry_namespace(proposal)
        ...
        existing = self._asset_registry_repository.get_asset(namespace, "cube", asset_key)
        asset = SemanticAsset(id=..., namespace=namespace, asset_type="cube", asset_key=asset_key, ...)
        return self._asset_registry_repository.create_or_update_asset(asset)
        # 缺失：select-then-insert/update 无锁保护，并发窗口内 IntegrityError 会直接抛给调用方
```

From app/application/semantic/modeling_draft_builder.py（P0 修复应复用的既有逻辑，不要重新发明）:
```python
class SemanticModelDraftBuilder:
    def __init__(self, *, cube_modeling_source_service, cube_modeling_service, ontology_service,
                 mapper_service=None, agent_plan_handler=None):
        self._cube_modeling_service = cube_modeling_service  # 内部持有 cube_repo（YAML 仓储）

    def apply(self, spec: Dict[str, Any]) -> Dict[str, Any]:
        """保存 Cube 与 Ontology 草稿，不默认发布。"""
        cube_payload = deepcopy(spec.get("cube") or {})
        cube = self._cube_modeling_service.create_cube(cube_payload)  # -> cube_repo.save(cube)
        ...
        return {"published": False, "assets": created, "spec": applied_spec, "audit": ...}

    def publish(self, spec: Dict[str, Any], publish_targets: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
        """按确认范围发布，默认 cube + ontology 同批发布。"""
        cube_name = (spec.get("cube") or {}).get("name")
        if targets["cube"] and cube_name:
            published["cube"] = self._dump_entity(self._cube_modeling_service.activate_cube(cube_name))
            # activate_cube -> cube_repo.save(cube with status=active)
        ...
        return {"publish_targets": targets, "published": published, "audit": ...}
```

From app/application/semantic/cube_modeling_service.py（apply/publish 底层最终落到的方法）:
```python
class CubeModelingService:
    def create_cube(self, payload: Dict[str, Any]) -> CubeDefinition:
        cube = CubeDefinition(**payload)
        ...
        if self._cube_repo.get(cube.name):
            # 名称冲突时改名为 {name}_draft_{tag} 再存 —— 注意：这意味着如果 SQL registry
            # 侧 asset_key 与 YAML 侧 cube.name 因改名而不一致，需要在 P0 修复里同步这个新名称
            ...
        self._cube_repo.save(cube)  # <- 真正写 YAML 的地方
        return cube

    def activate_cube(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)  # 要求 YAML 仓储里已存在该 cube（即 apply 阶段已 create_cube）
        cube = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "active"})
        self._cube_repo.save(cube)
        return cube
```

From app/infrastructure/semantic/sql_asset_registry_repository.py（P1-1 应复用的既有并发保护模式，来自 publish_with_snapshot）:
```python
class SqlAssetRegistryRepository:
    def create_or_update_asset(self, asset: SemanticAsset, *, allowed_update_fields=None) -> SemanticAsset:
        row = self.session.query(SemanticAssetORM).filter(
            SemanticAssetORM.namespace == asset.namespace,
            SemanticAssetORM.asset_type == asset.asset_type,
            SemanticAssetORM.asset_key == asset.asset_key,
        ).first()
        # 缺失：select 之后、insert/update 之前没有加锁；并发窗口内两个事务都可能 select 到 None
        # 然后都尝试 insert，第二个会撞 unique constraint 抛 IntegrityError，未被捕获
        ...
        self.session.commit()
        return _asset_from_row(row)

    # 已有的、应复用的并发保护范式（在 publish_with_snapshot 里）：
    def _lock_release_namespace(self, namespace: str) -> None:
        bind = self.session.get_bind()
        if bind is None or bind.dialect.name != "postgresql":
            return
        self.session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_class, hashtext(:lock_key))"),
            {"lock_class": 314159, "lock_key": f"semantic_release:{namespace}"},
        )

    def publish_with_snapshot(self, release, release_assets, snapshot, *, audit_writer=None) -> SemanticRelease:
        try:
            self._lock_release_namespace(release.namespace)
            ...
            self.session.commit()
            return _release_from_row(release_row)
        except IntegrityError as exc:
            self.session.rollback()
            self._record_failed_release_attempt(release, failure_reason="concurrent_publish_conflict")
            raise ValueError("concurrent_publish_conflict") from exc
```

注意：`_lock_release_namespace` 用的 `lock_class=314159` 是 release 发布锁的命名空间；为 asset upsert
新增锁时必须用**不同的 lock_key 前缀**（例如 `f"semantic_asset:{namespace}:{asset_type}:{asset_key}"`），
避免与 release 发布锁误共享同一把锁导致不必要的串行化或语义混淆。`hashtext()` 对不同字符串输入天然产出
不同 hash，只要 lock_key 前缀不同即可安全共存，不需要更换 lock_class。

From tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py（现有测试写法，P1-1 新测试应沿用同一 db_session fixture 与 mock _Session 风格）:
```python
def test_sql_asset_registry_uses_postgresql_advisory_lock_for_release_namespace():
    class _Dialect:
        name = "postgresql"
    class _Bind:
        dialect = _Dialect()
    class _Session:
        def __init__(self):
            self.calls = []
        def get_bind(self):
            return _Bind()
        def execute(self, statement, params):
            self.calls.append((str(statement), params))
    session = _Session()
    repo = SqlAssetRegistryRepository(session)
    repo._lock_release_namespace("qa_live_1")
    assert "pg_advisory_xact_lock" in session.calls[0][0]
    assert session.calls[0][1]["lock_key"] == "semantic_release:qa_live_1"
```

真实并发测试参考（tests/integration/semantic/test_semantic_postgres_concurrency.py 已有先例）：
用 `concurrent.futures.ThreadPoolExecutor` + 独立 DB session 对同一 asset_key 发起并发 upsert，
断言不抛出未处理异常、最终只有一条记录。
</interfaces>

deploy.sh 当前内容（探测端口错误的具体位置）：
```bash
echo "7. 检查健康状态..."
curl -f http://localhost:81/health || echo "警告: 健康检查失败（通过 nginx）"
curl -f http://localhost:5000/health || echo "警告: 后端健康检查失败"
...
echo "后端API: http://localhost:5000"
```
docker-compose.yml 里 backend 服务只有 `expose: "5000"`（容器间可见），没有 `ports:` 映射到宿主机；
nginx 服务有 `ports: ["81:80"]`。所以 `curl http://localhost:5000/health` 从宿主机探测必然失败，
且脚本末尾"后端API: http://localhost:5000"的提示也具有误导性（宿主机侧不可达）。

README.md 现状（本地闸门注释位置，第 373 行附近）：
```
# 本地闸门（GitLab CI 基建未就位时的替代入口）
```
第 383 行附近：
```
仓库根目录放了一套基于 `husky` 的本地闸门，用来在 GitLab CI 上线前兜底：
```
仓库 `.github/workflows/` 下已有 `backend-ci.yml`、`frontend-ci.yml`、`docs-health.yml`、
`lighthouse-ci-dispatch.yml` 四个真实生效的 GitHub Actions workflow。

Makefile 现状（两处措辞）：
- 第 156 行：`@printf '%s\n' '本地闸门（GitLab CI 未就位时的替代入口）:'`
- 第 520 行注释块：`# 本地闸门（GitLab CI 基建未就位时，替代 pipeline 的手动入口）`

skills/dp-semantic-builder/SKILL.md 已存在完整说明（不需要重写），
app/interfaces/cli/README.md 已存在完整命令参考（不需要重写）。
README.md 目前全文对 `semctl`/`cube onboard`/`dp-semantic-builder` 零命中，需要在
"常用命令"章节附近（第 320-379 行区间，紧邻 `cubic3-dp CLI` 相关命令）补一小段入口指引。

`openspec/project.md:217` 是一段泛化的"推荐实践 TBD"清单（"5. CI/CD: 集成 GitHub Actions / GitLab CI
自动运行测试"），与本次任务描述的"声称 GitLab CI 未就位"这一具体过时措辞不是同一件事，不在修复范围内。
</context>

<tasks>

<task type="auto">
  <name>Task 1: P0 — 打通 SQL-registry 发布链路与 YAML cube 仓储（含子步骤同时处理 P1-1 并发竞态）</name>
  <files>app/application/semantic/modeling_proposal_service.py, tests/unit/application/semantic/test_modeling_proposal_service.py, app/infrastructure/semantic/sql_asset_registry_repository.py, tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py</files>
  <action>
本 task 顺序完成两个独立但相邻的修复（P0 在 modeling_proposal_service.py，P1-1 在 sql_asset_registry_repository.py，两文件互不冲突，同一 task 内顺序执行）：

**子步骤 A（P0，最高优先级）**：修复 `_apply_to_sql_registry` / `_publish_from_sql_registry`，让它们在写 SQL registry 的同时，把 cube spec 物化进 YAML 仓储。复用 `self._builder`（`SemanticModelDraftBuilder`）已有的 `apply(spec)` / `publish(spec, publish_targets=...)` 方法，不要重新发明"cube spec -> YAML"的构造过程：

1. 在 `_apply_to_sql_registry(self, proposal)` 内，在写 SQL registry（`_upsert_sql_registry_asset` + `append_revision`）之外，额外调用 `builder_result = self._builder.apply(spec)`，把返回的 `builder_result["spec"]`（含 `create_cube` 后可能改名的 cube.name，用于处理名称冲突改名场景）合并进最终返回的 `spec` 字段，保证下游 `proposal.spec = applied_spec` 拿到的是 YAML 侧真实生效的 cube 定义。返回结构里新增 `"yaml"` 字段记录 `builder_result.get("assets")`，便于审计追踪双轨写入证据。
2. 在 `_publish_from_sql_registry(self, proposal, *, publish_targets, scope_hash)` 内，在写 SQL registry release（`_asset_registry_repository.append_revision` + `_release_service.publish`）之外，额外调用 `self._builder.publish(proposal.spec, publish_targets=publish_targets)`，把返回结果合并进 `result["yaml"]` 字段。调用顺序：先完成 SQL registry release 写入（治理门已在 `validate()`/`approve()` 阶段跑过，无需重复跑），再调用 `self._builder.publish(...)` 做 YAML 侧 `activate_cube`。若 `self._builder.publish(...)` 抛出异常（例如 cube 在 YAML 侧尚不存在，说明 apply 阶段未正确物化），让异常正常向上抛出，不要吞掉——这是刻意的强一致性设计：SQL registry release 已提交但 YAML 未写成功时，应该让调用方看到明确失败而不是静默产生"数据库说已发布、YAML 说没有"的分裂态。
3. 注意 `cube_modeling_service.create_cube` 在检测到同名 cube 已存在时会自动改名为 `{name}_draft_{tag}`（见 interfaces 里的代码片段）。如果这种改名分支在 apply 阶段被触发，`_publish_from_sql_registry` 里传给 `self._builder.publish` 的 `proposal.spec` 必须是 apply 后（可能已改名）的 spec，而不是最初的 spec——确认 `apply()` 方法末尾已经把 `applied_spec` 赋回 `proposal.spec`（现有代码已这么做，见 259-294 行 `apply()` 方法），本次改动不需要额外处理这一层，只需确保 `_publish_from_sql_registry` 读的是 `proposal.spec`（当前已是如此）。
4. 更新对应的 docstring/注释，说明"两条治理轨道（SQL registry 元数据 + YAML 运行时仓储）必须同批写入，任一失败都应让调用方感知"。

**子步骤 B（P1-1，并发竞态）**：给 `_upsert_sql_registry_asset` 的并发窗口加保护。做法：在 `app/infrastructure/semantic/sql_asset_registry_repository.py` 的 `create_or_update_asset` 方法内部，在 select-then-insert/update 之前，复用 `_lock_release_namespace` 同款模式新增一个 `_lock_asset_key(namespace, asset_type, asset_key)` 方法（lock_key 用 `f"semantic_asset:{namespace}:{asset_type}:{asset_key}"`，与 release 锁的 `f"semantic_release:{namespace}"` 前缀不同，避免共享同一把锁），并在方法体最前面调用它；同时把 insert 分支包裹在 try/except IntegrityError 里——捕获后 rollback，重新 `session.query(...).first()` 读一次当前记录（这次一定能读到，因为并发者已提交），按 update 分支合并当前 `asset` 的允许更新字段后返回，不再抛出未处理异常。这个改动属于 sql_asset_registry_repository.py，但因为 P0/P1-1 均涉及 `modeling_proposal_service.py` 调用路径，此 task 一并完成以保证两处改动互相印证、避免遗留半修复状态。

**TDD 要求**：本 task 涉及生产代码修改，先写测试再实现。
  </action>
  <behavior>
    - Test 1（P0 核心）：mock `builder`（含 `apply`/`publish` 方法）+ mock `asset_registry_repository`/`release_service`，走完整 `create -> draft -> validate -> approve -> apply -> publish` 流程后，断言 `builder.apply` 和 `builder.publish` 均被调用，且调用参数里的 spec 与 SQL registry 侧写入的 spec 一致。
    - Test 2（P0 回归防护）：断言 `_apply_to_sql_registry` 返回结构里新增的 `"yaml"` 字段存在且非空（用于后续证据追踪，不允许悄悄丢弃这块证据）。
    - Test 3（P0 边界）：mock `builder.publish` 抛出异常（模拟 YAML 侧 cube 不存在），断言 `publish()` 方法把异常正常向上传播，不吞掉、proposal 状态不应被错误地标记为 `published`。
    - Test 4（P1-1 并发）：对 `SqlAssetRegistryRepository.create_or_update_asset`（或经由 `ModelingProposalService._upsert_sql_registry_asset` 间接覆盖）模拟两次几乎同时的 upsert 竞争同一 `(namespace, asset_type, asset_key)`：可用真实 Postgres `db_session`（参考 `tests/integration/semantic/test_semantic_postgres_concurrency.py` 的 `ThreadPoolExecutor` 写法，各线程用独立 session）或者用 mock session 模拟第二次 insert 抛出 `IntegrityError` 后被捕获重试。断言不抛出未处理异常，最终只产生一条资产记录。
  </behavior>
  <verify>
    <automated>docker exec cubic3-data-platform-backend bash -c "cd /app && python -m pytest --no-cov tests/unit/application/semantic/test_modeling_proposal_service.py tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py -x -q"</automated>
  </verify>
  <done>
    新增 4 类测试全部通过；`_apply_to_sql_registry`/`_publish_from_sql_registry` 调用 `self._builder.apply`/`self._builder.publish`；`create_or_update_asset` 具备 advisory lock + IntegrityError 捕获重试；既有 `test_modeling_proposal_service.py` 全部测试保持通过（不回归）。
  </done>
</task>

<task type="auto">
  <name>Task 2: P0 真实端到端验证（最关键的验收步骤，不能只看单测绿）</name>
  <files>无新增文件；仅执行验证命令并记录证据</files>
  <action>
Task 1 完成并通过单测后，必须在真实容器环境里做端到端验证，证明"发布后可问数"这个闭环真正打通，而不是只有单测断言 mock 调用。

步骤：
1. 把最新代码同步进容器（如果开发环境挂载了源码卷可跳过；否则 `docker cp app cubic3-data-platform-backend:/app/app`）。
2. 找一张已有真实 schema 缓存、但尚未发布过 cube 的测试表（可用 `docker exec cubic3-data-platform-backend python -m app.interfaces.cli asset list` 先看一遍有哪些候选表；避免选中 P0 现象描述里提到的 `dws_study_lesson_answer_stats_wide_df` 等 5 个已经"半发布"过的表，选一张全新的表，或者接受对已"半发布"表重新走 onboard 也可以观察是否补齐 YAML）。
3. 执行 `docker exec cubic3-data-platform-backend python -m app.interfaces.cli cube onboard --source-id <N> --database <D> --table <T> --columns-from <table_id> --publish --dry-run` 先预览，确认无误。
4. 执行 `docker exec cubic3-data-platform-backend python -m app.interfaces.cli cube onboard --source-id <N> --database <D> --table <T> --columns-from <table_id> --publish --yes` 真实发布。
5. 执行 `docker exec cubic3-data-platform-backend python -m app.interfaces.cli cube list 2>/dev/null`，确认新发布的 cube 出现在列表里（这是 P0 现象描述里此前完全看不到的）。
6. 用一个与该 cube 业务相关的问题执行 `docker exec cubic3-data-platform-backend python -m app.interfaces.cli intent answerability "<相关问题>" --runtime-mode official 2>/dev/null`，确认 state 不是 `out_of_coverage`（应为 `answerable`，或至少不再是因为"cube 不存在"导致的不可答）。
7. 交叉检查容器内 YAML 仓储目录 `app/infrastructure/semantic/cubes/`，确认新发布的 cube 对应的 YAML 文件确实存在（`docker exec cubic3-data-platform-backend ls app/infrastructure/semantic/cubes/ | grep <cube_name>`）。

把每一步的关键输出（cube_list 是否含新 cube、answerability 结果、YAML 文件是否存在）记录进本 task 的执行证据，供 SUMMARY 引用。如果第 5/6/7 步任一失败，说明 Task 1 的修复未完全生效，需要回到 Task 1 排查，不允许在验证失败的情况下把本 task 标记为完成。
  </action>
  <verify>
    <automated>docker exec cubic3-data-platform-backend python -m app.interfaces.cli cube list 2>/dev/null | grep -q "<真实发布的 cube_name>"</automated>
  </verify>
  <done>
    真实 `cube onboard --publish --yes` 发布后，`cube list` 能看到新 cube；`intent answerability` 对相关问题不再因"cube 不存在"判定不可答；YAML 仓储目录里确实存在对应 cube 文件。三项证据缺一不可。
  </done>
</task>

<task type="auto">
  <name>Task 3: P1-2 — 修正 deploy.sh 健康检查探测端口</name>
  <files>deploy.sh</files>
  <action>
`deploy.sh` 当前第 42 行探测 `http://localhost:5000/health`，但 `docker-compose.yml` 里 backend 服务只有 `expose: "5000"`（容器间可见），没有 `ports:` 映射到宿主机，从宿主机探测必然失败。真实可从宿主机访问的入口是 nginx（`ports: ["81:80"]`），第 41 行已经在探测 `http://localhost:81/health` 且注释正确标注"通过 nginx"。

修复：
1. 删除第 42 行对 `http://localhost:5000/health` 的直接探测（该地址从宿主机不可达，属于误导性检查，不是"探测地址错误、改个 URL"就能修好——因为该端口本来就没有暴露给宿主机）。
2. 同步修正脚本末尾的提示文案（当前"后端API: http://localhost:5000"同样具有误导性），改为准确描述："后端 API：通过 nginx 反向代理 http://localhost:81/api"（或视 nginx 实际 `/api` 转发规则确认准确路径前缀）。
3. 保持现有"失败只打印警告、不阻断部署"的语义不变——即第 41 行的 `curl -f ... || echo "警告: ..."` 写法不变，只是移除对不可达内部端口的重复探测。
4. 检查是否有其他脚本（如 `docs/runbooks/` 下的部署相关文档）也引用了 `localhost:5000` 作为宿主机可达地址，如有，一并标注或修正（若属于历史归档文档且非当前基线，跳过不改）。
  </action>
  <verify>
    <automated>grep -n "localhost:5000" deploy.sh || echo "no host-unreachable probe remains"</automated>
  </verify>
  <done>
    `deploy.sh` 不再探测宿主机不可达的 `http://localhost:5000/health`；健康检查失败仍只打印警告不阻断部署；脚本末尾提示文案与实际可达入口一致。
  </done>
</task>

<task type="auto">
  <name>Task 4: P1-3 — README 补充 CLI/skill 入口简介；P1-4 — 清理"GitLab CI 未就位"过时措辞</name>
  <files>README.md, Makefile</files>
  <action>
**P1-3（README CLI/skill 入口）**：
在顶层 `README.md` 的"常用命令"章节（第 320-379 行区间，紧邻现有 `cubic3-dp CLI` 相关命令块）补充一小段"语义建模 CLI（semctl）"简介，几行即可，不重写详细教程：
- 一句话说明：语义建设与调试（建 cube、发布、调试问数路由）有专用 CLI `semctl`（`python -m app.interfaces.cli`，容器内跑）。
- 指向完整命令参考：`app/interfaces/cli/README.md`。
- 指向对应 Claude Code skill：`skills/dp-semantic-builder/SKILL.md`（如需要说明用途，一句话："搭建/调试语义层基础设施本身时用这个 skill"）。
- 参考现有"常用命令"章节里 `# cubic3-dp CLI` / `# CLI Agent-First 自描述与认证` 的简洁风格，不要展开成教程。

**P1-4（清理过时措辞）**：
仓库实际已有 `.github/workflows/backend-ci.yml`、`frontend-ci.yml`、`docs-health.yml`、`lighthouse-ci-dispatch.yml` 四个真实生效的 GitHub Actions workflow。修正以下 4 处过时表述（均已定位到精确行号）：
1. `README.md:373`：`# 本地闸门（GitLab CI 基建未就位时的替代入口）` → 改为准确反映现状，例如 `# 本地闸门（与 GitHub Actions CI 保持一致的本地验证入口，见 .github/workflows/）`。
2. `README.md:383`：`仓库根目录放了一套基于 \`husky\` 的本地闸门，用来在 GitLab CI 上线前兜底：` → 改为例如 `仓库根目录放了一套基于 \`husky\` 的本地闸门，与 .github/workflows/ 下的 GitHub Actions CI 保持一致，用于本地提前捕获问题：`
3. `Makefile:156`：`@printf '%s\n' '本地闸门（GitLab CI 未就位时的替代入口）:'` → 改为例如 `@printf '%s\n' '本地闸门（与 GitHub Actions CI 保持一致的本地验证入口）:'`
4. `Makefile:520`：`# 本地闸门（GitLab CI 基建未就位时，替代 pipeline 的手动入口）` → 改为例如 `# 本地闸门（与 GitHub Actions CI 保持一致，供本地提前验证的手动入口）`

不要改动 `openspec/project.md:217`——那是一段泛化的"推荐实践 TBD"清单（"集成 GitHub Actions / GitLab CI 自动运行测试"），不是本任务描述的"声称 GitLab CI 未就位"这一具体过时措辞，语义不同，不在本次修复范围内。

改完后请再 grep 一次仓库确认没有遗漏：
```bash
grep -rn "GitLab CI" README.md Makefile docs/ scripts/ 2>/dev/null
```
如发现 `docs/` 或 `scripts/` 下还有类似"GitLab CI 未就位/基建未就位"的具体过时提法（不是泛化推荐清单），一并清理；如只是历史归档文档（`docs/archive/`），按 CLAUDE.md 约定不手改历史归档。
  </action>
  <verify>
    <automated>grep -q "semctl\|dp-semantic-builder" README.md && ! grep -n "GitLab CI 未就位\|GitLab CI 基建未就位" README.md Makefile</automated>
  </verify>
  <done>
    README.md 补充了几行"语义建模 CLI（semctl）/ skill 入口"简介并链接到 `app/interfaces/cli/README.md` 与 `skills/dp-semantic-builder/SKILL.md`；README.md 与 Makefile 内 4 处"GitLab CI 未就位/基建未就位"措辞已更新为准确反映现状（GitHub Actions CI 已生效）；`openspec/project.md:217` 未被误改动。
  </done>
</task>

</tasks>

<verification>
每个 task 完成后按其 `<verify>` 命令跑一次定向验证，全部改动完成后再跑一次整体回归确认不互相冲突：

```bash
# 后端定向回归（P0 + P1-1 相关测试目录）
docker exec cubic3-data-platform-backend bash -c "cd /app && python -m pytest --no-cov tests/unit/application/semantic tests/unit/infrastructure/semantic -q"

# 语义专项回归（确认不破坏既有 23 个已生效 cube 相关测试与 modeling_proposal_service/semantic_definition_service 既有用例）
docker exec cubic3-data-platform-backend bash -c "cd /app && python -m pytest --no-cov tests/unit -k 'semantic or modeling or cube' -q"

# 文档健康检查（P1-3/P1-4 涉及 README.md 改动）
make verify-docs

# 仓库级过时措辞清理确认
grep -rn "GitLab CI 未就位\|GitLab CI 基建未就位" README.md Makefile docs/ scripts/ 2>/dev/null || echo "clean"
```

P0 的端到端验证（Task 2）证据必须在 SUMMARY 中体现：新 cube 出现在 `cube list`、`intent answerability` 结果、YAML 文件存在性三项证据。
</verification>

<success_criteria>
- P0：通过标准 proposal 发布链路发布的 cube，能被 `SemanticDefinitionService.list_cubes()` / `ICubeRepository.get_cube(name)` 读到；真实容器内 `cube onboard --publish --yes` 后 `cube list` 可见新 cube，且相关问题的 `intent answerability` 从不可答变为可答。
- P1-1：并发场景下两次几乎同时的 upsert 竞争同一 asset key 不再抛出未处理的 `IntegrityError`，最终只产生一条资产记录；新增并发测试通过。
- P1-2：`deploy.sh` 不再探测宿主机不可达的 `http://localhost:5000/health`；健康检查失败仍只打印警告不阻断部署。
- P1-3：顶层 `README.md` 能在几行内发现 `semctl` / `cube onboard` / `dp-semantic-builder` skill 的入口线索，并链接到已有详细文档，不重复造轮子。
- P1-4：`README.md`、`Makefile` 内不再有"GitLab CI 未就位/基建未就位"的过时表述，措辞准确反映当前已生效的 GitHub Actions CI；`openspec/project.md` 泛化推荐清单未被误改。
- 5 项修复各自独立提交，互不依赖对方才能生效；`modeling_proposal_service.py` 内 P0 与 P1-1 相关改动共存于同一 task、diff 不冲突。
- 既有测试套件（尤其 `tests/unit/application/semantic/`、`tests/unit/infrastructure/semantic/`）全部保持通过，不引入回归。
</success_criteria>

<output>
After completion, create `.planning/quick/260701-gnt-p0-sql-registry-yaml-cube-4-p1-deploy-re/260701-gnt-SUMMARY.md`，需包含：
- 5 项修复的逐项完成状态与对应 commit（如已提交）
- Task 2 的端到端验证证据（cube list 输出片段、answerability 结果、YAML 文件路径确认）
- 任何偏离本 plan 描述的实现细节及原因
</output>
