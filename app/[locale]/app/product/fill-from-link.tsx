"use client";

import { Link2, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { draftProductAction } from "./actions";

export type ProductDraft = Extract<Awaited<ReturnType<typeof draftProductAction>>, { ok: true }>["draft"];

/** "Fill in from a link": reads the product's website and drafts the form (one AI call, no credits). */
export function FillFromLink({ initialLink = "", hint, onDraft }: { initialLink?: string; hint: string; onDraft: (draft: ProductDraft) => void }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [link, setLink] = useState(initialLink);
  const [pending, startTransition] = useTransition();

  function fill() {
    startTransition(async () => {
      const res = await draftProductAction(link, locale);
      if (!res.ok) return void toast.error(t(res.error === "badUrl" ? "badUrl" : res.error === "unreadable" ? "linkUnreadable" : "fillFailed"));
      onDraft(res.draft);
    });
  }

  return (
    <div className="rounded-2xl bg-accent/60 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-4 text-primary" /> {t("fillTitle")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
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
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
