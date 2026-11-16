"""Local disk cache manager for Nodivium."""
import os
import diskcache
from pathlib import Path


def get_cache_dir() -> Path:
    """Return platform-appropriate cache directory."""
    if os.name == "nt":  # Windows
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:  # Linux/Mac
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    cache_dir = base / "nodivium"
    old_dir = base / "biofetch"
    if not cache_dir.exists() and old_dir.exists():
        try:
            old_dir.rename(cache_dir)
        except OSError:
            return old_dir  # An older process may still have the cache open.
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def get_cache(ttl_days: int = 7) -> diskcache.Cache:
    """Return a diskcache.Cache instance with TTL in days."""
    return diskcache.Cache(str(get_cache_dir()), timeout=1)


def make_key(source: str, accession: str, fmt: str, db: str = "") -> str:
    return f"{source}:{db}:{accession}:{fmt}" if db else f"{source}:{accession}:{fmt}"


class BioCache:
    def __init__(self, ttl_days: int = 7):
        self.cache = get_cache(ttl_days)
        self.ttl = ttl_days * 86400  # convert to seconds

    def get(self, source: str, accession: str, fmt: str, db: str = ""):
        key = make_key(source, accession, fmt, db)
        return self.cache.get(key)

    def set(self, source: str, accession: str, fmt: str, data, db: str = ""):
        key = make_key(source, accession, fmt, db)
        self.cache.set(key, data, expire=self.ttl)

    def delete(self, source: str, accession: str, fmt: str, db: str = "") -> bool:
        key = make_key(source, accession, fmt, db)
        return self.cache.delete(key)

    def clear(self):
        self.cache.clear()

    def stats(self) -> dict:
        size_bytes = sum(
            (get_cache_dir() / f).stat().st_size
            for f in os.listdir(get_cache_dir())
            if (get_cache_dir() / f).is_file()
        )
        return {
            "count": len(self.cache),
            "size_bytes": size_bytes,
            "cache_dir": str(get_cache_dir()),
        }

    def list_keys(self) -> list:
        return list(self.cache.iterkeys())

    def close(self):
        self.cache.close()
