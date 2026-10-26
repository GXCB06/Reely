"use client";

import { ArrowUp, CalendarDays, Check, Eye, ImagePlus, Link2, Loader2, Package, Plus, RotateCcw, Search, X } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { runResearchAction, understandAction } from "@/app/[locale]/app/research/actions";
import { PlatformIcon } from "@/components/platform-icon";
import { Logo } from "@/components/shell/logo";
import { useRouter } from "@/i18n/navigation";
import type { Understanding } from "@/lib/ai/schemas";
import type { SearchWindow } from "@/lib/adapters/types";
import { REGION_CHOICES, type RegionChoice } from "@/lib/region";
import { creditEstimate, DEFAULT_MIN_VIEWS, MIN_VIEWS_CHOICES, WINDOW_CHOICES } from "@/lib/search-settings";
import { findLink, hostOf, resizeImage } from "./image-utils";
import { RegionIcon } from "./region-flag";

const MAX_KEYWORDS = 5;
const PLATFORMS = ["tiktok", "youtube", "instagram"] as const;
type PlatformId = (typeof PLATFORMS)[number];
type Keyword = Understanding["keywords"][number];
export type SavedProduct = { id: string; name: string };

type Sent = { text: string; link: string | null; image: string | null; thumb: string | null; product: SavedProduct | null };
type Phase = "compose" | "thinking" | "plan" | "running" | "error";

/** Chat-style home: one message (text, link, image and/or a saved product) → Reely's understanding + keywords → run. */
export function ResearchChat({
  initialText = "",
  initialRegion = "th",
  autoSend = false,
  products = [],
  initialProductId = null,
}: {
  initialText?: string;
  initialRegion?: RegionChoice;
  autoSend?: boolean;
  products?: SavedProduct[];
  initialProductId?: string | null;
}) {
  const t = useTranslations("chat");
  const locale = useLocale() as "th" | "en";
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<{ full: string; thumb: string } | null>(null);
  const [region, setRegion] = useState<RegionChoice>(initialRegion);
  // TikTok only by default: it is the one platform with saves and shares, and the most on-topic results.
  const [platforms, setPlatforms] = useState<PlatformId[]>(["tiktok"]);
  const [product, setProduct] = useState<SavedProduct | null>(products.find((p) => p.id === initialProductId) ?? null);
  // Trends move fast: 90 days by default, and only videos with real views.
  const [days, setDays] = useState<SearchWindow>(90);
  const [minViews, setMinViews] = useState<number>(DEFAULT_MIN_VIEWS);
  const [phase, setPhase] = useState<Phase>("compose");
  const [sent, setSent] = useState<Sent | null>(null);
  const [plan, setPlan] = useState<(Understanding & { source: "ai" | "sample" }) | null>(null);
  const [keywords, setKeywords] = useState<(Keyword & { on: boolean })[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newExclusion, setNewExclusion] = useState("");
  const [runStep, setRunStep] = useState(0);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const link = findLink(text);
  const selected = keywords.filter((k) => k.on);
  const credits = creditEstimate(platforms, selected.length);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [phase]);

  // Progress steps while the run is working (the server does them in this order).
  useEffect(() => {
    if (phase !== "running") return;
    const timers = [5000, 14000, 22000].map((ms, i) => setTimeout(() => setRunStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10_000_000) return void toast.error(t("errorImage"));
    try {
      const [full, thumb] = await Promise.all([resizeImage(file, 1024, 0.82), resizeImage(file, 160, 0.7)]);
      setImage({ full, thumb });
    } catch {
      toast.error(t("errorImage"));
    }
  }

  function understand(message: Sent, regionChoice: RegionChoice) {
    setPhase("thinking");
    startTransition(async () => {
      const res = await understandAction({
        text: message.text,
        url: message.link ?? "",
        image: message.image,
        region: regionChoice,
        locale,
        productId: message.product?.id ?? null,
      }).catch(() => null);
      if (!res?.ok) {
        setPhase("error");
        return;
      }
      if (res.linkRead === false) toast.info(t("linkFailed"));
      if (res.understanding.source === "sample") toast.info(t("sampleNotice"));
      setPlan(res.understanding);
      setKeywords(res.understanding.keywords.map((k) => ({ ...k, on: true })));
      setExclusions(res.understanding.exclusions);
      setPhase("plan");
    });
  }

  function send(overrideText?: string) {
    const body = (overrideText ?? text).trim();
    const message: Sent = { text: body, link: findLink(body), image: image?.full ?? null, thumb: image?.thumb ?? null, product };
    if (body.length < 3 && !message.link && !message.image && !product) return void toast.error(t("errorEmpty"));
    setSent(message);
    setText("");
    setImage(null);
    understand(message, region);
  }

  useEffect(() => {
    if (autoSend && initialText && !autoSent.current) {
      autoSent.current = true;
      send(initialText);
    }
    // Runs once on mount for "search again" links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchRegion(next: RegionChoice) {
    setRegion(next);
    if (sent) understand(sent, next);
  }

  function addKeyword() {
    const k = newKeyword.trim();
    if (k.length < 2 || keywords.some((x) => x.text === k)) return;
    const on = selected.length < MAX_KEYWORDS;
    setKeywords((ks) => [...ks, { text: k, region: region === "global" ? "global" : "th", on }]);
    setNewKeyword("");
  }

  function toggleKeyword(k: string) {
    setKeywords((ks) =>
      ks.map((x) => (x.text !== k ? x : x.on ? { ...x, on: false } : selected.length < MAX_KEYWORDS ? { ...x, on: true } : x)),
    );
  }

  function addExclusion() {
    const w = newExclusion.trim();
    if (w && !exclusions.includes(w) && exclusions.length < 10) setExclusions((e) => [...e, w]);
    setNewExclusion("");
  }

  function run() {
    if (!sent || !plan || !selected.length) return;
    setRunStep(0);
    setPhase("running");
    startTransition(async () => {
      const res = await runResearchAction({
        text: sent.text,
        url: sent.link ?? "",
        imageThumb: sent.thumb,
        understanding: { productName: plan.productName, whatItIs: plan.whatItIs, audience: plan.audience, reply: plan.reply },
        keywords: selected.map(({ text: k, region: r }) => ({ text: k, region: r })),
        exclusions,
        platforms,
        region,
        settings: { days, minViews },
        productId: sent.product?.id ?? null,
        locale,
      }).catch(() => null);
      if (res?.ok) return router.push(`/app/research/${res.runId}`);
      if (res?.runId) return router.push(`/app/research/${res.runId}`);
      toast.error(t("errorRun"));
      setPhase("plan");
    });
  }

  const platformNames = platforms.map((p) => t(`platform.${p}`)).join(", ");

  const composer = (
    <div className="rounded-3xl border bg-card p-3 shadow-[0_8px_30px_-12px_rgba(86,54,186,0.25)] focus-within:ring-2 focus-within:ring-primary/30">
      {products.length > 0 && (
        // Agent memory: pick a saved product instead of describing it again.
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-xs">
          <span className="text-muted-foreground">{t("useProduct")}</span>
          {products.map((p) => {
            const on = product?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setProduct(on ? null : p)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Package className="size-3" /> {p.name}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!product}
            onClick={() => setProduct(null)}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 transition ${!product ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Plus className="size-3" /> {t("newProduct")}
          </button>
        </div>
      )}
      {image && (
        <div className="mb-2 flex">
          <span className="relative">
            <Image src={image.thumb} alt="" width={64} height={64} unoptimized className="size-16 rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label={t("removeImage")}
              className="absolute -top-1.5 -right-1.5 rounded-full bg-foreground p-0.5 text-background"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        onPaste={(e) => {
          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (file) {
            e.preventDefault();
            void onPickImage(file);
          }
        }}
        placeholder={product ? t("placeholderProduct", { product: product.name }) : t("placeholder")}
        rows={3}
        maxLength={1000}
        className="w-full resize-none bg-transparent px-2 py-1 text-base outline-none placeholder:text-muted-foreground/70"
      />
      {link && (
        <p className="mb-2 ml-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
          <Link2 className="size-3" /> {t("linkDetected", { host: hostOf(link) })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPickImage(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("attach")}
          title={t("attach")}
          className="grid size-9 place-items-center rounded-full border text-muted-foreground hover:bg-muted"
        >
          <ImagePlus className="size-4" />
        </button>
        <RegionPicker value={region} onChange={setRegion} />
        <PlatformPicker value={platforms} onChange={setPlatforms} />
        <button
          type="button"
          onClick={() => send()}
          aria-label={t("send")}
          className="ml-auto grid size-9 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          disabled={phase === "thinking" || phase === "running"}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );

  if (phase === "compose" || !sent) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-3xl flex-col justify-center px-6 py-10">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("greeting")}</h1>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        {composer}
        <p className="mt-2 px-3 text-xs text-muted-foreground">
          <RegionIcon region={region} /> {t(`regionHint.${region}`)}
          {platforms.includes("instagram") && <> · {t("instagramHint")}</>}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(["s1", "s2", "s3"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setText(t(`suggestions.${s}`))} className="chip text-left">
              {t(`suggestions.${s}`)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-3xl flex-col px-6 py-8">
      <div className="flex-1 space-y-6">
        <UserBubble text={sent.text} link={sent.link} thumb={sent.thumb} productName={sent.product?.name ?? null} />

        <ReelyBubble>
          {phase === "thinking" && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t(sent.link ? "thinking.link" : sent.image ? "thinking.image" : "thinking.text")}
            </p>
          )}

          {phase === "error" && (
            <div className="space-y-3">
              <p>{t("errorUnderstand")}</p>
              <button type="button" onClick={() => understand(sent, region)} className="chip">
                <RotateCcw className="size-3.5" /> {t("retry")}
              </button>
            </div>
          )}

          {(phase === "plan" || phase === "running") && plan && (
            <div className="space-y-4">
              <p className="leading-relaxed">{plan.reply}</p>
              <dl className="grid gap-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                <dt className="text-muted-foreground">{t("product")}</dt>
                <dd className="font-medium">
                  {plan.productName}
                  {plan.whatItIs && <span className="font-normal text-muted-foreground"> — {plan.whatItIs}</span>}
                </dd>
                {plan.audience && (
                  <>
                    <dt className="text-muted-foreground">{t("audience")}</dt>
                    <dd>{plan.audience}</dd>
                  </>
                )}
              </dl>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{t("searchFor")}</p>
                  <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <button
                      key={k.text}
                      type="button"
                      disabled={phase === "running"}
                      onClick={() => toggleKeyword(k.text)}
                      className={`chip ${k.on ? "chip-on" : "opacity-60"}`}
                    >
                      {k.on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      <RegionIcon region={k.region} /> {k.text}
                    </button>
                  ))}
                  {phase === "plan" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2">
                      <input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                        placeholder={t("addKeyword")}
                        className="w-32 bg-transparent py-1 text-sm outline-none"
                      />
                      <button type="button" onClick={addKeyword} aria-label={t("addKeyword")}>
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">{t("filterOut")}</p>
                <div className="flex flex-wrap gap-2">
                  {exclusions.map((w) => (
                    <button
                      key={w}
                      type="button"
                      disabled={phase === "running"}
                      onClick={() => setExclusions((e) => e.filter((x) => x !== w))}
                      className="chip border-amber-300 bg-amber-50 text-amber-900"
                    >
                      <X className="size-3.5" /> {w}
                    </button>
                  ))}
                  {phase === "plan" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2">
                      <input
                        value={newExclusion}
                        onChange={(e) => setNewExclusion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
                        placeholder={t("addExclusion")}
                        className="w-40 bg-transparent py-1 text-sm outline-none"
                      />
                    </span>
                  )}
                </div>
              </div>

              {phase === "plan" && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <RegionPicker value={region} onChange={switchRegion} />
                  <PlatformPicker value={platforms} onChange={setPlatforms} />
                  <SettingsPicker days={days} minViews={minViews} onDays={setDays} onMinViews={setMinViews} />
                  <span className="text-xs text-muted-foreground">
                    {credits ? t("credits", { credits }) : t("free")}
                  </span>
                  <button
                    type="button"
                    onClick={run}
                    disabled={!selected.length}
                    className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Search className="size-4" /> {t("find")}
                  </button>
                </div>
              )}
            </div>
          )}
        </ReelyBubble>

        {phase === "running" && (
          <ReelyBubble>
            <p className="font-semibold">{t("running.title")}</p>
            <ol className="mt-3 space-y-2 text-sm">
              {(["s1", "s2", "s3", "s4"] as const).map((s, i) => (
                <li key={s} className={`flex items-center gap-2 ${i > runStep ? "text-muted-foreground/60" : ""}`}>
                  {i < runStep ? (
                    <Check className="size-4 text-primary" />
                  ) : i === runStep ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <span className="size-4 rounded-full border" />
                  )}
                  {t(`running.${s}`, { platforms: platformNames })}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">{t("runningHint")}</p>
          </ReelyBubble>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function UserBubble({
  text,
  link,
  thumb,
  productName = null,
}: {
  text: string;
  link: string | null;
  thumb: string | null;
  productName?: string | null;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2 rounded-3xl rounded-br-md bg-primary/10 px-4 py-3">
        {productName && (
          <p className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            <Package className="size-3" /> {productName}
          </p>
        )}
        {thumb && <Image src={thumb} alt="" width={96} height={96} unoptimized className="size-24 rounded-xl object-cover" />}
        {text && <p className="whitespace-pre-wrap">{text}</p>}
        {link && !text.includes(link) && (
          <p className="inline-flex items-center gap-1 text-sm text-primary">
            <Link2 className="size-3.5" /> {hostOf(link)}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReelyBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-accent">
        <Logo markOnly height={20} />
      </span>
      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-md border bg-card px-5 py-4 shadow-sm">{children}</div>
    </div>
  );
}

function RegionPicker({ value, onChange }: { value: RegionChoice; onChange: (r: RegionChoice) => void }) {
  const t = useTranslations("chat");
  return (
    <div role="radiogroup" className="inline-flex rounded-full bg-muted p-0.5 text-sm">
      {REGION_CHOICES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          title={t(`regionHint.${r}`)}
          onClick={() => onChange(r)}
          className={`rounded-full px-3 py-1.5 transition ${value === r ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <RegionIcon region={r} className="mr-1" />
          {t(`region.${r}`)}
        </button>
      ))}
    </div>
  );
}

/** Before searching: how far back (7 / 30 / 90 days) and the fewest views a result may have. */
function SettingsPicker({
  days,
  minViews,
  onDays,
  onMinViews,
}: {
  days: SearchWindow;
  minViews: number;
  onDays: (d: SearchWindow) => void;
  onMinViews: (n: number) => void;
}) {
  const t = useTranslations("chat");
  const select = "rounded-full border bg-card py-1.5 pr-2 pl-7 text-sm outline-none hover:bg-muted";
  return (
    <div className="inline-flex flex-wrap gap-1">
      <label className="relative" title={t("windowHint")}>
        <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select
          value={days}
          onChange={(e) => onDays(Number(e.target.value) as SearchWindow)}
          className={select}
          aria-label={t("windowLabel")}
        >
          {WINDOW_CHOICES.map((d) => (
            <option key={d} value={d}>
              {t("windowDays", { n: d })}
            </option>
          ))}
        </select>
      </label>
      <label className="relative" title={t("minViewsHint")}>
        <Eye className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select value={minViews} onChange={(e) => onMinViews(Number(e.target.value))} className={select} aria-label={t("minViewsLabel")}>
          {MIN_VIEWS_CHOICES.map((n) => (
            <option key={n} value={n}>
              {t("minViewsN", { n: n / 1000 })}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PlatformPicker({ value, onChange }: { value: PlatformId[]; onChange: (p: PlatformId[]) => void }) {
  const t = useTranslations("chat");
  return (
    <div className="inline-flex flex-wrap gap-1">
      {PLATFORMS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            title={p === "instagram" ? t("instagramHint") : undefined}
            onClick={() => onChange(on ? (value.length > 1 ? value.filter((x) => x !== p) : value) : [...value, p])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            <PlatformIcon platform={p} className={`size-4 ${on ? "" : "opacity-50 grayscale"}`} />
            {t(`platform.${p}`)}
          </button>
        );
      })}
    </div>
  );
}
