/** W7: "Click to open next window (2 of 3)". Shown when a restore (or a shared ?ws= link) still has windows to open. */
import { Icon } from "@/components/ui/Icon";
import "@/styles/workspaces.css";
import { useWorkspaceStore } from "./workspaceStore";

export function WorkspaceQueue() {
  const queue = useWorkspaceStore((s) => s.queue);
  const total = useWorkspaceStore((s) => s.total);
  const openNext = useWorkspaceStore((s) => s.openNext);
  const cancel = useWorkspaceStore((s) => s.cancel);
  const next = queue[0];
  if (!next) return null;
  const k = Math.min(total, total - queue.length + 1);
  return (
    <div className="ws-queue" role="status">
      <button type="button" className="ws-next" onClick={openNext}>
        Click to open next window ({k} of {total}) · {next.role}
      </button>
      <button type="button" className="ws-cancel icon-btn" onClick={cancel} aria-label="Cancel workspace restore">
        <Icon name="close" />
      </button>
    </div>
  );
}