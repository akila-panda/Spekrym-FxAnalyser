import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { useAnalysisStore } from "@/desk/detect/analysisStore";
import { LayersPanel } from "@/desk/layers/LayersPanel";
import { useLayerStore } from "@/desk/layers/layerStore";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { useDeskKeys } from "@/desk/workspace/useDeskKeys";
import { DEPTH_FOR, describeObject } from "./describe";
import { EvidenceDrawer } from "./EvidenceDrawer";

const obj = mkObj({
  lo: 1.1, hi: 1.101, direction: "bull",
  grade: { significance: null, relevance: null, quality: null, freshness: null, factors: [
    { id: "a", label: "Displacement 2.1 ATR", status: "supports" },
    { id: "b", label: "Against HTF bias", status: "opposes" },
    { id: "c", label: "No calendar", status: "unavailable" },
  ] },
  lifecycle: [{ kind: "tested", t: 5_000, known_at: 5_000 }],
  evidence: [{ note: "Base then departure." }],
});

beforeEach(() => {
  useLayerStore.getState().reset();
  useDeskStore.setState({ complexity: "advanced" });
  useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, evidenceOpen: false, asOf: "latest" });
  useAnalysisStore.getState().setAnalysis({ objects: [obj], relations: [], projected: new Set(), dataKind: "sample", viewTf: "H1" });
});

describe("describeObject", () => {
  it("shows pips with ATR secondary in the headline", () => {
    const d = describeObject(obj, "headline", { atr: 0.0005 });
    expect(d.headline).toMatch(/10\.0 pips · 2\.0 ATR/);
    expect(d.explanation).toEqual([]);
  });
  it("three depths from one object", () => {
    expect(DEPTH_FOR).toEqual({ minimal: "headline", standard: "explanation", advanced: "evidence" });
    const e = describeObject(obj, "explanation");
    expect(e.supports).toEqual(["Displacement 2.1 ATR"]);
    expect(e.conflicts).toEqual(["Against HTF bias"]);
    expect(e.timing).toEqual([]);
    const f = describeObject(obj, "evidence", { viewTf: "M5" });
    expect(f.timing.length).toBeGreaterThan(3);
    expect(f.quality.join(" ")).toMatch(/sample data/);
    expect(f.quality.join(" ")).toMatch(/Unavailable input: No calendar/);
    expect(f.explanation[0]).toMatch(/Projected from H1 onto M5/);
  });
});

describe("EvidenceDrawer + keys", () => {
  it("E opens for the selected object, Esc closes it before Focus", async () => {
    const user = userEvent.setup();
    renderHook(() => useDeskKeys());
    render(<EvidenceDrawer />);
    await user.keyboard("e");
    expect(useDeskUiStore.getState().evidenceOpen).toBe(false);
    useDeskUiStore.getState().select(obj.id);
    useDeskUiStore.getState().setFocus(true);
    await user.keyboard("e");
    expect(await screen.findByRole("complementary", { name: "Evidence" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(useDeskUiStore.getState().evidenceOpen).toBe(false);
    expect(useDeskUiStore.getState().focusOn).toBe(true);
  });
  it("sections follow complexity; Minimal shows headline only", () => {
    useDeskUiStore.setState({ selectedObjectId: obj.id, evidenceOpen: true });
    const { rerender } = render(<EvidenceDrawer />);
    expect(screen.getByText("Timing & lifecycle")).toBeInTheDocument();
    expect(screen.getByText("Relations")).toBeInTheDocument();
    useDeskStore.setState({ complexity: "minimal" });
    rerender(<EvidenceDrawer />);
    expect(screen.queryByText("Supports")).toBeNull();
    expect(screen.getByText("sample")).toBeInTheDocument();
  });
  it("deselecting closes the drawer", () => {
    useDeskUiStore.setState({ selectedObjectId: obj.id, evidenceOpen: true });
    useDeskUiStore.getState().select(null);
    expect(useDeskUiStore.getState().evidenceOpen).toBe(false);
  });
});

describe("LayersPanel", () => {
  it("shows n of 6 and toggles layers by label", async () => {
    const user = userEvent.setup();
    render(<LayersPanel />);
    expect(screen.getByText("3 of 6 visible")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Liquidity" }));
    expect(screen.getByText("4 of 6 visible")).toBeInTheDocument();
  });
  it("preset applies visibility; settings popover opens from the row", async () => {
    const user = userEvent.setup();
    render(<LayersPanel />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Layer preset" }), "all");
    expect(screen.getByText("6 of 6 visible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Key levels settings" }));
    expect(screen.getByRole("group", { name: "Key levels settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Show mitigated/ }));
    expect(useLayerStore.getState().settings.levels.showInvalid).toBe(true);
  });
});