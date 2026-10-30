import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW, SAMPLE_TRADES } from "@/intel/fixtures";
import type { TradeRecord } from "@/intel/contracts";
import { TradeRecordSchema } from "@/intel/contracts";
import { SAMPLE_REGIME_SERIES } from "@/desk/canvas/context/regimeFixtures";
import { decodeState, encodeState } from "@/url/urlState";
import { parseRole } from "@/window/role";
import { CATEGORIES, countByCategory, executedSample, filterByCategory, regimeFor, tradeFocusRange, viewTrades } from "./ledger";
import { JournalRoot } from "./JournalRoot";

const base = SAMPLE_TRADES[0]!;
const mk = (over: Partial<TradeRecord>): TradeRecord => ({ ...base, ...over });

beforeEach(() => { window.history.replaceState(null, "", "/?window=journal"); });

describe("F10 ledger (pure)", () => {
  it("fixtures conform and cover all four categories", () => {
    for (const t of SAMPLE_TRADES) expect(() => TradeRecordSchema.parse(t)).not.toThrow();
    expect(new Set(SAMPLE_TRADES.map((t) => t.category))).toEqual(new Set(CATEGORIES));
  });

  it("always reports all four categories, including zeros (no survival bias)", () => {
    const c = countByCategory([mk({ category: "executed" })]);
    expect(c.map((x) => x.category)).toEqual([...CATEGORIES]);
    expect(c.find((x) => x.category === "rejected")!.count).toBe(0);
  });

  it("is causal: future trades hidden; outcome stripped until exit_time <= asOf", () => {
    const t = mk({ entry_time: 100, exit_time: 200, net_pnl: 5, R: 1, exit_price: 1.2 });
    expect(viewTrades([t], 99)).toHaveLength(0);
    const open = viewTrades([t], 150)[0]!;
    expect(open.closed).toBe(false);
    expect([open.exit_time, open.R, open.net_pnl, open.exit_price]).toEqual([undefined, undefined, undefined, undefined]);
    const closed = viewTrades([t], 200)[0]!;
    expect(closed.closed).toBe(true);
    expect(closed.R).toBe(1);
  });

  it("filters by category and gives an honest executed sample note", () => {
    expect(filterByCategory(SAMPLE_TRADES, ["rejected"]).every((t) => t.category === "rejected")).toBe(true);
    expect(executedSample(SAMPLE_TRADES)).toEqual({ n: 1, belowFloor: true });
  });

  it("regime link only if the snapshot was available at entry", () => {
    const series = SAMPLE_REGIME_SERIES;
    const early = series[0]!;
    expect(regimeFor({ regime_snapshot_id: early.id, entry_time: early.available_at }, series)).toMatchObject({ kind: "known" });
    expect(regimeFor({ regime_snapshot_id: early.id, entry_time: early.available_at - 1 }, series)).toMatchObject({ kind: "unknown_at_entry" });
    expect(regimeFor({ entry_time: 1 }, series)).toEqual({ kind: "none" });
  });

  it("focus range runs entry → exit, or +1h if open", () => {
    expect(tradeFocusRange({ entry_time: 10, exit_time: 50 })).toEqual([10, 50]);
    expect(tradeFocusRange({ entry_time: 10 })).toEqual([10, 3610]);
  });
});

describe("F10 deep link", () => {
  it("?trade= round-trips additively; malformed ids are dropped", () => {
    expect(decodeState(encodeState({ pair: "EUR_USD", trade: "t:1" }))).toEqual({ pair: "EUR_USD", trade: "t:1" });
    expect(decodeState("trade=<script>")).toEqual({});
    expect(encodeState({ pair: "EUR_USD" })).not.toContain("trade");
  });
  it("?window=journal parses to the journal role", () => {
    expect(parseRole("?window=journal")).toEqual({ kind: "journal" });
  });
});

describe("F10 journal UI", () => {
  it("renders records for all four categories, labelled sample, with text + glyph cues", async () => {
    render(<JournalRoot asOf={SAMPLE_NOW} />);
    await waitFor(() => expect(screen.getByLabelText("Trades")).toBeTruthy());
    const rows = screen.getByLabelText("Trades").querySelectorAll(".vj-row");
    expect(rows.length).toBe(4);
    expect(new Set(Array.from(rows).map((r) => r.getAttribute("data-cat")))).toEqual(new Set(CATEGORIES));
    const cats = screen.getByLabelText("Trade categories");
    for (const l of ["Executed", "Rejected", "Eligible", "Counterfactual"]) expect(cats.textContent).toContain(l);
    expect(screen.getByLabelText("Trade journal").textContent).toMatch(/sample/);
    expect(screen.getByLabelText("Trade journal").textContent).toMatch(/below the 30-trade floor/);
    expect(screen.getByLabelText("Trades").textContent).toMatch(/hypothetical/);
  });

  it("category filter hides rows but keeps every category button + count", async () => {
    const user = userEvent.setup();
    render(<JournalRoot asOf={SAMPLE_NOW} />);
    await waitFor(() => screen.getByLabelText("Trades"));
    const cats = within(screen.getByLabelText("Trade categories"));
    await user.click(cats.getByRole("button", { name: /Counterfactual/ }));
    expect(screen.getByLabelText("Trades").querySelectorAll(".vj-row")).toHaveLength(3);
    expect(cats.getByRole("button", { name: /Counterfactual \(1\)/ })).toBeTruthy();
  });

  it("selecting a trade shows its decision trace", async () => {
    const user = userEvent.setup();
    render(<JournalRoot asOf={SAMPLE_NOW} />);
    await waitFor(() => screen.getByLabelText("Trades"));
    await user.click(screen.getByLabelText("Trades").querySelector('[data-cat="rejected"]') as HTMLElement);
    expect(screen.getByLabelText("Decision trace").textContent).toMatch(/dead_volatility/);
  });

  it("deep link ?trade= selects and centres that trade", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/?window=journal&trade=t%3A2");
    render(<JournalRoot asOf={SAMPLE_NOW} />);
    await waitFor(() => screen.getByLabelText("Trades"));
    const cur = screen.getByLabelText("Trades").querySelector('[aria-current="true"]')!;
    expect(cur.getAttribute("data-cat")).toBe("rejected");
    expect(screen.getByLabelText("Trade detail").textContent).toMatch(/Rejected/);
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
  });

  it("an earlier viewed time hides later trades (causal)", async () => {
    render(<JournalRoot asOf={SAMPLE_TRADES[0]!.entry_time} />);
    await waitFor(() => screen.getByLabelText("Trades"));
    expect(screen.getByLabelText("Trades").querySelectorAll(".vj-row")).toHaveLength(1);
  });
});