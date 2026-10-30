/** DX10: "Two-screen review" plan. Pure: stack full-screen on the secondary screen, workbench stays on the primary. */
import { placementBounds, type Bounds, type ScreenInfo } from "./screens";

export interface TwoScreenPlan {
  /** Screen that keeps the workbench (list + detail). */
  workbench: ScreenInfo;
  /** Screen that gets the stack window. */
  stack: ScreenInfo;
  /** Fill bounds for the stack window on `stack`. */
  stackBounds: Bounds;
}

const area = (s: ScreenInfo): number => s.frame.width * s.frame.height;

/** Null with fewer than two screens, so the caller can degrade cleanly. The largest non-primary screen takes the stack. */
export function planTwoScreen(screens: readonly ScreenInfo[]): TwoScreenPlan | null {
  if (screens.length < 2) return null;
  const workbench = screens.find((s) => s.isPrimary) ?? screens[0]!;
  const others = screens.filter((s) => s !== workbench).sort((a, b) => area(b) - area(a) || a.id.localeCompare(b.id));
  const stack = others[0];
  return stack ? { workbench, stack, stackBounds: placementBounds(stack, true) } : null;
}