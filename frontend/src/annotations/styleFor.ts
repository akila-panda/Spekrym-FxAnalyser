import type { Tone } from "@/types/annotations";
import { roleVar } from "./roles";

export interface RoleStyle {
  cssVar: string;
  /** 0 = no fill. */
  fillAlpha: number;
  borderAlpha?: number;
  borderDash?: readonly number[];
  /** CSS px. */
  lineWidth: number;
  dash?: readonly number[];
  /** Dashed equilibrium line at 50% (premium). */
  midline?: boolean;
}

/** Alpha and line style per role: DESIGN_DIRECTION.md section 2. Unknown roles use the tone colour. */
export function styleFor(role: string, tone: Tone): RoleStyle {
  const cssVar = roleVar(role, tone);
  switch (role) {
    case "bias":
      return { cssVar, fillAlpha: 0, lineWidth: 3 };
    case "range":
      return { cssVar, fillAlpha: 0.1, borderAlpha: 0.7, lineWidth: 1 };
    case "window":
      return { cssVar, fillAlpha: 0.06, lineWidth: 1 };
    case "liquidity":
      return { cssVar, fillAlpha: 0, lineWidth: 1, dash: [4, 3] };
    case "sweep":
    case "structure":
      return { cssVar, fillAlpha: 0, lineWidth: 1 };
    case "imbalance":
      return { cssVar, fillAlpha: 0.14, borderAlpha: 0.5, borderDash: [1, 2], lineWidth: 1 };
    case "order_block":
      return { cssVar, fillAlpha: 0.18, borderAlpha: 0.8, lineWidth: 1 };
    case "premium_discount":
      return { cssVar, fillAlpha: 0.05, lineWidth: 1, midline: tone === "bear" };
    case "entry":
      return { cssVar, fillAlpha: 0.1, lineWidth: 1.5 };
    case "stop":
    case "target":
      return { cssVar, fillAlpha: 0.1, lineWidth: 1, dash: [4, 3] };
    case "filter":
      return { cssVar, fillAlpha: 0, lineWidth: 1.5 };
    case "context":
      return { cssVar, fillAlpha: 0, lineWidth: 1, dash: [1, 2] };
    default:
      return { cssVar, fillAlpha: 0.1, borderAlpha: 0.5, lineWidth: 1 };
  }
}

export type ColorResolver = (cssVar: string) => string;

/** Reads the token from the document; never hard-code colours. */
export const domColorResolver: ColorResolver = (cssVar) =>
  getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || "#888";