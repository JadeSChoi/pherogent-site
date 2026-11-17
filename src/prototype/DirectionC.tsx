// PROTOTYPE — Direction C "Offprint": editorial/manuscript. Single centered
// column, large serif type, hairline rules instead of cards, oxblood accent,
// evidence as margin notes. Throwaway.
import {
  activeSection,
  chatTurns,
  checkedSentence,
  evidenceCheck,
  projectName,
  projects,
} from "./sample-data";
import type { PrototypeScreen } from "./DesignPrototype";

const css = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&display=swap');
.pc-root {
  --paper: #fffdf9; --ink: #16130e; --ink-soft: #6c6354; --accent: #8a2a1d;
  --rule: #d9d2c5; --rule-strong: #16130e; --wash: #f6f1e7;
  min-height: 100vh; background: var(--paper); color: var(--ink);
  font-family: 'Newsreader', Georgia, serif; font-size: 17px; line-height: 1.55;
}
.pc-head { max-width: 1020px; margin: 0 auto; padding: 22px 20px 14px;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 24px; border-bottom: 2px solid var(--rule-strong); }
.pc-masthead { font-size: 22px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.pc-head nav { display: flex; gap: 20px; margin-left: auto; font-size: 15px; }
.pc-head nav a { color: var(--ink-soft); text-decoration: none; }
.pc-head nav a.pc-on { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }
.pc-col { max-width: 1020px; margin: 0 auto; padding: 36px 20px 60px; }
.pc-kicker { font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
.pc-col h1 { font-size: 42px; font-weight: 500; margin: 0 0 6px; line-height: 1.1; }
.pc-lede { font-style: italic; color: var(--ink-soft); font-size: 19px; margin: 0 0 36px; }
/* contents list */
.pc-toc { border-top: 1px solid var(--rule); max-width: 680px; }
.pc-entry { display: block; width: 100%; text-align: left; background: none; border: 0;
  border-bottom: 1px solid var(--rule); padding: 22px 4px; cursor: pointer; font: inherit; color: inherit; }
.pc-entry-row { display: flex; align-items: baseline; gap: 16px; }
.pc-entry-num { font-size: 14px; color: var(--accent); font-variant-numeric: tabular-nums; }
.pc-entry h2 { font-size: 24px; font-weight: 500; margin: 0; }
.pc-entry-q { margin: 6px 0 8px 34px; font-style: italic; color: var(--ink-soft); }
.pc-entry-meta { margin-left: 34px; font-size: 13.5px; letter-spacing: .04em; color: var(--ink-soft); }
.pc-entry-meta b { color: var(--ink); font-weight: 600; }
.pc-new { margin-top: 26px; margin-left: 34px; background: none; border: 0; font: inherit;
  font-style: italic; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline;
  text-underline-offset: 4px; }
/* chat as annotated manuscript */
.pc-chat { display: grid; grid-template-columns: minmax(0, 620px) 300px; gap: 48px; }
.pc-turns { display: flex; flex-direction: column; gap: 28px; }
.pc-speaker { font-size: 12.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 6px; }
.pc-turn-agent .pc-speaker { color: var(--accent); }
.pc-turn p { margin: 0; }
.pc-sentence { background: var(--wash); border-bottom: 2px solid var(--accent); padding: 2px 3px; }
.pc-margin { border-left: 1px solid var(--rule); padding-left: 24px; font-size: 14.5px; align-self: start; position: sticky; top: 24px; }
.pc-margin-label { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
.pc-margin h3 { font-size: 17px; margin: 0 0 6px; font-weight: 600; }
.pc-margin blockquote { margin: 10px 0; font-style: italic; }
.pc-margin-src { color: var(--ink-soft); font-size: 13.5px; }
.pc-suggest { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--rule); }
.pc-suggest-label { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 6px; }
.pc-decisions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; align-items: flex-start; }
.pc-link-btn { background: none; border: 0; padding: 0; font: inherit; font-size: 15px;
  color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 4px; }
.pc-link-btn.pc-muted { color: var(--ink-soft); }
.pc-composer { margin-top: 44px; border-top: 2px solid var(--rule-strong); padding-top: 16px;
  display: flex; gap: 14px; align-items: baseline; max-width: 620px; }
.pc-composer label { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-soft); white-space: nowrap; }
.pc-composer select { font: inherit; border: 0; background: none; color: var(--accent);
  border-bottom: 1px solid var(--rule); }
.pc-composer input { flex: 1; border: 0; border-bottom: 1px solid var(--rule); background: none;
  font: inherit; font-style: italic; outline: none; padding: 4px 0; min-width: 0; }
@media (max-width: 860px) {
  .pc-chat { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .pc-composer { flex-wrap: wrap; }
  .pc-margin { position: static; border-left: 3px solid var(--accent); margin: 8px 0 0 0; }
  .pc-col h1 { font-size: 32px; }
}
`;

function ProjectsScreen() {
  return (
    <main className="pc-col">
      <p className="pc-kicker">Contents</p>
      <h1>Projects</h1>
      <p className="pc-lede">Three lines of inquiry, in progress.</p>
      <div className="pc-toc">
        {projects.map((p, i) => (
          <button key={p.id} className="pc-entry">
            <span className="pc-entry-row">
              <span className="pc-entry-num">{String(i + 1).padStart(2, "0")}</span>
              <h2>{p.name}</h2>
            </span>
            <p className="pc-entry-q">{p.question}</p>
            <p className="pc-entry-meta">
              <b>{p.papers}</b> papers · <b>{p.checksDone}/{p.checksTotal}</b> evidence checks · last touched {p.updated.toLowerCase()}
            </p>
          </button>
        ))}
      </div>
      <button className="pc-new">Begin a new project</button>
    </main>
  );
}

function ChatScreen() {
  const agentTurn = chatTurns.find((t) => t.role === "agent");
  return (
    <main className="pc-col">
      <p className="pc-kicker">{projectName} · {activeSection}</p>
      <h1>Evidence check</h1>
      <p className="pc-lede">One sentence, one source, your decision.</p>
      <div className="pc-chat">
        <div className="pc-turns">
          <div className="pc-turn pc-turn-user">
            <p className="pc-speaker">You</p>
            <p>
              Check this sentence against my library:{" "}
              <span className="pc-sentence">“{checkedSentence}”</span>
            </p>
          </div>
          <div className="pc-turn pc-turn-agent">
            <p className="pc-speaker">Pherogent</p>
            <p>{agentTurn?.text}</p>
          </div>
          <div className="pc-composer">
            <label>
              Ask{" "}
              <select defaultValue={activeSection}>
                {["Workspace", "Library", "Manuscript", "Evidence", "Data analysis"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <input placeholder="Write your next question…" />
            <button className="pc-link-btn">Send</button>
          </div>
        </div>
        <aside className="pc-margin">
          <p className="pc-margin-label">{evidenceCheck.verdict}</p>
          <h3>{evidenceCheck.badge}</h3>
          <p style={{ margin: 0 }}>{evidenceCheck.explanation}</p>
          <blockquote>“{evidenceCheck.source.quote}”</blockquote>
          <p className="pc-margin-src">
            {evidenceCheck.source.authors} ({evidenceCheck.source.year}). {evidenceCheck.source.title}. <i>{evidenceCheck.source.venue}</i>. {evidenceCheck.source.passage}.
          </p>
          <div className="pc-suggest">
            <p className="pc-suggest-label">Suggested rewording</p>
            <p style={{ margin: 0 }}>{evidenceCheck.suggestion}</p>
          </div>
          <div className="pc-decisions">
            <button className="pc-link-btn">Accept the rewording</button>
            <button className="pc-link-btn">Edit the sentence myself</button>
            <button className="pc-link-btn pc-muted">Dismiss this check</button>
          </div>
        </aside>
      </div>
    </main>
  );
}

export function DirectionC({ screen }: { screen: PrototypeScreen }) {
  return (
    <div className="pc-root">
      <style>{css}</style>
      <header className="pc-head">
        <span className="pc-masthead">Pherogent</span>
        <nav>
          <a href="#projects" className={screen === "projects" ? "pc-on" : ""}>Projects</a>
          <a href="#workspace" className={screen === "chat" ? "pc-on" : ""}>Workspace</a>
          <a href="#activity">Activity</a>
        </nav>
      </header>
      {screen === "projects" ? <ProjectsScreen /> : <ChatScreen />}
    </div>
  );
}
