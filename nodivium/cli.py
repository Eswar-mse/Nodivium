"""Nodivium — CLI entry point built with Typer."""
import sys
import os
import re
from pathlib import Path
from typing import Optional, List
from enum import Enum

import typer
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

from nodivium.cache import BioCache
from nodivium import ncbi as ncbi_mod
from nodivium import uniprot as uniprot_mod
from nodivium import pdb as pdb_mod
from nodivium import display as disp
from nodivium.service import Target, fetch as fetch_record

app = typer.Typer(
    name="nodivium",
    help="[bold cyan]Nodivium[/] — Explore and export records from NCBI · UniProt · PDB.",
    rich_markup_mode="rich",
    add_completion=False,
    no_args_is_help=False,
)

cache_app = typer.Typer(help="Manage the local cache.", no_args_is_help=True)
app.add_typer(cache_app, name="cache")


@app.callback(invoke_without_command=True)
def root(ctx: typer.Context):
    """Display the Nodivium wordmark and command guide at launch."""
    if ctx.invoked_subcommand is None:
        disp.print_cli_logo()
        typer.echo(ctx.get_help())

class _LazyCache:
    """Open the disk cache only for commands that actually use it."""

    def __init__(self):
        self._instance = None

    def __getattr__(self, name):
        if self._instance is None:
            self._instance = BioCache(ttl_days=7)
        return getattr(self._instance, name)


_cache = _LazyCache()


# ─── Enums ───────────────────────────────────────────────────────────────────

class Source(str, Enum):
    ncbi = "ncbi"
    uniprot = "uniprot"
    pdb = "pdb"


class NCBIDb(str, Enum):
    nucleotide = "nucleotide"
    protein = "protein"
    gene = "gene"
    pubmed = "pubmed"


class NCBIFormat(str, Enum):
    fasta = "fasta"
    genbank = "genbank"
    xml = "xml"
    text = "text"


class UniProtFormat(str, Enum):
    fasta = "fasta"
    json = "json"
    txt = "txt"
    xml = "xml"
    tsv = "tsv"


class PDBFormat(str, Enum):
    pdb = "pdb"
    cif = "cif"
    fasta = "fasta"


# ─── fetch command ────────────────────────────────────────────────────────────

@app.command("fetch")
def fetch(
    accession: str = typer.Argument(..., help="Accession ID (e.g. NM_001301717, P68871, 1HHO)"),
    source: Source = typer.Option(..., "--source", "-s", help="Database source"),
    fmt: Optional[str] = typer.Option(None, "--format", "-f", help="Output format; defaults to the record type's preferred format"),
    db: NCBIDb = typer.Option(NCBIDb.nucleotide, "--db", help="NCBI database (only for --source ncbi)"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Save to file instead of printing"),
    no_cache: bool = typer.Option(False, "--no-cache", help="Bypass cache and force fresh fetch"),
    info: bool = typer.Option(False, "--info", "-i", help="Show metadata summary alongside sequence"),
    preview: bool = typer.Option(True, "--preview/--no-preview", help="Print sequence preview in terminal"),
):
    """Fetch a single record by accession ID from NCBI, UniProt, or PDB."""
    disp.print_header()

    try:
        target = Target(source.value, accession, db.value)
        fmt = fmt.lower() if fmt else target.default_format
        if fmt not in target.formats:
            raise ValueError(f"Choose a supported format: {', '.join(target.formats)}")
    except ValueError as e:
        disp.print_error(str(e))
        raise typer.Exit(2)
    accession = target.identifier
    cache_key_fmt = fmt

    # ── Cache check ──
    if not no_cache:
        cached = _cache.get(source.value, accession, cache_key_fmt, target.db)
        if cached:
            disp.print_success(f"[bold]{accession}[/] served from cache")
            _deliver(cached, output, preview, source, accession, fmt, info)
            return

    # ── Fetch ──
    data = None
    with Progress(
        SpinnerColumn(spinner_name="dots", style="bold cyan"),
        TextColumn(f"[cyan]Fetching [bold]{accession}[/] from {source.value.upper()}..."),
        TimeElapsedColumn(),
        transient=True,
    ) as progress:
        progress.add_task("fetch", total=None)
        try:
            data = fetch_record(target, fmt)
        except Exception as e:
            disp.print_error(str(e))
            raise typer.Exit(1)

    if not data:
        disp.print_error(f"No data returned for {accession}")
        raise typer.Exit(1)

    _cache.set(source.value, accession, cache_key_fmt, data, target.db)
    disp.print_success(f"[bold]{accession}[/] fetched and cached")
    _deliver(data, output, preview, source, accession, fmt, info)


def _deliver(data: str, output, preview: bool, source, accession: str, fmt: str, info: bool):
    """Write to file or print to terminal."""
    if output:
        output.write_text(data, encoding="utf-8")
        disp.print_info(f"Saved to [bold]{output}[/] ({len(data):,} bytes)")
    else:
        if preview:
            disp.print_fasta_preview(data, max_lines=24) if fmt == "fasta" else disp.print_text_preview(data, fmt, max_lines=24)

    # ── Optional info panel ──
    if info:
        try:
            if source == Source.ncbi and fmt == "fasta":
                stats = ncbi_mod.parse_fasta_stats(data)
                if stats:
                    from rich.table import Table
                    from rich import box
                    t = Table(box=box.SIMPLE_HEAD)
                    t.add_column("ID")
                    t.add_column("Length", justify="right")
                    t.add_column("GC %", justify="right")
                    for s in stats:
                        t.add_row(s["id"], f"{s['length']:,}", f"{s['gc_percent']}%")
                    disp.console.print(t)
            elif source == Source.uniprot:
                meta = uniprot_mod.fetch_uniprot_metadata(accession.strip())
                if isinstance(meta, dict):
                    summary = uniprot_mod.extract_uniprot_summary(meta)
                    disp.print_uniprot_summary(summary)
                else:
                    disp.print_warning("Could not parse UniProt metadata.")
            elif source == Source.pdb:
                meta = pdb_mod.fetch_pdb_metadata(accession)
                summary = pdb_mod.extract_pdb_summary(meta, accession)
                disp.print_pdb_summary(summary)
        except Exception as e:
            disp.print_warning(f"Could not fetch metadata: {e}")


# ─── search command ───────────────────────────────────────────────────────────

@app.command("search")
def search(
    query: str = typer.Argument(..., help="Search query string"),
    source: Source = typer.Option(Source.ncbi, "--source", "-s", help="Database to search"),
    db: NCBIDb = typer.Option(NCBIDb.nucleotide, "--db", help="NCBI database (for --source ncbi)"),
    limit: int = typer.Option(10, "--limit", "-n", help="Max results to return"),
    reviewed: bool = typer.Option(False, "--reviewed", help="UniProt: only Swiss-Prot reviewed entries"),
):
    """Search NCBI, UniProt, or PDB and list matching accessions."""
    disp.print_header()
    if not 1 <= limit <= 50 or not 2 <= len(query.strip()) <= 250:
        disp.print_error("Use a query of 2–250 characters and a result limit of 1–50.")
        raise typer.Exit(2)

    with Progress(
        SpinnerColumn(spinner_name="dots", style="bold cyan"),
        TextColumn(f"[cyan]Searching {source.value.upper()} for [bold]{query!r}[/]..."),
        TimeElapsedColumn(),
        transient=True,
    ) as progress:
        progress.add_task("search", total=None)
        try:
            if source == Source.ncbi:
                results = ncbi_mod.search_ncbi(query, db=db.value, max_results=limit)
                disp.print_search_results_ncbi(results, db.value)
            elif source == Source.uniprot:
                results = uniprot_mod.search_uniprot(query, max_results=limit, reviewed=reviewed)
                disp.print_search_results_uniprot(results)
            elif source == Source.pdb:
                results = pdb_mod.search_pdb(query, max_results=limit)
                disp.print_search_results_pdb(results)
        except Exception as e:
            disp.print_error(str(e))
            raise typer.Exit(1)


# ─── info command ─────────────────────────────────────────────────────────────

@app.command("info")
def info_cmd(
    accession: str = typer.Argument(..., help="Accession ID"),
    source: Source = typer.Option(..., "--source", "-s", help="Database source"),
    db: NCBIDb = typer.Option(NCBIDb.nucleotide, "--db", help="NCBI database"),
):
    """Fetch and display a rich metadata summary without downloading the full sequence."""
    disp.print_header()
    try:
        accession = Target(source.value, accession, db.value).identifier
    except ValueError as e:
        disp.print_error(str(e))
        raise typer.Exit(2)

    with Progress(
        SpinnerColumn(spinner_name="dots", style="bold cyan"),
        TextColumn(f"[cyan]Loading info for [bold]{accession}[/]..."),
        TimeElapsedColumn(),
        transient=True,
    ) as progress:
        progress.add_task("info", total=None)
        try:
            if source == Source.ncbi:
                record = ncbi_mod.fetch_ncbi_summary(accession, db=db.value)
                if record:
                    disp.print_ncbi_summary(record)
                else:
                    disp.print_error("No summary found.")
            elif source == Source.uniprot:
                meta = uniprot_mod.fetch_uniprot_metadata(accession)
                summary = uniprot_mod.extract_uniprot_summary(meta)
                disp.print_uniprot_summary(summary)
            elif source == Source.pdb:
                meta = pdb_mod.fetch_pdb_metadata(accession)
                summary = pdb_mod.extract_pdb_summary(meta, accession)
                disp.print_pdb_summary(summary)
        except Exception as e:
            disp.print_error(str(e))
            raise typer.Exit(1)


# ─── batch command ────────────────────────────────────────────────────────────

@app.command("batch")
def batch(
    accessions: List[str] = typer.Argument(..., help="Space-separated accession IDs"),
    source: Source = typer.Option(..., "--source", "-s", help="Database source"),
    fmt: Optional[str] = typer.Option(None, "--format", "-f", help="Output format; defaults to the record type's preferred format"),
    db: NCBIDb = typer.Option(NCBIDb.nucleotide, "--db", help="NCBI database"),
    outdir: Path = typer.Option(Path("."), "--outdir", "-d", help="Directory to save files"),
    no_cache: bool = typer.Option(False, "--no-cache", help="Bypass cache"),
):
    """Batch fetch multiple accession IDs and save each to a file."""
    disp.print_header()
    try:
        first = Target(source.value, accessions[0], db.value)
        fmt = fmt.lower() if fmt else first.default_format
        if fmt not in first.formats:
            raise ValueError(f"Choose a supported format: {', '.join(first.formats)}")
        targets = [Target(source.value, acc, db.value) for acc in accessions]
    except ValueError as e:
        disp.print_error(str(e))
        raise typer.Exit(2)
    outdir.mkdir(parents=True, exist_ok=True)

    results = {}
    pending = []
    for target in targets:
        cached = None if no_cache else _cache.get(source.value, target.identifier, fmt, target.db)
        if cached is not None:
            results[target.identifier] = cached
            _save_record(cached, target.identifier, fmt, outdir)
        else:
            pending.append(target)

    with Progress(
        SpinnerColumn(spinner_name="dots", style="bold cyan"),
        TextColumn("[cyan]{task.description}"),
        TimeElapsedColumn(),
        transient=False,
    ) as progress:
        task = progress.add_task(f"Fetching {len(targets)} records...", total=len(targets))

        progress.advance(task, len(targets) - len(pending))
        batch_data = {}
        if source == Source.ncbi and fmt == "fasta" and len(pending) > 1:
            progress.update(task, description=f"[cyan]Fetching {len(pending)} FASTA records from NCBI...")
            try:
                batch_data = ncbi_mod.fetch_ncbi_fasta_batch([target.identifier for target in pending], db=db.value)
            except Exception as exc:
                batch_data = {target.identifier: f"ERROR: {exc}" for target in pending}
        for target in pending:
            acc = target.identifier
            progress.update(task, description=f"[cyan]Fetching [bold]{acc}[/]...")
            try:
                data = batch_data[acc] if batch_data else fetch_record(target, fmt)
                if data.startswith("ERROR: "):
                    raise RuntimeError(data[7:])

                _cache.set(source.value, acc, fmt, data, target.db)
                results[acc] = data
                _save_record(data, acc, fmt, outdir)
            except Exception as e:
                results[acc] = f"ERROR: {e}"

            progress.advance(task)

    disp.print_batch_summary(results)
    disp.print_info(f"Files saved to [bold]{outdir.resolve()}[/]")


def _save_record(data: str, accession: str, fmt: str, outdir: Path):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", accession):
        raise ValueError("Invalid record ID for a file name")
    ext_map = {"fasta": "fasta", "genbank": "gb", "genpept": "gp", "gb": "gb", "json": "json",
               "xml": "xml", "txt": "txt", "pdb": "pdb", "cif": "cif",
               "gene_table": "txt", "medline": "txt", "abstract": "txt"}
    ext = ext_map.get(fmt, fmt)
    fname = outdir / f"nodivium_{accession}.{ext}"
    fname.write_text(data, encoding="utf-8")


# ─── cache subcommands ────────────────────────────────────────────────────────

@cache_app.command("stats")
def cache_stats():
    """Show cache size and entry count."""
    disp.print_header()
    stats = _cache.stats()
    disp.print_cache_stats(stats)


@cache_app.command("list")
def cache_list():
    """List all cached keys."""
    disp.print_header()
    keys = _cache.list_keys()
    if not keys:
        disp.print_info("Cache is empty.")
        return
    disp.console.print(f"\n[bold cyan]{len(keys)} cached entries:[/]\n")
    for k in keys:
        disp.console.print(f"  [dim]→[/] {k}")


@cache_app.command("clear")
def cache_clear(
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation prompt"),
):
    """Clear all cached data."""
    disp.print_header()
    if not force:
        confirm = typer.confirm("⚠  This will delete all cached records. Continue?")
        if not confirm:
            disp.print_info("Aborted.")
            return
    _cache.clear()
    disp.print_success("Cache cleared.")


@cache_app.command("delete")
def cache_delete(
    accession: str = typer.Argument(..., help="Accession ID to remove from cache"),
    source: Source = typer.Option(..., "--source", "-s"),
    fmt: str = typer.Option("fasta", "--format", "-f"),
    db: NCBIDb = typer.Option(NCBIDb.nucleotide, "--db", help="NCBI database"),
):
    """Delete a specific cached entry."""
    disp.print_header()
    deleted = _cache.delete(source.value, accession, fmt, db.value if source == Source.ncbi else "")
    if deleted:
        disp.print_success(f"Deleted cache entry: {source.value}:{accession}:{fmt}")
    else:
        disp.print_warning(f"Entry not found in cache: {source.value}:{accession}:{fmt}")


# ─── version command ──────────────────────────────────────────────────────────

@app.command("version")
def version():
    """Print Nodivium version."""
    from nodivium import __version__
    disp.console.print(f"[bold cyan]Nodivium[/] v{__version__}")


@app.command("web")
def web(port: int = typer.Option(8765, "--port", help="Local web port")):
    """Open the Nodivium web workspace on this computer."""
    if not 1024 <= port <= 65535:
        disp.print_error("Choose a port from 1024 to 65535.")
        raise typer.Exit(2)
    try:
        import uvicorn
    except ImportError as exc:
        disp.print_error("Web dependencies are missing. Install with: pip install 'nodivium[web]'")
        raise typer.Exit(2) from exc
    disp.print_info(f"Open http://127.0.0.1:{port} in your browser")
    uvicorn.run("nodivium.web:app", host="127.0.0.1", port=port)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    app()


if __name__ == "__main__":
    main()
