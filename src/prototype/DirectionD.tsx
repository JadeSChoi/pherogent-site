// PROTOTYPE — round-2 Direction D "Folio", revised per owner feedback:
// contents rail (from E, restyled), library filter chips + tighter rows,
// quieter supported-state marks, selected-row padding fix, contrast bumps,
// Archivo for dense data surfaces / serif for reading surfaces. Throwaway.
import {
  libraryCounts,
  manuscript,
  papers,
  type Sentence,
} from "./round2-data";

const css = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Archivo:wght@400;500;600&display=swap');
.pd-root {
  --paper: #FAF6EE; --panel: #FFFCF5; --ink: #211C14; --ink-2: #5C5342;
  --rule: #E4DCCA; --rule-2: #D4CAB2; --wash: #F2ECDD; --wash-2: #EBE3CF;
  --ok: #4A6B33; --ok-faint: rgba(74,107,51,.4); --ok-wash: #EDF0DC;
  --warn: #96670F; --warn-wash: #F7ECD2;
  --bad: #A23B2A; --bad-wash: #F6E3DD; --mute: #6E654F;
  --serif: 'Newsreader', Georgia, serif; --sans: 'Archivo', system-ui, sans-serif;
  min-height: 100vh; background: var(--paper); color: var(--ink);
  font-family: var(--serif); font-size: 17px; line-height: 1.55;
}
.pd-root.pd-dark {
  --paper: #18140E; --panel: #1E1912; --ink: #EAE2D0; --ink-2: #ADA28C;
  --rule: #352E22; --rule-2: #463D2D; --wash: #241F16; --wash-2: #2B2519;
  --ok: #96B96F; --ok-faint: rgba(150,185,111,.45); --ok-wash: #232A18;
  --warn: #D3A44A; --warn-wash: #2E2512;
  --bad: #D97F67; --bad-wash: #301B15; --mute: #93886F;
}
.pd-root *:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 1px; }
.pd-root ::selection { background: var(--wash-2); }

.pd-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 34px;
  padding: 22px 28px 14px; border-bottom: 1px solid var(--ink); }
.pd-mark { font-family: var(--serif); font-size: 22px; font-weight: 600;
  letter-spacing: .01em; display: flex; align-items: baseline; gap: 9px; }
.pd-mark .pd-pilcrow { font-weight: 400; font-size: 19px; }
.pd-top nav { display: none; gap: 20px; font-family: var(--sans); font-size: 13.5px; }
.pd-top nav a { color: var(--ink-2); text-decoration: none; padding-bottom: 2px; }
.pd-top nav a.pd-on { color: var(--ink); border-bottom: 2px solid var(--ink); }
.pd-saved { margin-left: auto; font-family: var(--sans); font-size: 12.5px; color: var(--ink-2); }

.pd-shell { display: flex; min-height: calc(100vh - 62px); }
.pd-rail { width: 224px; flex-shrink: 0; border-right: 1px solid var(--rule);
  padding: 24px 18px; display: flex; flex-direction: column; gap: 2px; }
.pd-rail-project { font-family: var(--serif); font-size: 17px; font-weight: 600;
  line-height: 1.3; margin-bottom: 2px; }
.pd-rail-switch { background: none; border: 0; padding: 0; text-align: left;
  font-family: var(--sans); font-size: 12px; color: var(--ink-2); cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px; margin-bottom: 18px; }
.pd-rail-switch:hover { color: var(--ink); }
.pd-rail a { display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--sans); font-size: 13.5px; color: var(--ink-2);
  text-decoration: none; padding: 7px 10px; margin-left: -10px;
  transition: background .12s ease-out, color .12s ease-out; }
.pd-rail a:hover { background: var(--wash); color: var(--ink); }
.pd-rail a.pd-on { color: var(--ink); font-weight: 600; background: var(--wash-2);
  box-shadow: inset 2px 0 0 var(--ink); }
.pd-rail a small { font-size: 12px; color: var(--mute); font-variant-numeric: tabular-nums; }
.pd-rail-foot { margin-top: auto; font-family: var(--sans); font-size: 12px;
  color: var(--ink-2); line-height: 1.5; }

.pd-page { flex: 1; min-width: 0; padding: 30px 32px 80px; max-width: 1040px; }
.pd-page-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 20px; margin-bottom: 14px; }
.pd-page-head h1 { font-size: 32px; font-weight: 500; margin: 0; letter-spacing: -.01em; }
.pd-page-sub { color: var(--ink-2); font-size: 16px; }
.pd-btn { font-family: var(--sans); font-size: 13.5px; font-weight: 500;
  background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
  border-radius: 3px; padding: 8px 16px; cursor: pointer; margin-left: auto;
  transition: opacity .12s ease-out; }
.pd-btn:hover { opacity: .82; }
.pd-link { background: none; border: 0; padding: 0; font-family: var(--sans);
  font-size: 13px; color: var(--ink); text-decoration: underline;
  text-underline-offset: 3px; cursor: pointer; }
.pd-link:hover { color: var(--ink-2); }
.pd-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.pd-chip { font-family: var(--sans); font-size: 12.5px; color: var(--ink-2);
  background: none; border: 1px solid var(--rule-2); border-radius: 999px;
  padding: 4px 13px; cursor: pointer; transition: all .12s ease-out;
  font-variant-numeric: tabular-nums; }
.pd-chip:hover { border-color: var(--ink-2); color: var(--ink); }
.pd-chip.pd-on { background: var(--ink); border-color: var(--ink); color: var(--paper); }

/* ledger — dense data surface: Archivo for data, serif kept for paper titles */
.pd-ledger { width: 100%; border-collapse: collapse; margin-top: 12px; }
.pd-ledger th { font-family: var(--sans); font-weight: 500; font-size: 12.5px;
  color: var(--ink-2); text-align: left; padding: 8px 14px 8px 0;
  border-bottom: 1px solid var(--ink); }
.pd-ledger th:first-child { padding-left: 12px; }
.pd-ledger td { padding: 8px 14px 8px 0; border-bottom: 1px solid var(--rule);
  vertical-align: baseline; }
.pd-ledger td:first-child { padding-left: 12px; }
.pd-ledger tbody tr { cursor: pointer; transition: background .12s ease-out; }
.pd-ledger tbody tr:hover { background: var(--wash); }
.pd-ledger tbody tr[aria-selected="true"] { background: var(--wash-2);
  box-shadow: inset 2px 0 0 var(--ink); }
.pd-ref-authors { font-family: var(--sans); font-weight: 600; font-size: 13.5px; }
.pd-ref-title { font-style: italic; color: var(--ink-2); font-size: 14.5px;
  line-height: 1.35; max-width: 58ch; }
.pd-cell-sans { font-family: var(--sans); font-size: 13px; color: var(--ink-2);
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.pd-cell-journal { font-family: var(--sans); font-size: 13px; color: var(--ink-2); white-space: nowrap; }
.pd-ev { display: inline-flex; gap: 10px; font-family: var(--sans); font-size: 12.5px; }
.pd-ev i { font-style: normal; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.pd-ev .pd-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.pd-ev-ok { color: var(--ok); } .pd-ev-ok .pd-dot { background: var(--ok); }
.pd-ev-warn { color: var(--warn); } .pd-ev-warn .pd-dot { background: var(--warn); }
.pd-ev-bad { color: var(--bad); } .pd-ev-bad .pd-dot { background: var(--bad); }
.pd-ev-none { color: var(--mute); }

/* manuscript — reading surface: serif */
.pd-doc-head { border-bottom: 1px solid var(--ink); padding-bottom: 16px; margin-bottom: 30px;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; }
.pd-doc-head h1 { font-size: 31px; font-weight: 500; margin: 0 0 2px; letter-spacing: -.01em; width: 100%; }
.pd-doc-meta { color: var(--ink-2); font-size: 15px; font-style: italic; }
.pd-doc { display: grid; grid-template-columns: minmax(0, 640px) 300px; gap: 20px 52px; }
.pd-para { font-size: 18.5px; line-height: 1.7; margin: 0 0 1.1em; }
.pd-notes { border-left: 1px solid var(--rule-2); padding-left: 22px;
  display: flex; flex-direction: column; gap: 18px; align-self: start; font-size: 14px; }
.pd-s { transition: background .12s ease-out; cursor: pointer; }
.pd-s:hover { background: var(--wash); }
/* quiet marks for settled states; strong color only where attention is needed */
.pd-s-supported { border-bottom: 1px solid var(--ok-faint); }
.pd-s-resolved { border-bottom: 1px solid var(--rule-2); }
.pd-s-narrower { border-bottom: 2px solid var(--warn); }
.pd-s-unsupported { border-bottom: 2px solid var(--bad); }
.pd-s-unchecked { border-bottom: 2px dotted var(--mute); }
.pd-s-selected { background: var(--warn-wash); }
.pd-note-verdict { font-family: var(--sans); font-size: 12px; font-weight: 600; margin: 0 0 3px;
  display: flex; align-items: center; gap: 6px; }
.pd-note-verdict .pd-dot { width: 7px; height: 7px; border-radius: 50%; }
.pd-note p.pd-note-detail { margin: 0; font-style: italic; color: var(--ink-2); line-height: 1.45; }
.pd-note-src { font-family: var(--sans); font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.pd-note-quote { margin: 8px 0; padding-left: 10px; border-left: 2px solid var(--rule-2);
  font-style: italic; line-height: 1.45; }
.pd-note-suggestion { margin: 8px 0 0; padding: 8px 10px; background: var(--wash);
  border-radius: 2px; line-height: 1.45; }
.pd-note-actions { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; align-items: center; }
.pd-note-actions .pd-btn { margin-left: 0; padding: 6px 12px; font-size: 12.5px; }
.pd-note-expanded { background: var(--panel); border: 1px solid var(--rule-2);
  border-radius: 3px; padding: 14px 16px; margin-left: -17px; }

@media (max-width: 920px) {
  .pd-rail { display: none; }
  .pd-top nav { display: flex; }
  .pd-page { padding: 20px 16px 60px; }
  .pd-doc { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .pd-notes { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule);
    padding-top: 12px; margin-bottom: 20px; }
  .pd-note-expanded { margin-left: 0; }
  .pd-ledger th:nth-child(2), .pd-ledger td:nth-child(2),
  .pd-ledger th:nth-child(3), .pd-ledger td:nth-child(3),
  .pd-ledger th:nth-child(5), .pd-ledger td:nth-child(5) { display: none; }
  .pd-page-head h1, .pd-doc-head h1 { font-size: 26px; }
}
`;

const stateDot: Record<string, string> = {
  supported: "pd-ev-ok",
  narrower: "pd-ev-warn",
  unsupported: "pd-ev-bad",
  resolved: "pd-ev-ok",
  unchecked: "pd-ev-none",
};

function Rail({ screen }: { screen: string }) {
  return (
    <aside className="pd-rail">
      <div className="pd-rail-project">{manuscript.project}</div>
      <button className="pd-rail-switch">Switch project</button>
      <a href="#overview">Overview</a>
      <a href="#library" className={screen === "library" ? "pd-on" : ""}>
        Library <small>{libraryCounts.all}</small>
      </a>
      <a href="#manuscript" className={screen === "manuscript" ? "pd-on" : ""}>
        Manuscript <small>{manuscript.words} w</small>
      </a>
      <a href="#evidence">Evidence <small>7</small></a>
      <a href="#activity">Activity</a>
      <div className="pd-rail-foot">Saved on this device.<br />Export a copy to keep your work.</div>
    </aside>
  );
}

function LibraryScreen() {
  return (
    <main className="pd-page">
      <div className="pd-page-head">
        <h1>Library</h1>
        <span className="pd-page-sub">
          {libraryCounts.all} papers, {libraryCounts.cited} cited in the manuscript
        </span>
        <button className="pd-btn">Add paper</button>
      </div>
      <div className="pd-chips">
        <button className="pd-chip pd-on">All {libraryCounts.all}</button>
        <button className="pd-chip">Cited {libraryCounts.cited}</button>
        <button className="pd-chip">Flagged {libraryCounts.flagged}</button>
      </div>
      <table className="pd-ledger">
        <thead>
          <tr>
            <th>Reference</th><th>Journal</th><th>Year</th><th>Evidence</th><th>Added</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((p) => (
            <tr key={p.id} aria-selected={p.id === 1 || undefined} tabIndex={0}>
              <td>
                <div className="pd-ref-authors">{p.authors} ({p.year})</div>
                <div className="pd-ref-title">{p.title}</div>
              </td>
              <td className="pd-cell-journal">{p.journal}</td>
              <td className="pd-cell-sans">{p.year}</td>
              <td>
                {p.checks ? (
                  <span className="pd-ev">
                    {p.checks.supported > 0 && <i className="pd-ev-ok"><span className="pd-dot" />{p.checks.supported} supported</i>}
                    {p.checks.caution > 0 && <i className="pd-ev-warn"><span className="pd-dot" />{p.checks.caution} caution</i>}
                    {p.checks.unsupported > 0 && <i className="pd-ev-bad"><span className="pd-dot" />{p.checks.unsupported} unsupported</i>}
                  </span>
                ) : (
                  <span className="pd-ev pd-ev-none">{p.cited > 0 ? "cited, unchecked" : "—"}</span>
                )}
              </td>
              <td className="pd-cell-sans">{p.added}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function Note({ sentence }: { sentence: Sentence }) {
  const { note, state, selected } = sentence;
  if (!note || !state) return null;
  return (
    <div className={`pd-note${selected ? " pd-note-expanded" : ""}`}>
      <p className={`pd-note-verdict ${stateDot[state]}`}>
        <span className="pd-dot" style={{ background: "currentColor" }} />
        {note.verdict}
      </p>
      <p className="pd-note-detail">{note.detail}</p>
      {selected && note.quote && <div className="pd-note-quote">“{note.quote}”</div>}
      {note.source && <div className="pd-note-src">{note.source}</div>}
      {selected && note.suggestion && (
        <div className="pd-note-suggestion">{note.suggestion}</div>
      )}
      {selected ? (
        <div className="pd-note-actions">
          <button className="pd-btn">Accept rewording</button>
          <button className="pd-link">Edit sentence</button>
          <button className="pd-link">Dismiss</button>
        </div>
      ) : state === "unchecked" ? (
        <div className="pd-note-actions">
          <button className="pd-link">Check this sentence</button>
        </div>
      ) : null}
    </div>
  );
}

function ManuscriptScreen() {
  return (
    <main className="pd-page">
      <div className="pd-doc-head">
        <h1>{manuscript.title}</h1>
        <span className="pd-doc-meta">
          {manuscript.words} words, edited {manuscript.edited}
        </span>
        <button className="pd-btn">Check next sentence</button>
      </div>
      <div className="pd-doc">
        <div className="pd-text">
          {manuscript.paragraphs.map((para, i) => (
            <p key={i} className="pd-para">
              {para.map((s, j) => (
                <span key={j}>
                  {s.state ? (
                    <span className={`pd-s pd-s-${s.state}${s.selected ? " pd-s-selected" : ""}`} tabIndex={0}>
                      {s.text}
                    </span>
                  ) : (
                    s.text
                  )}{" "}
                </span>
              ))}
            </p>
          ))}
        </div>
        <div className="pd-notes">
          {manuscript.paragraphs.flat().filter((s) => s.note).map((s, j) => (
            <Note key={j} sentence={s} />
          ))}
        </div>
      </div>
    </main>
  );
}

export function DirectionD({ screen, dark }: { screen: string; dark: boolean }) {
  return (
    <div className={`pd-root${dark ? " pd-dark" : ""}`}>
      <style>{css}</style>
      <header className="pd-top">
        <span className="pd-mark"><span className="pd-pilcrow">¶</span>Pherogent</span>
        <nav>
          <a href="#library" className={screen === "library" ? "pd-on" : ""}>Library</a>
          <a href="#manuscript" className={screen === "manuscript" ? "pd-on" : ""}>Manuscript</a>
        </nav>
        <span className="pd-saved">Saved on this device</span>
      </header>
      <div className="pd-shell">
        <Rail screen={screen} />
        {screen === "library" ? <LibraryScreen /> : <ManuscriptScreen />}
      </div>
    </div>
  );
}
