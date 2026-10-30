import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { TimelineBar } from "./TimelineBar";
import { useTimelineStore } from "./timelineStore";

const T0 = Date.UTC(2025, 3, 7, 0, 0, 0) / 1000;

beforeEach(() => {
  act(() => {
    useTimelineStore.getState().reset();
    useViewStore.setState({ asOf: null, timezone: "utc" });
    useScanStore.setState({ bounds: { first: T0, last: T0 + 6 * 3600 } });
  });
});

describe("Timeline Sync bar", () => {
  it("syncing locks the charts at the chosen time, slider then moves the anchor live", async () => {
    render(<TimelineBar />);
    const slider = screen.getByRole("slider", { name: /timeline time/i });
    fireEvent.change(slider, { target: { value: String(T0 + 3600) } });
    expect(useTimelineStore.getState().locked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /timeline sync/i }));
    expect(useTimelineStore.getState()).toMatchObject({ locked: true, anchor: T0 + 3600 });
    fireEvent.change(slider, { target: { value: String(T0 + 7200) } });
    expect(useTimelineStore.getState().anchor).toBe(T0 + 7200);
    expect(screen.getByRole("button", { name: /unlock/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("unlock releases the lock", async () => {
    render(<TimelineBar />);
    await userEvent.click(screen.getByRole("button", { name: /timeline sync/i }));
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
    expect(useTimelineStore.getState().locked).toBe(false);
  });

  it("is disabled when there is no data", () => {
    act(() => useScanStore.setState({ bounds: null }));
    render(<TimelineBar />);
    expect(screen.getByRole("button", { name: /timeline sync/i })).toBeDisabled();
  });
});