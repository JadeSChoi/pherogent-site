import { Library } from "../library/Library";
import { ManuscriptPanel } from "../manuscript/ManuscriptPanel";
import { NotebookPanel } from "../notebook/NotebookPanel";
import { manuscriptWordCount } from "../storage/workspace";
import { Nav, type NavItem } from "../ui";
import { WorkspaceControls } from "../workspace/WorkspaceControls";
import type { WorkspaceState } from "../workspace/useWorkspace";
import { ApiStatus } from "./ApiStatus";
import { pathFor, routeFromPath, useRoute, type Route } from "./router";
import "./shell.css";

/**
 * The Folio application shell (issue #19): the wordmark bar, the contents
 * rail, and one route per destination. The rail lists only destinations
 * that exist; it collapses to the top nav at narrow widths.
 */
export function AppShell(state: WorkspaceState) {
  const { workspace, activeProject, saved, commit, commitProject } = state;
  const { route, navigate } = useRoute();

  const items: NavItem[] = (
    [
      ["overview", "Overview", undefined],
      ["library", "Library", (activeProject.sources ?? []).length],
      ["manuscript", "Manuscript", `${manuscriptWordCount(activeProject)} words`],
    ] as const
  ).map(([key, label, count]) => ({
    label,
    href: pathFor(key),
    count,
    current: route === key,
  }));

  const go = (href: string) => navigate(routeFromPath(href));

  const page: Record<Route, React.ReactNode> = {
    overview: (
      <>
        <WorkspaceControls
          workspace={workspace}
          activeProject={activeProject}
          saved={saved}
          onCommit={commit}
        />
        <ApiStatus />
      </>
    ),
    library: <Library project={activeProject} onProjectChange={commitProject} />,
    manuscript: (
      <>
        <ManuscriptPanel project={activeProject} onProjectChange={commitProject} />
        <NotebookPanel project={activeProject} onProjectChange={commitProject} />
      </>
    ),
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
