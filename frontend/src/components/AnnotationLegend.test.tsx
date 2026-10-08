import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildDevSetup } from "@/annotations/devSetup";
import { useAnnotationStore } from "@/store/annotationStore";
import { AnnotationLegend } from "./AnnotationLegend";

const bars = Array.from({ length: 16 }, (_, i) => ({ time: 1_800_000_000 + i * 900, open: 1, high: 1.1, low: 0.9, close: 1, volume: 1 }));

beforeEach(() => act(() => { useAnnotationStore.getState().setSetup(null); useAnnotationStore.getState().showAllGroups(); }));

describe("AnnotationLegend", () => {
  it("shows the empty hint without a setup", () => {
    render(<AnnotationLegend />);
    expect(screen.getByText("Legend toggles appear after a scan.")).toBeInTheDocument();
  });
  it("lists role groups with source timeframes and toggles them", async () => {
    const user = userEvent.setup();
    act(() => useAnnotationStore.getState().setSetup(buildDevSetup(bars)));
    render(<AnnotationLegend />);
    expect(screen.getByText("Fair value gap")).toBeInTheDocument();
    expect(screen.getAllByText(/H1 · 1/).length).toBeGreaterThan(0);
    const box = screen.getByRole("checkbox", { name: "Sweep" });
    expect(box).toBeChecked();
    await user.click(box);
    expect(useAnnotationStore.getState().hiddenGroups.has("sweep")).toBe(true);
    expect(box).not.toBeChecked();
  });
});