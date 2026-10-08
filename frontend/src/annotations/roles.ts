import { isKnownRole, KNOWN_ROLES, type KnownRole, type Tone } from "@/types/annotations";

export const ROLE_LABELS: Record<KnownRole | "other", string> = {
  bias: "Bias",
  range: "Range",
  window: "Window",
  liquidity: "Liquidity",
  sweep: "Sweep",
  structure: "Structure",
  imbalance: "Fair value gap",
  order_block: "Order block",
  premium_discount: "Premium / discount",
  entry: "Entry",
  stop: "Stop",
  target: "Target",
  filter: "Filter",
  context: "Context",
  other: "Other",
};

/** Legend group: the role itself, or "other" for roles this client does not know. */
export const roleGroup = (role: string): KnownRole | "other" => (isKnownRole(role) ? role : "other");

export const GROUP_ORDER: readonly (KnownRole | "other")[] = [...KNOWN_ROLES, "other"];

/** Tone colours for roles the client does not know. */
const TONE_VAR: Record<Tone, string> = {
  bull: "--up",
  bear: "--down",
  neutral: "--muted",
  info: "--role-range",
};

/** CSS variable for a role. `imbalance` and `premium_discount` pick by tone. */
export function roleVar(role: string, tone: Tone): string {
  switch (role) {
    case "imbalance":
      return tone === "bear" ? "--role-fvg-bear" : "--role-fvg-bull";
    case "premium_discount":
      return tone === "bear" ? "--role-premium" : "--role-discount";
    case "order_block":
      return "--role-order-block";
    default:
      return isKnownRole(role) ? `--role-${role}` : TONE_VAR[tone];
  }
}