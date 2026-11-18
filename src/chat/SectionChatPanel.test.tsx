import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import { SectionChatPanel } from "./SectionChatPanel";
import { conversationFor, withAiReply, type ChatRequest } from "./sectionChat";
import type { ChatStage } from "./stages";
import type { SectionChatRuns } from "./useSectionChatRuns";

const idleRuns = (
  start = vi.fn<SectionChatRuns["start"]>().mockResolvedValue(undefined),
): SectionChatRuns & { start: ReturnType<typeof vi.fn<SectionChatRuns["start"]>> } => ({
  pending: null,
  notice: null,
  dismissNotice: vi.fn(),
  start,
});

function Harness({
  initial,
  runs,
  onProject,
}: {
  initial?: Project;
  runs?: SectionChatRuns;
  onProject?: (next: Project) => void;
}) {
  const [project, setProject] = useState(initial ?? createProject("Vision recovery"));
  return (
    <SectionChatPanel
      project={project}
      onProjectChange={(next) => {
        setProject(next);
        onProject?.(next);
      }}
      runs={runs ?? idleRuns()}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the section picker", () => {
  it("reaches all eleven sections from one surface", () => {
    render(<Harness />);
    const picker = screen.getByRole("navigation", { name: "Sections" });
    for (const label of [
      "Research organizer",
      "Data processing",
      "Methods",
      "Results",
      "Figures & tables",
      "Title",
      "Introduction",
      "Discussion",
      "Abstract",
      "References",
      "Final review",
    ]) {
      expect(within(picker).getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("keeps each section's conversation its own", () => {
    let project = createProject("Vision recovery");
    project = withAiReply(project, "methods", {
      runId: "run-1",
      text: "Methods-only reply.",
      suggestedDraft: null,
    });
    render(<Harness initial={project} />);
    fireEvent.click(screen.getByRole("button", { name: /Methods/ }));
    expect(screen.getByText("Methods-only reply.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));
    expect(screen.queryByText("Methods-only reply.")).toBeNull();
  });
});

describe("prepared examples", () => {
  it("loads the labeled prepared exchange without any network request", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("A prepared example must make no request.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Load the prepared example" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByText("Prepared example · no AI ran").length).toBeGreaterThan(0);
    expect(screen.getByText(/prewritten example/)).toBeTruthy();
  });
});

describe("the composer", () => {
  it("keeps unsent text with its own Project", () => {
    const alpha = createProject("Alpha");
    const beta = createProject("Beta");
    const runs = idleRuns();
    const { rerender } = render(
      <SectionChatPanel project={alpha} onProjectChange={() => {}} runs={runs} />,
    );
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Alpha's unsent question" },
    });
    rerender(
      <SectionChatPanel project={beta} onProjectChange={() => {}} runs={runs} />,
    );
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
    rerender(
      <SectionChatPanel project={alpha} onProjectChange={() => {}} runs={runs} />,
    );
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
      "Alpha's unsent question",
    );
  });
});

describe("consent", () => {
  const accessOk = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            canRun: true,
            message: "Open to everyone while the shared allowance lasts.",
            needsSignIn: false,
            signedIn: false,
          }),
          { status: 200 },
        ),
      ),
    );

  it("requires consent on the exact outgoing message and bounded context", async () => {
    accessOk();
    const runs = idleRuns();
    const initial = createProject("Vision recovery", "Does OSK restore vision?");
    render(<Harness initial={initial} runs={runs} />);
    fireEvent.click(screen.getByRole("button", { name: /Results/ }));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Describe the outcome." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview & send" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Send to the Results agent?")).toBeTruthy();
    const outgoing = dialog.querySelector(".evidence-check-outgoing")!.textContent!;
    const request = JSON.parse(outgoing) as ChatRequest;
    expect(request).toMatchObject({
      consent: true,
      stage: "results",
      message: "Describe the outcome.",
      studyDesign: true,
    });
    expect(request.context).toContain("PROJECT QUESTION\nDoes OSK restore vision?");
    // Nothing was sent by opening the preview.
    expect(runs.start).not.toHaveBeenCalled();

    const consentButton = await within(dialog).findByRole("button", {
      name: "Consent and send",
    });
    expect((consentButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(consentButton);
    expect(runs.start).toHaveBeenCalledTimes(1);
    const [, stage, sent] = runs.start.mock.calls[0];
    expect(stage).toBe("results");
    expect(sent).toEqual(request);
    // The consented message leaves the composer.
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses to preview an empty message", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Preview & send" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Write a message/);
  });

  it("shows the open run and blocks a second send meanwhile", () => {
    const initial = createProject("Vision recovery");
    const runs: SectionChatRuns = {
      ...idleRuns(),
      pending: {
        projectId: initial.id,
        stage: "organizer",
        requestId: "r",
        step: "Preparing one reply.",
      },
    };
    render(<Harness initial={initial} runs={runs} />);
    expect(screen.getByText(/Preparing one reply./)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Preview & send" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("the draft flow", () => {
  const replyProject = () =>
    withAiReply(createProject("Vision recovery"), "organizer", {
      runId: "run-1",
      text: "Here is a brief.",
      suggestedDraft: { title: "Project brief", body: "Question: unknown." },
    });

  it("applies a suggested draft, preserving the prior output and clearing review", () => {
    const states: Project[] = [];
    render(<Harness initial={replyProject()} onProject={(next) => states.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Use as section draft" }));
    const latest = () => states[states.length - 1];
    expect(conversationFor(latest(), "organizer").draft).toMatchObject({
      title: "Project brief",
      body: "Question: unknown.",
      reviewed: false,
    });

    // Edit, review, then apply again: the edited output is preserved in
    // history and the review status is cleared.
    fireEvent.change(screen.getByLabelText("Draft text"), {
      target: { value: "Edited brief." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(conversationFor(latest(), "organizer").draft.reviewed).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use as section draft" }));
    const draft = conversationFor(latest(), "organizer").draft;
    expect(draft.reviewed).toBe(false);
    expect(draft.history[0].body).toBe("Edited brief.");
  });

  it("gates append to Manuscript on mark-reviewed and never replaces text", () => {
    const states: Project[] = [];
    render(<Harness initial={replyProject()} onProject={(next) => states.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Use as section draft" }));
    const append = screen.getByRole("button", { name: "Add a copy to Manuscript" });
    expect((append as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect((append as HTMLButtonElement).disabled).toBe(false);
    const before = states[states.length - 1].manuscript!.sections;
    fireEvent.click(append);
    const latest = states[states.length - 1];
    const sections = latest.manuscript!.sections;
    expect(sections).toHaveLength(before.length + 1);
    expect(sections.slice(0, before.length)).toEqual(before);
    expect(sections[sections.length - 1]).toMatchObject({
      heading: "Project brief",
      text: "Question: unknown.",
    });
    expect(screen.getByRole("status").textContent).toMatch(/added to the Manuscript/i);

    // Appending the same reviewed draft again refuses the duplicate.
    fireEvent.click(screen.getByRole("button", { name: "Add a copy to Manuscript" }));
    expect(states[states.length - 1].manuscript!.sections).toHaveLength(sections.length);
    expect(screen.getByRole("status").textContent).toMatch(/already in the Manuscript/i);
  });
});
