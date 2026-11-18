import { useState } from "react";
import { Button, TextArea } from "../ui";
import {
  MANUSCRIPT_GUARD,
  appendNotebookToManuscript,
  emptyNotebook,
  type AppendOutcome,
  type Notebook,
  type Project,
} from "../storage/workspace";
import "./notebook.css";

type NotebookPanelProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
};

const APPEND_MESSAGES: Record<AppendOutcome, string> = {
  appended:
    "Findings and limitations were added to the manuscript, after your existing text.",
  empty: "Write findings or limitations first — hypotheses stay in the notebook.",
  duplicate: "These notes are already in the manuscript.",
  too_long: `The notes would exceed the manuscript's ${MANUSCRIPT_GUARD.toLocaleString("en-US")} character safety limit.`,
};

type FieldSpec = {
  key: keyof Notebook;
  label: string;
  rows: number;
  placeholder: string;
};

const FIELDS: FieldSpec[] = [
  {
    key: "findings",
    label: "Findings & interpretation",
    rows: 8,
    placeholder: "Write your research notes here…",
  },
  {
    key: "limitations",
    label: "Limitations & alternatives",
    rows: 4,
    placeholder: "What remains uncertain? What other explanation fits?",
  },
  {
    key: "hypothesis",
    label: "Working hypothesis",
    rows: 3,
    placeholder: "A testable expectation…",
  },
  {
    key: "nextExperiment",
    label: "Next experiment or question",
    rows: 3,
    placeholder: "The comparison or evidence you need next…",
  },
];

export function NotebookPanel({ project, onProjectChange }: NotebookPanelProps) {
  const [appendMessage, setAppendMessage] = useState<string>();
  const notebook = project.notebook ?? emptyNotebook();

  const append = () => {
    const result = appendNotebookToManuscript(project);
    if (result.outcome === "appended") onProjectChange(result.project);
    setAppendMessage(APPEND_MESSAGES[result.outcome]);
  };

  return (
    <section className="notebook-page" aria-label="Notebook">
      <h2 className="notebook-title">Notebook</h2>
      <p className="notebook-hint">
        Your findings, working hypotheses and open questions for {project.name}.
        Hypotheses and proposed tests are not findings.
      </p>
      <div className="notebook-fields">
        {FIELDS.map((field) => (
          <TextArea
            key={field.key}
            label={field.label}
            rows={field.rows}
            maxLength={20000}
            placeholder={field.placeholder}
            value={notebook[field.key]}
            onChange={(event) =>
              onProjectChange({
                ...project,
                notebook: { ...notebook, [field.key]: event.currentTarget.value },
              })
            }
          />
        ))}
      </div>
      <div className="notebook-actions">
        <Button onClick={append}>Add notes to manuscript</Button>
      </div>
      <p className="notebook-append-message" role="status">
        {appendMessage ??
          "Adding notes appends your findings and limitations to the manuscript; existing manuscript text is never changed."}
      </p>
    </section>
  );
}
