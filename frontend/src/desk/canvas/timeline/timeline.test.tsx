import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { buildTimeline, counts, isLive, rehydrate, replaySteps, stepAsOf } from "./timeline";
import { RECORDED_IDS, SAMPLE_TIMELINE, TIMELINE_INPUT } from "./timelineFixtures";
import { TimelineBar } from "./TimelineBar";
import { useTimelineStore } from "./timelineStore";
import { composeCanvas } from "../pipeline";
import { CanvasRoot } from "../CanvasRoot";
import { useCanvasStore } from "../canvasStore";
import { usePrepareStore } from "../prepare/prepareStore";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useTimelineStore.getState().reset();
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("F12 timeline (pure, causal, honest)", () => {
  const steps = replaySteps(SAMPLE_TIMELINE);

  it("every entry carries exactly one origin; default is reconstructed, never recorded", () => {
    for (const e of SAMPLE_TIMELINE) expect(["recorded", "reconstructed"]).toContain(e.origin);
    const none = buildTimeline({ ...TIMELINE_INPUT, recordedIds: new Set() });
    expect(none.every((e) => e.origin === "reconstructed")).toBe(true);
    expect(buildTimeline({ ...TIMELINE_INPUT }).filter((e) => e.origin === "recorded").map((e) => e.id).sort())
      .toEqual([...RECORDED_IDS].sort());
    expect(counts(SAMPLE_TIMELINE).recorded + counts(SAMPLE_TIMELINE).reconstructed).toBe(SAMPLE_TIMELINE.length);
  });

  it("rehydrate at as-of shows only what was knowable (respects availableAt)", () => {
    expect(rehydrate(SAMPLE_TIMELINE, 0)).toHaveLength(0);
    for (const t of steps) for (const e of rehydrate(SAMPLE_TIMELINE, t)) expect(e.availableAt).toBeLessThanOrEqual(t);
    const justBefore = steps[1]! - 1;
    expect(rehydrate(SAMPLE_TIMELINE, justBefore).every((e) => e.availableAt <= justBefore)).toBe(true);
  });

  it("replay/live parity: rehydrate(t) is a prefix of the full timeline; latest equals live", () => {
    for (const t of steps) {
      const part = rehydrate(SAMPLE_TIMELINE, t);
      expect(SAMPLE_TIMELINE.slice(0, part.length)).toEqual(part);
    }
    expect(rehydrate(SAMPLE_TIMELINE, steps[steps.length - 1]!)).toEqual(rehydrate(SAMPLE_TIMELINE, null));
  });

  it("overlays rehydrate under the same as-of (nothing composed before known_at)", () => {
    const early = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: 1_746_813_000 });
    const live = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: SAMPLE_NOW });
    expect(early.overlays).toHaveLength(0);
    expect(live.overlays.length).toBeGreaterThan(0);
  });

  it("stepAsOf walks the grid; forward onto the last step = live; back clamps at the first", () => {
    expect(isLive(steps, null)).toBe(true);
    const back1 = stepAsOf(steps, null, -1);
    expect(back1).toBe(steps[steps.length - 2]);
    expect(stepAsOf(steps, back1, 1)).toBeNull();
    let cur: number | null = null;
    for (let i = 0; i < steps.length + 3; i++) cur = stepAsOf(steps, cur, -1);
    expect(cur).toBe(steps[0]);
    expect(stepAsOf([], null, 1)).toBeNull();
  });
});

describe("F12 TimelineBar UI", () => {
  it("labels each event recorded/reconstructed in text + glyph; marked sample; no future entries", async () => {
    const user = userEvent.setup();
    render(<TimelineBar entries={SAMPLE_TIMELINE} />);
    const all = screen.getByLabelText("Timeline events").querySelectorAll("button").length;
    expect(all).toBe(SAMPLE_TIMELINE.length);
    const rec = screen.getAllByRole("button", { name: /— recorded$/ });
    const recon = screen.getAllByRole("button", { name: /— reconstructed$/ });
    expect(rec.length + recon.length).toBe(all);
    expect(rec[0]!.textContent).toContain("●");
    expect(recon[0]!.textContent).toContain("◌");
    expect(screen.getByLabelText("Intelligence timeline").textContent).toMatch(/sample/);
    await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    expect(screen.getByLabelText("Replay position").textContent).toMatch(/Replay @/);
    expect(screen.getByLabelText("Timeline events").querySelectorAll("button").length).toBeLessThan(all);
    await user.click(screen.getByRole("button", { name: "Back to live" }));
    expect(screen.getByLabelText("Replay position").textContent).toMatch(/Live/);
  });

  it("reduced motion: Play disabled, stepping still works", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    const user = userEvent.setup();
    render(<TimelineBar entries={SAMPLE_TIMELINE} />);
    expect((screen.getByRole("button", { name: "Play replay" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    expect(useTimelineStore.getState().asOf).not.toBeNull();
  });

  it("play advances the cursor on a timer and stops at live", () => {
    vi.useFakeTimers();
    render(<TimelineBar entries={SAMPLE_TIMELINE} />);
    act(() => { screen.getByRole("button", { name: "Play replay" }).click(); });
    expect(useTimelineStore.getState().asOf).not.toBeNull();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(useTimelineStore.getState().asOf).toBeNull();
    expect(useTimelineStore.getState().playing).toBe(false);
  });
});

describe("F12 in the Canvas", () => {
  it("stepping back rehydrates the regime strip causally; timeline present in every mode", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    const before = screen.getByLabelText("Regime strip").querySelectorAll(".vc-regime-seg").length;
    await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    await user.click(screen.getByRole("button", { name: "Step timeline back" }));
    expect(screen.getByLabelText("Regime strip").querySelectorAll(".vc-regime-seg").length).toBeLessThan(before);
    for (const m of ["Prepare", "Explore", "Monitor", "Review"]) {
      await user.click(screen.getByRole("button", { name: m }));
      expect(screen.getByLabelText("Intelligence timeline")).toBeTruthy();
    }
  });
});