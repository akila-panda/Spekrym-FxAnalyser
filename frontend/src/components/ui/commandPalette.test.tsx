import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useViewStore } from "@/store/viewStore";
import { CommandPalette, PaletteButton, usePaletteStore } from "./CommandPalette";

describe("DX11 command palette", () => {
  beforeEach(() => {
    usePaletteStore.setState({ open: false });
    useViewStore.getState().setLinked(true);
  });

  it("opens from the visible button and from Ctrl+K, with dialog and combobox roles", async () => {
    const user = userEvent.setup();
    render(<><PaletteButton /><CommandPalette /></>);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open command palette" }));
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search commands" })).toHaveFocus();
    expect(screen.getByRole("listbox", { name: "Commands" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("arrow keys move aria-activedescendant; Enter runs the command and closes", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    usePaletteStore.getState().setOpen(true);
    const box = await screen.findByRole("combobox");
    await user.type(box, "linked");
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{Enter}");
    expect(useViewStore.getState().linked).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab keeps focus in the input (trap) and a no-match query says so", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    usePaletteStore.getState().setOpen(true);
    const box = await screen.findByRole("combobox");
    await user.tab();
    expect(box).toHaveFocus();
    await user.type(box, "qqqqqq");
    expect(screen.getByText("No matching command.")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});