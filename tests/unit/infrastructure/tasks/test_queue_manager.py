import runpy
from datetime import datetime
from unittest.mock import MagicMock, Mock, patch

from app.shared.enums import TaskStatus


def _build_manager(app, redis_conn=None, queue=None, redis_url='redis://redis.local:6379/9'):
    redis_conn = redis_conn or object()
    queue = queue or MagicMock()

    with patch('app.infrastructure.tasks.task_queue.Redis.from_url', return_value=redis_conn) as mock_from_url:
        with patch('app.infrastructure.tasks.task_queue.Queue', return_value=queue) as mock_queue:
            with app.app_context():
                from app.infrastructure.tasks.task_queue import TaskQueueManager

                manager = TaskQueueManager(redis_url=redis_url)

    return manager, mock_from_url, mock_queue, redis_conn, queue


def test_task_queue_manager_initializes_queue_and_redis(app):
    manager, mock_from_url, mock_queue, redis_conn, queue = _build_manager(app)

    assert manager.redis_conn is redis_conn
    assert manager.queue is queue
    mock_from_url.assert_called_once_with(
        'redis://redis.local:6379/9',
        socket_timeout=10,
        socket_connect_timeout=10,
        socket_keepalive=True,
        retry_on_timeout=False,
        max_connections=50,
    )
    mock_queue.assert_called_once_with('default', connection=redis_conn)


def test_task_queue_manager_uses_flask_config_when_redis_url_missing(app):
    redis_conn = object()
    queue = MagicMock()

    with patch('app.infrastructure.tasks.task_queue.Redis.from_url', return_value=redis_conn) as mock_from_url:
        with patch('app.infrastructure.tasks.task_queue.Queue', return_value=queue):
            with app.app_context():
                app.config['REDIS_URL'] = 'redis://from-config:6379/2'
                from app.infrastructure.tasks.task_queue import TaskQueueManager

                manager = TaskQueueManager()

    assert manager.redis_url == 'redis://from-config:6379/2'
    mock_from_url.assert_called_once()


def test_enqueue_helpers_and_generic_enqueue_delegate_to_queue(app):
    queue = MagicMock()
    queue.enqueue.side_effect = [MagicMock(id='job-extraction'), MagicMock(id='job-query'), 'generic-job']
    manager, _, _, _, _ = _build_manager(app, queue=queue)

    extraction_job_id = manager.enqueue_extraction_task(101)
    sql_job_id = manager.enqueue_sql_query(202)
    generic_job = manager.enqueue('tasks.sync', 1, force=True)

    assert extraction_job_id == 'job-extraction'
    assert sql_job_id == 'job-query'
    assert generic_job == 'generic-job'
    assert queue.enqueue.call_count == 3
    assert queue.enqueue.call_args_list[0].args[1] == 101
    assert queue.enqueue.call_args_list[1].args[1] == 202
    assert queue.enqueue.call_args_list[2].args == ('tasks.sync', 1)
    assert queue.enqueue.call_args_list[2].kwargs == {'force': True}


def test_get_job_status_covers_success_and_not_found(app):
    manager, _, _, redis_conn, _ = _build_manager(app)
    job = MagicMock()
    job.id = 'job-1'
    job.get_status.return_value = 'finished'
    job.result = {'ok': True}
    job.exc_info = None
    job.created_at = datetime(2026, 3, 25, 10, 0, 0)
    job.started_at = datetime(2026, 3, 25, 10, 1, 0)
    job.ended_at = datetime(2026, 3, 25, 10, 2, 0)

    with patch('rq.job.Job.fetch', return_value=job) as mock_fetch:
        status = manager.get_job_status('job-1')

    assert status == {
        'job_id': 'job-1',
        'status': 'finished',
        'result': {'ok': True},
        'exc_info': None,
        'created_at': '2026-03-25T10:00:00',
        'started_at': '2026-03-25T10:01:00',
        'ended_at': '2026-03-25T10:02:00',
    }
    mock_fetch.assert_called_once_with('job-1', connection=redis_conn)

    with patch('rq.job.Job.fetch', side_effect=RuntimeError('missing job')):
        status = manager.get_job_status('job-404')

    assert status == {
        'job_id': 'job-404',
        'status': 'not_found',
        'error': 'missing job',
    }


def test_recover_pending_tasks_handles_success_failure_and_close(app):
    manager, _, _, _, _ = _build_manager(app)
    manager.enqueue_extraction_task = Mock(side_effect=['job-1', RuntimeError('queue offline')])

    run_ok = MagicMock()
    run_ok.id = 1
    run_ok.status = TaskStatus.RUNNING.value

    run_fail = MagicMock()
    run_fail.id = 2
    run_fail.status = TaskStatus.RUNNING.value
    run_fail.mark_as_failed = MagicMock()

    session = MagicMock()
    session.query.return_value.filter_by.return_value.all.return_value = [run_ok, run_fail]

    with patch('app.infrastructure.tasks.task_queue.get_db_session', return_value=session):
        manager.recover_pending_tasks()

    assert run_ok.status == TaskStatus.PENDING.value
    assert run_fail.status == TaskStatus.PENDING.value
    run_fail.mark_as_failed.assert_called_once_with('Recovery failed: queue offline')
    assert session.commit.call_count == 3
    session.close.assert_called_once()


def test_recover_pending_tasks_handles_query_failure_and_closes_session(app):
    manager, _, _, _, _ = _build_manager(app)
    session = MagicMock()
    session.query.side_effect = RuntimeError('db unavailable')

    with patch('app.infrastructure.tasks.task_queue.get_db_session', return_value=session):
        manager.recover_pending_tasks()

    session.close.assert_called_once()


def test_get_queue_info_covers_success_and_error(app):
    queue = MagicMock()
    queue.name = 'default'
    queue.__len__.return_value = 3
    queue.failed_job_registry.__len__.return_value = 1
    queue.finished_job_registry.__len__.return_value = 5
    manager, _, _, _, _ = _build_manager(app, queue=queue)

    assert manager.get_queue_info() == {
        'name': 'default',
        'count': 3,
        'failed_count': 1,
        'finished_count': 5,
    }

    broken_queue = MagicMock()
    broken_queue.name = 'default'
    broken_queue.__len__.side_effect = RuntimeError('queue unavailable')
    manager.queue = broken_queue

    assert manager.get_queue_info() == {'error': 'queue unavailable'}


def test_start_worker_uses_env_default_and_runs_worker(monkeypatch):
    redis_conn = object()
    worker = MagicMock()

    monkeypatch.setenv('REDIS_URL', 'redis://env-redis:6379/3')

    with patch('app.infrastructure.tasks.rq_worker.Redis.from_url', return_value=redis_conn) as mock_from_url:
        with patch('app.infrastructure.tasks.rq_worker.Worker', return_value=worker) as mock_worker:
            from app.infrastructure.tasks.rq_worker import start_worker

            start_worker()

    mock_from_url.assert_called_once_with('redis://env-redis:6379/3')
    mock_worker.assert_called_once_with(['default'], connection=redis_conn)
    worker.work.assert_called_once()


def test_rq_worker_main_entrypoint_invokes_start_worker(monkeypatch):
    worker = MagicMock()

    monkeypatch.setenv('REDIS_URL', 'redis://main-redis:6379/4')
    monkeypatch.setattr('redis.Redis.from_url', lambda url: object())
    monkeypatch.setattr('rq.Worker', lambda queues, connection: worker)

    runpy.run_module('app.infrastructure.tasks.rq_worker', run_name='__main__')

    worker.work.assert_called_once()
