import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rowsFor } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";
import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";
import type { Setup } from "@/types";
import { RejectionBreakdown } from "./RejectionBreakdown";

const rej = (id: string, days: number, key: string, label: string): Setup => ({
  ...rejectedSetup(id, days),
  conditions: [{ key, label, passed: false, detail: "" }],
});

beforeEach(() => act(() => useScanStore.getState().reset()));

describe("DX8 RejectionBreakdown", () => {
  it("renders nothing when there are no rejected candidates", () => {
    act(() => useScanStore.getState().finish("M5", scanOf("M5", [validSetup("v1", 0, 1)])));
    const { container } = render(<RejectionBreakdown />);
    expect(container).toBeEmptyDOMElement();
  });

  it("filters the list to one failure on click and clears on the second click", async () => {
    const user = userEvent.setup();
    act(() =>
      useScanStore.getState().finish(
        "M5",
        scanOf("M5", [validSetup("v1", 0, 1), rej("r1", 1, "x", "Alpha"), rej("r2", 2, "x", "Alpha"), rej("r3", 3, "y", "Beta")]),
      ),
    );
    render(<RejectionBreakdown />);
    const alpha = screen.getByRole("button", { name: /alpha/i });
    expect(alpha).toHaveTextContent("2");
    await user.click(alpha);

    const s = useScanStore.getState();
    expect(s.filters.failedCondition).toBe("x");
    expect(s.filters.showRejected).toBe(true);
    expect(rowsFor(s.panels, "M5", s.filters).map((r) => r.setup.id)).toEqual(["r1", "r2"]);
    expect(screen.getByRole("button", { name: /alpha/i })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    expect(useScanStore.getState().filters.failedCondition).toBe("");
  });
});