import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "@/url/urlState";
import { buildCommands, type CommandActions, type CommandContext } from "@/commands/registry";
import { SHORTCUTS } from "@/components/ui/ShortcutsSheet";

describe("DESK url codec", () => {
  it("round-trips app/desk/wf and omits app when scan", () => {
    expect(encodeState({ app: "desk", deskArea: "analysis", wf: "live" })).toBe("app=desk&desk=analysis&wf=live");
    expect(encodeState({})).toBe("");
    const s = decodeState("app=desk&desk=my&wf=review");
    expect(s).toEqual({ app: "desk", deskArea: "my", wf: "review" });
  });
  it("drops invalid desk params", () => {
    expect(decodeState("app=xyz&desk=nope&wf=spiral")).toEqual({});
  });
});

const ctx = (over: Partial<CommandContext>): CommandContext => ({
  pair: "EUR_USD", pairs: ["EUR_USD"], linked: true, mode: "scan", popped: new Set(),
  setups: [], rowToggles: [], presets: [], deskApp: "scan", deskArea: "my", deskWorkflow: "prepare", ...over,
});
const noop = () => {};
const actions = (): CommandActions => ({
  setPair: noop, toggleLinked: noop, togglePopout: noop, goToSetup: noop, setMode: noop, toggleRow: noop,
  restorePreset: noop, savePreset: noop, openShortcuts: noop,
  openDeskArea: noop, backToScan: noop, setDeskWorkflow: noop, setComplexity: noop, toggleDeskFocus: noop, deskSimplify: noop,
});

describe("DESK commands", () => {
  it("offers Open MY DESK / Analysis from Scan", () => {
    const ids = buildCommands(ctx({ deskApp: "scan" }), actions()).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["desk:my", "desk:analysis"]));
  });
  it("inside Desk offers workflow, focus, simplify and complexity", () => {
    const cmds = buildCommands(ctx({ deskApp: "desk", deskArea: "my", deskWorkflow: "prepare" }), actions());
    const ids = cmds.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["desk:scan", "desk:wf:live", "desk:focus", "desk:simplify", "desk:cx:advanced"]));
    expect(cmds.every((c) => c.group !== "Desk" || c.title.startsWith("Desk:"))).toBe(true);
  });
});

describe("shortcuts have no single-key conflicts", () => {
  it("every single-letter key is unique across SHORTCUTS", () => {
    const MOD = /ctrl|⌘|cmd|shift|alt/i;
    const singles: string[] = [];
    for (const s of SHORTCUTS) {
      if (s.keys.some((k) => MOD.test(k))) continue; // skip chords like "Ctrl/⌘ K"
      for (const k of s.keys) if (/^[A-Za-z]$/.test(k)) singles.push(k.toUpperCase());
    }
    expect(new Set(singles).size).toBe(singles.length);
  });
});
