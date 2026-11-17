# Study retrieval collections

These are the two **separate supplied-summary collections** from
`Pherogent_RAG_Skills_LangGraph_Package.zip`, not collections of full papers or
primary numerical datasets. RAG 1 contains six notes about Lu et al. 2020. RAG 2
contains seven notes about GEO GSE293381. They do not replace the separate Lee
2014 explorer or the Gill study.

The original `vectors.sqlite` files and `source_documents/verified_source_notes.jsonl`
are preserved byte for byte. The source package's filename uses “verified”, but
Pherogent labels the records as **supplied summaries, not independently verified
quotations**. A note's line number locates the supplied note, not a passage in the
paper. Open the original source and verify the passage before citing it.

`index.json` is the read-only runtime representation of each SQLite vector store:
the vocabulary, fitted inverse-document frequencies, archived float32 document
vectors and source locators. The hosted Worker loads these static indexes; it does
not open a writable vector database. Retrieval uses lexical TF–IDF cosine scoring
with unigrams and bigrams, logarithmic term frequencies and L2 normalization. It
uses no embedding model or paid API. Similarity is not a support verdict. Unknown
studies are refused; zero-score records are never returned.

`manifest.json` records hashes for the original package, the SQLite databases,
notes, runtime exports and independent Python query fixtures. Build with:

```sh
python3 scripts/build-study-indexes.py --package-root /path/to/Pherogent_RAG_Skills_Package --source-zip /path/to/Pherogent_RAG_Skills_LangGraph_Package.zip
```

The exporter requires NumPy and scikit-learn. It verifies that the archive's
stored vectors exactly reproduce from its notes before writing the runtime
representation. It performs no downloads or biological analyses.

Neither collection includes primary matrices or spatial coordinates. Numerical
analysis for these studies must remain **NOT_RUN** until validated source data
and an appropriate design manifest are supplied. Cross-sectional groups are not
the same cells tracked through time; ATAC is not DNA methylation; the human
GSE147436 series must not be silently combined with mouse RGC measurements.
