/** S4: pure bracket model for one lower row. Parents come from ACTUAL parent bars (S2 align). */
import { isHigherTf, type Candle, type Timeframe } from "@/types/market";
import { countChildren, parentSpans, spanAt, type ChildCount } from "./align";

export const MAX_BRACKETS = 80;

export interface BracketInput {
  parentTF: Timeframe;
  parentBars: readonly Candle[];
  childTF: Timeframe;
  childBars: readonly Candle[];
  /** Visible window [from, to) in UTC seconds. */
  from: number;
  to: number;
  asOf?: number | null;
  /** A time inside the active parent (the Focus open); null for none. */
  activeAt?: number | null;
  max?: number;
}

export interface Bracket {
  open: number;
  close: number;
  forming: boolean;
  calendar: boolean;
  active: boolean;
  count: ChildCount;
  label: string;
}

/** `×N`; partial gets `~N`; a forming parent adds ` · forming`. */
export function bracketLabel(count: ChildCount, forming: boolean): string {
  const base = count.partial ? `~${count.present}` : `×${count.present}`;
  return forming ? `${base} · forming` : base;
}

/** DX2: brackets need a visible row and a visible parent row; a hidden TF is skipped, never assumed. */
export function bracketsAllowed(childTF: Timeframe, parentTF: Timeframe, visible: readonly Timeframe[]): boolean {
  return visible.includes(childTF) && visible.includes(parentTF) && isHigherTf(parentTF, childTF);
}

export function buildBrackets(i: BracketInput): Bracket[] {
  if (!isHigherTf(i.parentTF, i.childTF)) return [];
  const spans = parentSpans(i.parentTF, i.parentBars, i.from, i.to, i.asOf, i.max ?? MAX_BRACKETS);
  const activeOpen = i.activeAt == null ? null : (spanAt(i.parentTF, i.parentBars, i.activeAt, i.asOf)?.open ?? null);
  return spans.map((span) => {
    const count = countChildren(span, i.childTF, i.childBars, i.asOf);
    return {
      open: span.open,
      close: span.close,
      forming: span.forming,
      calendar: span.calendar,
      active: span.open === activeOpen,
      count,
      label: bracketLabel(count, span.forming),
    };
  });
}