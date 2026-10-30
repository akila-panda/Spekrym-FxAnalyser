import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSource } from "@/api/mock/mockSource";
import { computeRects, GAP, STACK_BAR_PX, STACK_TIMELINE_PX } from "@/panels/layouts";
import { PanelGrid } from "@/panels/PanelGrid";
import { usePanelStore } from "@/panels/panelStore";
import type { Timeframe } from "@/types/market";
import { COLLAPSED_ROW_PX, STACK_ORDER } from "./viewportPolicy";
import { useFocusStore } from "./focusStore";

vi.mock("@/chart/ChartCanvas", () => ({ ChartCanvas: () => <div data-testid="chart-canvas" /> }));

const size = { width: 900, height: 900 };

describe("S3 stack layout geometry", () => {
  it("stacks D,H4,H1,M15,M5,M1 vertically between the focus bar and timeline bar, no overlap, W hidden", () => {
    const r = computeRects("stack", size, "M15");
    expect(r.W).toBeNull();
    let y = STACK_BAR_PX;
    for (const tf of STACK_ORDER) {
      const x = r[tf]!;
      expect(x.y).toBe(y);
      expect(x.width).toBe(size.width);
      expect(x.height).toBeGreaterThan(0);
      y += x.height + GAP;
    }
    expect(y - GAP + STACK_TIMELINE_PX).toBe(size.height);
    expect(r.M15!.height).toBeGreaterThan(r.D!.height);
  });
});

describe("DX1 stack layout geometry", () => {
  it("unsupported rows are 28px strips; the focus row stays the tallest", () => {
    const r = computeRects("stack", size, "M5", { focusTF: "M5", supported: new Set<Timeframe>(["M5", "M1"]) });
    for (const tf of ["D", "H4", "H1", "M15"] as const) expect(r[tf]!.height).toBe(COLLAPSED_ROW_PX);
    expect(r.M5!.height).toBeGreaterThan(r.M1!.height);
    const total = STACK_ORDER.reduce((a, tf) => a + r[tf]!.height, 0) + GAP * 5;
    expect(total + STACK_BAR_PX + STACK_TIMELINE_PX).toBe(size.height);
  });

  it("with every row supported only the weights change (same tiles, focus boosted)", () => {
    const r = computeRects("stack", size, "H1");
    expect(STACK_ORDER.every((tf) => r[tf] !== null && r[tf]!.width === size.width)).toBe(true);
    expect(r.H1!.height).toBeGreaterThan(r.M15!.height);
    expect(r.M15!.height).toBeGreaterThan(r.H4!.height);
  });
});

describe("S3 stack layout UI", () => {
  beforeEach(() => {
    act(() => {
      useFocusStore.getState().reset();
      usePanelStore.setState({ layout: "stack", restoreTo: "stack", focused: "M15" });
    });
  });

  it("renders six rows and the focus bar", () => {
    render(<PanelGrid source={createMockSource()} size={size} />);
    expect(screen.getByRole("toolbar", { name: /stack focus/i })).toBeInTheDocument();
    for (const tf of STACK_ORDER) expect(screen.getByRole("region", { name: `${tf} chart` })).toBeInTheDocument();
  });

  it("shows a re-snap control for a detached row and clears it", async () => {
    render(<PanelGrid source={createMockSource()} size={size} />);
    act(() => useFocusStore.getState().setDetached("M5", true));
    await userEvent.click(screen.getByRole("button", { name: /re-snap m5 to the focus/i }));
    expect(useFocusStore.getState().detached.has("M5")).toBe(false);
  });

  it("leaves the grid layout unchanged (no focus bar)", () => {
    act(() => usePanelStore.setState({ layout: "grid", restoreTo: "grid" }));
    render(<PanelGrid source={createMockSource()} size={size} />);
    expect(screen.queryByRole("toolbar", { name: /stack focus/i })).toBeNull();
  });
});