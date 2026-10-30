import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SPAN, MAX_SPAN } from "./timelineMath";
import { isTimelineTf, useTimelineStore } from "./timelineStore";

beforeEach(() => useTimelineStore.getState().reset());

describe("Timeline Sync store", () => {
  it("slider only moves the draft until synced", () => {
    const s = useTimelineStore.getState();
    s.setAnchor(1000);
    expect(useTimelineStore.getState()).toMatchObject({ draft: 1000, anchor: null, locked: false });
    s.sync(1000);
    s.setAnchor(2000);
    expect(useTimelineStore.getState()).toMatchObject({ locked: true, anchor: 2000, draft: 2000 });
  });

  it("unlock releases but remembers the position", () => {
    const s = useTimelineStore.getState();
    s.sync(5000);
    s.unlock();
    expect(useTimelineStore.getState()).toMatchObject({ locked: false, draft: 5000 });
  });

  it("span is clamped and defaults to 3h", () => {
    const s = useTimelineStore.getState();
    expect(useTimelineStore.getState().span).toBe(DEFAULT_SPAN);
    s.setSpan(1e12);
    expect(useTimelineStore.getState().span).toBe(MAX_SPAN);
  });

  it("covers H4..M1, not D or W", () => {
    expect(["H4", "H1", "M15", "M5", "M1"].every((t) => isTimelineTf(t as never))).toBe(true);
    expect(isTimelineTf("D")).toBe(false);
    expect(isTimelineTf("W")).toBe(false);
  });
});