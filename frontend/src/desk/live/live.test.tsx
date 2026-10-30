import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { detectAll } from "@/desk/detect";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { deepCandles } from "@/desk/mock/deepMock";
import type { AnalysisObject, Snapshot } from "@/desk/types/schemas";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { buildFeed, FEED } from "./changeFeed";
import { parseMarks, useLiveStore } from "./liveStore";
import { buildReadiness } from "./readiness";
import { buildThesis } from "./thesis";
import type { LiveSession } from "./useLive";

const REF = 1_740_000_000;
const H = 3600;
const ATR = 0.001;
const feed = (objects: AnalysisObject[], extra: Partial<Parameters<typeof buildFeed>[0]> = {}) =>
  buildFeed({ pair: "EUR_USD", objects, ref: REF, price: 1.1, atr: ATR, ...extra });
const zone = (extra: Partial<AnalysisObject> = {}) => mkObj({ source_tf: "H4", direction: "bull", lo: 1.0995, hi: 1.1005, known_at: REF - 40 * H, ...extra });
const bos = (code: 1 | 2, extra: Partial<AnalysisObject> = {}) =>
  mkObj({ type: "structure_event", layer: "structure", source_tf: "M15", direction: "bull", lo: 1.0998, hi: 1.0998, known_at: REF - 2 * H, geometry: { bands: [{ pHigh: 1.0998, pLow: 1.0998 }], anchorTimes: [REF - 5 * H, code] }, ...extra });
const BAD = /\b(buy|sell|long|short|reversal|likely|probab\w*|will)\b/i;

describe("buildFeed", () => {
  it("emits only meaningful events inside the window, newest first", () => {
    const entered = zone({ lifecycle: [{ kind: "partially_mitigated", t: REF - 3 * H, known_at: REF - 3 * H }] });
    const fvg = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", direction: "bull", lo: 1.1, hi: 1.1004, known_at: REF - 1 * H });
    const swp = mkObj({ type: "sweep", layer: "liquidity", source_tf: "H1", lo: 1.0996, hi: 1.0997, known_at: REF - 4 * H });
    const noise = [mkObj({ type: "swing", known_at: REF - H }), mkObj({ type: "impulse", known_at: REF - H }), mkObj({ type: "candle_signal", known_at: REF - H })];
    const old = mkObj({ type: "fvg", layer: "fvg", lo: 1.1, hi: 1.1004, known_at: REF - 30 * H });
    const ev = feed([entered, fvg, swp, bos(2), ...noise, old]);
    expect(ev.map((e) => e.kind)).toEqual(["fvg_formed", "structure_break", "entered", "swept"]);
    expect(ev.every((e) => e.t <= REF && e.t > REF - FEED.windowSec)).toBe(true);
    expect(ev[1]?.text).toMatch(/potential change in structure/);
  });
  it("invalidation and used-up zones are separate kinds; far objects drop unless thesis", () => {
    const inv = zone({ lifecycle: [{ kind: "invalidated", t: REF - H, known_at: REF - H }] });
    const used = zone({ lifecycle: [{ kind: "fully_mitigated", t: REF - 2 * H, known_at: REF - 2 * H }] });
    const far = mkObj({ type: "fvg", layer: "fvg", lo: 1.2, hi: 1.2005, known_at: REF - H });
    expect(feed([inv, used, far]).map((e) => e.kind)).toEqual(["invalidated", "spent"]);
    const withThesis = feed([far], { acceptedIds: new Set([far.id]) });
    expect(withThesis).toHaveLength(1);
    expect(withThesis[0]?.thesis).toBe(true);
  });
  it("is capped, carries pips from price, and never uses trade/forecast language", () => {
    const many = Array.from({ length: 60 }, (_, i) => mkObj({ type: "fvg", layer: "fvg", source_tf: "M5", direction: "bull", lo: 1.1006, hi: 1.1008, known_at: REF - 1 - i }));
    const ev = feed(many);
    expect(ev).toHaveLength(FEED.cap);
    expect(ev[0]?.where).toMatch(/pips from price/);
    expect(ev.map((e) => `${e.text} ${e.where}`).join(" ")).not.toMatch(BAD);
  });
  it("no lookahead: feed over viewAsOf(full,t) equals feed over detect(prefix t) (deep mock)", () => {
    const tfs = ["H4", "H1", "M15", "M5"] as const;
    const run = (asOf: number) => tfs.flatMap((tf) => {
      const c = deepCandles("EUR_USD", tf);
      return detectAll({ candles: c, pair: "EUR_USD", tf, asOf, dataKind: "sample", dataVersion: `${c.length}` }).objects;
    });
    const full = run(Infinity);
    const m5 = deepCandles("EUR_USD", "M5");
    for (const k of [0.5, 0.85, 0.99]) {
      const t = m5[Math.floor(m5.length * k)]!.time + 300;
      const price = m5[Math.floor(m5.length * k)]!.close;
      const a = buildFeed({ pair: "EUR_USD", objects: viewAsOf(full, t), ref: t, price, atr: 0.0008 });
      const b = buildFeed({ pair: "EUR_USD", objects: run(t), ref: t, price, atr: 0.0008 });
      expect(a.every((e) => e.t <= t)).toBe(true);
      expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    }
  }, 120000);
});

describe("buildReadiness (default OQ-1 chain)", () => {
  const f = zone({ lifecycle: [{ kind: "partially_mitigated", t: REF - 6 * H, known_at: REF - 6 * H }] });
  const swp = mkObj({ type: "sweep", layer: "liquidity", source_tf: "H1", lo: 1.0996, hi: 1.0997, known_at: REF - 5 * H });
  const fvg = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", direction: "bull", lo: 1.0999, hi: 1.1002, known_at: REF - H });
  const run = (objects: AnalysisObject[], focus: AnalysisObject | null = f, price = 1.1) => buildReadiness({ pair: "EUR_USD", focus, objects, ref: REF, price, atr: ATR });

  it("seen in order with times; missing steps say what is missing", () => {
    const r = run([f, swp, bos(2)]);
    expect(r.steps.map((s) => s.status)).toEqual(["seen", "seen", "seen", "pending"]);
    expect(r.steps[3]?.missing).toMatch(/No lower-timeframe FVG/);
    expect(r.complete).toBe(false);
    expect(run([f, swp, bos(2), fvg]).complete).toBe(true);
  });
  it("order matters: a break before the sweep does not count", () => {
    const early = bos(1, { known_at: REF - 8 * H });
    const r = run([f, swp, early]);
    expect(r.steps.map((s) => s.status)).toEqual(["seen", "seen", "pending", "pending"]);
    expect(r.steps[3]?.missing).toBe("Waiting for the previous step.");
  });
  it("zone step pending shows the distance in pips; later steps wait", () => {
    const r = run([mkObj({ source_tf: "H4", direction: "bull", lo: 1.1015, hi: 1.102, known_at: REF - 9 * H })], mkObj({ source_tf: "H4", direction: "bull", lo: 1.1015, hi: 1.102, known_at: REF - 9 * H }));
    expect(r.steps[0]).toMatchObject({ status: "pending" });
    expect(r.steps[0]?.missing).toMatch(/15\.0 pips from the zone/);
    expect(r.steps.slice(1).every((s) => s.status === "pending")).toBe(true);
  });
  it("failed when the zone is invalidated; direction-less focus marks break/FVG unavailable", () => {
    const dead = zone({ lifecycle: [{ kind: "invalidated", t: REF - H, known_at: REF - H }] });
    const r = run([dead], dead, 1.2);
    expect(r.steps.every((s) => s.status === "failed")).toBe(true);
    expect(r.steps[0]?.missing).toMatch(/invalidated at/);
    const pool = mkObj({ type: "liquidity_pool", layer: "liquidity", source_tf: "H1", lo: 1.0999, hi: 1.1001, known_at: REF - 7 * H });
    const n = run([pool], pool);
    expect(n.steps.filter((s) => s.status === "unavailable").map((s) => s.id)).toEqual(["break", "fvg"]);
  });
  it("chain is configurable (3-step) and no focus is honest", () => {
    const chain = [{ id: "zone", label: "Zone" }, { id: "sweep", label: "Sweep" }, { id: "fvg", label: "FVG" }] as const;
    const r = buildReadiness({ pair: "EUR_USD", focus: f, objects: [f, swp, fvg], ref: REF, price: 1.1, atr: ATR, chain });
    expect(r.steps.map((s) => s.id)).toEqual(["zone", "sweep", "fvg"]);
    expect(r.complete).toBe(true);
    expect(run([], null).steps[0]?.missing).toMatch(/No focus object/);
  });
});

describe("buildThesis", () => {
  const z = zone();
  const snap: Snapshot = {
    id: "snap:x", pair: "EUR_USD", date: "2025-02-19", as_of: REF - 5 * H, dataKind: "sample", rulesVersion: "rt", acceptedIds: [z.id], rejectedIds: [],
    revisitIds: [], reviewedSteps: [], objects: [z], notes: "Plan: watch demand.", created_at: REF - 5 * H,
  };
  it("no snapshot is stated honestly", () => {
    expect(buildThesis([], [])).toMatchObject({ saved: false, since: [], lines: [] });
  });
  it("shows the frozen thesis unchanged and only later events as changes, thesis objects first", () => {
    const events = feed([z, bos(2), mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", lo: 1.1, hi: 1.1004, known_at: REF - 8 * H })].map((o, i) => (i === 0 ? { ...o, lifecycle: [{ kind: "tested", t: REF - H, known_at: REF - H }] } : o)), { acceptedIds: new Set([z.id]) });
    const t = buildThesis([snap], events);
    expect(t.lines).toHaveLength(1);
    expect(t.notes).toBe("Plan: watch demand.");
    expect(t.since.every((e) => e.t > snap.as_of)).toBe(true);
    expect(t.since[0]?.thesis).toBe(true);
  });
});

describe("liveStore", () => {
  beforeEach(() => useLiveStore.getState().clear());
  it("acknowledge, dismiss, restore and note", () => {
    const s = useLiveStore.getState();
    s.acknowledge("e1"); s.dismiss("e2"); s.setNote("e1", "  watching  "); s.restore("e2");
    const m = useLiveStore.getState().marks;
    expect(m.e1).toEqual({ ack: true, note: "watching" });
    expect(m.e2?.dismissed).toBe(false);
  });
  it("parse drops corrupt input", () => {
    expect(parseMarks(null)).toEqual({});
    expect(parseMarks([1])).toEqual({});
    expect(parseMarks({ a: { ack: true, note: 5 }, b: 3 })).toEqual({ a: { ack: true } });
  });
});

const fake = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("./useLive", async (orig) => ({ ...(await orig<typeof import("./useLive")>()), useLive: () => fake.session }));

describe("Live widgets", () => {
  const z = zone({ lifecycle: [{ kind: "partially_mitigated", t: REF - 3 * H, known_at: REF - 3 * H }] });
  const e = feed([z]);
  const session = (events = e): LiveSession => ({
    events, ref: REF, dataKind: "sample", objects: [z],
    readiness: buildReadiness({ pair: "EUR_USD", focus: z, objects: [z], ref: REF, price: 1.1, atr: ATR }),
    thesis: buildThesis([], events),
  });
  beforeEach(() => { useLiveStore.getState().clear(); useDeskUiStore.setState({ selectedObjectId: null, evidenceOpen: false }); });

  it("feed: aria-live list, acknowledge keeps the row with a text cue, dismiss hides and can be shown", async () => {
    fake.session = session();
    const { ChangeFeedBody } = await import("./LiveWidgets");
    render(<ChangeFeedBody />);
    const list = screen.getByRole("list", { name: "Market Change Feed" });
    expect(list.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText(/No thesis saved for today/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Acknowledge:/ }));
    expect(within(list).getByText(/acknowledged ✓/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Dismiss:/ }));
    expect(screen.queryByRole("list", { name: "Market Change Feed" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Show dismissed \(1\)/ }));
    expect(screen.getByRole("list", { name: "Market Change Feed" })).toBeTruthy();
  });
  it("feed: a note is saved on Enter; row click selects the object; empty state explains", async () => {
    fake.session = session();
    const { ChangeFeedBody } = await import("./LiveWidgets");
    const { unmount } = render(<ChangeFeedBody />);
    await userEvent.click(screen.getByRole("button", { name: /^Note:/ }));
    await userEvent.type(screen.getByRole("textbox", { name: /^Note text:/ }), "fills the gap{Enter}");
    expect(Object.values(useLiveStore.getState().marks)[0]?.note).toBe("fills the gap");
    await userEvent.click(screen.getByRole("button", { name: /^Show evidence:/ }));
    expect(useDeskUiStore.getState().selectedObjectId).toBe(z.id);
    unmount();
    fake.session = session([]);
    render(<ChangeFeedBody />);
    expect(screen.getByText(/No meaningful changes near price/)).toBeTruthy();
  });
  it("readiness: labelled steps with glyph + text status", async () => {
    fake.session = session();
    const { ReadinessBody } = await import("./LiveWidgets");
    render(<ReadinessBody />);
    const list = screen.getByRole("list", { name: "Readiness chain" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getAllByText(/— (seen|pending|failed|unavailable)/).length).toBe(4);
  });
});