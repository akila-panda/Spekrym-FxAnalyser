import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { useScanStore } from "@/scan/scanStore";
import { RightRail } from "@/components/layout/RightRail";
import { useRailStore } from "@/components/layout/railStore";
import { useSetupNavigation } from "@/hooks/useSetupNavigation";
import { reviewKey, useReviewStore } from "@/review/reviewStore";
import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";

function Harness() {
  useSetupNavigation();
  return <RightRail collapsed={false} onToggle={() => undefined} />;
}

const scan = scanOf("M5", [validSetup("a", 0, 2.1), validSetup("b", 1, -1, "short"), rejectedSetup("r", 2)], 0.55);
const k = (id: string) => reviewKey(useViewStore.getState().pair, scan, id);
const list = () => within(screen.getByRole("list", { name: "Setups" }));

beforeEach(() => {
  localStorage.clear();
  act(() => {
    useReviewStore.setState({ entries: {} });
    useRailStore.getState().reset();
    useScanStore.getState().reset();
    useAnnotationStore.getState().setSetup(null);
    useViewStore.setState({ asOf: null });
    useScanStore.setState((s) => ({ panels: { ...s.panels, M5: { status: "done", stale: false, result: scan } } }));
  });
});

describe("DX12 review marks", () => {
  it("Y, N and R mark the active setup; the same key clears it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("y");
    expect(useReviewStore.getState().entries[k("a")]).toBeUndefined();
    await user.click(list().getAllByRole("button")[0]!);
    await user.keyboard("y");
    expect(useReviewStore.getState().entries[k("a")]?.mark).toBe("right");
    await user.keyboard("n");
    expect(useReviewStore.getState().entries[k("a")]?.mark).toBe("wrong");
    await user.keyboard("r");
    expect(useReviewStore.getState().entries[k("a")]?.mark).toBe("revisit");
    await user.keyboard("r");
    expect(useReviewStore.getState().entries[k("a")]).toBeUndefined();
  });

  it("is ignored while typing in the note field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(list().getAllByRole("button")[0]!);
    await user.click(screen.getByRole("textbox", { name: "Review note" }));
    await user.keyboard("ynr");
    expect(screen.getByRole("textbox", { name: "Review note" })).toHaveValue("ynr");
    expect(useReviewStore.getState().entries[k("a")]).toBeUndefined();
  });

  it("saves the note on Enter and labels the section as human review", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(list().getAllByRole("button")[0]!);
    await user.type(screen.getByRole("textbox", { name: "Review note" }), "late entry{Enter}");
    expect(useReviewStore.getState().entries[k("a")]?.note).toBe("late entry");
    expect(screen.getByText("Human review, not strategy result")).toBeInTheDocument();
  });

  it("shows a glyph in the list and filters by mark", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("group", { name: "Review filter" })).not.toBeInTheDocument();
    await user.click(list().getAllByRole("button")[0]!);
    await user.click(screen.getByRole("button", { name: /Looks right/ }));
    expect(list().getByRole("img", { name: "Review: Looks right" })).toHaveTextContent("✓");
    const chips = within(screen.getByRole("group", { name: "Review filter" }));
    await user.click(chips.getByRole("button", { name: /Right/ }));
    expect(list().getAllByRole("button")).toHaveLength(1);
    await user.click(chips.getByRole("button", { name: /Unmarked/ }));
    expect(list().getAllByRole("button")).toHaveLength(1);
    await user.click(chips.getByRole("button", { name: "All" }));
    expect(list().getAllByRole("button")).toHaveLength(2);
  });

  it("does not touch replicated or scan state", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(list().getAllByRole("button")[0]!);
    const before = useScanStore.getState().panels.M5.result;
    await user.keyboard("y");
    expect(useScanStore.getState().panels.M5.result).toBe(before);
  });
});