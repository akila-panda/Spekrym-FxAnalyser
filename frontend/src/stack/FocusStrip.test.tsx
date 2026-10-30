import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { useScanStore } from "@/scan/scanStore";
import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";
import { FocusStrip } from "./FocusStrip";
import { useFocusStore } from "./focusStore";
import { useTimelineStore } from "./timelineStore";

const st = () => useScanStore.getState();

beforeEach(() =>
  act(() => {
    st().reset();
    useFocusStore.getState().reset();
    useTimelineStore.getState().reset();
    useAnnotationStore.getState().setSetup(null);
    useViewStore.setState({ asOf: null, timezone: "utc" });
    useScanStore.setState((s) => ({
      panels: {
        ...s.panels,
        M5: { status: "done", stale: false, result: scanOf("M5", [validSetup("a", 0, 2.1), validSetup("b", 1, -1, "short"), rejectedSetup("r", 2)], 0.55) },
      },
    }));
  }),
);

describe("DX5 FocusStrip", () => {
  it("with no setup only Timeline Sync shows", () => {
    render(<FocusStrip />);
    expect(screen.queryByRole("group", { name: "Setup navigator" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Timeline sync" })).toBeInTheDocument();
  });

  it("navigator shows the position in the filtered list and walks it", async () => {
    const user = userEvent.setup();
    act(() => st().activate("M5", "a"));
    render(<FocusStrip />);
    expect(screen.getByLabelText("Setup 1 of 2")).toHaveTextContent("1 / 2");
    expect(screen.getByRole("button", { name: "Previous setup" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next setup" }));
    expect(st().active).toEqual({ tf: "M5", id: "b" });
    expect(screen.getByLabelText("Setup 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next setup" })).toBeDisabled();
  });

  it("shows pair, strategy and the setup window", () => {
    act(() => st().activate("M5", "a"));
    render(<FocusStrip />);
    expect(screen.getByText(/EUR\/USD/)).toBeInTheDocument();
    expect(screen.getByText(/→/)).toBeInTheDocument();
  });

  it("clicking a phase moves the focus anchor and never past asOf", async () => {
    const user = userEvent.setup();
    act(() => st().activate("M5", "a"));
    const setup = st().panels.M5.result!.setups.find((x) => x.id === "a")!;
    render(<FocusStrip />);
    await user.click(screen.getByRole("button", { name: "Context" }));
    expect(useFocusStore.getState().focus?.anchor).toBeLessThan(setup.focus.from);
    await user.click(screen.getByRole("button", { name: "Setup" }));
    expect(useFocusStore.getState().focus?.anchor).toBe(setup.focus.from);
    expect(screen.getByRole("button", { name: "Setup" })).toHaveAttribute("aria-pressed", "true");
    act(() => useViewStore.setState({ asOf: setup.focus.from - 7200 }));
    expect(screen.getByRole("button", { name: "Setup" })).toBeDisabled();
  });

  it("step controls reuse the annotation step state", async () => {
    const user = userEvent.setup();
    act(() => st().activate("M5", "a"));
    render(<FocusStrip />);
    expect(screen.getByRole("status", { name: /All steps/ })).toHaveTextContent("all");
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(useAnnotationStore.getState().step).not.toBeNull();
    expect(screen.getByRole("status", { name: /Step 1 of/ })).toHaveTextContent(/^1\//);
  });

  it("the embedded Timeline Sync keeps working", async () => {
    const user = userEvent.setup();
    act(() => {
      useScanStore.setState({ bounds: { first: 1_700_000_000, last: 1_700_000_000 + 6 * 3600 } });
      st().activate("M5", "a");
    });
    render(<FocusStrip />);
    await user.click(screen.getByRole("button", { name: /timeline sync/i }));
    expect(useTimelineStore.getState().locked).toBe(true);
  });
});