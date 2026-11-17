import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import { Library } from "./Library";

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
    expect(
      within(saved).getByText(
        "Reprogramming to recover youthful epigenetic information and restore vision.",
      ),
    ).toBeTruthy();
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

  it("reports a failed search without inventing results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Search Europe PMC"), {
      target: { value: "oct4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search papers" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/too many requests/i);
  });
});
