import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseRole, roleParam } from "@/window/role";
import { CanvasRoot } from "./CanvasRoot";
import { useCanvasStore } from "./canvasStore";
import { usePrepareStore } from "./prepare/prepareStore";
import { useExploreStore } from "./explore/exploreStore";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
  useExploreStore.setState({ hiddenEngines: [] });
});

describe("F1 canvas role", () => {
  it("?window=canvas parses to the canvas role and round-trips", () => {
    expect(parseRole("?window=canvas")).toEqual({ kind: "canvas" });
    expect(roleParam({ kind: "canvas" })).toBe("canvas");
  });
});

describe("F1 Intelligence Canvas shell", () => {
  it("renders the title, four modes, sources, and timeline", () => {
    render(<CanvasRoot />);
    expect(screen.getByText("Intelligence Canvas")).toBeTruthy();
    for (const m of ["Prepare", "Explore", "Monitor", "Review"]) expect(screen.getByRole("button", { name: m })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Regime/ })).toBeTruthy();
    expect(screen.getByLabelText("Intelligence timeline")).toBeTruthy();
  });

  it("switching mode sets aria-pressed and the URL", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByRole("button", { name: "Monitor" }));
    expect(screen.getByRole("button", { name: "Monitor" }).getAttribute("aria-pressed")).toBe("true");
    expect(new URLSearchParams(window.location.search).get("canvasMode")).toBe("monitor");
  });

  it("selecting a source syncs the chart region and the selected-insight panel", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    // before selection: prompt to select
    expect(screen.getByLabelText("Chart").textContent).toMatch(/select a source/i);
    await user.click(screen.getByRole("button", { name: /Session liquidity/ }));
    expect(useCanvasStore.getState().selectedSourceId).toBe("session");
    expect(screen.getByLabelText("Chart").textContent).toMatch(/Focused: Session liquidity/);
    expect(screen.getByLabelText("Selected insight").textContent).toMatch(/Session liquidity/);
  });

  it("renders the composed overlay set from mock data (GF1 pipeline wired)", () => {
    render(<CanvasRoot />);
    const panel = screen.getByLabelText("Overlays");
    expect(panel.querySelector("h4")?.textContent).toMatch(/Overlays \(\d/);
    expect(panel.querySelectorAll(".vc-overlay").length).toBeGreaterThan(0);
  });

  it("Prepare mode shows the six-step rail and freezes an immutable plan", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />); // default mode is prepare
    expect(screen.getByLabelText("Step").querySelectorAll("button")).toHaveLength(6);
    const overlay = screen.getByLabelText("Overlays").querySelector(".vc-overlay") as HTMLElement;
    await user.click(overlay);
    await user.click(screen.getByRole("button", { name: "Freeze plan" }));
    expect(screen.getByText(/Plan frozen/)).toBeTruthy();
    expect(usePrepareStore.getState().plan).not.toBeNull();
  });

  it("the active step's preset filters the overlays shown (step 5 = scenarios hides the level)", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    expect(screen.getByLabelText("Overlays").querySelectorAll(".vc-overlay").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /5\. Scenarios/ }));
    expect(screen.getByLabelText("Overlays").querySelectorAll(".vc-overlay").length).toBe(0);
  });

  it("Monitor mode without a frozen plan prompts to prepare one", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByRole("button", { name: "Monitor" }));
    expect(screen.getByLabelText("Chart").textContent).toMatch(/Freeze a plan in Prepare first/);
  });

  it("Monitor mode diffs live facts against the frozen plan without rewriting it", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    // freeze a plan in Prepare, then switch to Monitor
    await user.click(screen.getByLabelText("Overlays").querySelector(".vc-overlay") as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Freeze plan" }));
    const frozen = usePrepareStore.getState().plan!;
    await user.click(screen.getByRole("button", { name: "Monitor" }));
    expect(screen.getByLabelText("Market change feed").querySelectorAll(".vc-feed-row").length).toBeGreaterThan(0);
    expect(screen.getByText(/Before:/)).toBeTruthy();
    // plan object is unchanged and still frozen
    expect(usePrepareStore.getState().plan).toBe(frozen);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("Review mode shows the four independent axes for a completed session", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByLabelText("Overlays").querySelector(".vc-overlay") as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Freeze plan" }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    for (const ax of ["Analysis quality", "Decision quality", "Process adherence", "Trade outcome"]) {
      expect(screen.getByLabelText(ax)).toBeTruthy();
    }
  });

  it("Explore mode: engine toggles change display only and keep the frozen plan + Analysis hand-off", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByLabelText("Overlays").querySelector(".vc-overlay") as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Freeze plan" }));
    const frozen = usePrepareStore.getState().plan!;
    await user.click(screen.getByRole("button", { name: "Explore" }));
    const shown = () => screen.getByLabelText("Overlays").querySelectorAll(".vc-overlay").length;
    expect(shown()).toBeGreaterThan(0);
    const engineBtns = screen.getByLabelText("Explore engines").querySelectorAll(".vc-engine");
    expect(engineBtns.length).toBeGreaterThan(0);
    for (const b of Array.from(engineBtns)) await user.click(b as HTMLElement);
    expect(shown()).toBe(0);
    expect(screen.getByLabelText("Overlays").querySelector("h4")?.textContent).toMatch(/of \d/);
    await user.click(screen.getByRole("button", { name: "Show all engines" }));
    expect(shown()).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: "Open in Analysis" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/app=desk&desk=analysis/);
    expect(usePrepareStore.getState().plan).toBe(frozen);
  });

  it("F9: regime strip + context panels are present in every mode (qualitative, sample)", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    for (const m of ["Prepare", "Explore", "Monitor", "Review"]) {
      await user.click(screen.getByRole("button", { name: m }));
      expect(screen.getByLabelText("Regime strip")).toBeTruthy();
      expect(screen.getByLabelText("Context panels")).toBeTruthy();
    }
    expect(screen.getByLabelText("Regime strip").textContent).not.toMatch(/%/);
  });

  it("restores mode from ?canvasMode on mount", () => {
    window.history.replaceState(null, "", "/?window=canvas&canvasMode=review");
    render(<CanvasRoot />);
    expect(screen.getByRole("button", { name: "Review" }).getAttribute("aria-pressed")).toBe("true");
  });
});