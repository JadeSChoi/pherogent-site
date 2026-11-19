import { Button } from "../ui";
import type { Project } from "../storage/workspace";
import { projectSummary, type SummaryDestination } from "./summary";
import "./overview.css";

/**
 * The Overview's lead (issue #23): the project head, its ledger of counts,
 * and the one primary next action the project's state calls for. Everything
 * shown derives from the active Project; nothing here writes.
 */

type OverviewSummaryProps = {
  project: Project;
  onNavigate: (destination: SummaryDestination) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overview-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OverviewSummary({ project, onNavigate }: OverviewSummaryProps) {
  const summary = projectSummary(project);
  const { decided, total } = summary.review;
  const count = (value: number) => value.toLocaleString("en-US");
  return (
    <section className="overview-summary" aria-label="Project summary">
      <header className="overview-head">
        <h1 className="overview-project-name">{project.name}</h1>
        {project.question && <p className="overview-question">{project.question}</p>}
      </header>
      <dl className="overview-rows">
        <Row label="Saved sources">{count(summary.sourceCount)}</Row>
        <Row label="Manuscript sections">{count(summary.sectionCount)}</Row>
        <Row label="Words">{count(summary.wordCount)}</Row>
        <Row label="Sentences decided">
          {total === 0 ? (
            <span className="overview-none">None to review yet</span>
          ) : (
            `${count(decided)} of ${count(total)}`
          )}
        </Row>
      </dl>
      <div className="overview-next">
        <p className="overview-reason">{summary.nextAction.reason}</p>
        <Button
          variant="primary"
          onClick={() => onNavigate(summary.nextAction.destination)}
        >
          {summary.nextAction.label}
        </Button>
      </div>
    </section>
  );
}
