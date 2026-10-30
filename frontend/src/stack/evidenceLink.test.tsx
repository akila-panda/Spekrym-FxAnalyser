import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainSetup } from "@/components/setups/ExplainSetup";
import { validSetup } from "@/test/scanFixtures";
import { useEvidenceStore } from "./evidenceStore";

describe("DX4 evidence hover link", () => {
  beforeEach(() => act(() => useEvidenceStore.getState().setHover(null)));

  it("hovering a step row sets the linked step; leaving clears it", async () => {
    const user = userEvent.setup();
    const setup = validSetup("a", 0, 1);
    render(<ExplainSetup setup={setup} />);
    const first = screen.getAllByRole("button", { name: /^Step \d+:/ })[0]!;
    await user.hover(first);
    const n = useEvidenceStore.getState().hoverStep;
    expect(n).not.toBeNull();
    expect(first.closest("li")).toHaveAttribute("data-linked", "true");
    await user.unhover(first);
    expect(useEvidenceStore.getState().hoverStep).toBeNull();
    expect(first.closest("li")).toHaveAttribute("data-linked", "false");
  });

  it("a chart-side hover highlights the matching row", () => {
    const setup = validSetup("a", 0, 1);
    render(<ExplainSetup setup={setup} />);
    const n = setup.steps[0]!.n;
    act(() => useEvidenceStore.getState().setHover(n));
    const row = screen.getAllByRole("button", { name: /^Step \d+:/ }).find((b) => b.getAttribute("aria-label")?.startsWith(`Step ${n}:`))!;
    expect(row.closest("li")).toHaveAttribute("data-linked", "true");
  });

  it("keyboard focus links too", async () => {
    const user = userEvent.setup();
    render(<ExplainSetup setup={validSetup("a", 0, 1)} />);
    await user.tab();
    expect(useEvidenceStore.getState().hoverStep).not.toBeNull();
  });
});