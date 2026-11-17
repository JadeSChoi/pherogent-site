"""Export the public Lee reconstruction for the browser, without rounding values.

Usage: python3 scripts/build-lee-study.py /absolute/path/to/reconstruction/lee
Requires NumPy and openpyxl. This is an offline maintenance command, not a
deployment or model call. It checks the original workbook and the reconstructed
package before writing public artifacts. It cannot recover the missing archive.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/lee2014"
CSV_FILES = ("increments.csv", "same_day_comparisons.csv", "path_classes.csv",
             "return_schedules.csv", "group_differences.csv", "examples.csv")
SAMPLES = ["2°MEF", "D2H", "D5H", "D8H", "D11H", "D16H", "D18H", "D16L",
           "D21L", "D21Ø", "1°iPSC", "2°iPSC", "ESC"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def build(source):
    source = Path(source).resolve()
    verification = json.loads((source / "results/verification.json").read_text())
    reproduction = json.loads((source / "checks/reproduction.json").read_text())
    provenance = json.loads((source / "sources/provenance.json").read_text())
    routes = json.loads((source / "routes.json").read_text())
    for relative, expected in verification["source_sha256"].items():
        require(digest(source / relative) == expected, f"Source changed: {relative}")
    for relative, expected in verification["input_sha256"].items():
        require(digest(source / relative) == expected, f"Input changed: {relative}")
    for row in reproduction["files"]:
        actual = digest(source / "results" / row["file"])
        require(row["byte_identical"] and actual == row["archived_sha256"] == row["regenerated_sha256"],
                f"Reconstruction check changed: {row['file']}")
    require(verification["all_calculation_checks_passed"] is True,
            "Source calculations must pass before exporting")
    require(verification["original_archive_byte_identity_available"] is False,
            "The source release must retain the unavailable-archive disclosure")
    require(len(verification["report_discrepancies"]) == 1 and
            verification["report_discrepancies"][0]["name"] == "DMR_6652_withdrawal_minus_low",
            "The source release has a different report discrepancy; review before export")
    with np.load(source / "tensor/dmr_states.npz", allow_pickle=False) as tensor:
        samples = tensor["source_samples"].astype(str).tolist()
        values = tensor["source_beta"].astype(np.float64)
        features = tensor["feature_ids"].astype(str).tolist()
        groups = tensor["groups"].astype(str).tolist()
        rows = tensor["source_rows"].astype(int).tolist()
    require(samples == SAMPLES and values.shape == (13, 7890), "Unexpected source dimensions")
    require(features == [f"DMR_{n}" for n in range(1, 7891)] and rows == list(range(4, 7894)),
            "Unexpected feature identifiers or workbook rows")
    require(np.isfinite(values).all() and ((values >= 0) & (values <= 1)).all(),
            "Source values must be complete fractions in [0,1]")
    book = load_workbook(source / "sources/ncomms6619-s3.xlsx", read_only=True, data_only=True)
    try:
        sheet = book["Suppl_Data2"]
        headers = list(next(sheet.iter_rows(min_row=3, max_row=3, min_col=8, max_col=20, values_only=True)))
        workbook_rows = list(sheet.iter_rows(min_row=4, max_row=7893, max_col=20, values_only=True))
    finally:
        book.close()
    require(headers == samples, "Workbook sample order changed")
    require([str(r[0]) for r in workbook_rows] == features, "Workbook feature IDs changed")
    require([str(r[4]) for r in workbook_rows] == groups, "Workbook groups changed")
    require(np.array_equal(np.asarray([r[7:20] for r in workbook_rows], dtype=np.float64).T, values),
            "The tensor differs from the source workbook")
    workbook = next(row for row in provenance["files"] if row["file"] == "ncomms6619-s3.xlsx")
    downloads = [{"label": name, "url": f"/data/lee2014/{name}",
                  "sha256": digest(source / "results" / name)}
                 for name in (*CSV_FILES, "verification.json")]
    downloads.append({"label": "reproduction.json", "url": "/data/lee2014/reproduction.json",
                      "sha256": digest(source / "checks/reproduction.json")})
    data = {
        "schemaVersion": 1,
        "study": "lee2014",
        "samples": samples,
        "columns": [chr(code) for code in range(ord("H"), ord("T") + 1)],
        "features": features,
        "groups": groups,
        "rows": rows,
        "values": values.tolist(),
        "routeConfig": routes,
        "metadata": {
            "title": "Lee et al. 2014 · methylation time course",
            "doi": "10.1038/ncomms6619",
            "paperUrl": "https://doi.org/10.1038/ncomms6619",
            "workbookUrl": workbook["source_url"],
            "workbookFile": "sources/ncomms6619-s3.xlsx",
            "workbookSheet": "Suppl_Data2",
            "workbookSha256": workbook["sha256"],
            "generatedOn": "2026-11-14",
            "attribution": "Source data: Lee et al., Nature Communications 5, 5619 (2014), Supplementary Data 2. Browser export and descriptive recalculation: Pherogent.",
            "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "observationStructure": verification["observation_structure"],
            "limitations": [
                "These are regional bulk methylation measurements, not longitudinal measurements of individual cells.",
                "7,890 regions are features, not independent biological replicates. The independent biological replicate count is not established by this workbook.",
                "Shared samples appear on multiple routes; routes do not establish independent replicates.",
                "A return is an observed departure followed by an endpoint within a declared tolerance of baseline. It is not an exact return or evidence of a mechanism.",
                "Unequal intermediate sampling creates unequal opportunities to observe a departure. Use a common schedule for the corresponding descriptive comparison.",
                "The day ~30 label means by approximately day 30; it is not an exact sampling timestamp.",
            ],
            "roundingDiscrepancy": verification["report_discrepancies"][0],
            "originalArchiveAvailable": False,
            "reconstruction": True,
            "reproduction": {
                "outputsByteIdentical": reproduction["reconstruction_outputs_byte_identical"],
                "outputFilesChecked": len(reproduction["files"]),
                "comparison": reproduction["comparison"],
                "reportChecksPassed": sum(check["passed"] for check in verification["report_checks"]),
                "reportChecksTotal": len(verification["report_checks"]),
                "allReportValuesMatch": verification["all_report_values_match"],
                "sourceValuesChecked": verification["workbook_cell_comparison"]["values_checked"],
            },
            "downloads": downloads,
            "routeLabels": {"continued_high": "Continued high", "continued_low": "Continued low",
                            "low_withdrawal": "Low withdrawal", "high_withdrawal": "High withdrawal"},
        },
    }
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    decoded = json.loads(encoded)
    require(np.array_equal(np.asarray(decoded["values"], dtype=np.float64), values),
            "JSON serialization changed source values")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "data.json").write_text(encoded, encoding="utf-8")
    for name in (*CSV_FILES, "verification.json"):
        shutil.copyfile(source / "results" / name, OUTPUT / name)
    shutil.copyfile(source / "checks/reproduction.json", OUTPUT / "reproduction.json")
    manifest = {"schemaVersion": 1, "study": "lee2014", "dataSha256": digest(OUTPUT / "data.json"),
                "valuesCheckedAgainstWorkbook": int(values.size), "valuesEqualAfterJSONRoundtrip": True,
                "sourceWorkbookSha256": workbook["sha256"],
                "files": {name: digest(OUTPUT / name) for name in
                          ("data.json", *CSV_FILES, "verification.json", "reproduction.json")}}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output": str(OUTPUT), "sourceValuesVerified": int(values.size),
                      "dataBytes": len(encoded.encode()), "dataSha256": manifest["dataSha256"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    build(parser.parse_args().source)
