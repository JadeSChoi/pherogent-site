// PROTOTYPE — Direction B "Instrument": clinical lab-bench tool. Cool neutrals,
// teal accent, mono data type, dense project table, split-pane chat + evidence
// rail. Throwaway.
import {
  activeSection,
  chatTurns,
  evidenceCheck,
  projectName,
  projects,
  sections,
} from "./sample-data";
import type { PrototypeScreen } from "./DesignPrototype";

const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
.pb-root {
  --bg: #eef1f4; --panel: #ffffff; --ink: #101820; --ink-soft: #5a6572;
  --teal: #0e7490; --teal-wash: #e0f1f5; --warn: #92510a; --warn-wash: #fdf0dd;
  --border: #d4dade; --mono: 'IBM Plex Mono', ui-monospace, monospace;
  min-height: 100vh; background: var(--bg); color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.45;
}
.pb-top { display: flex; align-items: center; gap: 20px; padding: 0 16px; height: 46px;
  background: var(--panel); border-bottom: 1px solid var(--border); }
.pb-brand { font-weight: 700; letter-spacing: .02em; font-size: 15px; }
.pb-brand span { color: var(--teal); }
.pb-top nav { display: flex; gap: 2px; height: 100%; }
.pb-top nav button { border: 0; background: none; font: inherit; font-weight: 500;
  color: var(--ink-soft); padding: 0 12px; cursor: pointer; border-bottom: 2px solid transparent; }
.pb-top nav button.pb-on { color: var(--ink); border-bottom-color: var(--teal); }
.pb-status { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-soft);
  display: flex; gap: 14px; align-items: center; }
.pb-dot { width: 7px; height: 7px; border-radius: 50%; background: #1a9b58; display: inline-block; margin-right: 5px; }
.pb-btn { border: 1px solid var(--border); background: var(--panel); border-radius: 4px;
  padding: 6px 12px; font: inherit; font-weight: 500; cursor: pointer; color: var(--ink); }
.pb-btn.pb-primary { background: var(--teal); border-color: var(--teal); color: #fff; }
/* projects table */
.pb-main { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.pb-main-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; }
.pb-main-head h1 { font-size: 18px; font-weight: 700; margin: 0; }
.pb-count { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
.pb-main-head .pb-btn { margin-left: auto; }
.pb-table { width: 100%; background: var(--panel); border: 1px solid var(--border);
  border-radius: 6px; border-collapse: separate; border-spacing: 0; overflow: hidden; }
.pb-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--ink-soft); font-weight: 600; padding: 10px 14px; border-bottom: 1px solid var(--border);
  background: #f7f9fa; }
.pb-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
.pb-table tr:last-child td { border-bottom: 0; }
.pb-table tr:hover td { background: var(--teal-wash); cursor: pointer; }
.pb-proj-name { font-weight: 600; }
.pb-proj-q { color: var(--ink-soft); font-size: 13px; margin-top: 2px; }
.pb-num { font-family: var(--mono); font-size: 13px; white-space: nowrap; }
.pb-meter { width: 90px; height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin-top: 5px; }
.pb-meter i { display: block; height: 100%; background: var(--teal); }
/* chat split pane */
.pb-split { display: grid; grid-template-columns: minmax(0, 1fr) 340px;
  height: calc(100vh - 46px); }
.pb-chat { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--border); }
.pb-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 16px;
  background: var(--panel); border-bottom: 1px solid var(--border); font-size: 13px; }
.pb-toolbar b { font-weight: 600; }
.pb-seg { display: flex; margin-left: auto; border: 1px solid var(--border); border-radius: 4px; overflow: auto; max-width: 100%; }
.pb-seg button { border: 0; background: var(--panel); font: inherit; font-size: 12px;
  padding: 5px 10px; cursor: pointer; color: var(--ink-soft); white-space: nowrap; }
.pb-seg button.pb-on { background: var(--teal); color: #fff; }
.pb-log { flex: 1; overflow: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }
.pb-turn { max-width: 720px; }
.pb-turn-meta { font-family: var(--mono); font-size: 11px; color: var(--ink-soft);
  text-transform: uppercase; margin-bottom: 4px; }
.pb-turn-user .pb-turn-body { background: var(--panel); border: 1px solid var(--border);
  border-left: 3px solid var(--ink-soft); border-radius: 4px; padding: 10px 14px; }
.pb-turn-agent .pb-turn-body { background: var(--panel); border: 1px solid var(--border);
  border-left: 3px solid var(--teal); border-radius: 4px; padding: 10px 14px; }
.pb-verdict { margin-top: 10px; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.pb-verdict-head { display: flex; gap: 10px; align-items: center; background: var(--warn-wash);
  padding: 8px 12px; font-weight: 600; color: var(--warn); font-size: 13px; }
.pb-chip { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
  border: 1px solid currentColor; border-radius: 3px; padding: 1px 6px; margin-left: auto; }
.pb-verdict-body { padding: 10px 12px; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
.pb-suggest { background: var(--teal-wash); border-radius: 4px; padding: 8px 10px; }
.pb-suggest small { display: block; font-family: var(--mono); font-size: 10px;
  text-transform: uppercase; color: var(--teal); margin-bottom: 3px; }
.pb-actions { display: flex; gap: 6px; padding: 0 12px 12px; flex-wrap: wrap; }
.pb-composer { display: flex; gap: 8px; padding: 10px 16px; background: var(--panel);
  border-top: 1px solid var(--border); }
.pb-composer input { flex: 1; border: 1px solid var(--border); border-radius: 4px;
  padding: 8px 10px; font: inherit; min-width: 0; }
/* evidence rail */
.pb-rail { background: var(--panel); overflow: auto; padding: 16px; }
.pb-rail h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--ink-soft); margin: 0 0 12px; }
.pb-source { border: 1px solid var(--border); border-radius: 4px; padding: 12px; font-size: 13px; }
.pb-source b { display: block; margin-bottom: 4px; }
.pb-source-meta { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); margin-bottom: 8px; }
.pb-source blockquote { margin: 8px 0; padding-left: 10px; border-left: 2px solid var(--teal);
  color: var(--ink); font-style: italic; }
.pb-rail-links { display: flex; gap: 12px; margin-top: 8px; font-size: 12px; }
.pb-rail-links a { color: var(--teal); }
@media (max-width: 860px) {
  .pb-split { grid-template-columns: minmax(0, 1fr); height: auto; }
  .pb-status { display: none; }
  .pb-rail { border-top: 1px solid var(--border); }
  .pb-table th:nth-child(3), .pb-table td:nth-child(3),
  .pb-table th:nth-child(5), .pb-table td:nth-child(5) { display: none; }
}
`;

function ProjectsScreen() {
  return (
    <main className="pb-main">
      <div className="pb-main-head">
        <h1>Projects</h1>
        <span className="pb-count">{projects.length} active</span>
        <button className="pb-btn pb-primary">New project</button>
      </div>
      <table className="pb-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Papers</th>
            <th>Words</th>
            <th>Evidence checks</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="pb-proj-name">{p.name}</div>
                <div className="pb-proj-q">{p.question}</div>
              </td>
              <td className="pb-num">{p.papers}</td>
              <td className="pb-num">{p.words.toLocaleString()}</td>
              <td>
                <span className="pb-num">{p.checksDone}/{p.checksTotal}</span>
                <div className="pb-meter">
                  <i style={{ width: `${(p.checksDone / p.checksTotal) * 100}%` }} />
                </div>
              </td>
              <td className="pb-num">{p.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function ChatScreen() {
  return (
    <div className="pb-split">
      <section className="pb-chat">
        <div className="pb-toolbar">
          <b>{projectName}</b>
          <div className="pb-seg">
            {sections.map((s) => (
              <button key={s} className={s === activeSection ? "pb-on" : ""}>{s}</button>
            ))}
          </div>
        </div>
        <div className="pb-log">
          {chatTurns.map((turn, i) => (
            <div key={i} className={`pb-turn pb-turn-${turn.role}`}>
              <div className="pb-turn-meta">{turn.role === "user" ? "You · 14:02" : "Pherogent · 14:02"}</div>
              <div className="pb-turn-body">
                {turn.text}
                {turn.role === "agent" && turn.check && (
                  <div className="pb-verdict">
                    <div className="pb-verdict-head">
                      {turn.check.verdict}
                      <span className="pb-chip">{turn.check.badge}</span>
                    </div>
                    <div className="pb-verdict-body">
                      {turn.check.explanation}
                      <div className="pb-suggest">
                        <small>Suggested rewording</small>
                        {turn.check.suggestion}
                      </div>
                    </div>
                    <div className="pb-actions">
                      <button className="pb-btn pb-primary">Accept rewording</button>
                      <button className="pb-btn">Edit sentence</button>
                      <button className="pb-btn">Dismiss</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="pb-composer">
          <input placeholder="Message this project…" />
          <button className="pb-btn pb-primary">Send</button>
        </div>
      </section>
      <aside className="pb-rail">
        <h2>Evidence record</h2>
        <div className="pb-source">
          <b>{evidenceCheck.source.title}</b>
          <div className="pb-source-meta">
            {evidenceCheck.source.authors} {evidenceCheck.source.year} · {evidenceCheck.source.venue}
            <br />DOI {evidenceCheck.source.doi} · {evidenceCheck.source.passage}
          </div>
          <blockquote>“{evidenceCheck.source.quote}”</blockquote>
          <div className="pb-rail-links">
            <a href="#open">Open paper ↗</a>
            <a href="#full">Full text ↗</a>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function DirectionB({ screen }: { screen: PrototypeScreen }) {
  return (
    <div className="pb-root">
      <style>{css}</style>
      <header className="pb-top">
        <span className="pb-brand">pherogent<span>_</span></span>
        <nav>
          <button className={screen === "projects" ? "pb-on" : ""}>Projects</button>
          <button className={screen === "chat" ? "pb-on" : ""}>Workspace</button>
          <button>Activity</button>
        </nav>
        <div className="pb-status">
          <span><span className="pb-dot" />LOCAL · SAVED</span>
          <span>0 TOKENS</span>
        </div>
      </header>
      {screen === "projects" ? <ProjectsScreen /> : <ChatScreen />}
    </div>
  );
}
