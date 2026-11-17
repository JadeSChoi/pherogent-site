// PROTOTYPE — issue #3 design-direction comparison. Round 1 (A–C: project list
// + chat) and round 2 (D–E: library + manuscript, refined from C per the
// owner's brief), switchable via `?variant=`, `?screen=` and `?theme=dark` on
// the existing `/` route. Throwaway: the winning direction gets rebuilt as
// tokens + base components, then this folder is removed from main.
import { useEffect, useState } from "react";
import { DirectionA } from "./DirectionA";
import { DirectionB } from "./DirectionB";
import { DirectionC } from "./DirectionC";
import { DirectionD } from "./DirectionD";
import { DirectionE } from "./DirectionE";

export type PrototypeScreen = "projects" | "chat" | "library" | "manuscript";

const VARIANTS = [
  { key: "A", name: "Fieldbook", screens: ["projects", "chat"] },
  { key: "B", name: "Instrument", screens: ["projects", "chat"] },
  { key: "C", name: "Offprint", screens: ["projects", "chat"] },
  { key: "D", name: "Folio", screens: ["library", "manuscript"] },
  { key: "E", name: "Study", screens: ["library", "manuscript"] },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

type ProtoState = { variant: VariantKey; screen: PrototypeScreen; dark: boolean };

function variantDef(key: string) {
  return VARIANTS.find((v) => v.key === key) ?? VARIANTS[3];
}

function readParams(): ProtoState {
  const params = new URLSearchParams(window.location.search);
  const rawVariant = (params.get("variant") ?? "D").toUpperCase();
  const def = variantDef(rawVariant);
  const rawScreen = params.get("screen") ?? "";
  const screen = (def.screens as readonly string[]).includes(rawScreen)
    ? (rawScreen as PrototypeScreen)
    : (def.screens[0] as PrototypeScreen);
  return { variant: def.key, screen, dark: params.get("theme") === "dark" };
}

function writeParams(state: ProtoState) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", state.variant);
  url.searchParams.set("screen", state.screen);
  if (state.dark) url.searchParams.set("theme", "dark");
  else url.searchParams.delete("theme");
  window.history.replaceState(null, "", url);
}

const barCss = `
.proto-bar { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
  z-index: 9999; display: flex; align-items: center; gap: 4px; background: #111;
  color: #fff; border-radius: 999px; padding: 6px 10px; font: 500 13px/1 system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,.35); max-width: calc(100vw - 20px); overflow-x: auto; }
.proto-bar button { background: none; border: 0; color: #fff; font: inherit;
  cursor: pointer; padding: 6px 8px; border-radius: 999px; white-space: nowrap; }
.proto-bar button:hover { background: #333; }
.proto-bar .proto-label { min-width: 110px; text-align: center; white-space: nowrap; }
.proto-bar .proto-pill.proto-on { background: #fff; color: #111; }
.proto-bar .proto-sep { flex-shrink: 0; width: 1px; height: 18px; background: #444; margin: 0 4px; }
`;

export function DesignPrototype() {
  const [state, setState] = useState(readParams);
  const { variant, screen, dark } = state;

  const set = (next: ProtoState) => {
    writeParams(next);
    setState(next);
  };

  const cycle = (dir: 1 | -1) => {
    const index = VARIANTS.findIndex((v) => v.key === variant);
    const next = VARIANTS[(index + dir + VARIANTS.length) % VARIANTS.length];
    const screens = next.screens as readonly string[];
    const nextScreen = screens.includes(screen)
      ? screen
      : (next.screens[0] as PrototypeScreen);
    set({ variant: next.key, screen: nextScreen, dark });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const current = variantDef(variant);

  return (
    <>
      {variant === "A" && <DirectionA screen={screen as "projects" | "chat"} />}
      {variant === "B" && <DirectionB screen={screen as "projects" | "chat"} />}
      {variant === "C" && <DirectionC screen={screen as "projects" | "chat"} />}
      {variant === "D" && <DirectionD screen={screen} dark={dark} />}
      {variant === "E" && <DirectionE screen={screen} dark={dark} />}
      {!import.meta.env.PROD && (
        <div className="proto-bar">
          <style>{barCss}</style>
          <button onClick={() => cycle(-1)} aria-label="Previous variant">←</button>
          <span className="proto-label">
            {current.key} ({current.name})
          </span>
          <button onClick={() => cycle(1)} aria-label="Next variant">→</button>
          <span className="proto-sep" />
          {current.screens.map((s) => (
            <button
              key={s}
              className={`proto-pill${screen === s ? " proto-on" : ""}`}
              onClick={() => set({ variant, screen: s as PrototypeScreen, dark })}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="proto-sep" />
          <button
            className={`proto-pill${dark ? " proto-on" : ""}`}
            onClick={() => set({ variant, screen, dark: !dark })}
          >
            Dark
          </button>
        </div>
      )}
    </>
  );
}
