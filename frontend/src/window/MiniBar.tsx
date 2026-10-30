/** W4: the one slim bar in every pop-out: identity, pair, tz, linked, layout, other-window count, re-dock. W6: full-screen toggle + remembered bounds. W7: full-screen on first click when restored that way. */
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { resolveTz } from "@/lib/format";
import { usePanelStore } from "@/panels/panelStore";
import { useViewStore } from "@/store/viewStore";
import { FULLSCREEN_PARAM, roleKey } from "./popout";
import type { WindowRole } from "./role";
import { currentBounds, saveBounds, type Bounds } from "./screens";
import { usePeers } from "./usePeers";

// Read at load: the URL mirror rewrites the query later and drops params it does not own.
const WANT_FULLSCREEN = typeof window !== "undefined" && new URLSearchParams(window.location.search).get(FULLSCREEN_PARAM) === "1";

/** Remembers where the user left this window so the next pop-out of the same role reopens there. */
function useRememberBounds(key: string): void {
  useEffect(() => {
    let last = "";
    const save = () => {
      if (document.fullscreenElement) return;
      const b: Bounds = currentBounds();
      const s = JSON.stringify(b);
      if (s === last) return;
      last = s;
      saveBounds(key, b);
    };
    const id = window.setInterval(save, 3000);
    window.addEventListener("pagehide", save);
    window.addEventListener("resize", save);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("resize", save);
    };
  }, [key]);
}

function enterFullscreen(): void {
  try {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  } catch {
    /* not allowed here */
  }
}

function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else enterFullscreen();
  } catch {
    /* not allowed here */
  }
}

/** True until the first click/key, when the window was restored as full screen. */
function useFullscreenOnFirstGesture(): boolean {
  const [pending, setPending] = useState(WANT_FULLSCREEN);
  useEffect(() => {
    if (!pending) return;
    const go = () => {
      enterFullscreen();
      setPending(false);
    };
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
  }, [pending]);
  return pending;
}

export function MiniBar({ role }: { role: WindowRole }) {
  const pair = useViewStore((s) => s.pair);
  const timezone = useViewStore((s) => s.timezone);
  const linked = useViewStore((s) => s.linked);
  const layout = usePanelStore((s) => s.layout);
  const peers = usePeers();
  const key = roleKey(role);
  const fsHint = useFullscreenOnFirstGesture();
  useRememberBounds(key);
  useEffect(() => {
    document.title = `Spekrym · ${key}`;
  }, [key]);
  return (
    <div className="mini-bar" role="toolbar" aria-label="Window status">
      <strong className="mono">{key}</strong>
      <span className="mono">{pair.replace("_", "/")}</span>
      <span className="mono">{resolveTz(timezone)}</span>
      <span>{linked ? "linked" : "unlinked"}</span>
      <span>{layout}</span>
      {fsHint && <span className="fs-hint" role="status">Click anywhere for full screen</span>}
      <span className="spacer" />
      <span className="mini-presence" title="Other live windows" aria-label={`${peers.length} other windows connected`}>
        <span className="live-dot" aria-hidden="true"><Icon name={peers.length > 0 ? "dot" : "ring"} size={10} /></span> {peers.length}
      </span>
      <button type="button" className="resnap" onClick={toggleFullscreen} aria-label="Toggle full screen on this screen" title="Toggle full screen on this screen">
        <Icon name="fullscreen" />
      </button>
      <button type="button" className="resnap" onClick={() => window.close()} aria-label="Re-dock this window into the main window" title="Close this window; it re-docks into main">
        <Icon name="dock" /> re-dock
      </button>
    </div>
  );
}