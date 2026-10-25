"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { runResearchAction, suggestPlanAction } from "../actions";

const MAX_KEYWORDS = 5;
const PLATFORMS = ["tiktok", "youtube"] as const;
type Step = "describe" | "keywords" | "running";

export function ResearchWizard() {
  const t = useTranslations("research");
  const locale = useLocale() as "th" | "en";
  const router = useRouter();
  const [step, setStep] = useState<Step>("describe");
  const [brief, setBrief] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<(typeof PLATFORMS)[number][]>(["tiktok", "youtube"]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newExclusion, setNewExclusion] = useState("");
  const [pending, startTransition] = useTransition();

  const tooShort = brief.trim().length < 10;

  function suggest() {
    startTransition(async () => {
      const res = await suggestPlanAction(brief);
      if (!res.ok) return void toast.error(t("errorBrief"));
      setSuggested(res.plan.keywords);
      setSelected(res.plan.keywords.slice(0, MAX_KEYWORDS));
      setExclusions(res.plan.exclusions);
      if (res.plan.source === "sample") toast.info(t("sampleNotice"));
      setStep("keywords");
    });
  }

  function toggleKeyword(k: string) {
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < MAX_KEYWORDS ? [...s, k] : s));
  }

  function addKeyword() {
    const k = newKeyword.trim();
    if (k.length < 2) return;
    if (!suggested.includes(k)) setSuggested((s) => [...s, k]);
    if (!selected.includes(k) && selected.length < MAX_KEYWORDS) setSelected((s) => [...s, k]);
    setNewKeyword("");
  }

  function addExclusion() {
    const w = newExclusion.trim();
    if (w && !exclusions.includes(w) && exclusions.length < 10) setExclusions((e) => [...e, w]);
    setNewExclusion("");
  }

  function run() {
    setStep("running");
    startTransition(async () => {
      const res = await runResearchAction({ brief, keywords: selected, exclusions, platforms, locale });
      if (res.ok) return router.push(`/app/research/${res.runId}`);
      toast.error(t("errorRun"));
      setStep("keywords");
    });
  }

  // Each keyword search = 1 TikTok credit; baselines for up to 5 creators × 2 pages = 10.
  const credits = platforms.includes("tiktok") ? selected.length + 10 : 0;

  const steps: { id: Step; label: string }[] = [
    { id: "describe", label: t("stepDescribe") },
    { id: "keywords", label: t("stepKeywords") },
    { id: "running", label: t("stepRun") },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-4xl">
      <ol className="mb-8 flex items-center gap-3 text-sm">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
                i === stepIndex ? "bg-primary text-primary-foreground" : i < stepIndex ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {i < stepIndex ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      {step === "describe" && (
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div>
            <h2 className="font-heading text-2xl font-bold">{t("describeTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("describeHint")}</p>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={t("briefPlaceholder")}
              rows={6}
              maxLength={1000}
              className="mt-4 rounded-2xl bg-white shadow-sm"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{brief.length} / 1000</span>
            </div>
            <Button onClick={suggest} disabled={tooShort || pending} className="mt-4 h-11 rounded-full px-6">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {t("suggest")}
            </Button>
          </div>
          <aside className="h-fit rounded-2xl border bg-card p-4">
            <p className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{t("goodBrief")}</p>
            <ul className="space-y-3 text-sm">
              {(["topic", "audience", "angle", "avoid"] as const).map((k) => (
                <li key={k}>
                  <p className="font-medium">{t(`brief.${k}`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`brief.${k}Example`)}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {step === "keywords" && (
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-heading text-lg font-bold">{t("searchFor")}</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {selected.length} / {MAX_KEYWORDS}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("searchForHint")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggested.map((k) => {
                const on = selected.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKeyword(k)}
                    className={`chip ${on ? "chip-on" : ""}`}
                  >
                    {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                    {k}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex max-w-md gap-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder={t("addKeyword")}
                className="rounded-full bg-white"
              />
              <Button type="button" variant="outline" onClick={addKeyword} className="rounded-full">
                <Plus className="size-4" />
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">{t("filterOut")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("filterOutHint")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {exclusions.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setExclusions((e) => e.filter((x) => x !== w))}
                  className="chip border-amber-300 bg-amber-50 text-amber-900"
                >
                  <X className="size-3.5" />
                  {w}
                </button>
              ))}
            </div>
            <div className="mt-4 flex max-w-md gap-2">
              <Input
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
                placeholder={t("addExclusion")}
                className="rounded-full bg-white"
              />
              <Button type="button" variant="outline" onClick={addExclusion} className="rounded-full">
                <Plus className="size-4" />
              </Button>
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setPlatforms((s) => (on ? (s.length > 1 ? s.filter((x) => x !== p) : s) : [...s, p]))
                    }
                    className={`chip ${on ? "chip-on" : ""}`}
                  >
                    {on && <Check className="size-3.5" />}
                    {t(`platform.${p}`)}
                  </button>
                );
              })}
              <span className="chip pointer-events-none opacity-50">{t("platform.instagramSoon")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("creditEstimate", { credits })}</p>
          </section>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("describe")} className="rounded-full">
              <ArrowLeft className="size-4" /> {t("back")}
            </Button>
            <Button onClick={run} disabled={!selected.length || pending} className="h-11 rounded-full px-6">
              {t("run")} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "running" && (
        <div className="grid place-items-center rounded-3xl border bg-card px-6 py-20 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <h2 className="mt-4 font-heading text-xl font-bold">{t("runningTitle")}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("runningHint")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {selected.map((k) => (
              <span key={k} className="chip chip-on animate-pulse">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
