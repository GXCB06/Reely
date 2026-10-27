"use client";

import {
  ArrowUp,
  CalendarDays,
  Check,
  Eye,
  ImagePlus,
  Languages,
  Link2,
  Loader2,
  Package,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { enhanceBriefAction, runResearchAction } from "@/app/[locale]/app/research/actions";
import { importClipAction } from "@/app/[locale]/app/video/import-actions";
import { PlatformIcon } from "@/components/platform-icon";
import { Mascot } from "@/components/mascot";
import { useRouter } from "@/i18n/navigation";
import type { PlanDraft, Understanding } from "@/lib/ai/schemas";
import type { SearchWindow } from "@/lib/adapters/types";
import { parseClipLink } from "@/lib/clip-link";
import { GOALS, type Goal } from "@/lib/goals";
import { REGION_CHOICES, type RegionChoice } from "@/lib/region";
import {
  type ContentLanguage,
  creditEstimate,
  DEFAULT_MIN_VIEWS,
  LANGUAGE_CHOICES,
  MIN_VIEWS_CHOICES,
  RESEARCHES_PER_DAY,
  WINDOW_CHOICES,
} from "@/lib/search-settings";
import { findLink, hostOf, resizeImage } from "./image-utils";
import { streamPlan } from "./plan-stream";
import { RegionIcon } from "./region-flag";
import { ResearchStory } from "./research-story";

const MAX_KEYWORDS = 5;
const PLATFORMS = ["tiktok", "youtube", "instagram"] as const;
export type PlatformId = (typeof PLATFORMS)[number];
/** The platforms a user last searched, remembered per browser (someone who works from Reels keeps Reels on). */
const PLATFORMS_KEY = "reely.platforms";

function rememberedPlatforms(): PlatformId[] | null {
  try {
    const list = JSON.parse(localStorage.getItem(PLATFORMS_KEY) ?? "null");
    const valid = Array.isArray(list) ? PLATFORMS.filter((p) => list.includes(p)) : [];
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}
type Keyword = Understanding["keywords"][number];
export type SavedProduct = { id: string; name: string; goal?: Goal | null };
/** Where the goal came from: the user picked it, the saved product remembers it, or (null) the AI will guess. */
type GoalFrom = "user" | "product" | null;

type Sent = { text: string; link: string | null; image: string | null; thumb: string | null; product: SavedProduct | null };
type Phase = "compose" | "thinking" | "plan" | "running" | "error";

/** Chat-style home: one message (text, link, image and/or a saved product) → Reely's understanding + keywords → run. */
export function ResearchChat({
  initialText = "",
  initialRegion = "th",
  autoSend = false,
  products = [],
  initialProductId = null,
  initialPlatforms = null,
  researchesLeft = null,
  dashboard = null,
}: {
  initialText?: string;
  initialRegion?: RegionChoice;
  autoSend?: boolean;
  products?: SavedProduct[];
  initialProductId?: string | null;
  /** Platforms set by the link (e.g. "find more like this Reel"); otherwise the last ones this browser used. */
  initialPlatforms?: PlatformId[] | null;
  /** Researches left today (null = no cap). */
  researchesLeft?: number | null;
  /** Home dashboard shown under the composer until a message is sent (server-rendered, streamed). */
  dashboard?: React.ReactNode;
}) {
  const t = useTranslations("chat");
  const tg = useTranslations("goals");
  const locale = useLocale() as "th" | "en";
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<{ full: string; thumb: string } | null>(null);
  const [region, setRegion] = useState<RegionChoice>(initialRegion);
  // TikTok + Shorts by default (Shorts costs no credits). Reels stay optional: they cost credits and
  // Instagram's search only works in English. A user who turned Reels on keeps them on (remembered per browser).
  const [platforms, setPlatforms] = useState<PlatformId[]>(initialPlatforms ?? ["tiktok", "youtube"]);
  const [product, setProduct] = useState<SavedProduct | null>(products.find((p) => p.id === initialProductId) ?? null);
  // What the clips are for: steers keywords, filtering, ranking and the idea under each clip.
  const [goal, setGoal] = useState<Goal | null>(product?.goal ?? null);
  const [goalFrom, setGoalFrom] = useState<GoalFrom>(product?.goal ? "product" : null);
  const [replanning, setReplanning] = useState(false);
  // Trends move fast: 90 days by default, and only videos with real views.
  const [days, setDays] = useState<SearchWindow>(90);
  const [minViews, setMinViews] = useState<number>(DEFAULT_MIN_VIEWS);
  const [language, setLanguage] = useState<ContentLanguage>("any");
  const [phase, setPhase] = useState<Phase>("compose");
  const [sent, setSent] = useState<Sent | null>(null);
  const [plan, setPlan] = useState<(Understanding & { source: "ai" | "sample" }) | null>(null);
  // The plan as it streams in (shown read-only until it is finished).
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  // Each plan request gets a number, so events from an older request (before a goal or region switch) are ignored.
  const planRequest = useRef(0);
  const [keywords, setKeywords] = useState<(Keyword & { on: boolean })[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newExclusion, setNewExclusion] = useState("");
  // "Enhance": which of the 4 parts of a good brief the text covers (set by the AI after enhancing).
  const [covered, setCovered] = useState<Record<"topic" | "audience" | "angle" | "avoid", boolean> | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  // A pasted Reel / TikTok link opens that clip's page instead of planning a research.
  const [opening, setOpening] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const link = findLink(text);
  const clip = parseClipLink(text);
  const selected = keywords.filter((k) => k.on);
  const credits = creditEstimate(platforms, selected.length);
  // While the plan streams in, show the draft with everything disabled; then the finished plan.
  const drafting = phase === "thinking" && draft !== null;
  const view: PlanDraft | null = drafting ? draft : phase === "plan" || phase === "running" ? plan : null;
  const viewKeywords =
    drafting && draft
      ? (draft.keywords ?? []).filter((k) => k?.text).map((k) => ({ text: k.text!, region: k.region ?? "th", on: true }))
      : keywords;
  const viewExclusions = drafting && draft ? (draft.exclusions ?? []).filter((w): w is string => !!w) : exclusions;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  function understand(message: Sent, regionChoice: RegionChoice, goalChoice: Goal | null = goal) {
    const id = ++planRequest.current;
    setPhase("thinking");
    setDraft(null);
    let finished = false;
    streamPlan(
      {
        text: message.text,
        url: message.link ?? "",
        image: message.image,
        region: regionChoice,
        locale,
        productId: message.product?.id ?? null,
        goal: goalChoice,
        english: platforms.includes("instagram"),
      },
      (event) => {
        if (id !== planRequest.current) return;
        if (event.type === "draft") return setDraft(event.plan);
        finished = true;
        setReplanning(false);
        setDraft(null);
        if (event.type === "error") return setPhase("error");
        const u = event.understanding;
        if (event.linkRead === false) toast.info(t("linkFailed"));
        if (u.source === "sample") toast.info(t("sampleNotice"));
        setPlan(u);
        setGoal(u.goal);
        setKeywords(u.keywords.map((k) => ({ ...k, on: true })));
        setExclusions(u.exclusions);
        setPhase("plan");
      },
    )
      .catch(() => {})
      .finally(() => {
        if (finished || id !== planRequest.current) return;
        setReplanning(false);
        setDraft(null);
        setPhase("error");
      });
  }

  function openClip(body: string) {
    setOpening(true);
    const toastId = toast.loading(t("clip.reading"));
    importClipAction(body)
      .then((res) => {
        if (!res.ok) throw new Error(res.error);
        toast.dismiss(toastId);
        router.push(`/app/video/${res.videoId}?lookup=1${product ? `&product=${product.id}` : ""}`);
      })
      .catch((e: Error) => {
        toast.error(t(`clip.${["notFound", "limit"].includes(e.message) ? e.message : "failed"}`), { id: toastId });
        setOpening(false);
      });
  }

  function send(overrideText?: string) {
    const body = (overrideText ?? text).trim();
    if (parseClipLink(body)) return openClip(body);
    const message: Sent = { text: body, link: findLink(body), image: image?.full ?? null, thumb: image?.thumb ?? null, product };
    if (body.length < 3 && !message.link && !message.image && !product) return void toast.error(t("errorEmpty"));
    setSent(message);
    setText("");
    setImage(null);
    understand(message, region);
  }

  useEffect(() => {
    const remembered = initialPlatforms ? null : rememberedPlatforms();
    // Read after mount: the server has no browser storage, so the first render must match the default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered) setPlatforms(remembered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choosePlatforms(next: PlatformId[]) {
    setPlatforms(next);
    try {
      localStorage.setItem(PLATFORMS_KEY, JSON.stringify(next));
    } catch {
      // Private window or blocked storage: the choice just isn't remembered.
    }
  }

  useEffect(() => {
    if (autoSend && initialText && !autoSent.current) {
      autoSent.current = true;
      send(initialText);
    }
    // Runs once on mount for "search again" links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickProduct(p: SavedProduct | null) {
    setProduct(p);
    if (p?.goal) {
      setGoal(p.goal);
      setGoalFrom("product");
    } else if (goalFrom === "product") {
      setGoal(null);
      setGoalFrom(null);
    }
  }

  function pickGoal(next: Goal | null) {
    setGoal(next);
    setGoalFrom(next ? "user" : null);
  }

  /** Changing the goal after the plan re-plans the keywords for it (one AI call, no credits). */
  function switchGoal(next: Goal) {
    if (!sent || next === plan?.goal) return;
    pickGoal(next);
    setReplanning(true);
    understand(sent, region, next);
  }

  function switchRegion(next: RegionChoice) {
    setRegion(next);
    if (sent) understand(sent, next);
  }

  function addKeyword() {
    const k = newKeyword.trim();
    if (k.length < 2 || keywords.some((x) => x.text === k)) return;
    const on = selected.length < MAX_KEYWORDS;
    setKeywords((ks) => [...ks, { text: k, region: region === "global" ? "global" : "th", english: region === "global" ? k : undefined, on }]);
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
    setPhase("running");
    startTransition(async () => {
      const res = await runResearchAction({
        text: sent.text,
        url: sent.link ?? "",
        imageThumb: sent.thumb,
        understanding: {
          productName: plan.productName,
          whatItIs: plan.whatItIs,
          audience: plan.audience,
          reply: plan.reply,
          competitors: plan.competitors ?? [],
        },
        keywords: selected.map(({ text: k, region: r, english }) => ({ text: k, region: r, english })),
        exclusions,
        platforms,
        region,
        goal: plan.goal,
        settings: { days, minViews, language },
        productId: sent.product?.id ?? null,
        locale,
      }).catch(() => null);
      if (res?.ok) return router.push(`/app/research/${res.runId}`);
      if (res?.runId) return router.push(`/app/research/${res.runId}`);
      toast.error(res?.error === "limit" ? t("errorLimit", { n: RESEARCHES_PER_DAY }) : t("errorRun"));
      setPhase("plan");
    });
  }


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
                onClick={() => pickProduct(on ? null : p)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Package className="size-3" /> {p.name}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!product}
            onClick={() => pickProduct(null)}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 transition ${!product ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Plus className="size-3" /> {t("newProduct")}
          </button>
        </div>
      )}
      {products.length > 0 && <GoalPicker value={goal} onChange={pickGoal} />}
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
      {text.trim().length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-xs">
          {(["topic", "audience", "angle", "avoid"] as const).map((k) => (
            <span
              key={k}
              title={t(`brief.${k}Hint`)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${covered?.[k] ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}
            >
              {covered?.[k] ? <Check className="size-3" /> : <span className="size-2 rounded-full border border-current" />}
              {t(`brief.${k}`)}
            </span>
          ))}
          {!covered && <span className="text-muted-foreground">{t("brief.tip")}</span>}
        </div>
      )}
      {link && (
        <p className="mb-2 ml-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
          <Link2 className="size-3" /> {clip ? t("clip.detected") : t("linkDetected", { host: hostOf(link) })}
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
        <button
          type="button"
          disabled={enhancing || text.trim().length < 3}
          onClick={async () => {
            setEnhancing(true);
            const res = await enhanceBriefAction(text, locale).catch(() => null);
            setEnhancing(false);
            if (!res?.ok) return void toast.error(t("brief.failed"));
            setText(res.brief);
            setCovered(res.covered);
          }}
          title={t("brief.enhanceHint")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          {enhancing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("brief.enhance")}
        </button>
        <RegionPicker value={region} onChange={setRegion} />
        <PlatformPicker value={platforms} onChange={choosePlatforms} />
        <button
          type="button"
          onClick={() => send()}
          aria-label={t("send")}
          className="ml-auto grid size-9 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          disabled={phase === "thinking" || phase === "running" || opening}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );

  if (phase === "compose" || !sent) {
    return (
      <div className={dashboard ? "mx-auto max-w-6xl px-6 pt-14 pb-16" : "mx-auto flex min-h-[calc(100dvh-1rem)] max-w-3xl flex-col justify-center px-6 py-10"}>
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 text-center">
            <Mascot size={84} className="mx-auto mb-4" />
            <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("greeting")}</h1>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{t("subtitle")}</p>
          </div>
          {products.length === 0 && <GoalCards value={goal} onChange={pickGoal} />}
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
        {dashboard && <div className="mt-12">{dashboard}</div>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-3xl flex-col px-6 py-8">
      <div className="flex-1 space-y-6">
        <UserBubble text={sent.text} link={sent.link} thumb={sent.thumb} productName={sent.product?.name ?? null} />

        <ReelyBubble>
          {phase === "thinking" && !drafting && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {replanning ? t("goalReplanning") : t(sent.link ? "thinking.link" : sent.image ? "thinking.image" : "thinking.text")}
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

          {view && (
            <div className="space-y-4">
              {view.reply && <p className="leading-relaxed">{view.reply}</p>}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="mb-2 text-sm font-semibold">{t("goalLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {GOALS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={phase !== "plan"}
                      aria-pressed={view.goal === g}
                      onClick={() => switchGoal(g)}
                      className={`chip ${view.goal === g ? "chip-on" : "bg-card"}`}
                    >
                      <GoalIcon goal={g} /> {tg(`${g}.label`)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {view.goal && tg(`${view.goal}.desc`)}
                  {goalFrom !== "user" && <> · {t(goalFrom === "product" ? "goalRemembered" : "goalGuessed")}</>}
                </p>
              </div>
              {view.productName && (
                <dl className="grid gap-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="text-muted-foreground">{t("product")}</dt>
                  <dd className="font-medium">
                    {view.productName}
                    {view.whatItIs && <span className="font-normal text-muted-foreground"> — {view.whatItIs}</span>}
                  </dd>
                  {view.audience && (
                    <>
                      <dt className="text-muted-foreground">{t("audience")}</dt>
                      <dd>{view.audience}</dd>
                    </>
                  )}
                  {(view.competitors?.length ?? 0) > 0 && (
                    <>
                      <dt className="text-muted-foreground">{t("competitors")}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {view.competitors!.filter(Boolean).map((c) => (
                          <span key={c} className="rounded-full bg-card px-2 py-0.5 text-xs ring-1 ring-border">
                            {c}
                          </span>
                        ))}
                      </dd>
                    </>
                  )}
                </dl>
              )}

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{t("searchFor")}</p>
                  <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {viewKeywords.map((k) => (
                    <button
                      key={k.text}
                      type="button"
                      disabled={phase !== "plan"}
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
                  {viewExclusions.map((w) => (
                    <button
                      key={w}
                      type="button"
                      disabled={phase !== "plan"}
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

              {drafting && (
                <p className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> {t("drafting")}
                </p>
              )}
              {phase === "plan" && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <RegionPicker value={region} onChange={switchRegion} />
                  <PlatformPicker value={platforms} onChange={choosePlatforms} />
                  <SettingsPicker
                    days={days}
                    minViews={minViews}
                    language={language}
                    onDays={setDays}
                    onMinViews={setMinViews}
                    onLanguage={setLanguage}
                  />
                  <span className="text-xs text-muted-foreground">
                    {credits ? t("credits", { credits }) : t("free")}
                    {researchesLeft !== null && <> · {t("researchesLeft", { n: researchesLeft, max: RESEARCHES_PER_DAY })}</>}
                  </span>
                  <button
                    type="button"
                    onClick={run}
                    disabled={!selected.length || researchesLeft === 0}
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
          <ResearchStory
            brief={sent.text || plan?.whatItIs || ""}
            keywords={selected.map((k) => k.text)}
            exclusions={exclusions}
            platforms={platforms}
          />
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
      <Mascot size={32} className="mt-1" />
      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-md border bg-card px-5 py-4 shadow-sm">{children}</div>
    </div>
  );
}

const GOAL_ICON = { sell: ShoppingBag, shop: Store, startup: Rocket, brand: UserRound } as const;

function GoalIcon({ goal, className = "size-3.5" }: { goal: Goal; className?: string }) {
  const Icon = GOAL_ICON[goal];
  return <Icon className={className} />;
}

/** Composer row (returning users): what the clips are for; tap again to let Reely guess. */
function GoalPicker({ value, onChange }: { value: Goal | null; onChange: (g: Goal | null) => void }) {
  const t = useTranslations("chat");
  const tg = useTranslations("goals");
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-xs">
      <span className="text-muted-foreground">{t("goalLabel")}</span>
      {GOALS.map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            aria-pressed={on}
            title={tg(`${g}.desc`)}
            onClick={() => onChange(on ? null : g)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <GoalIcon goal={g} className="size-3" /> {tg(`${g}.short`)}
          </button>
        );
      })}
      {!value && <span className="text-muted-foreground/80">{t("goalAuto")}</span>}
    </div>
  );
}

/** First visit (no saved products yet): "What do you want the clips for?" as 4 cards above the composer. */
function GoalCards({ value, onChange }: { value: Goal | null; onChange: (g: Goal | null) => void }) {
  const t = useTranslations("chat");
  const tg = useTranslations("goals");
  return (
    <div className="mb-4">
      <p className="mb-2 text-center text-sm font-semibold">
        {t("goalQuestion")} <span className="font-normal text-muted-foreground">· {t("goalAuto")}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GOALS.map((g) => {
          const on = value === g;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : g)}
              className={`rounded-2xl border p-3 text-left transition ${on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "bg-card hover:border-primary/40"}`}
            >
              <span className={`grid size-8 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-accent text-primary"}`}>
                <GoalIcon goal={g} className="size-4" />
              </span>
              <span className="mt-2 block text-sm font-semibold">{tg(`${g}.label`)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{tg(`${g}.desc`)}</span>
            </button>
          );
        })}
      </div>
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
  language,
  onDays,
  onMinViews,
  onLanguage,
}: {
  days: SearchWindow;
  minViews: number;
  language: ContentLanguage;
  onDays: (d: SearchWindow) => void;
  onMinViews: (n: number) => void;
  onLanguage: (l: ContentLanguage) => void;
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
      <label className="relative" title={t("languageHint")}>
        <Languages className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select value={language} onChange={(e) => onLanguage(e.target.value as ContentLanguage)} className={select} aria-label={t("languageLabel")}>
          {LANGUAGE_CHOICES.map((l) => (
            <option key={l} value={l}>
              {t(`language.${l}`)}
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
