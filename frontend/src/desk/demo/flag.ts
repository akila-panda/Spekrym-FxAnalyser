/** DEMO (removable) — demo-mode flag. Persisted in localStorage (spekrym.demo.v1) so it survives the app's
 *  URL-state mirror and page loads; `?demo=1` / `?demo=0` in the URL overrides and writes it. Captured once at
 *  module import. Off by default, so DESK/Canvas defaults and tests are untouched. Delete src/desk/demo/ to remove. */
const KEY = "spekrym.demo.v1";

function read(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get("demo");
    if (p === "1") { localStorage.setItem(KEY, "1"); return true; }
    if (p === "0") { localStorage.setItem(KEY, "0"); return false; }
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const INITIAL: boolean = read();

/** Demo mode as it was at page load (components read this). */
export function isDemo(): boolean {
  return INITIAL;
}

/** Turn demo mode on/off and reload so the charts mount/unmount. */
export function setDemo(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
  // A URL override must not undo the user's explicit toggle on reload.
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState(null, "", url.toString());
  } catch { /* ignore */ }
  try { window.location.reload(); } catch { /* ignore */ }
}