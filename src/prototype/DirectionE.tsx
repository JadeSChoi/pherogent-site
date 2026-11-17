// PROTOTYPE — round-2 Direction E "Study": a reading room inside a precise
// instrument. Green-biased off-white ground, white surfaces, heritage botanical
// green as the single accent; separate semantic colors for evidence states.
// Schibsted Grotesk UI + Source Serif 4 content. Left contents rail (a TOC,
// not icon nav), dense finished tables, structured evidence rail. Throwaway.
import {
  libraryCounts,
  manuscript,
  papers,
  type Sentence,
} from "./round2-data";

const css = `
@import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..600;1,8..60,400..500&display=swap');
.pe-root {
  --ground: #F1F2EC; --surface: #FFFFFF; --ink: #1A231D; --ink-2: #5C675F;
  --rule: #E1E3DA; --rule-2: #CBCFC3; --hover: #F5F6F1; --select: #EDF2EC;
  --green: #1E5C48; --green-ink: #FFFFFF;
  --ok: #577A2E; --warn: #A3730E; --bad: #AC4328; --mute: #8B9188;
  --ok-wash: #EFF3E3; --warn-wash: #F8EFDA; --bad-wash: #F8E7DF;
  --sans: 'Schibsted Grotesk', system-ui, sans-serif;
  --serif: 'Source Serif 4', Georgia, serif;
  min-height: 100vh; background: var(--ground); color: var(--ink);
  font-family: var(--sans); font-size: 14px; line-height: 1.5;
}
.pe-root.pe-dark {
  --ground: #111612; --surface: #171E18; --ink: #E2E7E0; --ink-2: #9AA79D;
  --rule: #28312A; --rule-2: #39443B; --hover: #1C241D; --select: #1F2A22;
  --green: #6FBD97; --green-ink: #0E1510;
  --ok: #94BB62; --warn: #D8A94E; --bad: #DB8265; --mute: #6F7A71;
  --ok-wash: #1D2715; --warn-wash: #2C2411; --bad-wash: #2F1C14;
}
.pe-root *:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; border-radius: 2px; }

.pe-shell { display: flex; min-height: 100vh; }
.pe-rail { width: 236px; flex-shrink: 0; padding: 22px 18px; display: flex;
  flex-direction: column; gap: 4px; border-right: 1px solid var(--rule); }
.pe-mark { font-weight: 700; font-size: 17px; letter-spacing: -.01em; margin-bottom: 20px; }
.pe-mark i { font-style: normal; color: var(--green); }
.pe-rail-project { font-family: var(--serif); font-size: 15px; font-weight: 600;
  line-height: 1.3; margin-bottom: 12px; }
.pe-rail a { display: flex; justify-content: space-between; align-items: baseline;
  color: var(--ink-2); text-decoration: none; padding: 6px 10px; border-radius: 5px;
  font-size: 13.5px; transition: background .12s ease-out, color .12s ease-out; }
.pe-rail a:hover { background: var(--hover); color: var(--ink); }
.pe-rail a.pe-on { background: var(--select); color: var(--ink); font-weight: 600;
  box-shadow: inset 2px 0 0 var(--green); }
.pe-rail a small { font-size: 12px; color: var(--mute); font-variant-numeric: tabular-nums; }
.pe-rail-foot { margin-top: auto; font-size: 12px; color: var(--mute); line-height: 1.45; }

.pe-main { flex: 1; min-width: 0; padding: 22px 28px 60px; }
.pe-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
.pe-bar h1 { font-family: var(--serif); font-size: 23px; font-weight: 600; margin: 0; }
.pe-bar-sub { color: var(--ink-2); font-size: 13px; }
.pe-btn { font: inherit; font-weight: 600; font-size: 13px; background: var(--green);
  color: var(--green-ink); border: 0; border-radius: 6px; padding: 7px 14px;
  cursor: pointer; margin-left: auto; transition: filter .12s ease-out; }
.pe-btn:hover { filter: brightness(1.12); }
.pe-ghost { font: inherit; font-size: 13px; background: none; border: 1px solid var(--rule-2);
  color: var(--ink); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.pe-ghost:hover { background: var(--hover); }
.pe-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.pe-chip { font-size: 12.5px; border: 1px solid var(--rule-2); background: var(--surface);
  color: var(--ink-2); border-radius: 99px; padding: 4px 12px; cursor: pointer;
  transition: all .12s ease-out; }
.pe-chip:hover { border-color: var(--ink-2); color: var(--ink); }
.pe-chip.pe-on { background: var(--green); border-color: var(--green); color: var(--green-ink); }

.pe-panel { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
.pe-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pe-table th { text-align: left; font-weight: 500; font-size: 12px; color: var(--ink-2);
  padding: 9px 14px; border-bottom: 1px solid var(--rule); background: var(--surface);
  position: sticky; top: 0; }
.pe-table td { padding: 9px 14px; border-bottom: 1px solid var(--rule); vertical-align: baseline; }
.pe-table tbody tr { cursor: pointer; transition: background .1s ease-out; }
.pe-table tbody tr:hover { background: var(--hover); }
.pe-table tbody tr[aria-selected="true"] { background: var(--select);
  box-shadow: inset 2px 0 0 var(--green); }
.pe-table tbody tr:last-child td { border-bottom: 0; }
.pe-t-title { font-family: var(--serif); font-size: 14px; line-height: 1.35; max-width: 52ch; }
.pe-t-authors { color: var(--ink-2); font-size: 12.5px; margin-top: 1px; }
.pe-t-num { font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap; }
.pe-state { display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
  border-radius: 99px; padding: 2px 9px; white-space: nowrap; }
.pe-state .pe-d { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pe-state-ok { color: var(--ok); background: var(--ok-wash); }
.pe-state-warn { color: var(--warn); background: var(--warn-wash); }
.pe-state-bad { color: var(--bad); background: var(--bad-wash); }
.pe-state-mute { color: var(--mute); background: var(--hover); }

/* manuscript */
.pe-doc-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 312px; gap: 16px; align-items: start; }
.pe-doc { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
  padding: 36px clamp(20px, 5vw, 56px) 48px; }
.pe-doc h2 { font-family: var(--serif); font-size: 27px; font-weight: 600;
  letter-spacing: -.01em; margin: 0 0 4px; }
.pe-doc-meta { font-size: 12.5px; color: var(--ink-2); margin-bottom: 26px; }
.pe-doc p { font-family: var(--serif); font-size: 16.5px; line-height: 1.75;
  margin: 0 0 1.05em; max-width: 68ch; }
.pe-s { cursor: pointer; transition: background .12s ease-out;
  text-decoration-line: underline; text-decoration-thickness: 2px;
  text-underline-offset: 4px; }
.pe-s:hover { background: var(--hover); }
.pe-s-supported { text-decoration-color: var(--ok); }
.pe-s-resolved { text-decoration-color: var(--rule-2); }
.pe-s-narrower { text-decoration-color: var(--warn); }
.pe-s-unsupported { text-decoration-color: var(--bad); }
.pe-s-unchecked { text-decoration-style: dotted; text-decoration-color: var(--mute); }
.pe-s-selected { background: var(--warn-wash); }
.pe-s-selected:hover { background: var(--warn-wash); }
.pe-notes { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 16px; }
.pe-notes-title { font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin: 2px 2px 0; }
.pe-note { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px;
  padding: 12px 14px; font-size: 13px; transition: border-color .12s ease-out; }
.pe-note:hover { border-color: var(--rule-2); }
.pe-note.pe-note-open { border-color: var(--green); }
.pe-note-head { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.pe-note-detail { color: var(--ink-2); line-height: 1.45; margin: 0; }
.pe-note-quote { font-family: var(--serif); font-style: italic; font-size: 13.5px;
  margin: 8px 0; padding-left: 10px; border-left: 2px solid var(--rule-2); line-height: 1.5; }
.pe-note-src { font-size: 12px; color: var(--mute); margin-top: 5px; }
.pe-note-suggestion { font-family: var(--serif); font-size: 13.5px; margin: 8px 0 0;
  padding: 8px 10px; background: var(--select); border-radius: 5px; line-height: 1.5; }
.pe-note-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.pe-note-actions .pe-btn { margin-left: 0; padding: 5px 11px; font-size: 12.5px; }

@media (max-width: 960px) {
  .pe-rail { display: none; }
  .pe-doc-wrap { grid-template-columns: minmax(0, 1fr); }
  .pe-notes { position: static; }
  .pe-main { padding: 16px 16px 48px; }
  .pe-table th:nth-child(3), .pe-table td:nth-child(3),
  .pe-table th:nth-child(5), .pe-table td:nth-child(5) { display: none; }
}
`;

const stateChip: Record<string, { cls: string; label: string }> = {
  supported: { cls: "pe-state-ok", label: "Supported" },
  narrower: { cls: "pe-state-warn", label: "Needs narrower wording" },
  unsupported: { cls: "pe-state-bad", label: "Not supported" },
  resolved: { cls: "pe-state-ok", label: "Decision recorded" },
  unchecked: { cls: "pe-state-mute", label: "Not checked" },
};

function Rail({ screen }: { screen: string }) {
  return (
    <aside className="pe-rail">
      <div className="pe-mark">pherogent<i>.</i></div>
      <div className="pe-rail-project">{manuscript.project}</div>
      <a href="#overview">Overview</a>
      <a href="#library" className={screen === "library" ? "pe-on" : ""}>
        Library <small>{libraryCounts.all}</small>
      </a>
      <a href="#manuscript" className={screen === "manuscript" ? "pe-on" : ""}>
        Manuscript <small>{manuscript.words} w</small>
      </a>
      <a href="#evidence">Evidence <small>7</small></a>
      <a href="#activity">Activity</a>
      <div className="pe-rail-foot">Saved on this device.<br />Export a copy to keep your work.</div>
    </aside>
  );
}

function paperState(p: (typeof papers)[number]) {
  if (!p.checks) {
    return p.cited > 0
      ? { cls: "pe-state-mute", label: "Cited, unchecked" }
      : null;
  }
  if (p.checks.unsupported > 0) return { cls: "pe-state-bad", label: `${p.checks.unsupported} not supported` };
  if (p.checks.caution > 0) return { cls: "pe-state-warn", label: `${p.checks.caution} caution` };
  return { cls: "pe-state-ok", label: `${p.checks.supported} supported` };
}

function LibraryScreen() {
  return (
    <main className="pe-main">
      <div className="pe-bar">
        <h1>Library</h1>
        <span className="pe-bar-sub">{libraryCounts.all} papers</span>
        <button className="pe-btn">Add paper</button>
      </div>
      <div className="pe-bar">
        <div className="pe-chips">
          <button className="pe-chip pe-on">All {libraryCounts.all}</button>
          <button className="pe-chip">Cited {libraryCounts.cited}</button>
          <button className="pe-chip">Flagged {libraryCounts.flagged}</button>
        </div>
      </div>
      <div className="pe-panel">
        <table className="pe-table">
          <thead>
            <tr><th>Paper</th><th>Journal</th><th>Year</th><th>Evidence</th><th>Added</th></tr>
          </thead>
          <tbody>
            {papers.map((p) => {
              const st = paperState(p);
              return (
                <tr key={p.id} aria-selected={p.id === 1 || undefined} tabIndex={0}>
                  <td>
                    <div className="pe-t-title">{p.title}</div>
                    <div className="pe-t-authors">{p.authors}, {p.year}</div>
                  </td>
                  <td className="pe-t-num">{p.journal}</td>
                  <td className="pe-t-num">{p.year}</td>
                  <td>
                    {st ? (
                      <span className={`pe-state ${st.cls}`}><span className="pe-d" />{st.label}</span>
                    ) : (
                      <span className="pe-t-num">—</span>
                    )}
                  </td>
                  <td className="pe-t-num">{p.added}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Note({ sentence }: { sentence: Sentence }) {
  const { note, state, selected } = sentence;
  if (!note || !state) return null;
  const chip = stateChip[state];
  return (
    <div className={`pe-note${selected ? " pe-note-open" : ""}`}>
      <div className="pe-note-head">
        <span className={`pe-state ${chip.cls}`}><span className="pe-d" />{chip.label}</span>
      </div>
      <p className="pe-note-detail">{note.detail}</p>
      {selected && note.quote && <div className="pe-note-quote">“{note.quote}”</div>}
      {note.source && <div className="pe-note-src">{note.source}</div>}
      {selected && note.suggestion && <div className="pe-note-suggestion">{note.suggestion}</div>}
      {selected ? (
        <div className="pe-note-actions">
          <button className="pe-btn">Accept rewording</button>
          <button className="pe-ghost">Edit sentence</button>
          <button className="pe-ghost">Dismiss</button>
        </div>
      ) : state === "unchecked" ? (
        <div className="pe-note-actions">
          <button className="pe-ghost">Check this sentence</button>
        </div>
      ) : null}
    </div>
  );
}

function ManuscriptScreen() {
  const noted = manuscript.paragraphs.flat().filter((s) => s.note);
  return (
    <main className="pe-main">
      <div className="pe-bar">
        <h1>Manuscript</h1>
        <span className="pe-bar-sub">edited {manuscript.edited}</span>
        <button className="pe-btn">Check next sentence</button>
      </div>
      <div className="pe-doc-wrap">
        <article className="pe-doc">
          <h2>{manuscript.title}</h2>
          <div className="pe-doc-meta">{manuscript.words} words</div>
          {manuscript.paragraphs.map((para, i) => (
            <p key={i}>
              {para.map((s, j) => (
                <span key={j}>
                  {s.state ? (
                    <span className={`pe-s pe-s-${s.state}${s.selected ? " pe-s-selected" : ""}`} tabIndex={0}>
                      {s.text}
                    </span>
                  ) : (
                    s.text
                  )}{" "}
                </span>
              ))}
            </p>
          ))}
        </article>
        <aside className="pe-notes">
          <div className="pe-notes-title">Evidence checks</div>
          {noted.map((s, i) => (
            <Note key={i} sentence={s} />
          ))}
        </aside>
      </div>
    </main>
  );
}

export function DirectionE({ screen, dark }: { screen: string; dark: boolean }) {
  return (
    <div className={`pe-root${dark ? " pe-dark" : ""}`}>
      <style>{css}</style>
      <div className="pe-shell">
        <Rail screen={screen} />
        {screen === "library" ? <LibraryScreen /> : <ManuscriptScreen />}
      </div>
    </div>
  );
}
