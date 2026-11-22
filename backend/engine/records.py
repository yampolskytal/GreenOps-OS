"""Durable snapshots, change decisions, and parsed-source cache."""
import hashlib
import json
import sqlite3
import zlib
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()


class Records:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS snapshots
                    (id TEXT PRIMARY KEY, created TEXT, manifest TEXT, summary TEXT);
                CREATE TABLE IF NOT EXISTS cache (id TEXT PRIMARY KEY, payload BLOB);
                CREATE TABLE IF NOT EXISTS journal
                    (seq INTEGER PRIMARY KEY, created TEXT, actor TEXT, run TEXT, kind TEXT, payload TEXT);
                CREATE INDEX IF NOT EXISTS journal_run ON journal(run, kind, seq);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def cached(self, identity):
        with self.connection() as db:
            row = db.execute("SELECT payload FROM cache WHERE id=?", (identity,)).fetchone()
        return json.loads(zlib.decompress(row[0])) if row else None

    def cache(self, identity, value):
        payload = zlib.compress(json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), level=3)
        with self.connection() as db:
            db.execute("INSERT OR IGNORE INTO cache VALUES (?,?)", (identity, payload))

    def snapshot(self, manifest, summary):
        stamp = fingerprint(manifest)
        with self.connection() as db:
            db.execute("INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?)", (
                stamp, datetime.now(UTC).isoformat(), json.dumps(manifest), json.dumps(summary)))
        return stamp

    def snapshots(self, limit=50):
        with self.connection() as db:
            return [{"id": r["id"], "created": r["created"], "manifest": json.loads(r["manifest"]),
                     "summary": json.loads(r["summary"])} for r in db.execute(
                         "SELECT * FROM snapshots ORDER BY created DESC LIMIT ?", (limit,))]

    def append(self, actor, run, kind, payload):
        with self.connection() as db:
            cursor = db.execute("INSERT INTO journal(created,actor,run,kind,payload) VALUES (?,?,?,?,?)", (
                datetime.now(UTC).isoformat(), actor, run, kind, json.dumps(payload, ensure_ascii=False)))
            return cursor.lastrowid

    def history(self, run, kind, limit=100):
        with self.connection() as db:
            return [dict(row) | {"payload": json.loads(row["payload"])} for row in db.execute(
                "SELECT * FROM journal WHERE run=? AND kind=? ORDER BY seq DESC LIMIT ?", (run, kind, limit))]
