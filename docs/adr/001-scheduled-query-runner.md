<!-- docs/adr/001-scheduled-query-runner.md -->

# ADR-001: ScheduledQuery 运行器选型

- **状态**：accepted（W3 落地）
- **决策日期**：TBD（W3 完成）
- **决策人**：BE Lead
- **关联 plan**：[02 §B-back-8](../superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md)

## 背景

新增 `scheduled_queries` 表后，需要一个调度器周期性触发 `next_run_at` 到期的 query，
并把结果写入 `scheduled_query_runs` 表。

## 选项

  | 选项 | 优 | 劣 |
  | --- | --- | --- |
  | APScheduler（in-process） | 部署最简单，与现有 Flask 进程共享生命周期 | 多进程下需选主；横向扩展困难 |
  | Celery beat | 业界标准，与 worker 解耦，水平扩展容易 | 引入 broker（redis）+ 多进程，运维成本上升 |
  | RQ scheduler | 比 Celery 轻；同样基于 redis | 社区活跃度低；生态较小 |

## 决策

**本期（W3~W4）采用 APScheduler in-process（候选 A）。**

- 包：`APScheduler==3.x`，已在 `app/extensions.py` 中以 `Flask-APScheduler` 包装。
- 启动钩子：`app/infrastructure/queries/scheduled_query_runner.reload_all_scheduled_queries()`
  由 `app/__init__.py` 在 `init_jobs()` 后调用。
- Job 注册：`CronTrigger.from_crontab(cron, timezone=tz)` 解析 5 段 cron；
  每次 enable/disable/update 后同步 APScheduler job（add/remove）。
- 注意：多 Gunicorn worker 需用 `--workers=1` 或 `preload_app=True` 避免重复触发；
  生产建议用 `--workers=1 --threads=N` 方案。

后续升级路径（如需横向扩展）：替换为 Celery beat + Redis broker，
接口层（`ScheduledQueryService`）不变，仅替换 runner 注册逻辑。

## 影响

- 代码：`app/infrastructure/scheduler/`
- 运维：是否需要新增 redis / worker
- 后续：影响 B-back-9 是否复用同一调度框架做清理 job

## 参考资料

- [APScheduler 文档](https://apscheduler.readthedocs.io/)
- [Celery beat](https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html)
