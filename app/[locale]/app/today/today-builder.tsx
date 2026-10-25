"use client";

import { Check, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { buildTodayAction } from "./actions";

/** First visit of the day: builds the digest (about 20-40 s) with step-by-step progress, then shows it. */
export function TodayBuilder({ tracked, topics }: { tracked: number; topics: number }) {
  const t = useTranslations("today");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timers = [6000, 16000].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    buildTodayAction(locale)
      .then((res) => (res.ok ? router.refresh() : setFailed(true)))
      .catch(() => setFailed(true))
      .finally(() => timers.forEach(clearTimeout));
  }, [locale, router]);

  if (failed) return <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{t("failed")}</p>;

  const steps = [t("stepAccounts", { n: tracked }), t("stepTopics", { n: topics }), t("stepIdeas")];
  return (
    <div className="rounded-3xl border bg-card p-6 shadow-sm">
      <p className="font-semibold">{t("building")}</p>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i > step ? "text-muted-foreground/60" : ""}`}>
            {i < step ? (
              <Check className="size-4 text-primary" />
            ) : i === step ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <span className="size-4 rounded-full border" />
            )}
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">{t("buildingHint")}</p>
    </div>
  );
}
