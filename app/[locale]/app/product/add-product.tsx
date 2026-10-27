"use client";

import { Link2, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { draftProductAction, type ProductForm as Values } from "./actions";
import { ProductForm } from "./product-form";

/**
 * "+ Add product": a panel that opens on top of the list. Pasting the website fills the form in (one AI call);
 * the user checks it and presses Add. Opens by itself when there is no product yet.
 */
export function AddProduct({ empty, disabled, startOpen = false }: { empty: Values; disabled: boolean; startOpen?: boolean }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [open, setOpen] = useState(startOpen);
  const [link, setLink] = useState("");
  // A new draft re-mounts the form with the filled-in values.
  const [draft, setDraft] = useState<{ n: number; values: Values }>({ n: 0, values: empty });
  const [pending, startTransition] = useTransition();

  function fill() {
    startTransition(async () => {
      const res = await draftProductAction(link, locale);
      if (!res.ok) return void toast.error(t(res.error === "badUrl" ? "badUrl" : res.error === "unreadable" ? "linkUnreadable" : "fillFailed"));
      setDraft((d) => ({ n: d.n + 1, values: { ...empty, ...res.draft, goal: res.draft.goal ?? "" } }));
      toast.success(t("filled"));
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? t("limit") : undefined}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
      >
        <Plus className="size-4" /> {t("add")}
      </button>
    );
  }

  return (
    <section className="w-full rounded-3xl border bg-card p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{t("addTitle")}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="mb-5 rounded-2xl bg-accent/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> {t("fillTitle")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), link.trim() && fill())}
              placeholder="https://"
              className="h-10 rounded-full bg-white pl-9"
            />
          </div>
          <button
            type="button"
            onClick={fill}
            disabled={pending || !link.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {pending ? t("filling") : t("fill")}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("fillHint")}</p>
      </div>
      <ProductForm key={draft.n} initial={draft.values} onDone={() => setOpen(false)} />
    </section>
  );
}
