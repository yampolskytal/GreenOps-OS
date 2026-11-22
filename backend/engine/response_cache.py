"""Bounded in-memory cache of serialized API responses with single-flight computation.

Each workspace owns one cache, so rebuilding or importing a dataset (a new workspace)
discards every cached response. Callers put any other mutable input — such as the
review journal position — into the key. Only successful results are stored; errors
are re-raised to every waiting request and computed again on the next call.
"""
import json
import threading
from collections import OrderedDict


def encode(payload):
    """Serialize exactly as the HTTP service does, so cached and uncached bytes are identical."""
    return json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()


def key_of(*parts):
    return json.dumps(parts, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


class _Flight:
    __slots__ = ("done", "value", "error")

    def __init__(self):
        self.done = threading.Event()
        self.value = self.error = None


class ResponseCache:
    def __init__(self, max_bytes=24 * 1024 * 1024, max_entry_bytes=2 * 1024 * 1024):
        self.max_bytes, self.max_entry_bytes = max_bytes, max_entry_bytes
        self._entries = OrderedDict()
        self._flights = {}
        self._size = 0
        self._lock = threading.Lock()
        self.hits = self.misses = self.joined = 0

    def get_or_compute(self, key, compute):
        """Return (bytes, outcome) where outcome is "hit", "miss" or "joined"."""
        with self._lock:
            body = self._entries.get(key)
            if body is not None:
                self._entries.move_to_end(key)
                self.hits += 1
                return body, "hit"
            flight = self._flights.get(key)
            leader = flight is None
            if leader:
                flight = self._flights[key] = _Flight()
                self.misses += 1
            else:
                self.joined += 1
        if not leader:
            flight.done.wait()
            if flight.error is not None:
                raise flight.error
            return flight.value, "joined"
        try:
            flight.value = encode(compute())
        except BaseException as error:
            flight.error = error
            raise
        finally:
            with self._lock:
                self._flights.pop(key, None)
                if flight.error is None:
                    self._store(key, flight.value)
            flight.done.set()
        return flight.value, "miss"

    def _store(self, key, body):
        if len(body) > self.max_entry_bytes:
            return
        self._entries[key] = body
        self._size += len(key) + len(body)
        while self._size > self.max_bytes and self._entries:
            evicted_key, evicted = self._entries.popitem(last=False)
            self._size -= len(evicted_key) + len(evicted)

    def stats(self):
        with self._lock:
            return {"entries": len(self._entries), "bytes": self._size, "hits": self.hits,
                    "misses": self.misses, "joined": self.joined}
