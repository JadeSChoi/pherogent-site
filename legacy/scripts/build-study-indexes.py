#!/usr/bin/env python3
"""Export the supplied, separate SQLite indexes for read-only Worker retrieval.

No downloads, embeddings API, raw-data ingestion or new study claims occur here.
The original SQLite files are retained byte for byte. Runtime JSON contains their
float32 document vectors and the fitted IDF needed to reproduce query scoring.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import sqlite3

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


STUDIES = {
    "rag1_lu2020": {
        "label": "RAG 1 · Lu 2020",
        "title": "OSK and retinal ganglion cells",
        "sourceUrl": "https://www.nature.com/articles/s41586-020-2975-4",
        "expectedRecords": 6,
        "questions": ["Does OSK restore retinal function?", "TET1 and TET2 activity", "human mouse methylation", "zzzzquuxxxxx", "RNA sequencing reads", "DNAm.csv"],
    },
    "rag2_gse293381": {
        "label": "RAG 2 · GSE293381",
        "title": "WIF1 and mouse retina multiome",
        "sourceUrl": "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE293381",
        "expectedRecords": 7,
        "questions": ["What happens at 2 and 4 weeks?", "ATAC methylation", "GSM8881191", "spatial coordinates", "zzzzquuxxxxx", "same tracked cell"],
    },
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-root", type=Path, required=True)
    parser.add_argument("--source-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/data/research-studies")
    args = parser.parse_args()
    source_zip_sha = sha(args.source_zip)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {"schemaVersion": 1, "sourcePackage": args.source_zip.name, "sourcePackageSha256": source_zip_sha,
                "summaryOnly": True, "rawDataAvailable": False, "aiCalls": 0, "files": {}}
    fixtures = []
    for study, config in STUDIES.items():
        source_dir = args.package_root / study
        notes_path = source_dir / "source_documents/verified_source_notes.jsonl"
        db_path = source_dir / "vectors.sqlite"
        notes = [(line_number, json.loads(line)) for line_number, line in enumerate(notes_path.read_text(encoding="utf-8").splitlines(), 1) if line.strip()]
        note_lookup = {hashlib.sha256((r["source_url"] + r["text"]).encode()).hexdigest()[:20]: (line, r) for line, r in notes}
        if len(note_lookup) != config["expectedRecords"]:
            raise ValueError(f"{study}: unexpected number of unique source notes")
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            vocabulary = dict(connection.execute("SELECT term,idx FROM vocabulary"))
            rows = connection.execute("SELECT id,content,vector,metadata FROM chunks ORDER BY rowid").fetchall()
        if len(rows) != config["expectedRecords"] or set(r[0] for r in rows) != set(note_lookup):
            raise ValueError(f"{study}: archive and source notes differ")
        model = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, vocabulary=vocabulary, lowercase=True)
        reproduced = model.fit_transform([r[1] for r in rows]).astype(np.float32)
        records, vectors = [], []
        for order, (id_, content, blob, metadata) in enumerate(rows):
            line, note = note_lookup[id_]
            if json.loads(metadata) != note or content != note["text"] or note.get("study") != study or note.get("raw_data_ingested") is not False:
                raise ValueError(f"{study}: archive record {id_} differs from its source note")
            vector = np.load(io.BytesIO(blob), allow_pickle=False)
            if vector.shape != (len(vocabulary),) or not np.isfinite(vector).all() or not np.array_equal(vector, reproduced[order].toarray().ravel()):
                raise ValueError(f"{study}: cannot exactly reproduce stored float32 vector {id_}")
            vectors.append(vector)
            records.append({"id": id_, "text": content, "sourceUrl": note["source_url"], "sourceKind": note["source_type"],
                            "recordKind": note["record_kind"], "evidenceLevel": "source_summary_not_raw_data",
                            "quoteVerified": False, "independentlyVerified": False,
                            "locator": {"file": f"{study}/source_documents/verified_source_notes.jsonl", "line": line,
                                        "recordId": id_, "sourcePackageSha256": source_zip_sha},
                            "vector": [[i, float(value)] for i, value in enumerate(vector) if value != 0]})
        target = args.output / study
        (target / "source_documents").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(db_path, target / "vectors.sqlite")
        shutil.copyfile(notes_path, target / "source_documents/verified_source_notes.jsonl")
        index = {"schemaVersion": 1, "study": study, "label": config["label"], "title": config["title"], "sourceUrl": config["sourceUrl"],
                 "summaryOnly": True, "rawDataAvailable": False, "embeddingKind": "lexical_tfidf", "recordCount": len(records),
                 "method": {"ngramRange": [1, 2], "sublinearTf": True, "smoothIdf": True, "normalization": "l2", "lowercase": True,
                            "tokenPattern": "(?u)\\b\\w\\w+\\b", "documentDtype": "float32"},
                 "sourcePackageSha256": source_zip_sha, "sourceNotesSha256": sha(notes_path), "sourceSqliteSha256": sha(db_path),
                 "vocabulary": vocabulary, "idf": model.idf_.tolist(), "records": records}
        write_json(target / "index.json", index)
        for question in config["questions"]:
            query = model.transform([question]).toarray().ravel()
            scores = [(record["id"], float(np.dot(query, vector))) for record, vector in zip(records, vectors)]
            scores = sorted((row for row in scores if row[1] > 0), key=lambda row: (-row[1], row[0]))[:5]
            fixtures.append({"study": study, "question": question, "expected": [{"id": id_, "score": round(score, 8)} for id_, score in scores]})
        for path in sorted(target.rglob("*")):
            if path.is_file():
                manifest["files"][str(path.relative_to(args.output))] = {"sha256": sha(path), "bytes": path.stat().st_size}
    write_json(args.output / "query-fixtures.json", fixtures)
    manifest["files"]["query-fixtures.json"] = {"sha256": sha(args.output / "query-fixtures.json"), "bytes": (args.output / "query-fixtures.json").stat().st_size}
    write_json(args.output / "manifest.json", manifest)
    print(json.dumps({"studies": list(STUDIES), "records": sum(s["expectedRecords"] for s in STUDIES.values()), "queryFixtures": len(fixtures), "sqliteArchivesByteIdentical": True, "modelCalls": 0}))


if __name__ == "__main__":
    main()
