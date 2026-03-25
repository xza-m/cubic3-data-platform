# Concerns

以下内容基于当前代码与当前基线文档整理，重点记录可维护性、运行风险和质量缺口。每条都给出证据路径，便于后续按点复核。

## 1. 语义建模链路存在重复实现，后续很容易分叉

- 影响面：语义中心的 Cube 草稿、领域画布、发布、校验和可视化编排。
- 为什么重要：当前有两套相近但不完全一致的建模入口，改一处时很容易漏掉另一处，导致 UI 行为、校验规则或发布约束不一致。
- 证据路径：
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/RelationCanvas.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/domainCanvasState.ts`
  - `frontend/src/components/Semantic/CubeStudio/CubeStudioTaskPanel.tsx`
- 观察点：
  - 如果后续继续扩展语义建模，优先抽共享的草稿、发布和验证逻辑，不要继续在页面层复制。
  - 需要确认两条入口的路由、状态机和字段命名是否仍然保持兼容。

## 2. 认证状态依赖 `localStorage`，并直接触发整页跳转

- 影响面：登录、鉴权、401 恢复、浏览器会话一致性。
- 为什么重要：`localStorage` 中的 token 对同域脚本可读，页面内任意 XSS 都能拿到凭证；同时，401 后直接跳转登录页，容易掩盖是 token 过期、后端异常还是代理问题。
- 证据路径：
  - `frontend/src/api/client.ts`
  - `frontend/src/pages/Login.tsx`
  - `app/interfaces/api/middleware/auth.py`
- 观察点：
  - 我推断当前实现没有刷新令牌或 httpOnly cookie 保护，如果安全策略不是很强，这会是长期风险。
  - 需要重点监控登录态失效后的重定向循环，以及多标签页下的 token 清理一致性。

## 3. 后端边界层大量使用宽泛异常捕获，故障信号容易被稀释

- 影响面：查询、语义、消息、任务、启动钩子、外部集成。
- 为什么重要：大量 `except Exception` 会把根因压成通用错误或静默降级，短期看“页面没崩”，长期会让真实故障更难定位，也更难做告警分级。
- 证据路径：
  - `app/interfaces/api/v1/queries.py`
  - `app/interfaces/api/v1/semantic.py`
  - `app/__init__.py`
  - `app/infrastructure/events/event_bus.py`
  - `app/infrastructure/tasks/task_queue.py`
  - `app/infrastructure/adapters/datasources/*.py`
- 观察点：
  - 把宽泛捕获限制在最外层边界，内部尽量抛出可区分的领域异常。
  - 对启动阶段的 `warning` 级降级路径单独做健康检查，否则“服务起来了”不等于核心能力可用。

## 4. 权限与治理逻辑仍有明显占位实现

- 影响面：数据集访问、字段访问、行级过滤、配额控制、应用实例治理。
- 为什么重要：如果这些服务已经进入请求路径，当前行为会偏“默认放行”或“只做结构校验”，对数据隔离和治理不是足够强的约束。
- 证据路径：
  - `app/domain/services/permission_checker.py`
  - `app/domain/entities/app_instance.py`
  - `app/domain/entities/app_definition.py`
  - `app/interfaces/api/v1/app_instances.py`
- 观察点：
  - 我推断这些逻辑还没有形成真正的统一授权层，而是停留在业务可用性优先的阶段。
  - 后续若引入更细粒度权限，建议先明确“功能访问”与“安全授权”的边界，再把默认放行点逐个收紧。

## 5. 后端缺少统一 lint / typecheck / contract 门禁，API 漂移更依赖人工发现

- 影响面：Python 代码质量、接口契约、变更交付门槛。
- 为什么重要：当前仓库的固定验证入口偏向前端，后端静态检查、类型检查和契约检查都还没有成为默认门禁，后端 API 改动更容易在评审后或联调时才暴露问题。
- 证据路径：
  - `docs/quality/testing.md`
  - `frontend/package.json`
  - `README.md`
  - `frontend/README.md`
- 观察点：
  - `docs/quality/testing.md` 已明确写明 `make lint-backend`、`make typecheck-backend`、`make typecheck-contracts` 等仍是 `skip`。
  - 每次改 Python API、请求/响应结构或业务服务时，应该把定向测试和联调验证当成最低保障，而不是只依赖现有自动门禁。

## 6. 兼容分支和兜底逻辑较多，当前合同边界不够“单一”

- 影响面：语义目录、视图发布、域建模、前后端接口协同。
- 为什么重要：兼容旧字段、旧路由、旧引用格式的逻辑越多，越难判断某个值到底是规范输入还是历史遗留；这会拖慢重构，也会让测试矩阵越来越大。
- 证据路径：
  - `frontend/src/api/client.ts` 中对 `/semantic/catalogs` 的 404 特判
  - `app/interfaces/api/v1/semantic.py` 中 `_extract_view_cube_name()` 对字符串和对象引用的双兼容
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx` 中 `domain.id || domain.code` 的双入口跳转
  - `frontend/src/pages/Semantic/DevTools.tsx`、`frontend/src/pages/Semantic/ViewDetail.tsx` 中对状态和资源选择的多重兜底
- 观察点：
  - 这些分支大概率是迁移期遗留，我的判断是它们短期内合理，但需要持续收敛。
  - 建议为每个兼容点注明“仍需支持的原因”和“移除条件”，否则会变成永久负担。

## 7. 启动时副作用较多，Web 进程承担了不少非请求职责

- 影响面：应用启动时间、稳定性、测试隔离、故障定位。
- 为什么重要：`app/__init__.py` 在创建 Web 应用时同时做了路由注册、调度器初始化、种子数据加载、事件处理器注册和飞书长连接启动。任何一个子系统出问题，都可能让“应用初始化成功”与“核心能力就绪”脱节。
- 证据路径：
  - `app/__init__.py`
  - `app/infrastructure/scheduler.py`
  - `app/infrastructure/adapters/feishu/ws_event_handler.py`
  - `app/infrastructure/seed.py`
- 观察点：
  - 如果后续扩容部署或拆分进程角色，建议把这些副作用能力拆成可观测、可回滚的独立步骤。
  - 至少要区分“启动成功”“调度成功”“外部连接成功”三个状态，而不是只看 Flask 进程是否返回。

