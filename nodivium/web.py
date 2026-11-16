"""Local Nodivium web service. Run with ``nodivium web``."""

from __future__ import annotations

import io
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from nodivium import __version__
from nodivium.cache import BioCache
from nodivium.service import FORMATS, Target, fetch, parse_genbank_features, record, search

app = FastAPI(title="Nodivium", version=__version__)
_cache: BioCache | None = None
DIST = Path(__file__).resolve().parent / "static"


def cache() -> BioCache:
    global _cache
    if _cache is None:
        _cache = BioCache()
    return _cache


def target_or_400(source: str, identifier: str, db: str) -> Target:
    try:
        return Target(source, identifier, db)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


def fetch_cached(target: Target, fmt: str) -> tuple[str, bool]:
    if fmt not in target.formats:
        raise ValueError(f"Choose a supported format: {', '.join(target.formats)}")
    value = cache().get(target.source, target.identifier, fmt, target.db)
    if value is not None:
        return value, True
    value = fetch(target, fmt)
    if not value:
        raise LookupError("The source returned no record content.")
    cache().set(target.source, target.identifier, fmt, value, target.db)
    return value, False


def upstream_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    if "NODIVIUM_NCBI_EMAIL" in str(exc):
        return HTTPException(503, str(exc))
    return HTTPException(502, f"Source request failed: {exc}")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__}


@app.get("/api/sources")
def sources():
    return {"sources": [{"source": source, "db": db, "formats": formats}
                        for (source, db), formats in FORMATS.items()]}


@app.get("/api/search")
def search_api(q: str, source: str = "uniprot", db: str = "", limit: int = 10, reviewed: bool = False):
    try:
        return search(q, source, db, limit, reviewed)
    except Exception as exc:
        raise upstream_error(exc) from exc


@app.get("/api/records/{source}/{identifier}")
def record_api(source: str, identifier: str, db: str = ""):
    target = target_or_400(source, identifier, db)
    try:
        return record(target)
    except Exception as exc:
        raise upstream_error(exc) from exc


@app.get("/api/records/{source}/{identifier}/content")
def content_api(source: str, identifier: str, db: str = "", fmt: str = ""):
    target = target_or_400(source, identifier, db)
    try:
        content, from_cache = fetch_cached(target, fmt or target.default_format)
        if len(content.encode("utf-8")) > 2_000_000:
            raise ValueError("This record is too large to preview; use Download instead.")
        return {"content": content, "format": fmt or target.default_format, "from_cache": from_cache}
    except Exception as exc:
        raise upstream_error(exc) from exc


@app.get("/api/records/{source}/{identifier}/annotations")
def annotations_api(source: str, identifier: str, db: str = ""):
    target = target_or_400(source, identifier, db)
    if target.source != "ncbi" or target.db not in {"nucleotide", "protein"}:
        raise HTTPException(400, "Sequence feature annotations are available for NCBI nucleotide and protein records.")
    try:
        content, _ = fetch_cached(target, "genpept" if target.db == "protein" else "genbank")
        if len(content.encode("utf-8")) > 5_000_000:
            raise ValueError("This record is too large for feature preview; download the source record.")
        return {"features": parse_genbank_features(content)}
    except Exception as exc:
        raise upstream_error(exc) from exc


@app.get("/api/records/{source}/{identifier}/download")
def download_api(source: str, identifier: str, db: str = "", fmt: str = ""):
    target = target_or_400(source, identifier, db)
    selected = fmt or target.default_format
    try:
        content, _ = fetch_cached(target, selected)
    except Exception as exc:
        raise upstream_error(exc) from exc
    suffix = {"genbank": "gb", "genpept": "gp", "gene_table": "txt", "medline": "txt", "abstract": "txt"}.get(selected, selected)
    filename = f"nodivium_{target.identifier}.{suffix}"
    return Response(content, media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


class CollectionItem(BaseModel):
    source: str
    identifier: str
    db: str = ""
    fmt: str = ""


class CollectionRequest(BaseModel):
    items: list[CollectionItem] = Field(min_length=1, max_length=25)


@app.post("/api/collections/export")
def collection_export(request: CollectionRequest):
    output = io.BytesIO()
    manifest = {"nodivium_version": __version__, "exported_at": datetime.now(timezone.utc).isoformat(), "records": []}
    total_bytes = 0
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, item in enumerate(request.items, 1):
            row = {"source": item.source, "database": item.db, "id": item.identifier,
                   "format": item.fmt}
            try:
                target = Target(item.source, item.identifier, item.db)
                fmt = item.fmt or target.default_format
                row.update({"source": target.source, "database": target.db, "id": target.identifier,
                            "format": fmt, "source_url": target.source_url})
                content, was_cached = fetch_cached(target, fmt)
                encoded = content.encode("utf-8")
                if total_bytes + len(encoded) > 20_000_000:
                    raise ValueError("Collection exceeds the 20 MB export limit.")
                filename = f"records/{index:02d}_{target.source}_{target.identifier}.{fmt}"
                archive.writestr(filename, encoded)
                total_bytes += len(encoded)
                row.update({"status": "ok", "file": filename, "bytes": len(encoded),
                            "sha256": hashlib.sha256(encoded).hexdigest(), "from_cache": was_cached})
            except Exception as exc:
                row.update({"status": "failed", "error": str(exc)})
            manifest["records"].append(row)
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
    failed = sum(row["status"] == "failed" for row in manifest["records"])
    return Response(output.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="nodivium-collection.zip"',
                             "X-Nodivium-Failed": str(failed)})


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "API route not found.")
    root = DIST.resolve()
    candidate = (root / path).resolve()
    if path and candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    index = root / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(404, "Web assets are not built. Run 'npm install && npm run build' in web/.")
