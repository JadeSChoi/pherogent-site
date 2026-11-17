/**
 * Public Europe PMC discovery, ported from the legacy client
 * (legacy/public/literature.js). Runs in the browser; no model calls and no
 * automatic scientific judgments — results are candidates the author inspects.
 */

export type Paper = {
  id: string;
  source: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string;
  doi: string;
  pmid: string;
  pmcid: string;
  url: string;
  abstract: string;
  openAccess: boolean;
};

export type SearchResult = {
  total: number;
  papers: Paper[];
};

const ENDPOINT = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const TIMEOUT_MS = 12000;
const ID_PATTERN = /^([A-Z][A-Z0-9_]{0,11}):([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/;

/**
 * Reduces Europe PMC's HTML-flavored strings to plain text. Only inert,
 * attribute-free formatting survives to the HTML parser; in particular no
 * image, frame, or external-resource elements are ever parsed.
 */
export function stripMarkup(value: unknown): string {
  if (typeof value !== "string") return "";
  const markup = value
    .slice(0, 120000)
    .replace(/<(script|style|template|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g, (tag, name: string) => {
      if (!/^(p|br|div|section|h[1-6]|ul|ol|li|b|i|em|strong|sup|sub)$/i.test(name)) return "";
      return "<" + (tag.startsWith("</") ? "/" : "") + name.toLowerCase() + ">";
    });
  const doc = new DOMParser().parseFromString(markup, "text/html");
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc
    .querySelectorAll("p,div,section,h1,h2,h3,h4,h5,h6,li")
    .forEach((node) => node.append("\n"));
  return (doc.body.textContent || "")
    .replace(/ /g, " ")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

export function normalizePaper(record: unknown): Paper | null {
  if (!isRecord(record)) return null;
  const source = typeof record.source === "string" ? record.source : "";
  const externalId = typeof record.id === "string" ? record.id : "";
  const id = source + ":" + externalId;
  if (!ID_PATTERN.test(id)) return null;
  const title = stripMarkup(record.title);
  if (!title) return null;
  const authorList = isRecord(record.authorList) ? record.authorList.author : null;
  const authors = Array.isArray(authorList)
    ? authorList
        .map((author) =>
          isRecord(author) ? stripMarkup(author.fullName || author.collectiveName) : "",
        )
        .filter(Boolean)
    : stripMarkup(record.authorString || "")
        .split(/,\s*/)
        .filter(Boolean);
  const doi =
    typeof record.doi === "string" && /^10\.\d{4,9}\/\S+$/i.test(record.doi.trim())
      ? record.doi.trim()
      : "";
  const pmid = /^\d+$/.test(String(record.pmid || ""))
    ? String(record.pmid)
    : source === "MED" && /^\d+$/.test(externalId)
      ? externalId
      : "";
  const pmcid = /^PMC\d+$/.test(String(record.pmcid || ""))
    ? String(record.pmcid)
    : source === "PMC" && /^PMC\d+$/.test(externalId)
      ? externalId
      : "";
  const journalInfo = isRecord(record.journalInfo) ? record.journalInfo : {};
  const journal = isRecord(journalInfo.journal) ? journalInfo.journal.title : null;
  return {
    id,
    source,
    title,
    authors,
    year: /^\d{4}$/.test(String(record.pubYear || "")) ? Number(record.pubYear) : null,
    journal: stripMarkup(journal || record.journalTitle || ""),
    doi,
    pmid,
    pmcid,
    url:
      "https://europepmc.org/article/" +
      encodeURIComponent(source) +
      "/" +
      encodeURIComponent(externalId),
    abstract: stripMarkup(record.abstractText || ""),
    openAccess: record.isOpenAccess === "Y",
  };
}

function abortedError(): Error {
  const error = new Error("Search cancelled.");
  error.name = "AbortError";
  return error;
}

export type SearchOptions = {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export async function searchPapers(
  query: unknown,
  options: SearchOptions = {},
): Promise<SearchResult> {
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("Enter a topic, author, title, or DOI to search.");
  }
  const trimmed = query.trim();
  if (trimmed.length > 300) {
    throw new Error("Keep your search to 300 characters or fewer. Use a few specific terms.");
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error("Use a single line of text for your search.");
  }
  return request(trimmed, 8, options);
}

async function request(
  query: string,
  pageSize: number,
  { signal, fetchImpl = fetch }: SearchOptions,
): Promise<SearchResult> {
  if (signal?.aborted) throw abortedError();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    query,
    format: "json",
    resultType: "core",
    pageSize: String(pageSize),
  }).toString();
  try {
    const response = await fetchImpl(url.href, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Europe PMC is receiving too many requests. Please try again shortly.");
      }
      throw new Error(
        "Europe PMC could not complete this search (HTTP " + response.status + "). Try again later.",
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("Europe PMC returned an unreadable response. Please try again.");
    }
    if (
      !isRecord(data) ||
      typeof data.hitCount !== "number" ||
      !Number.isFinite(data.hitCount) ||
      data.hitCount < 0 ||
      !isRecord(data.resultList) ||
      !Array.isArray(data.resultList.result)
    ) {
      throw new Error("Europe PMC returned an unexpected response. No search results were accepted.");
    }
    const papers = data.resultList.result
      .map(normalizePaper)
      .filter((paper): paper is Paper => paper !== null);
    if (data.hitCount > 0 && !papers.length) {
      throw new Error("Europe PMC returned records without usable paper metadata. Please try another query.");
    }
    return { total: data.hitCount, papers };
  } catch (error) {
    if (signal?.aborted) throw abortedError();
    if (timedOut) throw new Error("Europe PMC took too long to respond. Please try again.");
    if (error instanceof TypeError) {
      throw new Error("Could not reach Europe PMC. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
