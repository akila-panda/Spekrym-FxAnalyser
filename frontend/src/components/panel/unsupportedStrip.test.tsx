import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UnsupportedStrip } from "./UnsupportedStrip";

const setup = () => render(<UnsupportedStrip tf="H4" label="not supported by ORB" reason="Not supported by ORB. Scan M5 instead." />);

describe("DX2 UnsupportedStrip", () => {
  it("is a labelled region with the TF and one line of text", () => {
    setup();
    expect(screen.getByRole("region", { name: "H4 chart" })).toBeInTheDocument();
    expect(screen.getByText(/not supported by ORB/)).toBeInTheDocument();
  });

  it("reveals the reason from the info button by keyboard and closes with Esc", async () => {
    const user = userEvent.setup();
    setup();
    const btn = screen.getByRole("button", { name: "Why H4 is collapsed" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("note", { hidden: true })).not.toBeVisible();
    btn.focus();
    await user.keyboard("{Enter}");
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("note")).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("Scan M5 instead");
    await user.keyboard("{Escape}");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on an outside press", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Why H4 is collapsed" }));
    await user.click(document.body);
    expect(screen.getByRole("button", { name: "Why H4 is collapsed" })).toHaveAttribute("aria-expanded", "false");
  });
});