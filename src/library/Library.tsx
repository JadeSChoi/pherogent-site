import { useRef, useState, type FormEvent } from "react";
import { Button, Dialog, Select, TextArea, TextInput } from "../ui";
import {
  READING_STATUSES,
  withSavedSource,
  withSourceUpdate,
  type Project,
  type ReadingStatus,
  type SavedSource,
} from "../storage/workspace";
import { searchPapers, type Paper, type SearchResult } from "./europePmc";
import "./library.css";

type LibraryProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  "to-read": "To read",
  useful: "Useful",
  conflicting: "Conflicting",
};

function paperMeta(paper: Paper): string {
  const venue = [paper.journal, paper.year].filter(Boolean).join(", ");
  const authors = paper.authors.join(", ");
  return [venue, authors].filter(Boolean).join(" — ");
}

const authorsLine = (paper: Paper): string => {
  const named = paper.authors.join(", ") || "Unnamed authors";
  return paper.year ? `${named} (${paper.year})` : named;
};

const savedOn = (source: SavedSource): string => {
  const date = new Date(source.savedAt);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function Library({ project, onProjectChange }: LibraryProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [result, setResult] = useState<SearchResult>();
  const [inspected, setInspected] = useState<Paper>();
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const activeSearch = useRef<AbortController>(null);

  const sources = project.sources ?? [];
  const savedIds = new Set(sources.map((source) => source.paper.id));
  const filtered =
    statusFilter === "all"
      ? sources
      : sources.filter((source) => source.status === statusFilter);
  // The detail is pinned to one source (defaulting to the first saved).
  // When the active filter excludes it, the detail hides — it never falls
  // back to a different row, so an edit can never land on another source.
  const selectedKey = selectedId ?? sources[0]?.paper.id;
  const selected = filtered.find((source) => source.paper.id === selectedKey);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearching(true);
    setSearchError(undefined);
    try {
      setResult(await searchPapers(query, { signal: controller.signal }));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResult(undefined);
      setSearchError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (activeSearch.current === controller) setSearching(false);
    }
  };

  const save = (paper: Paper) => {
    onProjectChange(withSavedSource(project, paper));
    setInspected(undefined);
    setSelectedId(paper.id);
  };

  const statusCounts = new Map<ReadingStatus, number>();
  for (const source of sources) {
    statusCounts.set(source.status, (statusCounts.get(source.status) ?? 0) + 1);
  }
  const chips: { key: ReadingStatus | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: sources.length },
    ...READING_STATUSES.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      count: statusCounts.get(status) ?? 0,
    })),
  ];

  return (
    <div className="library-page">
      <div className="library-page-head">
        <h1 className="library-title">Library</h1>
        <p className="library-page-sub">
          {sources.length === 1 ? "1 paper" : `${sources.length} papers`} saved
          for reading
        </p>
      </div>

      {sources.length > 0 && (
        <section className="library-saved" aria-label="Saved sources">
          <div className="library-chips" role="group" aria-label="Filter saved sources">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="library-chip"
                aria-pressed={statusFilter === chip.key}
                onClick={() => setStatusFilter(chip.key)}
              >
                {chip.label} {chip.count}
              </button>
            ))}
          </div>
          <table className="library-ledger">
            <thead>
              <tr>
                <th>Saved source</th>
                <th>Journal</th>
                <th>Year</th>
                <th>Reading status</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((source) => (
                <tr
                  key={source.paper.id}
                  aria-current={selected?.paper.id === source.paper.id || undefined}
                  onClick={() => setSelectedId(source.paper.id)}
                >
                  <td>
                    {/* The row's real selection control, for keyboard and
                        assistive tech; the row click is the wide target. */}
                    <button
                      type="button"
                      className="library-row-select"
                      aria-pressed={selected?.paper.id === source.paper.id}
                      onClick={() => setSelectedId(source.paper.id)}
                    >
                      <span className="library-source-authors">
                        {authorsLine(source.paper)}
                      </span>
                      <span className="library-source-title">
                        {source.paper.title}
                      </span>
                    </button>
                  </td>
                  <td className="library-cell">{source.paper.journal || "—"}</td>
                  <td className="library-cell">{source.paper.year ?? "—"}</td>
                  <td className="library-cell">{STATUS_LABELS[source.status]}</td>
                  <td className="library-cell">{savedOn(source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="library-hint">
              No saved source has this reading status yet.
            </p>
          )}
          {filtered.length > 0 && !selected && (
            <p className="library-hint">Select a row to edit its note and status.</p>
          )}

          {selected && (
            // The detail edits the selected (washed, marked) row above, so
            // it does not restate the saved source.
            <div className="library-detail">
              <p className="library-source-standing">
                Saved for reading — not an approved citation. Approving
                evidence is a separate, per-sentence decision.
              </p>
              <div className="library-result-actions">
                <Button onClick={() => setInspected(selected.paper)}>Inspect</Button>
              </div>
              <div className="library-source-fields">
                <TextArea
                  label="Reading note"
                  rows={2}
                  maxLength={2000}
                  value={selected.note}
                  onChange={(event) =>
                    onProjectChange(
                      withSourceUpdate(project, selected.paper.id, {
                        note: event.currentTarget.value,
                      }),
                    )
                  }
                />
                <Select
                  label="Reading status"
                  value={selected.status}
                  onChange={(event) =>
                    onProjectChange(
                      withSourceUpdate(project, selected.paper.id, {
                        status: event.currentTarget.value as ReadingStatus,
                      }),
                    )
                  }
                >
                  {READING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="library-find" aria-label="Find papers">
        <h3 className="library-section-title">Find papers</h3>
        <form className="library-search-form" onSubmit={search}>
          <TextInput
            label="Search Europe PMC"
            type="search"
            maxLength={300}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="e.g. OSK glaucoma mice"
            hint="Nothing is sent until you choose Search papers. Results are candidates to inspect, never automatic citations."
          />
          <Button variant="primary" type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search papers"}
          </Button>
        </form>
        {searchError && (
          <p className="library-search-error" role="alert">
            {searchError}
          </p>
        )}
        <div aria-live="polite">
          {result && (
            <>
              <p className="library-result-count">
                {result.total === 0
                  ? "No matching records on Europe PMC. Try fewer or different terms."
                  : `${result.total.toLocaleString()} matching records; showing ${result.papers.length}.`}
              </p>
              <ul className="library-source-list">
                {result.papers.map((paper) => (
                  <li key={paper.id} className="library-source">
                    <p className="library-source-authors">{authorsLine(paper)}</p>
                    <h4 className="library-source-title">{paper.title}</h4>
                    <div className="library-result-actions">
                      <Button onClick={() => setInspected(paper)}>
                        Inspect{savedIds.has(paper.id) ? " (saved)" : ""}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <Dialog
        open={inspected !== undefined}
        onClose={() => setInspected(undefined)}
        title="Inspect a candidate source"
      >
        {inspected && (
          <div className="library-inspect">
            <h3 className="library-paper-title">{inspected.title}</h3>
            <p className="library-paper-meta">{paperMeta(inspected)}</p>
            {inspected.doi && <p className="library-paper-meta">DOI: {inspected.doi}</p>}
            {inspected.abstract ? (
              <p className="library-abstract">{inspected.abstract}</p>
            ) : (
              <p className="library-hint">
                No abstract is available for this record. Open it on Europe PMC
                to read more.
              </p>
            )}
            <p className="library-paper-meta">
              <a href={inspected.url} target="_blank" rel="noopener noreferrer">
                Open on Europe PMC
              </a>
            </p>
            {savedIds.has(inspected.id) ? (
              <p className="library-hint">
                In your saved sources for reading — not an approved citation.
              </p>
            ) : (
              <p className="library-hint">
                Saving adds this paper to your project&rsquo;s saved sources for
                reading. It does not approve evidence or insert a citation.
              </p>
            )}
            <div className="library-inspect-actions">
              {!savedIds.has(inspected.id) && (
                <Button variant="primary" onClick={() => save(inspected)}>
                  Save to project
                </Button>
              )}
              <Button onClick={() => setInspected(undefined)}>Close</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
