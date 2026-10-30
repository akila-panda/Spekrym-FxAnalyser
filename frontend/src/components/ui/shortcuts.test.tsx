import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutsSheet, SHORTCUTS, useShortcutsStore } from "./ShortcutsSheet";

beforeEach(() => act(() => useShortcutsStore.getState().setOpen(false)));

describe("DX7 ShortcutsSheet", () => {
  it("opens on ?, traps focus on close, closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ShortcutsSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close shortcuts" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close shortcuts" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the setup and step keys", () => {
    const text = SHORTCUTS.map((s) => s.keys.join("")).join(" ");
    expect(text).toContain("JK");
    expect(text).toContain("[]");
  });
});