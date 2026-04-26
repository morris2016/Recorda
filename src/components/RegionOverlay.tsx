import { useEffect, useRef, useState } from "react";

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function RegionOverlay() {
  const [geom, setGeom] = useState<Geometry | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.recorda.regionGetGeometry().then(setGeom);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.recorda.regionCancel();
      } else if ((e.key === "Enter" || e.key === " ") && start && end) {
        confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, end]);

  const rect = (() => {
    if (!start || !end) return null;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    } as DragRect;
  })();

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (!dragging) return;
    setDragging(false);
    setEnd({ x: e.clientX, y: e.clientY });
    setTimeout(confirm, 30);
  };

  const confirm = () => {
    if (!geom || !rect || rect.width < 8 || rect.height < 8) return;
    const sf = geom.scaleFactor || 1;
    const out = {
      x: Math.round(geom.x + rect.x * sf),
      y: Math.round(geom.y + rect.y * sf),
      width: Math.round(rect.width * sf),
      height: Math.round(rect.height * sf),
    };
    window.recorda.regionConfirm(out);
  };

  if (!geom) return null;

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      className="fixed inset-0 cursor-crosshair"
      style={{ background: "rgba(8, 9, 12, 0.45)" }}
    >
      {!rect && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-xl bg-bg/80 backdrop-blur-md border border-border px-5 py-3.5 shadow-2xl">
            <div className="text-sm font-semibold text-text">Drag to select a region</div>
            <div className="text-xs text-text-dim mt-1">
              <kbd className="px-1.5 py-0.5 rounded bg-bg-panel2 border border-border-soft text-[10px] mr-1">Esc</kbd>
              cancel
              <span className="mx-2 text-text-faint">·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-panel2 border border-border-soft text-[10px] mr-1">Enter</kbd>
              confirm
            </div>
          </div>
        </div>
      )}

      {rect && (
        <>
          {/* dim panels around the selection */}
          <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: 0, right: 0, height: rect.y }} />
          <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }} />
          <div className="absolute bg-black/55 pointer-events-none" style={{ left: rect.x + rect.width, top: rect.y, right: 0, height: rect.height }} />
          <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: rect.y + rect.height, right: 0, bottom: 0 }} />

          {/* selection rectangle */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              border: "2px solid #3b82f6",
              boxShadow: "0 0 0 1px rgba(59,130,246,0.3), 0 0 32px rgba(59,130,246,0.25)",
              background: "transparent",
            }}
          />

          {/* corner handles */}
          {[
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y],
            [rect.x, rect.y + rect.height],
            [rect.x + rect.width, rect.y + rect.height],
          ].map(([cx, cy], i) => (
            <div
              key={i}
              className="absolute pointer-events-none rounded-sm"
              style={{
                left: cx - 5,
                top: cy - 5,
                width: 10,
                height: 10,
                background: "#3b82f6",
                boxShadow: "0 0 0 2px rgba(11,13,18,0.9)",
              }}
            />
          ))}

          {/* dimension label */}
          <div
            className="absolute pointer-events-none rounded-md bg-bg/90 border border-border px-2.5 py-1 text-xs font-mono shadow-lg backdrop-blur"
            style={{
              left: rect.x,
              top: rect.y + rect.height + 8,
              color: "#e7eaf2",
            }}
          >
            <span className="text-accent">{rect.width}</span>
            <span className="text-text-faint mx-1">x</span>
            <span className="text-accent">{rect.height}</span>
          </div>
        </>
      )}
    </div>
  );
}
