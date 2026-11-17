import { useRef, useState, type FormEvent } from "react";
import { Button, Dialog, Panel, Select, TextArea, TextInput } from "../ui";
import {
  withSavedSource,
  withSourceUpdate,
  type Project,
  type ReadingStatus,
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

export function Library({ project, onProjectChange }: LibraryProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [result, setResult] = useState<SearchResult>();
  const [inspected, setInspected] = useState<Paper>();
  const activeSearch = useRef<AbortController>(null);

  const sources = project.sources ?? [];
  const savedIds = new Set(sources.map((source) => source.paper.id));

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
  };

  return (
    <Panel title="Library">
      {sources.length > 0 && (
        <section className="library-saved" aria-label="Saved sources">
          <h3 className="library-section-title">Saved sources</h3>
          <p className="library-hint">
            Your reading collection for {project.name}. A saved source is not an
            approved citation — approving evidence is a separate, per-sentence
            decision.
          </p>
          <ul className="library-source-list">
            {sources.map((source) => (
              <li key={source.paper.id} className="library-source">
                <h4 className="library-paper-title">{source.paper.title}</h4>
                <p className="library-paper-meta">{paperMeta(source.paper)}</p>
                <p className="library-source-standing">
                  Saved for reading — not an approved citation
                </p>
                <div className="library-result-actions">
                  <Button onClick={() => setInspected(source.paper)}>Inspect</Button>
                </div>
                <div className="library-source-fields">
                  <TextArea
                    label="Reading note"
                    rows={2}
                    maxLength={2000}
                    value={source.note}
                    onChange={(event) =>
                      onProjectChange(
                        withSourceUpdate(project, source.paper.id, {
                          note: event.currentTarget.value,
                        }),
                      )
                    }
                  />
                  <Select
                    label="Reading status"
                    value={source.status}
                    onChange={(event) =>
                      onProjectChange(
                        withSourceUpdate(project, source.paper.id, {
                          status: event.currentTarget.value as ReadingStatus,
                        }),
                      )
                    }
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Find papers">
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
                    <h4 className="library-paper-title">{paper.title}</h4>
                    <p className="library-paper-meta">{paperMeta(paper)}</p>
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
    </Panel>
  );
}
