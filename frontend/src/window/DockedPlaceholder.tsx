/** W4: shown in main in place of a region that lives in a pop-out window. */
import { Icon } from "@/components/ui/Icon";
import { redock } from "./popout";

export function DockedPlaceholder({ what, roleKey }: { what: string; roleKey: string }) {
  return (
    <div className="docked-placeholder" role="status">
      <p>{what} {what.endsWith("s") ? "are" : "is"} open in another window.</p>
      <button type="button" onClick={() => redock(roleKey)} aria-label={`Re-dock ${what} into this window`}>
        <Icon name="dock" /> Re-dock
      </button>
    </div>
  );
}