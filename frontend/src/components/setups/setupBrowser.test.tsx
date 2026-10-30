import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { useScanStore } from "@/scan/scanStore";
import { SummaryStrip } from "@/components/layout/SummaryStrip";
import { RightRail } from "@/components/layout/RightRail";
import { useRailStore } from "@/components/layout/railStore";
import { useSetupNavigation } from "@/hooks/useSetupNavigation";
import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";

function Harness() {
  useSetupNavigation();
  return (
    <>
      <RightRail collapsed={false} onToggle={() => undefined} />
      <SummaryStrip />
    </>
  );
}

const st = () => useScanStore.getState();
const openFilters = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /^Filters/ }));
const seed = () =>
  act(() => {
    useRailStore.getState().reset();
    st().reset();
    useAnnotationStore.getState().setSetup(null);
    useViewStore.setState({ asOf: null });
    useScanStore.setState((s) => ({
      panels: {
        ...s.panels,
        M5: { status: "done", stale: false, result: scanOf("M5", [validSetup("a", 0, 2.1), validSetup("b", 1, -1, "short"), rejectedSetup("r", 2)], 0.55) },
        M1: { status: "done", stale: false, result: scanOf("M1", [validSetup("a", 3, 0.5)], 0.5) },
      },
    }));
  });

beforeEach(seed);

describe("setup browser", () => {
  it("shows tabs with counts and the merged list with timeframe chips", () => {
    render(<Harness />);
    const tabs = within(screen.getByRole("tablist", { name: "Setups by timeframe" }));
    expect(tabs.getByRole("tab", { name: /^M5 2$/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /^All 3$/ })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Setups" })).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/▲ long/);
    expect(rows[0]).toHaveTextContent(/\+2\.10R/);
    expect(rows[1]).toHaveTextContent(/−1\.00R/);
  });

  it("clicking a row makes the setup active and fills the annotation store; detail shows conditions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(screen.getByRole("list", { name: "Setups" })).getAllByRole("button")[0]!);
    expect(st().active).toEqual({ tf: "M5", id: "a" });
    expect(useAnnotationStore.getState().annotations.length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Setup detail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Why it qualified" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Conditions" }));
    expect(screen.getByRole("list", { name: "Conditions" })).toBeInTheDocument();
  });

  it("J and K walk the list; clamped at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("j");
    expect(st().active).toEqual({ tf: "M5", id: "a" });
    await user.keyboard("j");
    expect(st().active).toEqual({ tf: "M5", id: "b" });
    await user.keyboard("j");
    expect(st().active).toEqual({ tf: "M1", id: "a" });
    await user.keyboard("j");
    expect(st().active).toEqual({ tf: "M1", id: "a" });
    await user.keyboard("k");
    expect(st().active).toEqual({ tf: "M5", id: "b" });
  });

  it("[ and ] replay steps in order and cycle through all steps", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("j");
    const n = useAnnotationStore.getState().steps.length;
    expect(n).toBeGreaterThan(0);
    expect(useAnnotationStore.getState().step).toBeNull(); // default: all steps
    await user.keyboard("]");
    expect(useAnnotationStore.getState().step).toBe(useAnnotationStore.getState().steps[0]!.n);
    for (let i = 1; i < n; i++) await user.keyboard("]");
    expect(useAnnotationStore.getState().step).toBe(useAnnotationStore.getState().steps[n - 1]!.n);
    await user.keyboard("]");
    expect(useAnnotationStore.getState().step).toBeNull();
    await user.keyboard("[[");
    expect(useAnnotationStore.getState().step).toBe(useAnnotationStore.getState().steps[n - 1]!.n);
  });

  it("does not steal keys while typing in a field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openFilters(user);
    const from = screen.getByLabelText("From");
    await user.click(from);
    await user.keyboard("j");
    expect(st().active).toBeNull();
  });

  it("toggling rejected candidates adds them, and a failed condition is readable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openFilters(user);
    await user.click(screen.getByRole("checkbox", { name: /Show rejected candidates/ }));
    const rows = within(screen.getByRole("list", { name: "Setups" })).getAllByRole("button");
    expect(rows).toHaveLength(4);
    const rejected = rows.find((r) => /rejected/.test(r.textContent ?? ""))!;
    await user.click(rejected);
    expect(screen.getByRole("button", { name: "Why it was rejected" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Conditions" }));
    const list = within(screen.getByRole("list", { name: "Conditions" }));
    expect(list.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "Conditions" }).textContent).toMatch(/failed|passed|not applicable/);
  });

  it("an empty filter result says what to change", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Outcome"), "flat");
    expect(screen.getByText(/No setups match these filters/)).toBeInTheDocument();
  });

  it("switching to a tab with no scan explains where to scan", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /^H4/ }));
    expect(screen.getByText(/No H4 scan yet/)).toBeInTheDocument();
  });
});

describe("summary strip", () => {
  it("shows the active timeframe's expectancy, the badge and the too-few note, with no combined total", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Show M5 setups" }));
    expect(screen.getByLabelText("Expectancy in R, net of cost")).toHaveTextContent("+0.55R");
    expect(screen.getByText(/n=2/)).toBeInTheDocument();
    expect(screen.getByText(/Exploratory scan, not validated/)).toBeInTheDocument();
    expect(screen.getByText(/too few setups to read anything into/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show M1 setups" }));
    expect(screen.getByLabelText("Expectancy in R, net of cost")).toHaveTextContent("+0.50R");
    expect(screen.queryByText(/n=3/)).not.toBeInTheDocument(); // 2 + 1 would be a combined total
  });

  it("per-timeframe chips switch the tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Show M1 setups" });
    await user.click(chip);
    expect(st().tab).toBe("M1");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a dash before any scan", () => {
    act(() => st().reset());
    render(<Harness />);
    expect(screen.getByLabelText("Expectancy in R, net of cost")).toHaveTextContent("—");
    expect(screen.getByText("No scan yet.")).toBeInTheDocument();
  });
});

describe("active setup lifecycle", () => {
  it("clears the active setup when a rescan no longer contains it", () => {
    act(() => st().activate("M5", "a"));
    expect(st().active).toEqual({ tf: "M5", id: "a" });
    act(() => st().finish("M5", scanOf("M5", [validSetup("z", 0, 1)])));
    expect(st().active).toBeNull();
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);
  });

  it("keeps it (and refreshes annotations) when a rescan still contains it", () => {
    act(() => st().activate("M5", "a"));
    act(() => useAnnotationStore.getState().setStep(1));
    act(() => st().finish("M5", scanOf("M5", [validSetup("a", 0, 3)])));
    expect(st().active).toEqual({ tf: "M5", id: "a" });
  });

  it("activate moves the charts to the setup's time", () => {
    act(() => st().activate("M5", "b"));
    const setup = st().panels.M5.result!.setups.find((x) => x.id === "b")!;
    expect(useViewStore.getState().asOf).toBe(setup.focus.to + 3600);
  });
});