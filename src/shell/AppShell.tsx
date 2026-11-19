import { useState } from "react";
import { SectionChatPanel } from "../chat/SectionChatPanel";
import { useSectionChatRuns } from "../chat/useSectionChatRuns";
import { Library } from "../library/Library";
import { ResearchCheckPanel } from "../research/ResearchCheckPanel";
import { useResearchCheckRun } from "../research/useResearchCheckRun";
import { ManuscriptPanel } from "../manuscript/ManuscriptPanel";
import { NotebookPanel } from "../notebook/NotebookPanel";
import { manuscriptWordCount } from "../storage/workspace";
import { OverviewSummary } from "../overview/OverviewSummary";
import type { SummaryDestination } from "../overview/summary";
import { UsageMeterPanel } from "../usage/UsageMeterPanel";
import { Nav, type NavItem } from "../ui";
import { WorkspaceControls } from "../workspace/WorkspaceControls";
import type { WorkspaceState } from "../workspace/useWorkspace";
import { pathFor, routeFromPath, useRoute, type Route } from "./router";
import "./shell.css";

/**
 * The Folio application shell (issue #19): the wordmark bar, the contents
 * rail, and one route per destination. The rail lists only destinations
 * that exist; it collapses to the top nav at narrow widths.
 */
export function AppShell(state: WorkspaceState) {
  const { workspace, activeProject, saved, commit, commitProject, updateProject } =
    state;
  const { route, navigate } = useRoute();
  // The one in-flight chat run lives here, above the routes, so a reply
  // lands in its originating Project and section wherever the author is.
  const chatRuns = useSectionChatRuns(updateProject);
  // Likewise the one Research check run: its unsaved note survives
  // navigation, and explicit saves land in the originating project.
  const researchRun = useResearchCheckRun(updateProject);

  const items: NavItem[] = (
    [
      ["overview", "Overview", undefined],
      ["library", "Library", (activeProject.sources ?? []).length],
      ["research", "Research", researchRun.run?.running ? "1 run open" : undefined],
      ["manuscript", "Manuscript", `${manuscriptWordCount(activeProject)} words`],
      ["chat", "Section chat", chatRuns.pending ? "1 run open" : undefined],
      ["usage", "Usage", undefined],
    ] as const
  ).map(([key, label, count]) => ({
    label,
    href: pathFor(key),
    count,
    current: route === key,
  }));

  // The empty-project next action means "go find a paper", not merely "go to
  // the Library": it carries the intent to open the Library's search. Plain
  // navigation (rail, top nav) drops the intent, so the Library opens with
  // its search closed there, as #24's owner-approved layout has it.
  const [addPaperIntent, setAddPaperIntent] = useState(false);
  const followNextAction = (destination: SummaryDestination) => {
    setAddPaperIntent(destination === "library");
    navigate(destination);
  };

  const go = (href: string) => {
    setAddPaperIntent(false);
    navigate(routeFromPath(href));
  };

  const page: Record<Route, React.ReactNode> = {
    overview: (
      <>
        <OverviewSummary project={activeProject} onNavigate={followNextAction} />
        <WorkspaceControls
          workspace={workspace}
          activeProject={activeProject}
          saved={saved}
          onCommit={commit}
        />
      </>
    ),
    library: (
      <Library
        project={activeProject}
        onProjectChange={commitProject}
        initialSearchOpen={addPaperIntent}
      />
    ),
    research: (
      // Keyed by project so the question field reseeds on a project switch.
      <ResearchCheckPanel
        key={activeProject.id}
        project={activeProject}
        runState={researchRun}
      />
    ),
    manuscript: (
      <>
        <ManuscriptPanel project={activeProject} onProjectChange={commitProject} />
        <NotebookPanel project={activeProject} onProjectChange={commitProject} />
      </>
    ),
    chat: (
      <SectionChatPanel
        project={activeProject}
        onProjectChange={commitProject}
        runs={chatRuns}
      />
    ),
    usage: <UsageMeterPanel />,
  };

  return (
    <div className="shell-root">
      <header className="shell-top">
        <span className="shell-mark">
          <span className="shell-pilcrow" aria-hidden="true">
            ¶
          </span>
          Pherogent
        </span>
        {/* The same contents, shown only when the rail yields at narrow
            widths — one of the two is always display:none. */}
        <div className="shell-topnav">
          <Nav label="Contents" items={items} onSelect={go} />
        </div>
        <span className="shell-saved" role="status">
          {saved
            ? "Saved on this device"
            : "Storage unavailable — export your work before closing"}
        </span>
      </header>
      <div className="shell-body">
        <aside className="shell-rail">
          <div className="shell-rail-project">{activeProject.name}</div>
          <button
            type="button"
            className="shell-rail-switch"
            onClick={() => navigate("overview")}
          >
            Switch project
          </button>
          <Nav label="Contents" items={items} onSelect={go} />
          <div className="shell-rail-foot">
            {saved
              ? "Saved on this device. Export a copy to keep your work."
              : "Storage unavailable — export your work before closing."}
          </div>
        </aside>
        <main className="shell-page">{page[route]}</main>
      </div>
    </div>
  );
}
