import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverflowMenu } from "./OverflowMenu";

describe("DX6 OverflowMenu", () => {
  it("opens, exposes presets, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu />);
    const btn = screen.getByRole("button", { name: "More actions" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Preset name")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Preset name")).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
});