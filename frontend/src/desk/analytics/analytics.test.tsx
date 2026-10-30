import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LedgerSnapshotSchema, type LedgerSnapshot } from "@/intel/contracts";
import { SAMPLE_LEDGER } from "@/intel/ledgerFixtures";
import { SAMPLE_NOW } from "@/intel/fixtures";
import { createMockIntelligenceSource } from "@/intel/mockSource";
import { parseRole } from "@/window/role";
import { effectiveTier, filterTiers, TIERS, viewLedger } from "./board";
import { AnalyticsRoot } from "./AnalyticsRoot";

beforeEach(() => { window.history.replaceState(null, "", "/?window=analytics"); });

describe("F14 ledger board (pure)", () => {
  it("fixture conforms; role parses", () => {
    expect(() => LedgerSnapshotSchema.parse(SAMPLE_LEDGER)).not.toThrow();
    expect(parseRole("?window=analytics")).toEqual({ kind: "analytics" });
  });

  it("shows tested N variants (total), not just rows listed", () => {
    const v = viewLedger(SAMPLE_LEDGER);
    expect(v.tested).toBe(47);
    expect(v.listed).toBe(4);
    expect(v.label).toBe("Tested 47 variants (4 listed)");
  });

  it("all four tiers always listed, zeros shown", () => {
    const v = viewLedger({ ...SAMPLE_LEDGER, experiments: [] });
    expect(v.tierCounts.map((t) => t.tier)).toEqual([...TIERS]);
    expect(v.tierCounts.every((t) => t.count === 0)).toBe(true);
  });

  it("vault_confirmed needs a logged final-confirmation read; otherwise downgraded with a reason", () => {
    const rec = SAMPLE_LEDGER.experiments.find((e) => e.id === "exp:4")!;
    const none = effectiveTier(rec, []);
    expect(none.tier).toBe("validated");
    expect(none.downgrade).toMatch(/final-confirmation/);
    expect(effectiveTier(rec, [{ ts: 1, experimentId: "exp:4", finalConfirmation: false }]).tier).toBe("validated");
    expect(effectiveTier(rec, [{ ts: 1, experimentId: "exp:4", finalConfirmation: true }]).tier).toBe("vault_confirmed");
    const failed = { ...rec, verdict: { ...rec.verdict, status: "FAIL" as const, passed: false } };
    expect(effectiveTier(failed, [{ ts: 1, experimentId: "exp:4", finalConfirmation: true }]).tier).toBe("in_sample");
  });

  it("a non-PASS verdict can never be 'validated'", () => {
    const rec = { ...SAMPLE_LEDGER.experiments[0]!, verdict: { ...SAMPLE_LEDGER.experiments[0]!.verdict, evidence_tier: "validated" as const } };
    expect(effectiveTier(rec, []).tier).toBe("in_sample");
  });

  it("causal: experiments and the report are hidden before their timestamps", () => {
    const early = viewLedger(SAMPLE_LEDGER, SAMPLE_NOW - 35_000);
    expect(early.listed).toBe(1);
    expect(early.tested).toBeNull();
    expect(early.label).toMatch(/not yet known/);
    expect(viewLedger(SAMPLE_LEDGER, 0).listed).toBe(0);
  });

  it("low-sample flag below the 30-trade floor; tier filter is display-only", () => {
    const v = viewLedger(SAMPLE_LEDGER);
    expect(v.rows.find((r) => r.record.id === "exp:2")!.lowSample).toBe(true);
    expect(v.rows.find((r) => r.record.id === "exp:3")!.lowSample).toBe(false);
    expect(filterTiers(v.rows, ["validated"]).every((r) => r.tier === "validated")).toBe(true);
    expect(v.rows).toHaveLength(4);
  });

  it("mock source serves the ledger as sample; missing → empty", async () => {
    const r = await createMockIntelligenceSource().getLedger();
    expect(r.provenance.kind).toBe("sample");
    const m: LedgerSnapshot = (await createMockIntelligenceSource({ missing: true }).getLedger()).data;
    expect(m.experiments).toEqual([]);
  });
});

describe("F14 AnalyticsRoot (UI, read-only)", () => {
  it("renders ledger, tested-N, tiers (glyph+text), VAULT counter, sample", async () => {
    render(<AnalyticsRoot />);
    await screen.findByLabelText("Experiments");
    const sum = screen.getByLabelText("Multiple-testing and VAULT");
    expect(sum.textContent).toMatch(/Tested 47 variants \(4 listed\)/);
    expect(sum.textContent).toMatch(/FDR α 0\.05/);
    expect(screen.getByLabelText("VAULT consultations").textContent).toMatch(/0 \(never consulted\)/);
    expect(screen.getByLabelText("Validation ledger").textContent).toMatch(/sample/);
    const tiers = screen.getByLabelText("Evidence tiers");
    expect(within(tiers).getAllByRole("button")).toHaveLength(4);
    expect(tiers.textContent).toMatch(/Vault-confirmed \(0\)/);
    expect(screen.getByLabelText("Experiments").querySelectorAll("li")).toHaveLength(4);
  });

  it("selecting shows the verdict; a downgraded tier is flagged, never silent", async () => {
    const user = userEvent.setup();
    render(<AnalyticsRoot />);
    await user.click(await screen.findByRole("button", { name: /Unlogged vault claim/ }));
    const d = screen.getByLabelText("Experiment detail");
    expect(d.textContent).toMatch(/Claimed Vault-confirmed; shown as Validated/);
    expect(d.textContent).toMatch(/corrected over 47 variants/);
    await user.click(screen.getByRole("button", { name: /Sample strategy \(train\)/ }));
    expect(screen.getByLabelText("Experiment detail").textContent).toMatch(/below the 30-trade floor/);
  });

  it("tier toggles filter the list only", async () => {
    const user = userEvent.setup();
    render(<AnalyticsRoot />);
    await screen.findByLabelText("Experiments");
    await user.click(screen.getByRole("button", { name: /^Validated/ }));
    await waitFor(() => expect(screen.getByLabelText("Experiments").querySelectorAll("li")).toHaveLength(2));
  });

  it("read-only: the only buttons are tier filters and experiment rows — no promote/confirm/run/vault action", async () => {
    render(<AnalyticsRoot />);
    await screen.findByLabelText("Experiments");
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((n) => /promot|confirm now|run|open vault|approve|deploy/i.test(n))).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});