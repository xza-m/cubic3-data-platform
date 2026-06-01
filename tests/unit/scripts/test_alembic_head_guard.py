from pathlib import Path

from scripts.checks import alembic_head_guard as guard


def _write_revision(
    versions_dir: Path,
    filename: str,
    *,
    revision: str,
    down_revision: str | None,
) -> None:
    down_literal = "None" if down_revision is None else repr(down_revision)
    (versions_dir / filename).write_text(
        "\n".join(
            [
                f'revision = "{revision}"',
                f"down_revision = {down_literal}",
                "branch_labels = None",
                "depends_on = None",
            ]
        ),
        encoding="utf-8",
    )


def test_alembic_guard_rejects_revision_ids_longer_than_alembic_version_column(tmp_path):
    _write_revision(
        tmp_path,
        "0001_initial.py",
        revision="0001_initial",
        down_revision=None,
    )
    too_long = "0002_this_revision_identifier_is_too_long"
    _write_revision(
        tmp_path,
        "0002_too_long.py",
        revision=too_long,
        down_revision="0001_initial",
    )

    report = guard.analyze(tmp_path)

    assert not report.ok
    assert report.revision_id_length_violations == [
        ("0002_too_long.py", too_long, len(too_long)),
    ]
