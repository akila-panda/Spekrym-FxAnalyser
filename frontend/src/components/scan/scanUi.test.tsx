import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DataSource } from "@/api/dataSource";
import { useScanStore } from "@/scan/scanStore";
import strategiesFixture from "@/test/fixtures/strategies.json";
import { parseStrategies } from "@/types";
import { PanelHeader } from "@/components/panel/PanelHeader";
import { ParamForm } from "./ParamForm";
import { ScanAllButton } from "./ScanAllButton";
import { StrategyPicker } from "./StrategyPicker";

const orb = parseStrategies(strategiesFixture)[0]!;
const other = {
  ...orb, id: "sb", name: "Silver Bullet", supported_timeframes: ["M1" as const],
  params: [{ key: "window", label: "Window", type: "select" as const, default: "ny_am", options: ["london", "ny_am"] }],
};
const source = { getStrategies: async () => [orb, other] } as unknown as DataSource;

beforeEach(() => act(() => useScanStore.getState().reset()));

describe("scan controls", () => {
  it("generates the parameter form from definitions and regenerates on strategy change", async () => {
    const user = userEvent.setup();
    render(<><StrategyPicker source={source} /><ParamForm /><ScanAllButton /></>);
    expect(await screen.findByLabelText("Strategy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Scan all (${orb.supported_timeframes.length})` })).toBeEnabled();
    for (const p of orb.params) expect(screen.getByLabelText(new RegExp(p.label.replace(/[()]/g, "\\$&")))).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Strategy"), "sb");
    expect(screen.getByLabelText("Window")).toBeInTheDocument();
    expect(screen.queryByLabelText(new RegExp(orb.params[0]!.label.replace(/[()]/g, "\\$&")))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan all (1)" })).toBeInTheDocument();
  });

  it("shows a validation message, a changed marker and a reset for an edited field", async () => {
    const user = userEvent.setup();
    render(<><StrategyPicker source={source} /><ParamForm /></>);
    await screen.findByLabelText("Strategy");
    const found = orb.params.find((p) => p.type === "integer" && p.max !== undefined)!;
    if (found.type !== "integer") throw new Error("fixture needs an integer param");
    const def = found;
    const input = screen.getByLabelText(new RegExp(def.label.replace(/[()]/g, "\\$&")));
    await user.clear(input);
    await user.type(input, String((def.max ?? 0) + 1));
    expect(screen.getByRole("alert")).toHaveTextContent(/must be between/);
    await user.click(screen.getByRole("button", { name: `Reset ${def.label}` }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("panel header Scan is disabled with a reason and calls onScan when enabled", async () => {
    const user = userEvent.setup();
    const onScan = vi.fn();
    const { rerender } = render(<PanelHeader tf="H1" onScan={onScan} scanDisabledReason="Not supported by ORB." />);
    expect(screen.getByRole("button", { name: "Scan H1" })).toBeDisabled();
    rerender(<PanelHeader tf="H1" onScan={onScan} state="scanning" chipText="scanning" />);
    await user.click(screen.getByRole("button", { name: "Scan H1" }));
    expect(onScan).toHaveBeenCalledOnce();
    expect(screen.getByRole("progressbar", { name: "Scanning H1" })).toBeInTheDocument();
  });
});