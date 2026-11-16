"""NCBI Entrez fetcher for nucleotide, protein, and gene records."""
import time
from typing import Optional
from Bio import Entrez, SeqIO
import io
import os
import json
import re


Entrez.tool = "Nodivium"


def configure_entrez() -> None:
    """Attach a real contact address and optional key to NCBI requests."""
    email = (os.environ.get("NODIVIUM_NCBI_EMAIL") or os.environ.get("BIOFETCH_NCBI_EMAIL", "")).strip()
    if not email or "@" not in email:
        raise RuntimeError("NCBI access needs a contact email. Set NODIVIUM_NCBI_EMAIL to your address.")
    Entrez.email = email
    Entrez.api_key = (os.environ.get("NODIVIUM_NCBI_API_KEY") or os.environ.get("BIOFETCH_NCBI_API_KEY", "")).strip() or None


NCBI_DB_MAP = {
    "nucleotide": "nucleotide",
    "nt": "nucleotide",
    "protein": "protein",
    "prot": "protein",
    "gene": "gene",
    "pubmed": "pubmed",
    "taxonomy": "taxonomy",
}

FORMAT_MAP = {
    "fasta": ("fasta", "text"),
    "genbank": ("gb", "text"),
    "gb": ("gb", "text"),
    "xml": ("xml", "xml"),
    "text": ("text", "text"),
}

DATABASE_FORMATS = {
    "nucleotide": {"fasta": ("fasta", "text"), "genbank": ("gb", "text"), "xml": ("gb", "xml")},
    "protein": {"fasta": ("fasta", "text"), "genpept": ("gp", "text"), "xml": ("gp", "xml")},
    "gene": {"xml": (None, "xml"), "gene_table": ("gene_table", "text")},
    "pubmed": {"xml": (None, "xml"), "medline": ("medline", "text"), "abstract": ("abstract", "text")},
}


def search_ncbi(query: str, db: str = "nucleotide", max_results: int = 10) -> dict:
    """Search NCBI and return a list of IDs and metadata."""
    db = NCBI_DB_MAP.get(db.lower(), db)
    configure_entrez()
    handle = Entrez.esearch(db=db, term=query, retmax=max_results, usehistory="y")
    record = Entrez.read(handle)
    handle.close()
    return {
        "ids": record["IdList"],
        "count": int(record["Count"]),
        "webenv": record.get("WebEnv"),
        "query_key": record.get("QueryKey"),
    }


def fetch_ncbi(
    accession: str,
    db: str = "nucleotide",
    fmt: str = "fasta",
    retries: int = 3,
) -> Optional[str]:
    """Fetch a single record from NCBI by accession ID."""
    db = NCBI_DB_MAP.get(db.lower(), db)
    configure_entrez()
    allowed = DATABASE_FORMATS.get(db)
    if allowed is None or fmt.lower() not in allowed:
        raise ValueError(f"Unsupported format {fmt!r} for NCBI {db}.")
    ret_type, ret_mode = allowed[fmt.lower()]

    for attempt in range(retries):
        try:
            options = {"db": db, "id": accession, "retmode": ret_mode}
            if ret_type is not None:
                options["rettype"] = ret_type
            handle = Entrez.efetch(**options)
            data = handle.read()
            handle.close()
            if isinstance(data, bytes):
                data = data.decode("utf-8", errors="replace")
            return data
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
            else:
                raise RuntimeError(f"NCBI fetch failed for {accession}: {e}")


def fetch_ncbi_summary(accession: str, db: str = "nucleotide") -> Optional[dict]:
    """Fetch DocSum metadata for a record."""
    db = NCBI_DB_MAP.get(db.lower(), db)
    configure_entrez()
    handle = Entrez.esummary(db=db, id=accession, retmode="json")
    try:
        result = json.load(handle).get("result", {})
    finally:
        handle.close()
    uids = result.get("uids", [])
    return result.get(str(uids[0])) if uids else None


def fetch_ncbi_summaries(ids: list[str], db: str = "nucleotide") -> dict[str, dict]:
    """Fetch a page of DocSums in one request for useful search cards."""
    if not ids:
        return {}
    if len(ids) > 50:
        raise ValueError("At most 50 NCBI summaries can be requested at once.")
    configure_entrez()
    handle = Entrez.esummary(db=NCBI_DB_MAP.get(db.lower(), db), id=",".join(ids), retmode="json")
    try:
        result = json.load(handle).get("result", {})
    finally:
        handle.close()
    return {identifier: result.get(identifier, {}) for identifier in ids}


def parse_fasta_stats(fasta_text: str) -> list[dict]:
    """Parse FASTA text and return basic stats per record."""
    stats = []
    handle = io.StringIO(fasta_text)
    for record in SeqIO.parse(handle, "fasta"):
        seq = str(record.seq)
        length = len(seq)
        gc = (seq.upper().count("G") + seq.upper().count("C")) / length * 100 if length else 0
        stats.append({
            "id": record.id,
            "description": record.description,
            "length": length,
            "gc_percent": round(gc, 2),
        })
    return stats


def batch_fetch_ncbi(
    accessions: list[str],
    db: str = "nucleotide",
    fmt: str = "fasta",
    delay: float = 0.4,
) -> dict[str, str]:
    """Batch fetch multiple accessions with rate limiting."""
    results = {}
    for acc in accessions:
        try:
            data = fetch_ncbi(acc, db=db, fmt=fmt)
            results[acc] = data
        except Exception as e:
            results[acc] = f"ERROR: {e}"
        time.sleep(delay)
    return results


def fetch_ncbi_fasta_batch(accessions: list[str], db: str = "nucleotide") -> dict[str, str]:
    """Fetch FASTA records in groups, matching headers before assigning content.

    NCBI may return fewer records than requested or use accession.version in
    headers. Unmatched records are fetched individually so a sequence is never
    silently assigned to the wrong requested accession.
    """
    db = NCBI_DB_MAP.get(db.lower(), db)
    if db not in {"nucleotide", "protein"}:
        raise ValueError("Batch FASTA is supported only for nucleotide and protein.")
    configure_entrez()
    results: dict[str, str] = {}
    for start in range(0, len(accessions), 50):
        chunk = accessions[start:start + 50]
        try:
            handle = Entrez.efetch(db=db, id=",".join(chunk), rettype="fasta", retmode="text")
            try:
                data = handle.read()
            finally:
                handle.close()
            if isinstance(data, bytes):
                data = data.decode("utf-8", errors="replace")
            blocks = re.findall(r"(?m)^>[^\n]*(?:\n(?!>)[^\n]*)*", data)
            for block in blocks:
                header = block.splitlines()[0][1:].split()[0]
                header_ids = {part.upper() for part in header.split("|") if part}
                matches = [acc for acc in chunk if acc.upper() in header_ids or
                           any(identifier.startswith(acc.upper() + ".") for identifier in header_ids)]
                if len(matches) == 1 and matches[0] not in results:
                    results[matches[0]] = block.rstrip("\n") + "\n"
        except Exception:
            # A failed group request must not prevent the remaining IDs from loading.
            pass
        for acc in chunk:
            if acc not in results:
                try:
                    results[acc] = fetch_ncbi(acc, db=db, fmt="fasta")
                except Exception as exc:
                    results[acc] = f"ERROR: {exc}"
    return results
