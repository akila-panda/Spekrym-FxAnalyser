import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { detectAll } from "@/desk/detect";
import { deepCandles } from "@/desk/mock/deepMock";
import type { Decision } from "@/desk/types/schemas";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { useViewStore } from "@/store/viewStore";
import { START_BACK, closeTimes, indexAtOrBefore, scrubTo, startPoint, stepFrom, tickMs } from "./replayClock";
import { AsOfBadge, ReplayBody } from "./ReplayWidgets";
import { playReplay, tickReplay, useReplayStore } from "./replayStore";
import { TIMELINE, buildTimeline } from "./timeline";

const times = closeTimes("EUR_USD", "M15");
const last = times.length - 1;

beforeEach(() => {
  useDeskUiStore.setState({ asOf: "latest", selectedObjectId: null });
  useReplayStore.setState({ playing: false, speed: 1, stepTf: "M15" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("replay clock", () => {
  it("grid = closed-bar close times, ascending", () => {
    expect(times).toHaveLength(deepCandles("EUR_USD", "M15").length);
    expect(times.every((t, i) => i === 0 || t > (times[i - 1] as number))).toBe(true);
    expect(indexAtOrBefore(times, (times[5] as number) + 1)).toBe(5);
    expect(indexAtOrBefore(times, (times[0] as number) - 1)).toBe(-1);
  });
  it("steps, clamps, and ends at latest", () => {
    expect(stepFrom(times, "latest", 1)).toBe("latest");
    expect(stepFrom(times, "latest", -1)).toBe(times[last - 1]);
    expect(stepFrom(times, times[last - 1] as number, 1)).toBe("latest");
    expect(stepFrom(times, times[0] as number, -1)).toBe(times[0]);
    expect(scrubTo(times, last)).toBe("latest");
    expect(startPoint(times)).toBe(times[last - START_BACK]);
    expect(tickMs(4)).toBeLessThan(tickMs(1));
  });
});

describe("replay transport", () => {
  it("play from latest rewinds, ticks forward, and stops at latest; never writes viewStore.asOf", () => {
    const viewAsOf = useViewStore.getState().asOf;
    expect(playReplay("EUR_USD")).toBe(true);
    expect(useDeskUiStore.getState().asOf).toBe(times[last - START_BACK]);
    expect(useReplayStore.getState().playing).toBe(true);
    for (let i = 0; i < START_BACK; i++) tickReplay("EUR_USD");
    expect(useDeskUiStore.getState().asOf).toBe("latest");
    expect(useReplayStore.getState().playing).toBe(false);
    expect(useViewStore.getState().asOf).toEqual(viewAsOf);
  });
  it("reduced motion: Play is refused and disabled; stepping works", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    expect(playReplay("EUR_USD")).toBe(false);
    expect(useReplayStore.getState().playing).toBe(false);
    render(<ReplayBody />);
    expect(screen.getByRole("button", { name: "Play replay" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Step back one bar" }));
    expect(useDeskUiStore.getState().asOf).toBe(times[last - 1]);
  });
  it("body: timer advances the clock while playing and unmount pauses", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ReplayBody />);
    act(() => { playReplay("EUR_USD"); });
    const start = useDeskUiStore.getState().asOf as number;
    act(() => { vi.advanceTimersByTime(2100); });
    expect(useDeskUiStore.getState().asOf as number).toBeGreaterThan(start);
    unmount();
    expect(useReplayStore.getState().playing).toBe(false);
  });
  it("as-of badge shows only when not latest and returns to latest", async () => {
    const { rerender } = render(<AsOfBadge />);
    expect(screen.queryByRole("status", { name: "As-of" })).toBeNull();
    act(() => useDeskUiStore.getState().setAsOf(times[100] as number));
    rerender(<AsOfBadge />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Return to latest" }));
    expect(useDeskUiStore.getState().asOf).toBe("latest");
  });
});

describe("buildTimeline", () => {
  const REF = 1_740_000_000;
  const H = 3600;
  const o = mkObj({ source_tf: "H4", direction: "bull", known_at: REF - 6 * H, confirmed_at: REF + H,
    lifecycle: [{ kind: "partially_mitigated", t: REF - 2 * H, known_at: REF - 2 * H }, { kind: "invalidated", t: REF + 2 * H, known_at: REF + 2 * H }] });
  const later = mkObj({ type: "fvg", layer: "fvg", known_at: REF + H });
  it("never contains a fact known after the as-of", () => {
    const tl = buildTimeline({ objects: [o, later], ref: REF });
    expect(tl.every((e) => e.t <= REF)).toBe(true);
    expect(tl.map((e) => e.kind).sort()).toEqual(["formed", "lifecycle"]);
    expect(tl.some((e) => e.objectId === later.id)).toBe(false);
    expect(tl[0]?.text).toMatch(/partially mitigated/);
  });
  it("is newest first; later as-of reveals the later facts; selected scopes to one object", () => {
    const tl = buildTimeline({ objects: [o, later], ref: REF + 3 * H });
    expect(tl.map((e) => e.t)).toEqual([...tl.map((e) => e.t)].sort((a, b) => b - a));
    expect(tl.map((e) => e.kind)).toContain("confirmed");
    expect(buildTimeline({ objects: [o, later], ref: REF + 3 * H, selectedId: o.id }).every((e) => e.objectId === o.id)).toBe(true);
  });
  it("window + cap; decisions anchored on trading date and gated by as-of; no forecast words", () => {
    const old = mkObj({ type: "fvg", layer: "fvg", known_at: REF - 100 * H });
    expect(buildTimeline({ objects: [old], ref: REF })).toHaveLength(0);
    const many = Array.from({ length: 90 }, (_, i) => mkObj({ type: "fvg", layer: "fvg", known_at: REF - 1 - i }));
    expect(buildTimeline({ objects: many, ref: REF })).toHaveLength(TIMELINE.cap);
    const d = (date: string): Decision => ({ id: `d|${date}`, pair: "EUR_USD", date, objectId: o.id, action: "accept", decided_at: 1_900_000_000, rulesVersion: "r" });
    const day = new Date(REF * 1000).toISOString().slice(0, 10);
    const tl = buildTimeline({ objects: [o], decisions: [d(day), d("2099-01-01")], ref: REF });
    expect(tl.filter((e) => e.kind === "decision")).toHaveLength(1);
    expect(tl.map((e) => e.text).join(" ")).not.toMatch(/\b(buy|sell|long|short|reversal|likely|probab\w*|will)\b/i);
  });
  it("matches a prefix recompute: folding full detection at t == detecting on the prefix (no lookahead)", () => {
    const candles = deepCandles("EUR_USD", "H1");
    const t = candles[Math.floor(candles.length * 0.7)]!.time + 3600;
    const mk = (asOf: number) => detectAll({ candles, pair: "EUR_USD", tf: "H1", asOf, dataKind: "sample", dataVersion: "x" }).objects;
    const full = buildTimeline({ objects: mk(Infinity), ref: t, selectedId: null }).map((e) => e.id);
    const pre = buildTimeline({ objects: mk(t), ref: t, selectedId: null }).map((e) => e.id);
    expect(full).toEqual(pre);
  });
});