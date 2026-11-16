"""Validated, presentation-neutral operations shared by web and CLI adapters."""

from __future__ import annotations

import re
import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

from nodivium import ncbi, pdb, uniprot
from Bio import SeqIO


FORMATS = {
    ("ncbi", "nucleotide"): ("fasta", "genbank", "xml"),
    ("ncbi", "protein"): ("fasta", "genpept", "xml"),
    ("ncbi", "gene"): ("xml", "gene_table"),
    ("ncbi", "pubmed"): ("xml", "medline", "abstract"),
    ("uniprot", ""): ("fasta", "json", "txt", "xml", "tsv"),
    ("pdb", ""): ("cif", "pdb", "fasta"),
}
DEFAULT_FORMAT = {
    ("ncbi", "nucleotide"): "fasta",
    ("ncbi", "protein"): "fasta",
    ("ncbi", "gene"): "xml",
    ("ncbi", "pubmed"): "xml",
    ("uniprot", ""): "fasta",
    ("pdb", ""): "cif",
}
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")


@dataclass(frozen=True)
class Target:
    source: str
    identifier: str
    db: str = ""

    def __post_init__(self) -> None:
        source = self.source.lower().strip()
        db = self.db.lower().strip() if source == "ncbi" else ""
        identifier = self.identifier.strip()
        if (source, db) not in FORMATS:
            raise ValueError("Choose a supported source and NCBI database.")
        if not IDENTIFIER.fullmatch(identifier):
            raise ValueError("Enter a valid accession or record ID (up to 80 letters, digits, . _ -).")
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "db", db)
        object.__setattr__(self, "identifier", identifier.upper() if source == "pdb" else identifier)

    @property
    def formats(self) -> tuple[str, ...]:
        return FORMATS[(self.source, self.db)]

    @property
    def default_format(self) -> str:
        return DEFAULT_FORMAT[(self.source, self.db)]

    @property
    def source_url(self) -> str:
        if self.source == "uniprot":
            return f"https://www.uniprot.org/uniprotkb/{self.identifier}"
        if self.source == "pdb":
            return f"https://www.rcsb.org/structure/{self.identifier}"
        section = {"nucleotide": "nuccore", "protein": "protein", "gene": "gene", "pubmed": "pubmed"}[self.db]
        return f"https://www.ncbi.nlm.nih.gov/{section}/{self.identifier}"


def search(query: str, source: str, db: str = "", limit: int = 10, reviewed: bool = False) -> dict:
    query = query.strip()
    if not 2 <= len(query) <= 250:
        raise ValueError("Search query must contain 2–250 characters.")
    if not 1 <= limit <= 50:
        raise ValueError("Result limit must be between 1 and 50.")
    source = source.lower().strip()
    db = db.lower().strip() if source == "ncbi" else ""
    if (source, db) not in FORMATS:
        raise ValueError("Choose a supported source and NCBI database.")
    if source == "uniprot":
        rows = uniprot.search_uniprot(query, max_results=limit, reviewed=reviewed)
        results = [{"id": row["accession"], "title": row.get("protein_name") or row["accession"],
                    "subtitle": row.get("organism", ""), "detail": row.get("gene", ""),
                    "reviewed": row.get("reviewed", False), "source": source, "db": db} for row in rows]
        total = None  # This adapter receives a result page, not a verified total.
    elif source == "pdb":
        rows = pdb.search_pdb(query, max_results=limit)
        def describe(identifier: str) -> tuple[str, str]:
            try:
                summary = pdb.extract_pdb_summary(pdb.fetch_pdb_metadata(identifier, retries=1), identifier)
                return summary.get("title") or identifier, summary.get("method") or "RCSB PDB structure"
            except Exception:
                return identifier, "RCSB PDB structure"
        with ThreadPoolExecutor(max_workers=4) as pool:
            descriptions = list(pool.map(describe, [row["pdb_id"] for row in rows[:8]]))
        results = []
        for index, row in enumerate(rows):
            identifier = row["pdb_id"]
            title, subtitle = descriptions[index] if index < len(descriptions) else (identifier, "RCSB PDB structure")
            results.append({"id": identifier, "title": title, "subtitle": subtitle,
                            "detail": "", "source": source, "db": db})
        total = None
    else:
        rows = ncbi.search_ncbi(query, db=db, max_results=limit)
        try:
            summaries = ncbi.fetch_ncbi_summaries(rows["ids"], db=db)
        except Exception:
            summaries = {}
        results = []
        for identifier in rows["ids"]:
            summary = summaries.get(identifier, {})
            results.append({"id": identifier, "title": summary.get("title") or summary.get("name") or identifier,
                            "subtitle": summary.get("organism") or f"NCBI {db} record",
                            "detail": summary.get("caption", ""), "source": source, "db": db})
        total = rows["count"]
    has_more = len(results) < total if total is not None else len(results) == limit
    return {"query": query, "source": source, "db": db, "total": total,
            "has_more": has_more and len(results) < 50, "results": results}


def record(target: Target) -> dict:
    genomic_locations = []
    if target.source == "uniprot":
        raw = uniprot.fetch_uniprot_metadata(target.identifier)
        summary = uniprot.extract_uniprot_summary(raw)
        sequence = raw.get("sequence", {}).get("value", "")
        features = [{"type": f.get("type", "Feature"), "description": f.get("description", ""),
                     "start": f.get("location", {}).get("start", {}).get("value"),
                     "end": f.get("location", {}).get("end", {}).get("value")}
                    for f in raw.get("features", [])]
        links = []
        for reference in raw.get("uniProtKBCrossReferences", []):
            database, identifier = reference.get("database"), reference.get("id", "")
            if not identifier:
                continue
            if database == "PDB":
                url = f"https://www.rcsb.org/structure/{identifier}"
            elif database == "RefSeq":
                url = f"https://www.ncbi.nlm.nih.gov/search/all/?term={identifier}"
            elif database == "EMBL":
                url = f"https://www.ebi.ac.uk/ena/browser/view/{identifier}"
            else:
                continue
            links.append({"database": database, "id": identifier, "url": url})
        title = summary.get("protein_name") or target.identifier
    elif target.source == "pdb":
        raw = pdb.fetch_pdb_metadata(target.identifier)
        summary = pdb.extract_pdb_summary(raw, target.identifier)
        title = summary.get("title") or target.identifier
        sequence, features, links = "", [], []
        entity_ids = raw.get("rcsb_entry_container_identifiers", {}).get("polymer_entity_ids") or []
        entity_names = []
        organisms = []
        for entity_id in entity_ids[:8]:
            try:
                entity = pdb.fetch_polymer_entity(target.identifier, str(entity_id))
            except Exception:
                continue
            name = entity.get("rcsb_polymer_entity", {}).get("pdbx_description")
            if name:
                entity_names.append(str(name))
            for source_organism in entity.get("rcsb_entity_source_organism") or []:
                organism = source_organism.get("ncbi_scientific_name")
                if organism and organism not in organisms:
                    organisms.append(organism)
            identifiers = entity.get("rcsb_polymer_entity_container_identifiers", {}).get("reference_sequence_identifiers") or []
            for reference in identifiers:
                if reference.get("database_name") == "UniProt":
                    accession = reference.get("database_accession", "")
                    if IDENTIFIER.fullmatch(accession):
                        link = {"database": "UniProt", "id": accession,
                                "url": f"https://www.uniprot.org/uniprotkb/{accession}"}
                        if link not in links:
                            links.append(link)
        if entity_names:
            summary["polymer_entities"] = entity_names
        if organisms:
            summary["source_organisms"] = organisms
    else:
        raw = ncbi.fetch_ncbi_summary(target.identifier, db=target.db)
        if not raw:
            raise LookupError("No NCBI record found for that ID.")
        sequence, features, links = "", [], []
        if target.db == "pubmed":
            authors = raw.get("authors") or raw.get("AuthorList") or raw.get("Authors") or []
            author_names = [author.get("name", "") if isinstance(author, dict) else str(author)
                            for author in authors] if isinstance(authors, (list, tuple)) else [str(authors)]
            identifiers = raw.get("articleids") or []
            doi = next((item.get("value", "") for item in identifiers
                        if isinstance(item, dict) and item.get("idtype") == "doi"), "")
            summary = {
                "Title": raw.get("title") or raw.get("Title") or "",
                "Authors": ", ".join(name for name in author_names if name),
                "Journal": raw.get("fulljournalname") or raw.get("source") or raw.get("FullJournalName") or raw.get("Source") or "",
                "Published": raw.get("pubdate") or raw.get("PubDate") or "",
                "Volume": raw.get("volume") or "",
                "Issue": raw.get("issue") or "",
                "Pages": raw.get("pages") or "",
                "DOI": doi or raw.get("DOI") or "",
                "PMID": target.identifier,
            }
            if summary["DOI"].startswith("10.") and not any(char.isspace() for char in summary["DOI"]):
                links.append({"database": "DOI", "id": summary["DOI"],
                              "url": f"https://doi.org/{quote(summary['DOI'], safe='/')}"})
        elif target.db == "gene":
            organism = raw.get("organism") or {}
            summary = {
                "Name": raw.get("name") or "",
                "Description": raw.get("description") or "",
                "Organism": organism.get("scientificname", "") if isinstance(organism, dict) else str(organism),
                "Chromosome": raw.get("chromosome") or "",
                "Summary": raw.get("summary") or "",
            }
            for location in raw.get("genomicinfo") or []:
                if not isinstance(location, dict) or not location.get("chraccver"):
                    continue
                try:
                    start0, stop0 = int(location["chrstart"]), int(location["chrstop"])
                except (KeyError, TypeError, ValueError):
                    continue
                if min(start0, stop0) < 0:
                    continue
                genomic_locations.append({"accession": location["chraccver"],
                                          "start": min(start0, stop0) + 1,
                                          "end": max(start0, stop0) + 1,
                                          "strand": "+" if start0 <= stop0 else "-"})
        else:
            summary = {k: ", ".join(str(item) for item in v) if isinstance(v, (list, tuple)) else str(v)
                       for k, v in raw.items() if k != "Item"}
        title = str(raw.get("title") or raw.get("name") or raw.get("Title") or raw.get("Name") or target.identifier)
    return {"source": target.source, "db": target.db, "id": target.identifier,
            "title": title, "summary": summary, "sequence": sequence,
            "features": features, "links": links, "formats": target.formats,
            "default_format": target.default_format, "source_url": target.source_url,
            "genomic_locations": genomic_locations,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def fetch(target: Target, fmt: str | None = None) -> str:
    fmt = (fmt or target.default_format).lower()
    if fmt not in target.formats:
        raise ValueError(f"{fmt} is not available for {target.source} {target.db or 'record'}. Choose: {', '.join(target.formats)}.")
    if target.source == "uniprot":
        return uniprot.fetch_uniprot(target.identifier, fmt=fmt)
    if target.source == "pdb":
        return pdb.fetch_pdb_fasta(target.identifier) if fmt == "fasta" else pdb.fetch_pdb_structure(target.identifier, fmt=fmt)
    return ncbi.fetch_ncbi(target.identifier, db=target.db, fmt=fmt)


def parse_genbank_features(content: str, limit: int = 250) -> list[dict]:
    """Convert INSDC feature coordinates to 1-based inclusive display positions."""
    result = []
    for sequence_record in SeqIO.parse(io.StringIO(content), "genbank"):
        for feature in sequence_record.features:
            if len(result) >= limit:
                return result
            try:
                start, end = int(feature.location.start) + 1, int(feature.location.end)
            except (TypeError, ValueError, AttributeError):
                continue
            qualifiers = feature.qualifiers
            description = next((qualifiers[key][0] for key in ("product", "gene", "note") if qualifiers.get(key)), "")
            result.append({"type": feature.type, "start": start, "end": end,
                           "description": description[:300]})
        break
    return result
