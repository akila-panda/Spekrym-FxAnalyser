/** W4: pop-out control. Rendered only in the main window (popouts have a re-dock button instead). */
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { parseRole, type WindowRole } from "./role";
import { openPopout, roleLabel } from "./popout";

interface Props {
  role: WindowRole;
  /** Wording for the tooltip, e.g. "charts". Defaults to the role label. */
  label?: string;
  className?: string;
}

export function PopoutButton({ role, label, className = "icon-btn" }: Props) {
  const [isMain] = useState(() => parseRole(window.location.search).kind === "main");
  if (!isMain) return null;
  const what = label ?? roleLabel(role);
  return (
    <button
      type="button"
      className={className}
      onClick={() => openPopout(role)}
      aria-label={`Pop out ${what} to a new window`}
      title={`Pop out ${what} to a new window`}
    >
      <Icon name="popout" />
    </button>
  );
}