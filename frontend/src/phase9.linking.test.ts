import { beforeEach, describe, expect, it } from "vitest";
import { visibleAnnotations } from "@/annotations/visibility";
import { usePanelStore } from "@/panels/panelStore";
import { useViewStore } from "@/store/viewStore";
import { AnnotationSchema, type Annotation } from "@/types/schemas";

const T = "2026-03-02T10:00:00Z";
const level = (source_tf: Annotation["source_tf"]): Annotation =>
  AnnotationSchema.parse({
    id: `lvl-${source_tf}`, kind: "level", role: "liquidity", tone: "neutral",
    source_tf, step: 0, known_at: T, t0: T, price: 1.1,
  });

describe("Phase 9 — chart linking (viewStore.linked)", () => {
  beforeEach(() => useViewStore.setState({ linked: true }));

  it("defaults to linked", () => {
    expect(useViewStore.getState().linked).toBe(true);
  });

  it("toggleLinked flips the flag", () => {
    useViewStore.getState().toggleLinked();
    expect(useViewStore.getState().linked).toBe(false);
    useViewStore.getState().toggleLinked();
    expect(useViewStore.getState().linked).toBe(true);
  });
});

describe("Phase 9 — per-chart projection (panelStore.localOnly)", () => {
  beforeEach(() => usePanelStore.setState({ localOnly: new Set() }));

  it("starts empty and toggles a timeframe on and off", () => {
    expect(usePanelStore.getState().localOnly.size).toBe(0);
    usePanelStore.getState().toggleLocalOnly("M5");
    expect(usePanelStore.getState().localOnly.has("M5")).toBe(true);
    usePanelStore.getState().toggleLocalOnly("M5");
    expect(usePanelStore.getState().localOnly.has("M5")).toBe(false);
  });

  it("toggling one timeframe leaves others untouched", () => {
    usePanelStore.getState().toggleLocalOnly("M5");
    usePanelStore.getState().toggleLocalOnly("M15");
    const s = usePanelStore.getState().localOnly;
    expect([...s].sort()).toEqual(["M15", "M5"]);
  });
});

describe("Phase 9 — localOnly override suppresses projected context", () => {
  const anns = [level("H1"), level("M5")];

  it("without override, an H1 level flows down onto an M5 chart", () => {
    const vis = visibleAnnotations({ annotations: anns, steps: [], panelTf: "M5", hiddenGroups: new Set(), step: null });
    expect(vis.map((a) => a.id).sort()).toEqual(["lvl-H1", "lvl-M5"]);
  });

  it("with the local-only override, the M5 chart shows only its own level", () => {
    const hide = new Set(anns.filter((a) => a.source_tf !== "M5").map((a) => a.id));
    const vis = visibleAnnotations({
      annotations: anns, steps: [], panelTf: "M5", hiddenGroups: new Set(), step: null, overrides: { hide },
    });
    expect(vis.map((a) => a.id)).toEqual(["lvl-M5"]);
  });
});
