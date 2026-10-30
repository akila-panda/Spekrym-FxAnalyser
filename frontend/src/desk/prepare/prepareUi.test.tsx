import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDecisionStore } from "@/desk/decisions/decisionStore";
import { DeskRoot } from "@/desk/workspace/DeskRoot";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { usePrepareStore } from "./prepareStore";
import { useSnapshotStore } from "./snapshotStore";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  useDecisionStore.setState({ decisions: [] });
  useSnapshotStore.setState({ snapshots: [] });
  usePrepareStore.setState({ drafts: {}, step: "W", cursor: 0, undo: [], view: null });
  useDeskStore.setState({ app: "desk", area: "my", workflow: "prepare", complexity: "standard", layoutByWorkflow: {}, focusSets: {} });
  useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, asOf: "latest", evidenceOpen: false });
});

describe("Prepare workflow UI", () => {
  it("shows the step rail, checklist and inbox; [ ] move steps; keys triage; Save snapshot works", async () => {
    const user = userEvent.setup();
    render(<DeskRoot />);
    await waitFor(() => expect(screen.getByRole("group", { name: "Top-down step" })).toBeInTheDocument(), { timeout: 20000 });
    expect(screen.getAllByRole("button", { name: /step,/ })).toHaveLength(7);
    expect(screen.getByRole("list", { name: "Top-down checklist" })).toBeInTheDocument();

    await user.keyboard("]");
    expect(screen.getByRole("button", { name: /^D step/ })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("[[");
    expect(screen.getByRole("button", { name: /^W step/ })).toHaveAttribute("aria-pressed", "true");

    // Find a step with candidates and triage one with Y, then undo with U.
    const view = usePrepareStore.getState().view!;
    const step = (["W", "D", "H4", "H1", "M15", "M5", "M1"] as const).find((s) => view.inbox[s].length > 0);
    if (step) {
      usePrepareStore.getState().setStep(step);
      await user.keyboard("y");
      expect(useDecisionStore.getState().decisions).toHaveLength(1);
      await user.keyboard("u");
      expect(useDecisionStore.getState().decisions).toHaveLength(0);
    }

    await user.click(screen.getByRole("button", { name: "Save snapshot" }));
    expect(useSnapshotStore.getState().snapshots).toHaveLength(1);
    expect(useSnapshotStore.getState().snapshots[0]!.dataKind).toBe("sample");
    expect(screen.getByRole("list", { name: "Saved snapshots" })).toBeInTheDocument();
  }, 40000);

  it("keys do not fire while typing in the notes field", async () => {
    const user = userEvent.setup();
    render(<DeskRoot />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Worksheet notes/ })).toBeInTheDocument(), { timeout: 20000 });
    await user.click(screen.getByRole("textbox", { name: /Worksheet notes/ }));
    await user.keyboard("]yn");
    expect(usePrepareStore.getState().step).toBe("W");
    expect(useDecisionStore.getState().decisions).toHaveLength(0);
  }, 40000);
});