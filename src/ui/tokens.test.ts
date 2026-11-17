// Token discipline seam: design tokens are defined once in tokens.css (with a
// complete dark mode) and consumed everywhere else — never restated inline.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vitest runs with the repo root as cwd
const uiDir = join(process.cwd(), "src", "ui");
const tokensPath = join(uiDir, "tokens.css");

function tokenNames(block: string): string[] {
  return [...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((m) => m[0]);
}

function lightBlock(css: string): string {
  const match = css.match(/:root\s*{([^}]*)}/);
  return match?.[1] ?? "";
}

function darkMediaBlock(css: string): string {
  const match = css.match(
    /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{([^}]*)}/,
  );
  return match?.[1] ?? "";
}

function darkOverrideBlock(css: string): string {
  const match = css.match(/:root\[data-theme="dark"\]\s*{([^}]*)}/);
  return match?.[1] ?? "";
}

describe("design tokens", () => {
  const css = readFileSync(tokensPath, "utf8");

  it("defines color, font, and spacing tokens on :root", () => {
    const names = tokenNames(lightBlock(css));
    expect(names.some((n) => n.startsWith("--color-"))).toBe(true);
    expect(names.some((n) => n.startsWith("--font-"))).toBe(true);
    expect(names.some((n) => n.startsWith("--space-"))).toBe(true);
  });

  it("redefines every color token in both dark-mode blocks", () => {
    const colors = tokenNames(lightBlock(css)).filter((n) =>
      n.startsWith("--color-"),
    );
    expect(colors.length).toBeGreaterThan(0);
    const media = tokenNames(darkMediaBlock(css));
    const override = tokenNames(darkOverrideBlock(css));
    for (const token of colors) {
      expect(media, `media dark block missing ${token}`).toContain(token);
      expect(override, `[data-theme=dark] block missing ${token}`).toContain(token);
    }
  });

  it("keeps the two dark-mode blocks identical, values included", () => {
    const declarations = (block: string) =>
      block
        .split(";")
        .map((d) => d.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .sort();
    expect(declarations(darkMediaBlock(css))).toEqual(
      declarations(darkOverrideBlock(css)),
    );
  });
});

describe("token consumption", () => {
  const files = readdirSync(uiDir).filter(
    (f) =>
      (f.endsWith(".css") || f.endsWith(".tsx")) &&
      f !== "tokens.css" &&
      !f.includes(".test."),
  );

  it("never restates colors or font families outside tokens.css", () => {
    for (const file of files) {
      const text = readFileSync(join(uiDir, file), "utf8");
      expect(text, `${file} contains a raw hex color`).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b/,
      );
      expect(text, `${file} contains a raw rgb()/hsl() color`).not.toMatch(
        /\b(?:rgba?|hsla?)\(/,
      );
      expect(text, `${file} declares font-family with a literal`).not.toMatch(
        /font-family:(?!\s*var\()/,
      );
    }
  });
});
