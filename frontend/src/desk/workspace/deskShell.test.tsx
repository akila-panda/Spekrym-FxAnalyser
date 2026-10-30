import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DeskRoot } from "./DeskRoot";
import { useDeskStore } from "./deskStore";
import { useDeskUiStore } from "./deskUiStore";

beforeEach(() => {
  // DeskRoot mounts useUrlState, which restores from the URL on mount; clear it so a prior test's
  // query does not override setState below.
  window.history.replaceState(null, "", "/");
  useDeskStore.setState({ app: "desk", area: "my", workflow: "prepare", complexity: "standard", layoutByWorkflow: {}, focusSets: {} });
  useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, asOf: "latest" });
});

describe("DeskRoot shell", () => {
  it("renders the header, pinned sample warning and MY DESK widgets", () => {
    render(<DeskRoot />);
    expect(screen.getByRole("group", { name: "App" })).toBeInTheDocument();
    expect(screen.getByText(/Sample data/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Workflow" })).toBeInTheDocument();
    // Prepare defaults include the Levels inbox
    expect(screen.getByRole("region", { name: "Levels inbox" })).toBeInTheDocument();
  });

  it("hides the workflow control in the Analysis area", async () => {
    const user = userEvent.setup();
    render(<DeskRoot />);
    await user.click(screen.getByRole("button", { name: "Analysis" }));
    expect(screen.queryByRole("group", { name: "Workflow" })).toBeNull();
  });

  it("Focus hides docks but keeps the pinned warning and shows Restore", async () => {
    const user = userEvent.setup();
    const { container } = render(<DeskRoot />);
    expect(container.querySelector(".dk-dock-right")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Focus" }));
    expect(container.querySelector(".dk-dock-right")).toBeNull();
    expect(screen.getByText(/Sample data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restore/ })).toBeInTheDocument();
  });

  it("complexity Minimal drops standard-level widgets (cap by minLevel)", async () => {
    const user = userEvent.setup();
    useDeskStore.setState({ area: "my", workflow: "review" });
    const { rerender } = render(<DeskRoot />);
    expect(screen.getByRole("region", { name: "Level scorecard" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Minimal" }));
    rerender(<DeskRoot />);
    expect(screen.queryByRole("region", { name: "Level scorecard" })).toBeNull();
  });
});
