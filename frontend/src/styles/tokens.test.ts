import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const STYLES = join(SRC, "styles");
const SELF = "tokens.test.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(css|ts|tsx)$/.test(name) && name !== SELF) out.push(p);
  }
  return out;
}

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");
const names = (s: string): Set<string> => new Set([...s.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]!));
const tokensCss = stripComments(readFileSync(join(STYLES, "tokens.css"), "utf8"));
const defined = names(tokensCss);

const SEMANTIC = [
  "--bg", "--panel", "--panel-2", "--grid", "--faint", "--text", "--muted",
  "--accent", "--up", "--down", "--warn", "--info", "--overlay",
];

const block = (re: RegExp): string => {
  const m = tokensCss.match(re);
  if (!m) throw new Error(`block not found: ${re}`);
  return m[1] ?? "";
};
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

describe("DX0 tokens", () => {
  it("defines every var(--x) used in src", () => {
    const missing: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const name = m[1]!;
        if (!defined.has(name)) missing.push(`${file.replace(SRC, "")}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("aliases --border to --grid", () => {
    expect(tokensCss).toMatch(/--border:\s*var\(--grid\)/);
  });

  it("dark root defines the semantic set", () => {
    const dark = names(block(/:root\s*\{([^}]*)\}/));
    for (const k of SEMANTIC) expect(dark.has(k), k).toBe(true);
  });

  it("light block overrides the full semantic set", () => {
    const light = names(block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/));
    for (const k of SEMANTIC) expect(light.has(k), k).toBe(true);
  });

  it("prefers-color-scheme fallback matches the explicit light block", () => {
    const explicit = block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
    const media = block(
      /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)\s*\{([^}]*)\}/,
    );
    expect(norm(media)).toBe(norm(explicit));
  });

  it("has no raw colours outside tokens.css", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(STYLES).filter((n) => n.endsWith(".css") && n !== "tokens.css")) {
      const css = stripComments(readFileSync(join(STYLES, name), "utf8"));
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});