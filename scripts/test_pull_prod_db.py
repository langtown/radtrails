import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('pull', Path(__file__).with_name('pull-prod-db.py'))
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)


class SnapshotTests(unittest.TestCase):
    def test_large_blob_and_migration_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            blob = b'photo' * 160_000
            snapshot = root / 'snapshot.sql'
            snapshot.write_text('CREATE TABLE d1_migrations(name TEXT);'
                                "INSERT INTO d1_migrations VALUES('0001.sql');"
                                'CREATE TABLE images(id INTEGER PRIMARY KEY, bytes BLOB);'
                                f"INSERT INTO images VALUES(1,X'{blob.hex()}');")
            pull.import_snapshot(snapshot, root / 'staged.sqlite')
            with sqlite3.connect(root / 'staged.sqlite') as db:
                self.assertEqual(db.execute('SELECT bytes FROM images').fetchone()[0], blob)
                self.assertEqual(db.execute('SELECT name FROM d1_migrations').fetchone()[0], '0001.sql')

    def test_invalid_foreign_key_rejects_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / 'snapshot.sql'
            snapshot.write_text('CREATE TABLE d1_migrations(name TEXT);'
                                'CREATE TABLE parent(id INTEGER PRIMARY KEY);'
                                'CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));'
                                'INSERT INTO child VALUES(99);')
            with self.assertRaisesRegex(RuntimeError, 'Foreign-key'):
                pull.import_snapshot(snapshot, root / 'staged.sqlite')

    def test_missing_migration_history_rejects_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / 'snapshot.sql'
            snapshot.write_text('CREATE TABLE images(id INTEGER);')
            with self.assertRaisesRegex(RuntimeError, 'migration history'):
                pull.import_snapshot(snapshot, root / 'staged.sqlite')


if __name__ == '__main__':
    unittest.main()
