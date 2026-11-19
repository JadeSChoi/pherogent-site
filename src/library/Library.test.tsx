import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  type Project,
  type ReadingStatus,
  type SavedSource,
} from "../storage/workspace";
import type { Paper } from "./europePmc";
import { Library } from "./Library";

const NAMES = ["one", "two", "three"];

const savedSource = (index: number, status: ReadingStatus): SavedSource => ({
  paper: {
    id: `MED:${index}`,
    source: "MED",
    title: `Paper ${NAMES[index]}`,
    authors: [`Author ${NAMES[index].toUpperCase()}`],
    year: 2020 + index,
    journal: `Journal ${NAMES[index]}`,
    doi: "",
    pmid: "",
    pmcid: "",
    url: `https://europepmc.org/article/MED/${index}`,
    abstract: `Abstract ${NAMES[index]}.`,
    openAccess: false,
  } satisfies Paper,
  note: `Note ${NAMES[index]}`,
  status,
  savedAt: `2026-11-1${index}T10:00:00.000Z`,
});

function projectWithSources(...statuses: ReadingStatus[]): Project {
  return {
    ...createProject("Vision recovery"),
    sources: statuses.map((status, index) => savedSource(index, status)),
  };
}

const fixtureBody = JSON.stringify({
  hitCount: 1,
  resultList: {
    result: [
      {
        id: "33268865",
        source: "MED",
        pmid: "33268865",
        pmcid: "PMC7752134",
        title:
          "Reprogramming to recover youthful epigenetic information and restore vision.",
        authorString: "Lu Y, Brommer B, Tian X",
        pubYear: "2020",
        journalInfo: { journal: { title: "Nature" } },
        doi: "10.1038/s41586-020-2975-4",
        isOpenAccess: "Y",
        abstractText:
          "Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells promotes axon regeneration after injury.",
      },
    ],
  },
});

const stubSearch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(fixtureBody, { status: 200 })),
  );

/** Owns the project the way App does, so edits flow back into the prop. */
function Harness({ initial }: { initial?: Project }) {
  const [project, setProject] = useState(
    initial ?? createProject("Vision recovery", "Can OSK reverse vision loss?"),
  );
  return <Library project={project} onProjectChange={setProject} />;
}

const searchFixture = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Add paper" }));
  fireEvent.change(screen.getByLabelText("Search Europe PMC"), {
    target: { value: "OSK glaucoma mice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search papers" }));
  return screen.findByText(
    "Reprogramming to recover youthful epigenetic information and restore vision.",
  );
};

describe("Library", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the Europe PMC search from Add paper and closes it again", () => {
    render(<Harness />);
    // The search is a disclosure, not a static section below the ledger.
    expect(screen.queryByLabelText("Search Europe PMC")).toBeNull();

    const add = screen.getByRole("button", { name: "Add paper" });
    expect(add.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(add);
    expect(add.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Search Europe PMC")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("Search Europe PMC")).toBeNull();
    expect(add.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the selection, filter, and results across search open and close", async () => {
    stubSearch();
    render(<Harness initial={projectWithSources("to-read", "useful", "useful")} />);
    const saved = screen.getByRole("region", { name: "Saved sources" });
    const ledger = within(saved).getByRole("table");
    fireEvent.click(within(saved).getByRole("button", { name: "Useful 2" }));
    fireEvent.click(within(ledger).getByText("Paper two"));

    await searchFixture();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      (screen.getByLabelText("Reading note") as HTMLTextAreaElement).value,
    ).toBe("Note two");
    expect(
      within(saved)
        .getByRole("button", { name: "Useful 2" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // Reopening brings the previous results back rather than a blank search.
    fireEvent.click(screen.getByRole("button", { name: "Add paper" }));
    expect(
      screen.getByText(
        "Reprogramming to recover youthful epigenetic information and restore vision.",
      ),
    ).toBeTruthy();
  });

  it("searches Europe PMC and renders the results as candidates", async () => {
    stubSearch();
    render(<Harness />);

    await searchFixture();
    expect(screen.getByText(/Lu Y/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Inspect/ })).toBeTruthy();
  });

  it("shows the abstract and metadata on inspect, before any save", async () => {
    stubSearch();
    render(<Harness />);
    await searchFixture();

    fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/retinal ganglion cells/)).toBeTruthy();
    expect(within(dialog).getByText(/Nature/)).toBeTruthy();
    expect(within(dialog).getByText(/2020/)).toBeTruthy();
    expect(within(dialog).getByText(/10\.1038\/s41586-020-2975-4/)).toBeTruthy();
    // Saving is explicitly not a citation approval.
    expect(within(dialog).getByText(/does not approve/i)).toBeTruthy();
  });

  it("saves an inspected paper to the project as a non-citation source", async () => {
    stubSearch();
    render(<Harness />);
    await searchFixture();
    fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save to project" }));

    const saved = screen.getByRole("region", { name: "Saved sources" });
    // Saving selects the paper, so its title shows in the ledger row and
    // again as the detail heading.
    expect(
      within(saved).getAllByText(
        "Reprogramming to recover youthful epigenetic information and restore vision.",
      ),
    ).toHaveLength(2);
    expect(
      within(saved).getAllByText(/not an approved citation/i).length,
    ).toBeGreaterThan(0);
  });

  it("edits the reading note and status of a saved source", async () => {
    stubSearch();
    render(<Harness />);
    await searchFixture();
    fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save to project" }));

    fireEvent.change(screen.getByLabelText("Reading note"), {
      target: { value: "Mouse model only; clinical use unproven." },
    });
    fireEvent.change(screen.getByLabelText("Reading status"), {
      target: { value: "useful" },
    });

    const note = screen.getByLabelText("Reading note") as HTMLTextAreaElement;
    const status = screen.getByLabelText("Reading status") as HTMLSelectElement;
    expect(note.value).toBe("Mouse model only; clinical use unproven.");
    expect(status.value).toBe("useful");
  });

  it("reopens a saved source's abstract and metadata from the saved list", async () => {
    stubSearch();
    render(<Harness />);
    await searchFixture();
    fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save to project" }));

    const saved = screen.getByRole("region", { name: "Saved sources" });
    fireEvent.click(within(saved).getByRole("button", { name: /Inspect/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/retinal ganglion cells/)).toBeTruthy();
    expect(within(dialog).getByText(/10\.1038\/s41586-020-2975-4/)).toBeTruthy();
    // Reopening a saved source still presents it as reading material,
    // not an approved citation.
    expect(within(dialog).getByText(/not an approved citation/i)).toBeTruthy();
  });

  it("filters the ledger by reading status, with counts on the chips", () => {
    render(<Harness initial={projectWithSources("to-read", "useful", "useful")} />);
    const saved = screen.getByRole("region", { name: "Saved sources" });
    // Queries scope to the ledger table: the selected source's title also
    // shows as the detail heading.
    const ledger = within(saved).getByRole("table");
    expect(within(saved).getByRole("button", { name: "All 3" })).toBeTruthy();
    expect(within(ledger).getByText("Paper one")).toBeTruthy();

    fireEvent.click(within(saved).getByRole("button", { name: "Useful 2" }));
    expect(within(ledger).queryByText("Paper one")).toBeNull();
    expect(within(ledger).getByText("Paper two")).toBeTruthy();
    expect(within(ledger).getByText("Paper three")).toBeTruthy();

    fireEvent.click(within(saved).getByRole("button", { name: "All 3" }));
    expect(within(ledger).getByText("Paper one")).toBeTruthy();
  });

  it("selects a ledger row to edit that source's note and status", () => {
    render(<Harness initial={projectWithSources("to-read", "useful")} />);
    const saved = screen.getByRole("region", { name: "Saved sources" });
    // The first source is selected by default.
    expect((screen.getByLabelText("Reading note") as HTMLTextAreaElement).value).toBe(
      "Note one",
    );

    fireEvent.click(within(saved).getByText("Paper two"));
    expect((screen.getByLabelText("Reading note") as HTMLTextAreaElement).value).toBe(
      "Note two",
    );
    fireEvent.change(screen.getByLabelText("Reading note"), {
      target: { value: "Rewritten note." },
    });
    expect((screen.getByLabelText("Reading note") as HTMLTextAreaElement).value).toBe(
      "Rewritten note.",
    );

    fireEvent.click(within(saved).getByText("Paper one"));
    expect((screen.getByLabelText("Reading note") as HTMLTextAreaElement).value).toBe(
      "Note one",
    );
  });

  it("titles the detail with the selected source's title", () => {
    render(<Harness initial={projectWithSources("to-read", "useful")} />);
    const detail = screen.getByRole("complementary", { name: "Selected source" });
    expect(within(detail).getByRole("heading", { name: "Paper one" })).toBeTruthy();

    // The title now appears in both the ledger row and the detail.
    const saved = screen.getByRole("region", { name: "Saved sources" });
    expect(within(saved).getAllByText("Paper one")).toHaveLength(2);

    fireEvent.click(within(within(saved).getByRole("table")).getByText("Paper two"));
    expect(
      within(screen.getByRole("complementary", { name: "Selected source" })).getByRole(
        "heading",
        { name: "Paper two" },
      ),
    ).toBeTruthy();
  });

  it("hides the detail instead of retargeting it when the filter excludes the selection", () => {
    render(<Harness initial={projectWithSources("to-read", "useful", "useful")} />);
    const saved = screen.getByRole("region", { name: "Saved sources" });
    // Paper one (to-read) is selected by default; filtering to Useful must
    // not silently point the editor at a different source.
    fireEvent.click(within(saved).getByRole("button", { name: "Useful 2" }));
    expect(screen.queryByLabelText("Reading note")).toBeNull();
    expect(
      within(saved).getByText("Select a row to edit its note and status."),
    ).toBeTruthy();

    // Changing a status so the row leaves the active filter also hides the
    // detail rather than rebinding it.
    fireEvent.click(within(saved).getByText("Paper two"));
    fireEvent.change(screen.getByLabelText("Reading status"), {
      target: { value: "conflicting" },
    });
    expect(screen.queryByLabelText("Reading note")).toBeNull();
  });

  it("reports a failed search without inventing results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Add paper" }));
    fireEvent.change(screen.getByLabelText("Search Europe PMC"), {
      target: { value: "oct4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search papers" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/too many requests/i);
  });
});
