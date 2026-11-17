import { describe, expect, it } from "vitest";
import { normalizePaper, searchPapers } from "./europePmc";

/** The same bibliographic record the Playwright fixture serves. */
const fixtureRecord = {
  id: "33268865",
  source: "MED",
  pmid: "33268865",
  pmcid: "PMC7752134",
  title: "Reprogramming to recover youthful epigenetic information and restore vision.",
  authorString: "Lu Y, Brommer B, Tian X",
  pubYear: "2020",
  journalInfo: { journal: { title: "Nature" } },
  doi: "10.1038/s41586-020-2975-4",
  isOpenAccess: "Y",
  abstractText:
    "Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells promotes axon regeneration after injury.",
};

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("normalizePaper", () => {
  it("normalizes a Europe PMC core record", () => {
    const paper = normalizePaper(fixtureRecord);
    expect(paper).toMatchObject({
      id: "MED:33268865",
      title:
        "Reprogramming to recover youthful epigenetic information and restore vision.",
      authors: ["Lu Y", "Brommer B", "Tian X"],
      year: 2020,
      journal: "Nature",
      doi: "10.1038/s41586-020-2975-4",
      pmid: "33268865",
      pmcid: "PMC7752134",
      url: "https://europepmc.org/article/MED/33268865",
      openAccess: true,
    });
    expect(paper?.abstract).toContain("retinal ganglion cells");
  });

  it("strips markup but keeps the text of a formatted title and abstract", () => {
    const paper = normalizePaper({
      ...fixtureRecord,
      title: "The <i>Oct4</i> pathway<script>alert(1)</script>",
      abstractText: "<p>First paragraph.</p><p>Second paragraph.</p>",
    });
    expect(paper?.title).toBe("The Oct4 pathway");
    expect(paper?.abstract).toContain("First paragraph.");
    expect(paper?.abstract).toContain("Second paragraph.");
    expect(paper?.abstract).not.toContain("<p>");
  });

  it("rejects records without a usable identifier or title", () => {
    expect(normalizePaper(null)).toBeNull();
    expect(normalizePaper({ ...fixtureRecord, id: "" })).toBeNull();
    expect(normalizePaper({ ...fixtureRecord, title: "" })).toBeNull();
    expect(normalizePaper({ ...fixtureRecord, source: "not a source!" })).toBeNull();
  });

  it("drops an invalid DOI and non-numeric year instead of the record", () => {
    const paper = normalizePaper({
      ...fixtureRecord,
      doi: "javascript:alert(1)",
      pubYear: "20xx",
    });
    expect(paper?.doi).toBe("");
    expect(paper?.year).toBeNull();
  });
});

describe("searchPapers", () => {
  it("sends the query to the Europe PMC search endpoint and returns papers", async () => {
    let requested: URL | undefined;
    const result = await searchPapers("OSK glaucoma mice", {
      fetchImpl: async (input) => {
        requested = new URL(String(input));
        return okResponse({ hitCount: 1, resultList: { result: [fixtureRecord] } });
      },
    });
    expect(requested?.origin).toBe("https://www.ebi.ac.uk");
    expect(requested?.pathname).toBe("/europepmc/webservices/rest/search");
    expect(requested?.searchParams.get("query")).toBe("OSK glaucoma mice");
    expect(requested?.searchParams.get("format")).toBe("json");
    expect(result.total).toBe(1);
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].id).toBe("MED:33268865");
  });

  it("rejects an empty or over-long query without any network request", async () => {
    const fetchImpl = async () => {
      throw new Error("must not fetch");
    };
    await expect(searchPapers("   ", { fetchImpl })).rejects.toThrow(/search/i);
    await expect(
      searchPapers("x".repeat(301), { fetchImpl }),
    ).rejects.toThrow(/300/);
  });

  it("reports an HTTP failure as a readable error", async () => {
    await expect(
      searchPapers("oct4", {
        fetchImpl: async () => new Response("busy", { status: 429 }),
      }),
    ).rejects.toThrow(/too many requests/i);
    await expect(
      searchPapers("oct4", {
        fetchImpl: async () => new Response("down", { status: 500 }),
      }),
    ).rejects.toThrow(/500/);
  });

  it("rejects an unreadable or unexpected response shape", async () => {
    await expect(
      searchPapers("oct4", {
        fetchImpl: async () => new Response("not json", { status: 200 }),
      }),
    ).rejects.toThrow(/unreadable/i);
    await expect(
      searchPapers("oct4", {
        fetchImpl: async () => okResponse({ unexpected: true }),
      }),
    ).rejects.toThrow(/unexpected/i);
  });
});
