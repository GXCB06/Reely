"use client";

import { Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { addBriefsAction } from "./actions";

type Candidate = { id: string; title: string; region: string; when: string; platforms: string };

/** Your other researches, one tap to add; plus the suggested starting set while the test set is empty. */
export function AddBriefs({ candidates, suggested }: { candidates: Candidate[]; suggested: string[] }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [pending, start] = useTransition();
  const add = (ids: string[], core: boolean) =>
    start(async () => {
      const res = await addBriefsAction(ids, core);
      if (!res.ok) toast.error(t("addFailed"));
      router.refresh();
    });

  return (
    <section className="space-y-3">
      {suggested.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => add(suggested, true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Sparkles className="size-4" /> {t("addSuggested", { n: suggested.length })}
        </button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {t(`region.${c.region}`)} · {c.when} · {c.platforms}
              </p>
            </div>
            <button type="button" disabled={pending} onClick={() => add([c.id], false)} className="chip">
              <Plus className="size-3.5" /> {t("add")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
