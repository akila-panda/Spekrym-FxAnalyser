import { useState } from "react";
import { loadPresets, removePreset, savePreset, type Preset } from "@/presets/presets";
import { applyShareState, captureShareState } from "@/url/shareState";

/** Save, recall, and delete named presets, plus copy the shareable link to the current view. */
export function PresetBar() {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState(false);

  const save = () => {
    if (!name.trim()) return;
    setPresets(savePreset(name, captureShareState()));
    setSelected(name.trim());
    setName("");
  };
  const apply = (n: string) => {
    const p = presets.find((x) => x.name === n);
    if (p) applyShareState(p.state);
  };
  const del = () => {
    if (!selected) return;
    setPresets(removePreset(selected));
    setSelected("");
  };
  const copyLink = () => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="field preset-bar" role="group" aria-label="Presets">
      <input
        type="text"
        aria-label="Preset name"
        placeholder="Preset name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button type="button" onClick={save} disabled={!name.trim()}>Save</button>
      <select
        aria-label="Saved presets"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          if (e.target.value) apply(e.target.value);
        }}
      >
        <option value="">Presets…</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
      <button type="button" onClick={del} disabled={!selected} aria-label="Delete preset">✕</button>
      <button type="button" onClick={copyLink} title="Copy a shareable link to this view">
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
