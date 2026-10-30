import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSource } from "@/api/mock/mockSource";
import { MOCK_STRATEGIES } from "@/api/mock/mockStrategies";
import { PanelGrid } from "@/panels/PanelGrid";
import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import type { Timeframe } from "@/types/market";
import { useFocusStore } from "./focusStore";
import { useRowsStore } from "./rowsStore";

vi.mock("@/chart/ChartCanvas", () => ({ ChartCanvas: () => <div data-testid="chart-canvas" /> }));

const size = { width: 900, height: 900 };

function useStrategy(supported: Timeframe[], context: Timeframe[]) {
  act(() => {
    const st = useScanStore.getState();
    st.setCatalog([{ ...MOCK_STRATEGIES[0]!, id: "t", name: "Test strategy", supported_timeframes: supported, context_timeframes: context }]);
    st.selectStrategy("t");
  });
}

beforeEach(() => {
  act(() => {
    useScanStore.getState().reset();
    useRowsStore.getState().reset();
    useFocusStore.getState().reset();
    usePanelStore.setState({ layout: "stack", restoreTo: "stack", focused: "M15" });
  });
});

describe("DX2 stack rows", () => {
  it("without a strategy every row is a chart", () => {
    render(<PanelGrid source={createMockSource()} size={size} />);
    expect(screen.getAllByTestId("chart-canvas")).toHaveLength(6);
  });

  it("an unsupported row is a strip and mounts no chart", () => {
    useStrategy(["M15", "M5", "M1"], ["H1"]);
    render(<PanelGrid source={createMockSource()} size={size} />);
    expect(screen.getAllByTestId("chart-canvas")).toHaveLength(3);
    const h1 = screen.getByRole("region", { name: "H1 chart" });
    expect(h1).toHaveAttribute("data-row", "collapsed");
    expect(within(h1).getByText(/not supported by Test strategy/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "D chart" })).toBeNull(); // not supported, not context: hidden by default
  });

  it("the strip reason is reachable by keyboard", async () => {
    const user = userEvent.setup();
    useStrategy(["M15", "M5", "M1"], ["H1"]);
    render(<PanelGrid source={createMockSource()} size={size} />);
    await user.click(screen.getByRole("button", { name: "Why H1 is collapsed" }));
    expect(screen.getByRole("note")).toHaveTextContent(/Not supported by Test strategy/);
  });

  it("hides and shows a row from the Rows menu", async () => {
    const user = userEvent.setup();
    render(<PanelGrid source={createMockSource()} size={size} />);
    await user.click(screen.getByRole("button", { name: "Choose visible rows" }));
    const group = screen.getByRole("group", { name: "Visible rows" });
    await user.click(within(group).getByRole("checkbox", { name: /^D/ }));
    expect(screen.queryByRole("region", { name: "D chart" })).toBeNull();
    expect(screen.getAllByTestId("chart-canvas")).toHaveLength(5);
    await user.click(within(group).getByRole("checkbox", { name: /^D/ }));
    expect(screen.getByRole("region", { name: "D chart" })).toBeInTheDocument();
  });

  it("keeps the last row and resets to the default rows", async () => {
    const user = userEvent.setup();
    useStrategy(["M5"], []);
    render(<PanelGrid source={createMockSource()} size={size} />);
    await user.click(screen.getByRole("button", { name: "Choose visible rows" }));
    const group = screen.getByRole("group", { name: "Visible rows" });
    expect(within(group).getByRole("checkbox", { name: /^M5/ })).toBeDisabled();
    await user.click(within(group).getByRole("checkbox", { name: /^D/ }));
    expect(screen.getByRole("region", { name: "D chart" })).toBeInTheDocument();
    await user.click(within(group).getByRole("button", { name: "Default rows" }));
    expect(screen.queryByRole("region", { name: "D chart" })).toBeNull();
  });

  it("closes the Rows menu with Esc", async () => {
    const user = userEvent.setup();
    render(<PanelGrid source={createMockSource()} size={size} />);
    await user.click(screen.getByRole("button", { name: "Choose visible rows" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Visible rows" })).toBeNull();
  });

  it("other layouts keep mounting every panel", () => {
    act(() => usePanelStore.setState({ layout: "grid", restoreTo: "grid" }));
    useStrategy(["M5"], []);
    render(<PanelGrid source={createMockSource()} size={size} />);
    expect(screen.getAllByTestId("chart-canvas").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole("button", { name: "Choose visible rows" })).toBeNull();
  });
});