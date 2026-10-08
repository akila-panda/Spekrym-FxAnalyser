import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockSource } from "@/api/mock/mockSource";
import { PanelGrid } from "./PanelGrid";
import { usePanelStore } from "./panelStore";

// jsdom has no canvas, so the real chart cannot run here.
vi.mock("@/chart/ChartCanvas", () => ({ ChartCanvas: () => <div data-testid="chart-canvas" /> }));

const source = createMockSource();
const size = { width: 1200, height: 800 };
const setup = () => render(<PanelGrid source={source} size={size} />);

beforeEach(() => {
  act(() => usePanelStore.setState({ layout: "grid", restoreTo: "grid", focused: "M15" }));
});

describe("PanelGrid", () => {
  it("renders five panels in order H4, H1, M15, M5, M1", () => {
    setup();
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["H4 chart", "H1 chart", "M15 chart", "M5 chart", "M1 chart"]);
  });

  it("maximizes with the button and restores with Esc", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    await user.click(screen.getByRole("button", { name: "Maximize H1" }));
    expect(usePanelStore.getState().layout).toBe("maximized");
    expect(usePanelStore.getState().focused).toBe("H1");
    expect(container.querySelectorAll(".panel-slot:not([hidden])")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(usePanelStore.getState().layout).toBe("grid");
    expect(container.querySelectorAll(".panel-slot:not([hidden])")).toHaveLength(5);
  });

  it("double-clicking a header maximizes", async () => {
    const user = userEvent.setup();
    setup();
    await user.dblClick(screen.getByText("M5"));
    expect(usePanelStore.getState()).toMatchObject({ layout: "maximized", focused: "M5" });
  });

  it("keys 1-5 focus a chart and M toggles maximize", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("1");
    expect(usePanelStore.getState().focused).toBe("H4");
    await user.keyboard("5");
    expect(usePanelStore.getState().focused).toBe("M1");
    await user.keyboard("m");
    expect(usePanelStore.getState().layout).toBe("maximized");
    await user.keyboard("m");
    expect(usePanelStore.getState().layout).toBe("grid");
  });

  it("restores to the layout it was maximized from", () => {
    act(() => usePanelStore.getState().setLayout("focus"));
    act(() => usePanelStore.getState().toggleMaximize("H4"));
    act(() => usePanelStore.getState().restore());
    expect(usePanelStore.getState().layout).toBe("focus");
  });
});