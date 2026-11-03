"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { type CanvasFormat, INSTRUCTIONS_MAX } from "@/lib/canvas";
import type { CanvasOutput as Output } from "@/lib/canvas-data";
import { generateAction } from "../actions";
import { OutputCard } from "./output-card";

/** Steps 2 and 3: pick a format, add an optional line, generate; then every version, newest first. */
export function CanvasOutput({
  canvasId,
  formats,
  outputs,
  perDay,
  hasClips,
}: {
  canvasId: string;
  formats: CanvasFormat[];
  outputs: Output[];
  perDay: number;
  hasClips: boolean;
}) {
  const t = useTranslations("canvas");
  const locale = useLocale();
  const router = useRouter();
  const [format, setFormat] = useState<CanvasFormat>(outputs[0]?.format ?? formats[0]);
  const [instructions, setInstructions] = useState("");
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await generateAction(canvasId, format, instructions.trim(), locale);
      if (!res.ok) return void toast.error(res.error === "limit" ? t("limit", { n: perDay }) : t("failed"));
      router.refresh();
    });
  }

  const step = (n: number, label: string, on: boolean) => (
    <h2 className="font-heading font-bold">
      <span className={`mr-1.5 inline-flex size-5 items-center justify-center rounded-full text-[11px] ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {n}
      </span>
      {label}
    </h2>
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="space-y-3 rounded-3xl border bg-card p-4">
        {step(2, t("step.format"), hasClips || outputs.length > 0)}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" data-canvas="formats">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              onClick={() => setFormat(f)}
              className={`rounded-2xl border p-3 text-left transition ${format === f ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"}`}
            >
              <span className="block text-sm font-medium">{t(`formats.${f}.name`)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`formats.${f}.hint`)}</span>
            </button>
          ))}
        </div>
        <label className="block text-xs text-muted-foreground">
          {t("instructions")}
          <input
            value={instructions}
            maxLength={INSTRUCTIONS_MAX}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t("instructionsPlaceholder")}
            className="mt-1 w-full rounded-full border bg-background px-3 py-1.5 text-sm text-foreground"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          {step(3, t("step.generate"), true)}
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            data-canvas="generate"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {pending ? t("generating") : t("generate")}
          </button>
          <span className="text-xs text-muted-foreground">{t("perDay", { n: perDay })}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold">{t("versions")}</h2>
        {outputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noVersions")}</p>
        ) : (
          outputs.map((o) => <OutputCard key={o.id} canvasId={canvasId} output={o} perDay={perDay} />)
        )}
      </section>
    </div>
  );
}
