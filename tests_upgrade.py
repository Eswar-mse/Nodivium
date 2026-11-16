"""Focused checks for record identity, formats, and export provenance."""

import io
import hashlib
import json
import zipfile
from unittest.mock import patch

import pytest

from nodivium.service import Target, fetch, parse_genbank_features, record, search
from nodivium import ncbi, pdb
from nodivium.cli import NCBIDb, Source, batch
from typer.testing import CliRunner
from nodivium.cli import app as cli_app
from nodivium.web import CollectionItem, CollectionRequest, collection_export
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, FeatureLocation
from Bio import SeqIO


def test_record_formats_are_specific_to_database():
    assert Target("ncbi", "NM_007294", "nucleotide").default_format == "fasta"
    assert "genpept" in Target("ncbi", "NP_123", "protein").formats
    assert "genbank" not in Target("ncbi", "NP_123", "protein").formats
    assert Target("ncbi", "1234", "pubmed").default_format == "xml"
    assert "fasta" not in Target("ncbi", "1234", "pubmed").formats
    assert Target("pdb", "1hho").identifier == "1HHO"
    with pytest.raises(ValueError):
        Target("ncbi", "../secret", "protein")


def test_bare_cli_shows_wordmark_and_commands():
    result = CliRunner().invoke(cli_app, [])
    assert result.exit_code == 0
    assert "N   N  OOO" in result.output
    assert "Usage:" in result.output
    assert "fetch" in result.output


def test_search_reports_verified_total_only_for_ncbi():
    with patch("nodivium.service.uniprot.search_uniprot", return_value=[
        {"accession": "P68871", "protein_name": "Hemoglobin", "organism": "Human"}]):
        uniprot_result = search("hemoglobin", "uniprot", limit=1)
    assert uniprot_result["total"] is None
    assert uniprot_result["has_more"] is True
    with patch("nodivium.service.ncbi.search_ncbi", return_value={"ids": ["123"], "count": 24}), \
         patch("nodivium.service.ncbi.fetch_ncbi_summaries", return_value={"123": {"title": "Article"}}):
        ncbi_result = search("hemoglobin", "ncbi", db="pubmed", limit=1)
    assert ncbi_result["total"] == 24
    assert ncbi_result["has_more"] is True


def test_pdb_no_hits_is_empty_search_not_error():
    from unittest.mock import Mock
    response = Mock(status_code=204)
    with patch("nodivium.pdb.requests.post", return_value=response):
        assert pdb.search_pdb("unlikely test query") == []
    response.json.assert_not_called()


def test_pdb_fasta_uses_documented_entry_download_endpoint():
    from unittest.mock import Mock
    response = Mock(text=">1HHO_1\nMVLSP")
    with patch("nodivium.pdb.requests.get", return_value=response) as request:
        assert pdb.fetch_pdb_fasta("1hho") == ">1HHO_1\nMVLSP"
    assert request.call_args.args[0] == "https://www.rcsb.org/fasta/entry/1HHO/download"


def test_fetch_rejects_unsupported_format_before_provider_call():
    with patch("nodivium.service.ncbi.fetch_ncbi") as provider:
        with pytest.raises(ValueError):
            fetch(Target("ncbi", "1234", "pubmed"), "fasta")
        provider.assert_not_called()


def test_ncbi_format_map_does_not_turn_gene_or_pubmed_into_fasta(monkeypatch):
    monkeypatch.setenv("NODIVIUM_NCBI_EMAIL", "tests@example.org")
    with patch.object(ncbi.Entrez, "efetch") as efetch:
        efetch.return_value.read.return_value = "<Record/>"
        ncbi.fetch_ncbi("1234", db="pubmed", fmt="xml")
        assert efetch.call_args.kwargs["retmode"] == "xml"
        assert "rettype" not in efetch.call_args.kwargs
    with pytest.raises(ValueError):
        ncbi.fetch_ncbi("1234", db="gene", fmt="fasta")


def test_gene_coordinates_are_one_based_and_preserve_reverse_strand():
    summary = {"name": "BRCA1", "description": "BRCA1 DNA repair associated",
               "organism": {"scientificname": "Homo sapiens"},
               "genomicinfo": [{"chraccver": "NC_000017.11", "chrstart": 43044294,
                                "chrstop": 43125482}]}
    with patch("nodivium.service.ncbi.fetch_ncbi_summary", return_value=summary):
        result = record(Target("ncbi", "672", "gene"))
    assert result["summary"]["Name"] == "BRCA1"
    assert result["genomic_locations"] == [{"accession": "NC_000017.11",
                                            "start": 43044295, "end": 43125483,
                                            "strand": "+"}]


def test_pubmed_summary_keeps_citation_and_doi_source_link():
    summary = {"title": "A study of molecular records", "authors": [{"name": "Lee A"}],
               "fulljournalname": "Journal of Example Biology", "pubdate": "2026 Jan",
               "articleids": [{"idtype": "doi", "value": "10.1234/example.1"}]}
    with patch("nodivium.service.ncbi.fetch_ncbi_summary", return_value=summary):
        result = record(Target("ncbi", "12345678", "pubmed"))
    assert result["summary"]["Authors"] == "Lee A"
    assert result["summary"]["Journal"] == "Journal of Example Biology"
    assert result["links"] == [{"database": "DOI", "id": "10.1234/example.1",
                                "url": "https://doi.org/10.1234/example.1"}]


def test_pdb_summary_does_not_mislabel_entry_id_as_date_or_taxonomy_count_as_organism():
    summary = pdb.extract_pdb_summary({"entry": {"id": "1HHO"}, "rcsb_entry_info": {"polymer_entity_taxonomy_count": 2}}, "1HHO")
    assert summary["deposition_date"] is None
    assert "organism" not in summary
    assert summary["polymer_count"] == 0


def test_collection_export_includes_source_and_failures():
    with patch("nodivium.web.fetch_cached", side_effect=[(">P68871\nMVT", False), RuntimeError("source unavailable")]):
        response = collection_export(CollectionRequest(items=[
            CollectionItem(source="uniprot", identifier="P68871", fmt="fasta"),
            CollectionItem(source="pdb", identifier="1hho", fmt="cif"),
        ]))
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["records"][0]["source_url"] == "https://www.uniprot.org/uniprotkb/P68871"
        assert manifest["records"][0]["status"] == "ok"
        assert manifest["records"][1]["status"] == "failed"
        content = archive.read(manifest["records"][0]["file"])
        assert content.startswith(b">P68871")
        assert manifest["records"][0]["sha256"] == hashlib.sha256(content).hexdigest()


def test_collection_export_keeps_invalid_item_in_manifest():
    with patch("nodivium.web.fetch_cached", return_value=(">P68871\nMVT", False)) as provider:
        response = collection_export(CollectionRequest(items=[
            CollectionItem(source="ncbi", identifier="../invalid", db="protein", fmt="fasta"),
            CollectionItem(source="uniprot", identifier="P68871", fmt="fasta"),
        ]))
    with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
        records = json.loads(archive.read("manifest.json"))["records"]
    assert [row["status"] for row in records] == ["failed", "ok"]
    assert response.headers["X-Nodivium-Failed"] == "1"
    provider.assert_called_once()


def test_ncbi_batch_fasta_matches_versioned_headers_and_retries_missing(monkeypatch):
    monkeypatch.setenv("NODIVIUM_NCBI_EMAIL", "tests@example.org")
    batch = io.StringIO(">NM_001.2 example\nACGT\n>NP_002.1 protein\nMVT\n")
    with patch.object(ncbi.Entrez, "efetch", return_value=batch) as efetch, \
         patch.object(ncbi, "fetch_ncbi", return_value=">NM_003.1 recovered\nTT\n") as single:
        results = ncbi.fetch_ncbi_fasta_batch(["NM_001", "NP_002", "NM_003"])
    assert results["NM_001"] == ">NM_001.2 example\nACGT\n"
    assert results["NP_002"] == ">NP_002.1 protein\nMVT\n"
    assert results["NM_003"] == ">NM_003.1 recovered\nTT\n"
    assert efetch.call_count == 1
    single.assert_called_once_with("NM_003", db="nucleotide", fmt="fasta")


def test_cli_batch_uses_ncbi_group_fetch_and_saves_each_record(tmp_path, monkeypatch):
    payload = {"NM_001": ">NM_001\nAC\n", "NM_002": ">NM_002\nGT\n"}
    from unittest.mock import Mock
    import nodivium.cli as cli
    cache = Mock()
    monkeypatch.setattr(cli, "_cache", cache)
    with patch("nodivium.cli.ncbi_mod.fetch_ncbi_fasta_batch", return_value=payload) as grouped:
        cache.get.return_value = None
        batch(["NM_001", "NM_002"], Source.ncbi, "fasta", NCBIDb.nucleotide, tmp_path, False)
    grouped.assert_called_once_with(["NM_001", "NM_002"], db="nucleotide")
    assert (tmp_path / "nodivium_NM_001.fasta").read_text() == payload["NM_001"]
    assert (tmp_path / "nodivium_NM_002.fasta").read_text() == payload["NM_002"]


def test_genbank_features_use_one_based_inclusive_positions():
    sequence = SeqRecord(Seq("ATGCGT"), id="X1", name="X1", description="fixture")
    sequence.annotations["molecule_type"] = "DNA"
    sequence.features = [SeqFeature(FeatureLocation(0, 3), type="CDS", qualifiers={"gene": ["abc"]})]
    handle = io.StringIO()
    SeqIO.write(sequence, handle, "genbank")
    features = parse_genbank_features(handle.getvalue())
    assert features[0] == {"type": "CDS", "start": 1, "end": 3, "description": "abc"}


def test_pdb_record_links_only_source_reported_uniprot_identifiers():
    entry = {"struct": {"title": "Fixture structure"},
             "rcsb_entry_container_identifiers": {"polymer_entity_ids": ["1"]}}
    entity = {"rcsb_polymer_entity": {"pdbx_description": "Test protein"},
              "rcsb_polymer_entity_container_identifiers": {"reference_sequence_identifiers": [
                  {"database_name": "UniProt", "database_accession": "P68871"},
                  {"database_name": "Other", "database_accession": "X"}]}}
    with patch.object(pdb, "fetch_pdb_metadata", return_value=entry), patch.object(pdb, "fetch_polymer_entity", return_value=entity):
        result = record(Target("pdb", "1hho"))
    assert result["links"] == [{"database": "UniProt", "id": "P68871", "url": "https://www.uniprot.org/uniprotkb/P68871"}]
    assert result["summary"]["polymer_entities"] == ["Test protein"]


def test_ncbi_summary_resolves_accession_to_returned_uid(monkeypatch):
    monkeypatch.setenv("NODIVIUM_NCBI_EMAIL", "tests@example.org")
    response = io.StringIO(json.dumps({"result": {"uids": ["111"], "111": {"uid": "111", "title": "A nucleotide record"}}}))
    with patch.object(ncbi.Entrez, "esummary", return_value=response) as summary:
        result = ncbi.fetch_ncbi_summary("NM_123", db="nucleotide")
    assert result["title"] == "A nucleotide record"
    assert summary.call_args.kwargs["retmode"] == "json"


def test_pubmed_record_formats_authors_and_doi_from_json_summary():
    raw = {"title": "A study of proteins", "authors": [{"name": "A Researcher"}, {"name": "B Scientist"}],
           "fulljournalname": "Journal of Tests", "pubdate": "2026", "articleids": [{"idtype": "doi", "value": "10.1234/example"}]}
    with patch.object(ncbi, "fetch_ncbi_summary", return_value=raw):
        result = record(Target("ncbi", "12345", "pubmed"))
    assert result["title"] == "A study of proteins"
    assert result["summary"]["Authors"] == "A Researcher, B Scientist"
    assert result["summary"]["DOI"] == "10.1234/example"
    assert result["links"] == [{"database": "DOI", "id": "10.1234/example", "url": "https://doi.org/10.1234/example"}]


def test_gene_record_uses_ncbi_genomic_coordinates_as_one_based():
    raw = {"name": "BRCA1", "description": "BRCA1 DNA repair associated",
           "organism": {"scientificname": "Homo sapiens"}, "chromosome": "17",
           "genomicinfo": [{"chraccver": "NC_000017.11", "chrstart": 43000010, "chrstop": 42999910}]}
    with patch.object(ncbi, "fetch_ncbi_summary", return_value=raw):
        result = record(Target("ncbi", "672", "gene"))
    assert result["summary"]["Organism"] == "Homo sapiens"
    assert result["genomic_locations"] == [{"accession": "NC_000017.11", "start": 42999911,
                                             "end": 43000011, "strand": "-"}]
