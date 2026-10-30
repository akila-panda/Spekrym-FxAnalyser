/** DESK DK3 — layer labels + presets. Presets change PRESENTATION only (which layers are visible); never calculation. */
import { LAYERS, type LayerId } from "@/desk/types/schemas";

export const LAYER_LABELS: Record<LayerId, string> = {
  structure: "Structure",
  levels: "Key levels",
  supplyDemand: "Supply & demand",
  liquidity: "Liquidity",
  fvg: "FVGs / imbalances",
  priceAction: "Price action",
};

export type PresetId = "market_map" | "liquidity" | "price_action" | "execution" | "all" | "core";

export interface Preset { id: PresetId; label: string; visible: readonly LayerId[] }

export const CORE_LAYERS: readonly LayerId[] = ["structure", "levels", "supplyDemand"];

export const PRESETS: readonly Preset[] = [
  { id: "market_map", label: "Market Map", visible: ["structure", "levels", "supplyDemand"] },
  { id: "liquidity", label: "Liquidity", visible: ["levels", "liquidity", "fvg"] },
  { id: "price_action", label: "Price Action", visible: ["structure", "levels", "priceAction"] },
  { id: "execution", label: "Execution", visible: ["supplyDemand", "liquidity", "fvg", "priceAction"] },
  { id: "all", label: "Show all", visible: LAYERS },
  { id: "core", label: "Reset to core", visible: CORE_LAYERS },
];

export const getPreset = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);