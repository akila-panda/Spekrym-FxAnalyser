import type { SeriesMarker, Time } from "lightweight-charts";
import type { ChartApi } from "@/chart/chartApi";
import { readTokens } from "@/chart/theme";
import { TF_SECONDS, type Pair, type Timeframe } from "@/types/market";
import type { Annotation } from "@/types/annotations";
import { BandFillPrimitive } from "./primitives/BandFillPrimitive";
import { LevelPrimitive } from "./primitives/LevelPrimitive";
import { LinePrimitive } from "./primitives/LinePrimitive";
import { TextPrimitive } from "./primitives/TextPrimitive";
import { TradePrimitive } from "./primitives/TradePrimitive";
import { WindowPrimitive } from "./primitives/WindowPrimitive";
import { ZonePrimitive } from "./primitives/ZonePrimitive";
import { domColorResolver, type ColorResolver } from "./styleFor";
import { toSpecs, type ShapeSpec } from "./toPrimitives";

type Prim = LevelPrimitive | ZonePrimitive | WindowPrimitive | LinePrimitive | TradePrimitive | BandFillPrimitive;
interface Entry {
  sig: string;
  type: ShapeSpec["type"];
  prim: Prim;
  detach: () => void;
}

/** One per panel. Diffs the visible set against what is attached, so unchanged annotations are not redrawn. */
export class AnnotationManager {
  private shapes = new Map<string, Entry>();
  private texts: { prim: TextPrimitive; detach: () => void } | null = null;
  private feed: { getBars: ChartApi["getCandles"]; barSeconds: number };

  constructor(
    private readonly api: ChartApi,
    tf: Timeframe,
    private readonly resolve: ColorResolver = domColorResolver,
  ) {
    this.feed = { getBars: () => api.getCandles(), barSeconds: TF_SECONDS[tf] };
  }

  /** `extraMarkers` are the setup pins; they share the series' single marker layer with annotation markers. */
  sync(visible: readonly Annotation[], pair: Pair, extraMarkers: readonly SeriesMarker<Time>[] = []): void {
    const t = readTokens();
    const specs = toSpecs(visible, { resolve: this.resolve, pair, text: t.text, bg: t.bg, font: t.fontMono });

    const keep = new Set(specs.shapes.map((s) => s.id));
    for (const [id, e] of this.shapes) {
      if (!keep.has(id)) {
        e.detach();
        this.shapes.delete(id);
      }
    }
    for (const s of specs.shapes) {
      const sig = JSON.stringify(s.opts);
      const cur = this.shapes.get(s.id);
      if (cur?.sig === sig) continue;
      if (cur && cur.type === s.type) {
        (cur.prim as { set(o: unknown): void }).set(s.opts);
        cur.sig = sig;
        continue;
      }
      cur?.detach();
      const prim = this.create(s);
      this.shapes.set(s.id, { sig, type: s.type, prim, detach: this.api.attachPrimitive(prim) });
    }

    if (specs.texts.length > 0) {
      const opts = { items: specs.texts, style: { color: t.text, halo: t.bg, font: t.fontMono } };
      if (this.texts) this.texts.prim.set(opts);
      else {
        const prim = new TextPrimitive(this.feed, opts);
        this.texts = { prim, detach: this.api.attachPrimitive(prim) };
      }
    } else if (this.texts) {
      this.texts.detach();
      this.texts = null;
    }

    this.api.setMarkers([...specs.markers, ...extraMarkers].sort((a, b) => Number(a.time) - Number(b.time)));
    this.api.syncIndicators(specs.indicators);
  }

  dispose(): void {
    for (const e of this.shapes.values()) e.detach();
    this.shapes.clear();
    this.texts?.detach();
    this.texts = null;
    this.api.setMarkers([]);
    this.api.syncIndicators([]);
  }

  private create(s: ShapeSpec): Prim {
    switch (s.type) {
      case "level": return new LevelPrimitive(this.feed, s.opts);
      case "zone": return new ZonePrimitive(this.feed, s.opts);
      case "window": return new WindowPrimitive(this.feed, s.opts);
      case "line": return new LinePrimitive(this.feed, s.opts);
      case "trade": return new TradePrimitive(this.feed, s.opts);
      case "bandfill": return new BandFillPrimitive(this.feed, s.opts);
    }
  }
}