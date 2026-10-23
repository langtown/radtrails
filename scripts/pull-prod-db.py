#!/usr/bin/env python3
"""Read production via Wrangler; stage and validate SQLite before local replacement."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import shlex
import sqlite3
import subprocess
import tempfile


def assert_stopped(state):
    # An open workerd handle would continue using the old database after a swap.
    for process in Path('/proc').glob('[0-9]*'):
        try:
            for fd in (process / 'fd').iterdir():
                try:
                    target = fd.resolve()
                    if target.is_relative_to(state):
                        raise RuntimeError('Local D1 is in use. Stop make dev / preview before pulling production.')
                except (FileNotFoundError, PermissionError):
                    pass
        except (FileNotFoundError, PermissionError):
            pass


def validate(db):
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise RuntimeError('SQLite integrity check failed; local state was not replaced.')
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise RuntimeError('Foreign-key check failed; local state was not replaced.')


def import_snapshot(snapshot, target):
    # SQLite accepts large BLOB literals that exceed workerd's SQL text limit.
    # This is only a new staging file; never import directly over active local data.
    with closing(sqlite3.connect(target)) as db:
        db.executescript(snapshot.read_text())
        validate(db)
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='d1_migrations'").fetchone():
            raise RuntimeError('Snapshot lacks migration history; refusing to guess the production schema.')
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, help='Reuse a previously downloaded full SQL snapshot')
    parser.add_argument('--wrangler', default='npx wrangler')
    parser.add_argument('--database', default='DB')
    parser.add_argument('--backup-dir', type=Path, default=Path('.local/d1-backups'))
    parser.add_argument('--state-dir', type=Path, default=Path('.wrangler/state/v3/d1'))
    args = parser.parse_args()
    os.umask(0o077)
    state = args.state_dir.resolve()
    backups = args.backup_dir.resolve()
    backups.mkdir(parents=True, exist_ok=True)
    assert_stopped(state)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    snapshot = args.snapshot.resolve() if args.snapshot else backups / f'prod-{stamp}.sql'
    old_state = backups / f'local-state-{stamp}'
    cli = shlex.split(args.wrangler)

    def run(*arguments):
        result = subprocess.run(cli + list(arguments), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        # Do not print SQL data or temporary signed export-download URLs.
        log = backups / f'pull-{stamp}.log'
        with log.open('a') as stream:
            stream.write(result.stdout)
        if result.returncode:
            raise RuntimeError(f'Wrangler {arguments[1]} failed. Details: {log}')

    if args.snapshot:
        if not snapshot.is_file():
            raise RuntimeError('Snapshot file does not exist.')
    else:
        print('Exporting full production snapshot (read-only)...', flush=True)
        run('d1', 'export', args.database, '--remote', '--output', str(snapshot), '--skip-confirmation')
    # Place staging on the same filesystem as local state so installation is a rename.
    state.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.d1-pull-', dir=state.parent) as temporary:
        staging = Path(temporary)
        run('d1', 'execute', args.database, '--local', '--persist-to', str(staging),
            '--command', 'SELECT 1', '--yes')
        candidates = [p for p in staging.rglob('*.sqlite') if p.name != 'metadata.sqlite']
        if len(candidates) != 1:
            raise RuntimeError('Unexpected Wrangler persistence layout; refusing to replace local state.')
        print('Importing snapshot and validating image BLOBs in staging...', flush=True)
        import_snapshot(snapshot, candidates[0])
        print('Applying pending migrations to the staged local copy...', flush=True)
        run('d1', 'migrations', 'apply', args.database, '--local', '--persist-to', str(staging))
        with closing(sqlite3.connect(candidates[0])) as db:
            validate(db)
            db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        staged_state = candidates[0].parent.parent
        assert_stopped(state)
        # Keep an intact, restorable copy of the previous database and its WAL files.
        moved = False
        if state.exists():
            state.rename(old_state)
            moved = True
        try:
            staged_state.rename(state)
        except BaseException:
            if moved:
                old_state.rename(state)
            raise
    print(f'Local D1 now contains production data plus pending local migrations.\nSnapshot: {snapshot}')
    if moved:
        print(f'Previous local state: {old_state}')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, sqlite3.Error, OSError) as error:
        raise SystemExit(f'Database pull failed: {error}') from None
