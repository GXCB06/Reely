"use client";

import { ChevronDown, LayoutGrid, ListOrdered } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

type View = "steps" | "board";
const KEY = "reely:canvas-view";

/** The view this person last used (this browser only; Steps when storage is blocked or the screen is narrow). */
function storedView(): View {
  try {
    if (!window.matchMedia("(min-width: 768px)").matches) return "steps";
    return window.localStorage.getItem(KEY) === "board" ? "board" : "steps";
  } catch {
    return "steps";
  }
}

/**
 * Steps | Board on a canvas: the same canvas either as numbered steps (the default, and always on phones) or as a
 * board of nodes. On the board, the inputs (clips, note, my channel) open in a panel above it.
 */
export function CanvasViews({ steps, board, inputs }: { steps: ReactNode; board: ReactNode; inputs: ReactNode }) {
  const t = useTranslations("canvas.board");
  const [view, setView] = useState<View>("steps");
  const [inputsOpen, setInputsOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setView(storedView()), []);

  function choose(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  }

  const tab = (v: View, icon: ReactNode, label: string, extra = "") => (
    <button
      type="button"
      onClick={() => choose(v)}
      aria-pressed={view === v}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"} ${extra}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Board needs room to drag nodes: offered from tablet width up. */}
      <div className="hidden w-fit gap-1 rounded-full border bg-card p-1 md:flex" data-canvas="views">
        {tab("steps", <ListOrdered className="size-4" />, t("steps"))}
        {tab("board", <LayoutGrid className="size-4" />, t("board"))}
      </div>
      {view === "steps" ? (
        steps
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setInputsOpen((o) => !o)} className="chip" aria-expanded={inputsOpen}>
            <ChevronDown className={`size-3.5 transition ${inputsOpen ? "rotate-180" : ""}`} /> {t("inputs")}
          </button>
          {inputsOpen && <div className="grid gap-4 lg:grid-cols-2">{inputs}</div>}
          {board}
        </div>
      )}
    </div>
  );
}
