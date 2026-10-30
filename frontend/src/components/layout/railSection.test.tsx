import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SetupDetail } from "@/components/setups/SetupDetail";
import { activeFilterCount, filterSummary } from "@/components/setups/SetupFilters";
import { useScanStore } from "@/scan/scanStore";
import { DEFAULT_FILTERS } from "@/scan/selectors";
import { scanOf, validSetup } from "@/test/scanFixtures";
import { RailAccordion } from "./RailSection";
import { useRailStore } from "./railStore";

const SECTIONS = [
  { id: "a", title: "Alpha", content: <p>alpha body</p> },
  { id: "b", title: "Beta", content: <p>beta body</p> },
  { id: "c", title: "Gamma", content: <p>gamma body</p> },
];

function Harness({ initial = "a" }: { initial?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  return <RailAccordion label="Test sections" sections={SECTIONS} open={open} onOpenChange={setOpen} />;
}

describe("DX3 RailAccordion", () => {
  it("opens one section at a time and exposes aria-expanded", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("alpha body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("alpha body")).not.toBeInTheDocument();
    expect(screen.getByText("beta body")).toBeInTheDocument();
  });

  it("clicking the open header closes it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.queryByText("alpha body")).not.toBeInTheDocument();
  });

  it("Up/Down/Home/End move between headers; Enter toggles", async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("gamma body")).toBeInTheDocument();
  });

  it("an unknown open id leaves everything closed", () => {
    render(<Harness initial="zzz" />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("DX3 SetupDetail sections", () => {
  beforeEach(() =>
    act(() => {
      useRailStore.getState().reset();
      useScanStore.getState().reset();
      useScanStore.setState((s) => ({
        panels: { ...s.panels, M5: { status: "done", stale: false, result: scanOf("M5", [validSetup("a", 0, 1.34)], 0.55) } },
      }));
    }),
  );

  it("shows the hint and a closed analytics section with no selection", () => {
    render(<SetupDetail />);
    expect(screen.getByText(/Select a setup/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan analytics" })).toHaveAttribute("aria-expanded", "false");
  });

  it("selected setup: header, Why open by default, five sections", async () => {
    const user = userEvent.setup();
    act(() => useScanStore.getState().activate("M5", "a"));
    render(<SetupDetail />);
    expect(screen.getByRole("banner", { name: "Setup summary" })).toHaveTextContent(/\+1\.34R/);
    expect(screen.getByRole("banner", { name: "Setup summary" })).toHaveTextContent(/▲ LONG/);
    for (const n of ["Why it qualified", "Conditions", "What-if", "Timeline", "Scan analytics"]) {
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Why it qualified" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.getByRole("group", { name: "Steps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Why it qualified" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("DX3 filter summary", () => {
  it("counts and describes non-default filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(filterSummary(DEFAULT_FILTERS)).toBe("");
    const f = { ...DEFAULT_FILTERS, showRejected: true, direction: "long" as const, from: "2026-05-01" };
    expect(activeFilterCount(f)).toBe(3);
    expect(filterSummary(f)).toBe("rejected shown · long · from 2026-05-01");
  });
});