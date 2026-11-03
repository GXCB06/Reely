"use client";

import { LayoutTemplate, Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addToCanvasAction, listCanvasesAction } from "@/app/[locale]/app/canvas/actions";
import { useRouter } from "@/i18n/navigation";
import { MAX_CLIPS } from "@/lib/canvas";
import { sourceOf } from "@/lib/events";

type Choices = Awaited<ReturnType<typeof listCanvasesAction>>;

/**
 * "Add to canvas" on a clip: a small menu of the user's recent canvases, plus "New canvas for <product>". The list
 * loads only when the menu opens, so cards stay cheap. `compact` shows the icon only (narrow clip cards).
 */
export function AddToCanvas({ videoId, compact = false }: { videoId: number; compact?: boolean }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Close the menu on a click outside it.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    if (!choices) void listCanvasesAction().then(setChoices).catch(() => setChoices({ canvases: [], products: [] }));
  }

  function add(target: { canvasId: string } | { productId: string }) {
    start(async () => {
      const res = await addToCanvasAction(target, videoId, sourceOf(pathname));
      if (!res.ok) return void toast.error(res.error === "full" ? t("full") : t("failed"));
      setOpen(false);
      setChoices(null);
      toast.success(t("addedTo"), { action: { label: t("openCanvas"), onClick: () => router.push(`/app/canvas/${res.id}`) } });
    });
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        title={t("addToCanvas")}
        aria-label={t("addToCanvas")}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
      >
        <LayoutTemplate className="size-3.5" />
        {!compact && t("addToCanvas")}
      </button>
      {open && (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-2xl border bg-popover p-2 text-left shadow-lg" data-canvas="add-menu">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <p className="text-xs font-semibold">{t("addToCanvas")}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </div>
          {choices === null ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">…</p>
          ) : (
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {choices.canvases.map((c) => {
                const here = c.clips.includes(videoId);
                const full = c.clips.length >= MAX_CLIPS;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={pending || here || full}
                    onClick={() => add({ canvasId: c.id })}
                    className="block w-full rounded-xl px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <span className="block truncate font-medium">{c.title || t("untitled")}</span>
                    <span className="block truncate text-muted-foreground">
                      {c.product} · {here ? t("alreadyIn") : full ? t("full") : t("clips", { n: c.clips.length })}
                    </span>
                  </button>
                );
              })}
              {choices.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={pending}
                  onClick={() => add({ productId: p.id })}
                  className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/5"
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  <span className="truncate">{t("newFor", { product: p.name })}</span>
                </button>
              ))}
              {choices.products.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("noProducts")}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
