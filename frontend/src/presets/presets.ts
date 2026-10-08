import type { ShareState } from "@/url/urlState";

/** A named snapshot of the shareable workbench state. */
export interface Preset {
  name: string;
  state: ShareState;
}

const KEY = "spekrym.presets.v1";

/** Reads saved presets. Returns [] on any storage, parse, or shape error — never throws. */
export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Preset => !!p && typeof (p as Preset).name === "string" && typeof (p as Preset).state === "object",
    );
  } catch {
    return [];
  }
}

function write(list: Preset[]): Preset[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode, quota): keep the in-memory list */
  }
  return list;
}

/** Adds or replaces the preset with this name and returns the new list. A blank name is ignored. */
export function savePreset(name: string, state: ShareState): Preset[] {
  const trimmed = name.trim();
  if (!trimmed) return loadPresets();
  const rest = loadPresets().filter((p) => p.name !== trimmed);
  return write([...rest, { name: trimmed, state }].sort((a, b) => a.name.localeCompare(b.name)));
}

/** Removes the named preset and returns the new list. */
export function removePreset(name: string): Preset[] {
  return write(loadPresets().filter((p) => p.name !== name));
}
