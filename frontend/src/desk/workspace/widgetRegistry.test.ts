import { describe, expect, it } from "vitest";
import { availableWidgets, defaultWidgets, getWidget, levelMeets } from "./widgetRegistry";

describe("widget registry", () => {
  it("prepare at standard shows the three default widgets", () => {
    const ids = defaultWidgets("prepare", "standard").map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["checklist", "layers", "levelsInbox"]));
  });

  it("live defaults are brief + changeFeed + layers (+ readiness from standard)", () => {
    expect(defaultWidgets("live", "standard").map((w) => w.id).sort()).toEqual(["brief", "calendar", "changeFeed", "layers", "plan", "readiness", "sessions", "volatility"]);
    expect(defaultWidgets("live", "minimal").map((w) => w.id).sort()).toEqual(["brief", "changeFeed", "layers"]);
  });

  it("minimal hides a standard-only widget from a workflow default", () => {
    // scorecard is standard-level and a review default; it must not appear at minimal.
    expect(defaultWidgets("review", "minimal").map((w) => w.id)).not.toContain("scorecard");
    expect(defaultWidgets("review", "standard").map((w) => w.id)).toContain("scorecard");
  });

  it("review standard adds Replay + Evidence timeline; minimal hides them", () => {
    expect(defaultWidgets("review", "standard").map((w) => w.id)).toEqual(expect.arrayContaining(["replay", "evidenceTimeline"]));
    expect(defaultWidgets("review", "minimal").map((w) => w.id)).not.toContain("replay");
  });

  it("availableWidgets gates advanced widgets out of lower levels", () => {
    expect(availableWidgets("minimal").map((w) => w.id)).not.toContain("replay");
    expect(availableWidgets("advanced").map((w) => w.id)).toContain("replay");
    expect(availableWidgets("minimal").map((w) => w.id)).not.toContain("methodology");
  });

  it("levelMeets orders minimal < standard < advanced", () => {
    expect(levelMeets("advanced", "standard")).toBe(true);
    expect(levelMeets("minimal", "standard")).toBe(false);
  });

  it("getWidget resolves by id", () => {
    expect(getWidget("layers")?.title).toBe("Layers");
    expect(getWidget("nope")).toBeUndefined();
  });
});