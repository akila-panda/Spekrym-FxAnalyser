import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import "@/styles/chrome.css";

const key = (id: string): string => `spekrym.tip.${id}`;
const seen = (id: string): boolean => {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
};

/** One dismissible line. Once dismissed it stays dismissed (local only). */
export function TipLine({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => seen(id));
  if (hidden) return null;
  return (
    <p className="tip-line" role="note">
      <span>{children}</span>
      <button
        type="button"
        className="tip-dismiss"
        aria-label="Dismiss tip"
        onClick={() => {
          try {
            localStorage.setItem(key(id), "1");
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </p>
  );
}