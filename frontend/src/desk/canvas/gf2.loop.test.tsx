/** Gate GF2 — the full Prepare → Explore → Monitor → Review loop on mock data. Integration only; no new features. */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { CanvasRoot } from "./CanvasRoot";
import { useCanvasStore } from "./canvasStore";
import { composeCanvas } from "./pipeline";
import { usePrepareStore } from "./prepare/prepareStore";
import { useExploreStore } from "./explore/exploreStore";
import { PREPARE_STEPS } from "./prepare/steps";
import { buildChangeFeed, sampleLiveFacts } from "./live/diff";
import { buildReview, sampleReviewInput } from "./review/scorecard";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
  useExploreStore.setState({ hiddenEngines: [] });
});

describe("GF2 full loop (UI, mock data)", () => {
  it("walks all six steps, freezes, explores, monitors and reviews with the plan unchanged", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);

    // Prepare: visit every step, select an object, freeze.
    for (let i = 0; i < PREPARE_STEPS.length; i++) {
      await user.click(screen.getByLabelText("Step").querySelectorAll("button")[i] as HTMLElement);
    }
    expect(Object.keys(usePrepareStore.getState().reviewed)).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: /1\. / }));
    await user.click(screen.getByLabelText("Overlays").querySelector(".vc-overlay") as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Freeze plan" }));
    const frozen = usePrepareStore.getState().plan!;
    expect(Object.isFrozen(frozen)).toBe(true);

    // Explore: hide every engine (display only), then restore.
    await user.click(screen.getByRole("button", { name: "Explore" }));
    for (const b of Array.from(screen.getByLabelText("Explore engines").querySelectorAll(".vc-engine"))) await user.click(b as HTMLElement);
    expect(screen.getByLabelText("Overlays").querySelectorAll(".vc-overlay")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Show all engines" }));

    // Monitor: feed + Before/Now against the frozen plan.
    await user.click(screen.getByRole("button", { name: "Monitor" }));
    expect(screen.getByLabelText("Market change feed").querySelectorAll(".vc-feed-row").length).toBeGreaterThan(0);
    expect(screen.getByText(/Before:/)).toBeTruthy();

    // Review: four independent axes.
    await user.click(screen.getByRole("button", { name: "Review" }));
    for (const ax of ["Analysis quality", "Decision quality", "Process adherence", "Trade outcome"]) expect(screen.getByLabelText(ax)).toBeTruthy();

    // Back to Prepare: plan is still the very same frozen object; surfaces are labelled sample.
    await user.click(screen.getByRole("button", { name: "Prepare" }));
    expect(usePrepareStore.getState().plan).toBe(frozen);
    expect(screen.getAllByText("sample").length).toBeGreaterThan(0);
  });
});

describe("GF2 loop invariants (pure)", () => {
  it("is causal: nothing composes before it was knowable, and the loop is deterministic", () => {
    const before = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: 0 });
    expect(before.overlays).toHaveLength(0);
    const a = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: SAMPLE_NOW });
    const b = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: SAMPLE_NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.overlays.length).toBeGreaterThan(0);
  });

  it("monitor + review read the frozen plan without mutating it", () => {
    const s = usePrepareStore.getState();
    s.toggleSelect("a");
    s.freeze({ pair: "EUR_USD", asOf: SAMPLE_NOW });
    const plan = usePrepareStore.getState().plan!;
    const snap = JSON.stringify(plan);
    const feed = buildChangeFeed(plan, sampleLiveFacts(plan));
    const review = buildReview(sampleReviewInput(plan, feed));
    expect([review.analysis, review.decision, review.process, review.outcome]).toHaveLength(4);
    expect(JSON.stringify(plan)).toBe(snap);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});