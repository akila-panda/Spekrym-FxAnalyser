import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { loadPresets, removePreset, savePreset, type Preset } from "@/presets/presets";
import { applyShareState, captureShareState } from "@/url/shareState";
import { useDockStore } from "@/window/dockStore";
import { openWindows } from "@/window/popout";
import { loadBounds } from "@/window/screens";
import { useScreenStore } from "@/window/screenStore";
import { captureWorkspace, workspaceUrl } from "@/window/workspaces";
import { useWorkspaceStore } from "@/window/workspaceStore";

const captureWindows = () => captureWorkspace(openWindows(), useScreenStore.getState().screens, (k) => loadBounds(k));

/** Save, recall, and delete named presets (optionally with the open windows), plus copy the shareable link to the current view. */
export function PresetBar() {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState<"" | "view" | "workspace">("");
  const [withWindows, setWithWindows] = useState(true);
  const poppedCount = useDockStore((s) => s.popped.size);

  const save = () => {
    if (!name.trim()) return;
    const ws = withWindows && poppedCount > 0 ? captureWindows() : undefined;
    setPresets(savePreset(name, captureShareState(), ws));
    setSelected(name.trim());
    setName("");
  };
  const apply = (n: string) => {
    const p = presets.find((x) => x.name === n);
    if (!p) return;
    applyShareState(p.state);
    if (p.workspace) useWorkspaceStore.getState().restore(p.workspace);
  };
  const del = () => {
    if (!selected) return;
    setPresets(removePreset(selected));
    setSelected("");
  };
  const copy = (text: string, kind: "view" | "workspace") => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(kind);
        window.setTimeout(() => setCopied(""), 1500);
      },
      () => setCopied(""),
    );
  };
  const done = (
    <>
      <Icon name="check" /> Copied
    </>
  );

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
      {poppedCount > 0 && (
        <label className="mm-fill">
          <input type="checkbox" checked={withWindows} onChange={(e) => setWithWindows(e.target.checked)} /> Include windows ({poppedCount})
        </label>
      )}
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
          <option key={p.name} value={p.name}>
            {p.name}
            {p.workspace ? ` · ${p.workspace.length} windows` : ""}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={del} disabled={!selected} aria-label="Delete preset" title="Delete preset">
        <Icon name="close" />
      </button>
      <button type="button" onClick={() => copy(window.location.href, "view")} title="Copy a shareable link to this view">
        {copied === "view" ? done : "Copy link"}
      </button>
      {poppedCount > 0 && (
        <button
          type="button"
          onClick={() => copy(workspaceUrl(window.location.href, captureWindows()), "workspace")}
          title="Copy a link that also reopens the current windows"
        >
          {copied === "workspace" ? done : "Copy workspace link"}
        </button>
      )}
    </div>
  );
}