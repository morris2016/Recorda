import { Film, FolderOpen } from "lucide-react";
import { useStore } from "../store";
import { formatBytes, formatRelative } from "../lib/format";

export function RecentList() {
  const { recents } = useStore();
  if (recents.length === 0) {
    return (
      <div className="card p-4 text-center text-xs text-text-faint">
        Your past recordings will appear here.
      </div>
    );
  }
  return (
    <div className="card divide-y divide-border-soft overflow-hidden">
      {recents.map((r) => (
        <div key={r.path} className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-panel2 transition-colors">
          <Film size={14} className="text-text-faint shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate text-text">{r.name}</div>
            <div className="text-[10px] text-text-faint">
              {formatBytes(r.sizeBytes)}  ·  {formatRelative(r.mtimeMs)}
            </div>
          </div>
          <button
            className="btn btn-ghost p-1.5"
            onClick={() => window.recorda.showInExplorer(r.path)}
            title="Show in Explorer"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
