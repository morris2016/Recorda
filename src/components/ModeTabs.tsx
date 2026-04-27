import { Monitor, Crop } from "lucide-react";
import { useStore } from "../store";
import { cn } from "../lib/cn";

export function ModeTabs() {
  const { mode, setMode, region, setRegion, recState } = useStore();
  const disabled = recState.status === "recording" || recState.status === "starting";

  const pickRegion = async () => {
    const r = await window.recorda.pickRegion();
    if (r) setRegion(r);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="bg-bg-panel border border-border rounded-xl p-1 flex">
        <Tab
          active={mode === "fullscreen"}
          onClick={() => setMode("fullscreen")}
          disabled={disabled}
          icon={<Monitor size={14} />}
          label="Full screen"
        />
        <Tab
          active={mode === "region"}
          onClick={() => { setMode("region"); if (!region) pickRegion(); }}
          disabled={disabled}
          icon={<Crop size={14} />}
          label="Region"
        />
      </div>

      {mode === "region" && (
        <div className="flex items-center gap-2">
          <div className="bg-bg-panel border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-text-dim">
            {region
              ? `${region.width} x ${region.height}`
              : "no region"}
          </div>
          <button
            className="btn btn-secondary text-xs"
            onClick={pickRegion}
            disabled={disabled}
          >
            <Crop size={12} />
            {region ? "Reselect" : "Select..."}
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({
  active, onClick, disabled, icon, label,
}: {
  active: boolean; onClick: () => void; disabled?: boolean;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
        active
          ? "bg-accent text-white shadow-glow"
          : "text-text-dim hover:bg-bg-panel2 hover:text-text",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
