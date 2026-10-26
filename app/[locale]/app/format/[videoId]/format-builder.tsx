"use client";

import { Check, Layers, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { buildFormatAction } from "./actions";

/**
 * A format nobody explored yet: finding who else made this kind of clip costs ~3 credits and 20-40 s,
 * so it starts only when the user asks (opening the page alone never spends credits).
 */
export function FormatBuilder({ videoId }: { videoId: number }) {
  const t = useTranslations("format");
  const locale = useLocale();
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  function start() {
    setStarted(true);
    setFailed(false);
    setStep(0);
    const timers = [5000, 12000, 20000].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    buildFormatAction(videoId, locale)
      .then((res) => (res.ok ? router.refresh() : setFailed(true)))
      .catch(() => setFailed(true))
      .finally(() => timers.forEach(clearTimeout));
  }

  if (!started || failed) {
    return (
      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        {failed && <p className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{t("failed")}</p>}
        <p className="max-w-xl text-muted-foreground">{t("startBody")}</p>
        <button
          type="button"
          onClick={start}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Layers className="size-4" /> {t("startButton")}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">{t("buildingHint")}</p>
      </div>
    );
  }

  const steps = [t("step1"), t("step2"), t("step3"), t("step4")];
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
