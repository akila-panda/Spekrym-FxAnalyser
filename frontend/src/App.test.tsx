import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";

// jsdom has no canvas, so the real chart cannot run here. Chart logic is covered by unit tests.
vi.mock("@/chart/ChartCanvas", () => ({ ChartCanvas: () => <div data-testid="chart-canvas" /> }));

describe("workbench shell", () => {
  it("renders all five regions", () => {
    render(<App />);
    expect(screen.getByRole("banner", { name: "Controls" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Strategy and layers" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Charts" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Setups and detail" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "Scan summary" })).toBeInTheDocument();
    expect(screen.getByText(/not validated/i)).toBeInTheDocument();
  });

  it("collapses and expands the left rail", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("Parameters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse left rail" }));
    expect(screen.queryByText("Parameters")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand left rail" }));
    expect(screen.getByText("Parameters")).toBeInTheDocument();
  });

  it("collapses and expands the right rail", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("No scan yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse right rail" }));
    expect(screen.queryByText("No scan yet.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand right rail" }));
    expect(screen.getByText("No scan yet.")).toBeInTheDocument();
  });
});