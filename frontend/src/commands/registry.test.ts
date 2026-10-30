import { describe, expect, it, vi } from "vitest";
import { argCommands, buildCommands, searchCommands, type CommandActions, type CommandContext, type SetupRef } from "./registry";

const setups: SetupRef[] = Array.from({ length: 15 }, (_, i) => ({ key: `M15:s${i}`, tf: "M15", id: `s${i}`, label: `▲ 0${(i % 9) + 1} May 07:16 · M15` }));
const ctx = (o: Partial<CommandContext> = {}): CommandContext => ({
  pair: "EUR_USD", pairs: ["EUR_USD", "GBP_USD"], linked: true, mode: "scan", popped: new Set(), setups,
  rowToggles: [{ tf: "H1", visible: true }, { tf: "M15", visible: true }, { tf: "M5", visible: false }], presets: ["Morning"],
  deskApp: "scan", deskArea: "my", deskWorkflow: "prepare", ...o,
});
const actions = (): CommandActions => ({
  setPair: vi.fn(), toggleLinked: vi.fn(), togglePopout: vi.fn(), goToSetup: vi.fn(), setMode: vi.fn(),
  toggleRow: vi.fn(), restorePreset: vi.fn(), savePreset: vi.fn(), openShortcuts: vi.fn(),
  openDeskArea: vi.fn(), backToScan: vi.fn(), setDeskWorkflow: vi.fn(), setComplexity: vi.fn(), toggleDeskFocus: vi.fn(), deskSimplify: vi.fn(),
});
const ids = (c: { id: string }[]) => c.map((x) => x.id);

describe("DX11 command registry", () => {
  it("covers every command family", () => {
    const got = ids(buildCommands(ctx(), actions()));
    for (const id of ["window:charts", "window:setups", "window:stack", "view:linked", "row:H1", "row:M5", "pair:GBP_USD", "mode:investigate", "mode:review", "setup:M15:s0", "preset:Morning", "help:shortcuts"]) {
      expect(got).toContain(id);
    }
  });

  it("omits the current pair and mode, and flips titles with state", () => {
    const list = buildCommands(ctx({ popped: new Set(["stack"]), linked: false }), actions());
    expect(ids(list)).not.toContain("pair:EUR_USD");
    expect(ids(list)).not.toContain("mode:scan");
    expect(list.find((c) => c.id === "window:stack")?.title).toBe("Re-dock stack");
    expect(list.find((c) => c.id === "window:charts")?.title).toBe("Pop out charts");
    expect(list.find((c) => c.id === "view:linked")?.title).toBe("Turn Linked on");
  });

  it("never offers to hide the last visible row", () => {
    const list = buildCommands(ctx({ rowToggles: [{ tf: "H1", visible: true }, { tf: "M5", visible: false }] }), actions());
    expect(ids(list)).not.toContain("row:H1");
    expect(list.find((c) => c.id === "row:M5")?.title).toBe("Show row M5");
  });

  it("each command runs its action", () => {
    const a = actions();
    const by = (id: string) => buildCommands(ctx(), a).find((c) => c.id === id)!;
    by("window:charts").run();
    expect(a.togglePopout).toHaveBeenCalledWith("charts");
    by("view:linked").run();
    expect(a.toggleLinked).toHaveBeenCalled();
    by("pair:GBP_USD").run();
    expect(a.setPair).toHaveBeenCalledWith("GBP_USD");
    by("mode:review").run();
    expect(a.setMode).toHaveBeenCalledWith("review");
    by("row:M5").run();
    expect(a.toggleRow).toHaveBeenCalledWith("M5");
    by("setup:M15:s3").run();
    expect(a.goToSetup).toHaveBeenCalledWith(setups[3]);
    by("preset:Morning").run();
    expect(a.restorePreset).toHaveBeenCalledWith("Morning");
    by("help:shortcuts").run();
    expect(a.openShortcuts).toHaveBeenCalled();
  });

  it("argument commands: go to setup N and save <name>", () => {
    const a = actions();
    expect(ids(argCommands("12", ctx(), a))).toEqual(["arg:goto"]);
    expect(ids(argCommands("go to setup 3", ctx(), a))).toEqual(["arg:goto"]);
    expect(argCommands("99", ctx(), a)).toEqual([]);
    expect(argCommands("0", ctx(), a)).toEqual([]);
    const save = argCommands("save My view", ctx(), a);
    expect(save[0]?.title).toBe('Save preset "My view"');
    save[0]!.run();
    expect(a.savePreset).toHaveBeenCalledWith("My view");
  });

  it("search: arg command first, no duplicate setup row, fuzzy title match, keyword fallback", () => {
    const a = actions();
    const list = buildCommands(ctx(), a);
    const r = searchCommands(list, "12", ctx(), a);
    expect(r[0]?.id).toBe("arg:goto");
    expect(ids(r)).not.toContain("setup:M15:s11");
    expect(searchCommands(list, "pop", ctx(), a)[0]?.title).toMatch(/^Pop out /);
    expect(ids(searchCommands(list, "monitor", ctx(), a))).toContain("window:charts");
    expect(searchCommands(list, "zzzz", ctx(), a)).toEqual([]);
  });

  it("empty query lists the commands but not the long setup list; results are capped", () => {
    const a = actions();
    const list = buildCommands(ctx(), a);
    const r = searchCommands(list, "", ctx(), a);
    expect(r.some((c) => c.group === "Setups")).toBe(false);
    expect(searchCommands(list, "", ctx(), a, 3)).toHaveLength(3);
  });
});