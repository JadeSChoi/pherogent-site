// PROTOTYPE — Direction A "Fieldbook": warm academic. Cream paper, deep
// botanical green, serif display headings, sidebar + card grid. Throwaway.
import {
  activeSection,
  chatTurns,
  projectName,
  projects,
  sections,
} from "./sample-data";
import type { PrototypeScreen } from "./DesignPrototype";

const css = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400&family=Public+Sans:wght@400;500;600&display=swap');
.pa-root {
  --paper: #f7f4ec; --panel: #fffdf8; --ink: #22302a; --ink-soft: #5d6b63;
  --green: #1d5c48; --green-deep: #153e32; --green-wash: #e7efe9;
  --amber: #9a6b15; --amber-wash: #f7ecd4; --border: #e3dccb;
  min-height: 100vh; background: var(--paper); color: var(--ink);
  font-family: 'Public Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.5;
}
.pa-root h1, .pa-root h2, .pa-root .pa-serif { font-family: 'Lora', Georgia, serif; }
.pa-top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 20px;
  background: var(--panel); border-bottom: 1px solid var(--border); }
.pa-brand { display: flex; align-items: center; gap: 10px; font-family: 'Lora', serif;
  font-size: 20px; font-weight: 600; color: var(--green-deep); }
.pa-brand-mark { width: 30px; height: 30px; border-radius: 50%; background: var(--green-deep);
  color: #f3efe2; display: grid; place-items: center; font-style: italic; font-size: 17px; }
.pa-top-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.pa-btn { border: 1px solid var(--border); background: var(--panel); color: var(--ink);
  border-radius: 8px; padding: 7px 14px; font: inherit; font-weight: 500; cursor: pointer; }
.pa-btn.pa-primary { background: var(--green-deep); border-color: var(--green-deep); color: #f3efe2; }
.pa-layout { display: flex; min-height: calc(100vh - 56px); }
.pa-side { width: 230px; flex-shrink: 0; padding: 20px 14px; border-right: 1px solid var(--border); }
.pa-side-label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft); margin: 14px 8px 6px; }
.pa-nav-item { display: block; width: 100%; text-align: left; border: 0; background: none;
  padding: 8px 10px; border-radius: 8px; font: inherit; color: var(--ink); cursor: pointer; }
.pa-nav-item.pa-active { background: var(--green-wash); color: var(--green-deep); font-weight: 600; }
.pa-main { flex: 1; padding: 32px clamp(16px, 4vw, 48px); max-width: 980px; }
.pa-eyebrow { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--green); }
.pa-main h1 { font-size: 34px; margin: 4px 0 4px; font-weight: 600; }
.pa-sub { color: var(--ink-soft); margin: 0 0 28px; }
.pa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 18px; }
.pa-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 20px; box-shadow: 0 1px 2px rgba(34,48,42,.05); display: flex; flex-direction: column; gap: 10px; }
.pa-card h2 { font-size: 20px; margin: 0; font-weight: 600; line-height: 1.3; }
.pa-card-q { color: var(--ink-soft); font-style: italic; font-family: 'Lora', serif; margin: 0; flex: 1; }
.pa-card-stats { display: flex; gap: 14px; font-size: 13px; color: var(--ink-soft);
  border-top: 1px solid var(--border); padding-top: 10px; }
.pa-card-stats strong { color: var(--ink); font-weight: 600; }
.pa-updated { margin-left: auto; }
.pa-new-card { border: 1.5px dashed var(--border); border-radius: 12px; display: grid;
  place-items: center; color: var(--green); font-weight: 600; min-height: 150px;
  background: none; font: inherit; cursor: pointer; }
/* chat screen */
.pa-chat-wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column;
  min-height: calc(100vh - 56px); padding: 24px 16px 20px; box-sizing: border-box; }
.pa-crumb { font-size: 13px; color: var(--ink-soft); margin-bottom: 18px; }
.pa-crumb b { color: var(--ink); font-weight: 600; }
.pa-turns { flex: 1; display: flex; flex-direction: column; gap: 18px; }
.pa-turn-user { align-self: flex-end; max-width: 85%; background: var(--green-wash);
  border-radius: 14px 14px 4px 14px; padding: 12px 16px; }
.pa-turn-agent { align-self: stretch; max-width: 100%; }
.pa-agent-label { font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--green); margin-bottom: 6px; }
.pa-check { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  margin-top: 12px; overflow: hidden; }
.pa-check-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--amber-wash); border-bottom: 1px solid var(--border); }
.pa-check-head h2 { font-size: 17px; margin: 0; color: var(--amber); }
.pa-badge { margin-left: auto; font-size: 11px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--amber); border: 1px solid currentColor;
  border-radius: 99px; padding: 2px 10px; }
.pa-check-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.pa-quote { border-left: 3px solid var(--green); padding: 2px 0 2px 14px; font-family: 'Lora', serif;
  font-style: italic; font-size: 16px; }
.pa-src { font-size: 13px; color: var(--ink-soft); }
.pa-src b { color: var(--ink); }
.pa-suggest { background: var(--green-wash); border-radius: 8px; padding: 10px 14px; }
.pa-suggest small { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--green); margin-bottom: 4px; }
.pa-check-actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 16px 16px; }
.pa-composer { margin-top: 24px; display: flex; gap: 8px; align-items: center;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 8px; }
.pa-section-pick { border: 0; background: var(--green-wash); color: var(--green-deep);
  font: inherit; font-weight: 600; border-radius: 8px; padding: 8px 10px; }
.pa-composer input { flex: 1; border: 0; background: none; font: inherit; outline: none; min-width: 0; }
@media (max-width: 720px) {
  .pa-side { display: none; }
  .pa-main { padding: 20px 16px; }
  .pa-top-actions .pa-btn:not(.pa-primary) { display: none; }
}
`;

function ProjectsScreen() {
  return (
    <div className="pa-layout">
      <aside className="pa-side">
        <div className="pa-side-label">Workspace</div>
        {["Projects", "Activity", "Settings"].map((item, i) => (
          <button key={item} className={`pa-nav-item${i === 0 ? " pa-active" : ""}`}>
            {item}
          </button>
        ))}
        <div className="pa-side-label">Recent</div>
        {projects.slice(0, 2).map((p) => (
          <button key={p.id} className="pa-nav-item">{p.name}</button>
        ))}
      </aside>
      <main className="pa-main">
        <div className="pa-eyebrow">Your workspace</div>
        <h1>Projects</h1>
        <p className="pa-sub">Each project keeps its question, sources, evidence, and manuscript together.</p>
        <div className="pa-grid">
          {projects.map((p) => (
            <article key={p.id} className="pa-card">
              <h2>{p.name}</h2>
              <p className="pa-card-q">{p.question}</p>
              <div className="pa-card-stats">
                <span><strong>{p.papers}</strong> papers</span>
                <span><strong>{p.checksDone}/{p.checksTotal}</strong> checks</span>
                <span className="pa-updated">{p.updated}</span>
              </div>
            </article>
          ))}
          <button className="pa-new-card">+ New project</button>
        </div>
      </main>
    </div>
  );
}

function ChatScreen() {
  return (
    <div className="pa-chat-wrap">
      <div className="pa-crumb"><b>{projectName}</b> · {activeSection}</div>
      <div className="pa-turns">
        {chatTurns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="pa-turn-user">{turn.text}</div>
          ) : (
            <div key={i} className="pa-turn-agent">
              <div className="pa-agent-label">Pherogent</div>
              <p style={{ margin: 0 }}>{turn.text}</p>
              {turn.check && (
                <div className="pa-check">
                  <div className="pa-check-head">
                    <h2 className="pa-serif">{turn.check.verdict}</h2>
                    <span className="pa-badge">{turn.check.badge}</span>
                  </div>
                  <div className="pa-check-body">
                    <p style={{ margin: 0 }}>{turn.check.explanation}</p>
                    <div className="pa-quote">“{turn.check.source.quote}”</div>
                    <div className="pa-src">
                      <b>{turn.check.source.authors} · {turn.check.source.year}</b> — {turn.check.source.title}. {turn.check.source.venue} · DOI {turn.check.source.doi} · {turn.check.source.passage}
                    </div>
                    <div className="pa-suggest">
                      <small>Suggested rewording</small>
                      {turn.check.suggestion}
                    </div>
                  </div>
                  <div className="pa-check-actions">
                    <button className="pa-btn pa-primary">Accept rewording</button>
                    <button className="pa-btn">Edit sentence</button>
                    <button className="pa-btn">Dismiss</button>
                  </div>
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <div className="pa-composer">
        <button className="pa-section-pick">{activeSection} ▾</button>
        <input placeholder={`Ask about ${sections.length} areas of this project…`} />
        <button className="pa-btn pa-primary">Send</button>
      </div>
    </div>
  );
}

export function DirectionA({ screen }: { screen: PrototypeScreen }) {
  return (
    <div className="pa-root">
      <style>{css}</style>
      <header className="pa-top">
        <span className="pa-brand"><span className="pa-brand-mark">p</span>Pherogent</span>
        <div className="pa-top-actions">
          <button className="pa-btn">Export</button>
          <button className="pa-btn pa-primary">Open manuscript</button>
        </div>
      </header>
      {screen === "projects" ? <ProjectsScreen /> : <ChatScreen />}
    </div>
  );
}
