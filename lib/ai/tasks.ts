import "server-only";
import { generateText, Output, streamText } from "ai";
import type { Feedback } from "@/lib/feedback";
import type { Goal } from "@/lib/goals";
import type { LinkPreview } from "@/lib/link-preview";
import { firstSeconds, type Segment } from "@/lib/transcript";
import { keywordRegions, type RegionChoice } from "@/lib/region";
import { formatMultiplier } from "@/lib/scoring";
import { aiCallOptions, getModel, languageName } from "./model";
import {
  MAX_KEYWORDS,
  planSchema,
  type ResearchPlan,
  relevanceSchema,
  type RunSummary,
  runSummarySchema,
  type FormatDescription,
  formatMatchSchema,
  formatSchema,
  type Enhanced,
  enhanceSchema,
  type Script,
  type HookBreakdown,
  hookBreakdownSchema,
  clipIdeasSchema,
  todaySchema,
  scriptSchema,
  englishKeywordsSchema,
  type PlanDraft,
  planOutputSchema,
  type Understanding,
  type VideoAnalysis,
  videoAnalysisSchema,
} from "./schemas";

// Every task falls back to deterministic sample output when Gemini is not configured or fails,
// so the app keeps working (and costs nothing) during development.

export async function suggestPlan(brief: string): Promise<ResearchPlan & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const { output } = await generateText({
        ...aiCallOptions(),
        model,
        output: Output.object({ schema: planSchema }),
        prompt: [
          "You plan short-form video research on TikTok and YouTube Shorts.",
          `From the brief below, write ${MAX_KEYWORDS} search phrases people actually type or use as hashtags,`,
          "2-4 words each, specific to the niche. Use the language the target audience posts in",
          "(Thai phrases for a Thai audience; mix in English product terms if natural).",
          "Also list single words to exclude that would bring off-topic videos.",
          `Brief:\n${brief}`,
        ].join("\n"),
      });
      return { ...output, source: "ai" };
    } catch (e) {
      console.warn("[ai] suggestPlan failed, using sample", (e as Error).message);
    }
  }
  const parts = brief
    .split(/[,\n،、]|\band\b|และ/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const keywords = [...new Set(parts.length ? parts : [brief.trim()])].slice(0, MAX_KEYWORDS).map((k) => k.slice(0, 80));
  return { keywords, exclusions: [], source: "sample" };
}

export type ProductMessage = {
  text: string;
  link: LinkPreview | null;
  /** Data URL of a resized product screenshot or photo. */
  image: string | null;
  region: RegionChoice;
  /** What the clips are for, when the user picked it (or the saved product remembers it); otherwise AI decides. */
  goal?: Goal | null;
  /** A product the user saved earlier ("agent memory"); the text then refines what to look for. */
  saved?: {
    name: string;
    url: string | null;
    description: string | null;
    audience: string | null;
    competitors?: string[] | null;
  } | null;
};

/** "The user …": what each goal wants from the clips (used in every prompt). */
const GOAL_BRIEF: Record<Goal, string> = {
  sell: "sells products (as an affiliate or on TikTok Shop) and wants videos that make people BUY a product like this",
  shop: "runs a shop or local business and wants videos that bring customers IN (to the shop, cafe, clinic or service)",
  startup: "builds a startup (app, SaaS or AI tool) and wants videos that make a product FEATURE go viral",
  brand: "is building a personal brand and wants videos that grow FOLLOWERS in their niche",
};

/** Keyword recipe per goal (5 phrases). Each finds the kind of viral video that goal can reuse. */
const GOAL_KEYWORDS: Record<Goal, string[]> = {
  sell: [
    "- 2 phrases for the product type the way buyers search before buying: reviews, unboxings, 'ป้ายยา', 'ของมันต้องมี',",
    "  'รีวิว<type>', '<type> review', 'tiktok made me buy it'.",
    "- 1 phrase naming or comparing real competing products or brands (full real names only; list them in competitors).",
    "- 2 phrases for the problem the product fixes or the result it promises, as buyers say it (for a serum: 'หน้าใส', 'acne scar').",
  ],
  shop: [
    "- 2 phrases for this kind of business promoting itself: 'ร้าน<type>', 'เปิดร้าน<type>', 'เจ้าของร้าน<type>', 'small business <type>'.",
    "- 1 phrase for behind-the-scenes or owner stories ('เบื้องหลังร้าน<type>', 'day in the life <type> owner').",
    "- 2 phrases customers search: reviews of places like it, menu or service reveals, 'POV ลูกค้า', promotions, the area if given.",
  ],
  startup: [
    "- 2 phrases for the everyday work pain or situation the product solves, as the audience says it (for accounting",
    "  software: 'ปิดงบสิ้นเดือน', 'ทำบัญชีเอง', 'month end close'). People watch the pain, not the software.",
    "- 1 phrase naming a real competitor or well-known similar tool the way people search it ('<brand> รีวิว', 'สอนใช้ <brand>',",
    "  '<brand> review'). Full real names only (never guess); list them in competitors.",
    "- 1 phrase for tools or AI that do this job ('AI ทำบัญชี', 'AI tool for <job>').",
    "- 1 how-to topic this audience searches all the time inside the product's field (for accounting: 'ยื่นภาษีออนไลน์').",
  ],
  brand: [
    "- 3 phrases for the hottest topics in the niche, as viewers search them.",
    "- 1 tips or how-to phrase in the niche.",
    "- 1 story, opinion or 'day in the life' phrase in the niche.",
  ],
};

/** What a video must be about to count as clearly relevant (score 2) for each goal. */
const GOAL_RELEVANCE: Record<Goal, string> = {
  sell: "The user sells this kind of product: 2 also covers videos that review, demo, unbox, compare or sell a similar product (any brand).",
  shop: "The user runs this kind of business: 2 also covers videos where a similar business promotes itself, shows behind the scenes, or customers show their visit.",
  startup: "The user wants to promote a product feature: 2 also covers videos about the exact work pain or situation the product solves (skits, rants, how-tos), even when no product is shown.",
  brand: "The user is a creator in this niche: 2 covers videos on the niche's topics; 1 covers adjacent topics the same viewers watch.",
};

/** Scripts and ideas get posted as-is, so they must not promise results nobody measured. */
const NO_MADE_UP_NUMBERS =
  "Never invent numbers about the product (percentages, time or money saved, prices, user counts, ratings) unless the description states them; say it in words instead (e.g. 'much faster').";

/** What the per-clip idea should achieve for each goal. */
const GOAL_ACTION: Record<Goal, string> = {
  sell: "get viewers to buy it (end on the TikTok Shop basket or link)",
  shop: "bring customers to their shop or business",
  startup: "show off one feature that solves the pain in the video",
  brand: "grow followers with their own take",
};

/** Script structure per goal: beats in order, and what each must do. */
const GOAL_BEATS: Record<Goal, string[]> = {
  sell: [
    "Beats in order: hook, demo, proof, cta.",
    "hook: the problem or the result, in the first second. demo: the product in someone's hands, close up, doing its job.",
    "proof: before/after, a result, a comparison or a real reaction. cta: tap the TikTok Shop basket (ตะกร้า) or link, with a reason to buy now.",
  ],
  shop: [
    "Beats in order: hook, story, offer, cta.",
    "story: behind the scenes, or the owner saying what makes the place special. offer: one menu item, service, price or promotion.",
    "cta: come visit: where it is, opening hours or how to book.",
  ],
  startup: [
    "Beats in order: pain, feature, result, cta.",
    "pain: a relatable moment of the everyday work pain the product solves (this is the hook). feature: ONE feature that fixes it, shown",
    "on screen. result: the time or money saved, before/after. cta: try it free, link in bio.",
  ],
  brand: [
    "Beats in order: hook, story, takeaway, cta.",
    "story: the creator's own experience or opinion. takeaway: one useful tip viewers will save. cta: follow for more on the niche.",
  ],
};

/** What the formulas on a research should look like for each goal. */
const GOAL_FORMULAS: Record<Goal, string> = {
  sell: "Formulas that SELL: demos, before/after, unboxings, comparisons, honest reviews; each idea ends with a reason to tap the Shop basket.",
  shop: "Formulas that bring customers IN: owner stories, behind the scenes, menu or service reveals, customer reactions, an offer plus where to find the place.",
  startup: "Formulas that promote ONE feature: a pain skit then the fix, a screen-recorded demo, a founder talking head, myth-busting; each idea names the feature it shows.",
  brand: "Formulas that grow FOLLOWERS: strong talking-head hooks, stories, tip lists, opinions; each idea ends with a reason to follow.",
};

/** What to look for when picking Today's videos for each goal. */
const GOAL_TODAY: Record<Goal, string> = {
  sell: "Prefer videos that sell a product (Shop links, demos, reviews).",
  shop: "Prefer videos a small local business could film in its own place.",
  startup: "Prefer videos about the work pain the product solves, or tool demos in its field.",
  brand: "Prefer videos where one creator's hook or story carried the video.",
};

function goalPlan(goal: Goal | null | undefined): string[] {
  if (goal) return [`The user ${GOAL_BRIEF[goal]}. Set goal to "${goal}". Keywords (${MAX_KEYWORDS}):`, ...GOAL_KEYWORDS[goal]];
  return [
    "First decide goal: what the user most likely wants the clips for, from their words, the product and the link:",
    ...(Object.keys(GOAL_BRIEF) as Goal[]).map((g) => `- ${g}: the user ${GOAL_BRIEF[g]}`),
    `Then write ${MAX_KEYWORDS} keywords with the recipe for that goal:`,
    ...(Object.keys(GOAL_KEYWORDS) as Goal[]).flatMap((g) => [`If ${g}:`, ...GOAL_KEYWORDS[g]]),
  ];
}

const REGION_RULE: Record<RegionChoice, string> = {
  th: `All ${MAX_KEYWORDS} phrases in Thai (region "th"), as Thai creators would type them; English product terms are fine inside.`,
  global: `All ${MAX_KEYWORDS} phrases in English (region "global"), as creators worldwide would type them.`,
  both: `3 phrases in Thai (region "th") then 2 in English (region "global").`,
};

/**
 * Chat home, step 1: reads the user's description, product page and/or image, then plans the search. `onDraft`
 * gets the plan as it streams in (a saved product's details at once, then the reply, then keywords one by one).
 * The AI only writes what is not known yet: a saved product's name, description, audience and competitors come
 * from memory, and keywords get English versions only when Reels is on (`english`). Keyword regions are forced
 * to match the region choice, whatever the model returns.
 */
export async function understandProduct(
  msg: ProductMessage & { english?: boolean },
  locale: string,
  onDraft?: (draft: PlanDraft) => void,
): Promise<Understanding & { source: "ai" | "sample" }> {
  const known = msg.saved
    ? { productName: msg.saved.name, whatItIs: msg.saved.description ?? "", audience: msg.saved.audience ?? "" }
    : null;
  const knownCompetitors = msg.saved?.competitors?.length ? msg.saved.competitors : null;
  const draftOf = (partial: PlanDraft, count = MAX_KEYWORDS): PlanDraft => {
    const regions = keywordRegions(msg.region, count);
    return {
      ...partial,
      ...known,
      ...(knownCompetitors ? { competitors: knownCompetitors } : {}),
      goal: msg.goal ?? partial.goal,
      keywords: partial.keywords?.map((k, i) => ({ ...k, region: regions[i] ?? k.region })),
    };
  };

  const model = getModel();
  if (model) {
    try {
      if (known) onDraft?.(draftOf({}));
      const prompt = [
        "You are Reely, a research assistant that finds viral short-form videos (TikTok, YouTube Shorts,",
        "Instagram Reels) a user can turn into their own content. Work out what the product is from everything below,",
        `then plan the search. Write ${known ? "reply" : "reply, productName, whatItIs and audience"} in ${languageName(locale)}.`,
        "In reply, say in a few words what you think they want the clips for and what kind of videos you will look for.",
        `Keywords: search phrases, 2-4 words each, that people actually type or use as hashtags. ${REGION_RULE[msg.region]}`,
        "Avoid broad or ambiguous phrases that also name unrelated things (e.g. a university faculty, a",
        "celebrity, a TV show): every phrase should still clearly point at the product's topic.",
        ...goalPlan(msg.goal),
        knownCompetitors ? "" : "competitors: real brand names only (never guess).",
        "Exclusions: single words that would bring off-topic videos. Never exclude a word that is part of the",
        "product's own topic or its audience's everyday work (e.g. for accounting software never exclude tax,",
        "finance, ภาษี or การเงิน); exclude only clearly different subjects (e.g. stocks, crypto, gaming).",
        "",
        msg.saved
          ? `Their saved product: ${msg.saved.name} — ${msg.saved.description ?? ""}. Audience: ${msg.saved.audience ?? ""}. Link: ${msg.saved.url ?? ""}.` +
            (knownCompetitors ? ` Competitors: ${knownCompetitors.join(", ")}.` : "")
          : "",
        msg.text
          ? `The user wrote${msg.saved ? " (what to look for this time)" : ""}:\n${msg.text}`
          : msg.saved
            ? "The user wrote nothing extra; plan a broad search for the saved product."
            : "The user wrote nothing; rely on the link and/or image.",
        msg.link
          ? `
Their product page (${msg.link.url}):
Title: ${msg.link.title ?? ""}
Description: ${msg.link.description ?? ""}
Text: ${msg.link.text.slice(0, 2000)}`
          : "",
        msg.image ? "\nThey also attached an image of the product (below)." : "",
      ].join("\n");
      const imageData = msg.image?.split(",")[1];
      const mediaType = msg.image?.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg";
      const result = streamText({
        // Gemini can take 20-30 s for a full plan; a timeout falls back to much weaker sample keywords, so this
        // step gets more time than the others.
        ...aiCallOptions(45_000),
        model,
        output: Output.object({
          schema: planOutputSchema({ knownProduct: !!known, knownCompetitors: !!knownCompetitors, english: !!msg.english }),
        }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...(imageData ? [{ type: "file" as const, mediaType, data: imageData }] : []),
            ],
          },
        ],
      });
      for await (const partial of result.partialOutputStream) onDraft?.(draftOf(partial as PlanDraft));
      const output = (await result.output) as PlanDraft;
      const plan = draftOf(output, output.keywords?.length ?? 0);
      return {
        goal: plan.goal ?? "startup",
        reply: plan.reply ?? "",
        keywords: (plan.keywords ?? [])
          .filter((k) => k.text)
          .map((k) => ({ text: k.text!, region: k.region ?? "th", ...(k.english ? { english: k.english } : {}) })),
        exclusions: (plan.exclusions ?? []).filter((w): w is string => !!w),
        competitors: (plan.competitors ?? []).filter((c): c is string => !!c),
        productName: plan.productName ?? "",
        whatItIs: plan.whatItIs ?? "",
        audience: plan.audience ?? "",
        source: "ai",
      };
    } catch (e) {
      console.warn("[ai] understandProduct failed, using sample", (e as Error).message);
    }
  }
  const th = locale !== "en";
  const base = msg.text || msg.saved?.name || msg.link?.title || (th ? "สินค้าของคุณ" : "your product");
  const plan = await suggestPlan(base.length >= 2 ? base : `${base} product`);
  const regions = keywordRegions(msg.region, plan.keywords.length);
  const name =
    msg.saved?.name ??
    ((msg.link?.title ?? msg.text).split(/[|\-–—\n,]/)[0].trim().slice(0, 80) || (th ? "สินค้าของคุณ" : "Your product"));
  return {
    goal: msg.goal ?? "startup",
    productName: name,
    whatItIs: msg.saved?.description ?? msg.link?.description ?? msg.text.slice(0, 300),
    audience: msg.saved?.audience ?? "",
    reply: th
      ? "นี่คือคีย์เวิร์ดตัวอย่าง (ยังไม่ได้ใช้ AI) แก้ไขได้ก่อนกดค้นหา"
      : "These are sample keywords (AI is off). Edit them before you search.",
    keywords: plan.keywords.map((text, i) => ({ text, region: regions[i], english: text })),
    exclusions: plan.exclusions,
    competitors: msg.saved?.competitors ?? [],
    source: "sample",
  };
}

/** English versions of keywords, for Instagram (its search only understands English). Null when AI is unavailable. */
export async function englishKeywords(phrases: string[]): Promise<string[] | null> {
  const model = getModel();
  if (!model || !phrases.length) return null;
  try {
    const { output } = await generateText({
      ...aiCallOptions(),
      model,
      output: Output.object({ schema: englishKeywordsSchema }),
      prompt: [
        "Translate each short-video search phrase into the natural English phrase people would search on Instagram.",
        "Keep brand names. Return one phrase per line, in the same order.",
        ...phrases.map((p, i) => `${i} | ${p}`),
      ].join("\n"),
    });
    return phrases.map((p, i) => output.english[i]?.trim() || p);
  } catch (e) {
    console.warn("[ai] englishKeywords failed", (e as Error).message);
    return null;
  }
}

export type ProductBrief = { name: string; whatItIs: string; audience: string };

const RELEVANCE_BATCH = 80;

/**
 * Rates each search result 0-2 for relevance to the product, and 0-2 for how easily a small business could film a
 * similar clip with a phone, from its caption (one Gemini call per 80 videos, run in parallel). Returns null when
 * AI is unavailable or fails, so callers keep everything.
 */
export async function rateRelevance(
  product: ProductBrief,
  videos: { caption: string; creatorHandle: string }[],
  goal?: Goal | null,
  examples?: Feedback["examples"] | null,
): Promise<{ scores: number[]; copy: (number | null)[] } | null> {
  // The user's own 👍/👎 for this product: the clearest signal of what "relevant" means to them.
  const example = (c: { creatorHandle: string; caption: string }) => `- @${c.creatorHandle} | ${c.caption.slice(0, 120).replace(/\s+/g, " ")}`;
  const taught = [
    ...(examples?.liked.length
      ? ["The user marked these clips USEFUL for this product. Give 2 to clips with the same kind of topic, angle or format:", ...examples.liked.map(example)]
      : []),
    ...(examples?.disliked.length
      ? ["The user marked these clips NOT useful for this product. Give 0 to clips like them:", ...examples.disliked.map(example)]
      : []),
  ];
  const model = getModel();
  if (!model || !videos.length) return null;
  const batches = Array.from({ length: Math.ceil(videos.length / RELEVANCE_BATCH) }, (_, b) =>
    videos.slice(b * RELEVANCE_BATCH, (b + 1) * RELEVANCE_BATCH),
  );
  try {
    const results = await Promise.all(
      batches.map(async (batch, b) => {
        const { output } = await generateText({
          ...aiCallOptions(40_000),
          model,
          output: Output.object({ schema: relevanceSchema }),
          prompt: [
            "A founder wants short videos they can learn from for their product. Rate every video below.",
            `Product: ${product.name} — ${product.whatItIs}`,
            product.audience ? `Audience: ${product.audience}` : "",
            "First name the product's FIELD in 2-4 words (e.g. accounting & tax for SMEs). Then score:",
            "2: about the product's category, the problem it solves, or a named competitor.",
            "1: not about the product, but squarely inside its field (e.g. for accounting software: tax tips,",
            "bookkeeping, invoices, payroll, SME cash flow).",
            "0: anything outside the field, even if loosely related: generic AI, app or tech tutorials, social",
            "media tips, other software categories, entertainment, school life, other industries. Also 0 when a",
            "word only matches by accident (a brand that shares a word, 'account' meaning a social media account,",
            "'บัญชี' meaning a bank or TikTok account) or the caption is empty or too vague to tell.",
            "For a business (B2B) product, personal/consumer topics are outside the field (personal debt, home loans,",
            "personal budgeting or investing, motivation and mindset clips).",
            goal ? GOAL_RELEVANCE[goal] : "",
            ...taught,
            "Also rate copy: how easily a small business could film a similar clip with a phone.",
            "2: easy (talking head, screen recording or demo, simple skit, product in hand, voiceover on photos or text).",
            "1: needs some production (studio set, actors, many locations, heavy editing).",
            "0: can't be copied (celebrity, TV/movie/news footage, re-uploads or compilations of others' clips, big-budget ads).",
            "Return score and copy for every line number.",
            "",
            ...batch.map((v, i) => `${i} | @${v.creatorHandle} | ${v.caption.slice(0, 160).replace(/\s+/g, " ") || "(no caption)"}`),
          ].join("\n"),
        });
        const scores: number[] = Array(batch.length).fill(0);
        const copy: (number | null)[] = Array(batch.length).fill(null);
        for (const s of output.scores) {
          if (s.i >= batch.length) continue;
          scores[s.i] = s.score;
          copy[s.i] = s.copy;
        }
        return { b, scores, copy };
      }),
    );
    const ordered = results.sort((x, y) => x.b - y.b);
    return { scores: ordered.flatMap((r) => r.scores), copy: ordered.flatMap((r) => r.copy) };
  } catch (e) {
    console.warn("[ai] rateRelevance failed, keeping all results", (e as Error).message);
    return null;
  }
}

type VideoInput = { caption: string; views: number | null; usual: number | null; reach: number | null; handle: string; platform: string };

export async function analyzeVideo(v: VideoInput, locale: string): Promise<VideoAnalysis & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const { output } = await generateText({
        ...aiCallOptions(),
        model,
        output: Output.object({ schema: videoAnalysisSchema }),
        prompt: [
          `Break down why this ${v.platform} video performed. Answer in ${languageName(locale)}.`,
          "Base it only on the caption and numbers; call reasons a likely explanation, not a fact.",
          `Creator: @${v.handle}`,
          `Views: ${v.views ?? "unknown"}`,
          v.usual !== null ? `That is ${formatMultiplier(v.usual)}x the creator's usual views.` : "",
          v.reach !== null ? `Views are ${formatMultiplier(v.reach)}x the creator's follower count.` : "",
          `Caption:\n${v.caption || "(no caption)"}`,
        ].join("\n"),
      });
      return { ...output, source: "ai" };
    } catch (e) {
      console.warn("[ai] analyzeVideo failed, using sample", (e as Error).message);
    }
  }
  const firstLine = (v.caption.split(/\n|#/)[0] || v.caption).trim().slice(0, 120);
  const th = locale !== "en";
  return {
    hook: firstLine || "—",
    hookType: th ? "ตัวอย่าง" : "sample",
    format: th ? "ยังไม่ได้วิเคราะห์" : "not analysed yet",
    angle: th ? "เพิ่ม Gemini API key เพื่อดูการวิเคราะห์จริง" : "Add a Gemini API key to see a real breakdown",
    cta: "—",
    whyItWorked: th
      ? "นี่คือข้อความตัวอย่าง ใส่ GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local เพื่อให้ AI วิเคราะห์คลิปนี้"
      : "This is sample text. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local to have AI analyse this video.",
    source: "sample",
  };
}

export type ProductInput = { name: string; url: string | null; description: string | null; audience: string | null };
type ScriptVideoInput = VideoInput & {
  hook: string | null;
  format: string | null;
  angle: string | null;
  /** From the clip's transcript, when the user read it: what is really said first, and the parts with timing. */
  spoken?: { hook: string; beats: { label: string; start: number; end: number; summary: string }[] } | null;
};

/** Transcript lines for a prompt, capped so a long talking-head clip doesn't crowd it out. */
function transcriptLines(segments: Segment[], maxChars = 4000): string[] {
  const out: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`;
    if (used + line.length > maxChars) break;
    out.push(line);
    used += line.length;
  }
  return out;
}

/** Video page: the real hook and structure, from the clip's timed transcript. Null when AI is unavailable or fails. */
export async function breakDownHook(
  v: { caption: string; platform: string; handle: string; duration: number | null },
  segments: Segment[],
  locale: string,
): Promise<HookBreakdown | null> {
  const model = getModel();
  if (!model || !segments.length) return null;
  try {
    const { output } = await generateText({
      ...aiCallOptions(30_000),
      model,
      output: Output.object({ schema: hookBreakdownSchema }),
      prompt: [
        `Break down how this ${v.platform} video by @${v.handle} is built, from its timed transcript.`,
        `Write hookTranslated, hookType, hookWhy, the beat summaries and cta in ${languageName(locale)}.`,
        "hook: copy the opening line exactly as spoken, in its own language (finish the sentence if the 3-second estimate cuts it).",
        "beats: the parts of the video in order, with start and end in seconds, covering the whole video; the first beat is the hook.",
        v.duration ? `Video length: ${v.duration} s.` : "",
        `Spoken in about the first 3 seconds: ${firstSeconds(segments, 3)}`,
        `Caption: ${v.caption.slice(0, 300).replace(/\s+/g, " ")}`,
        "Transcript ([start-end seconds] text):",
        ...transcriptLines(segments),
      ].join("\n"),
    });
    return output;
  } catch (e) {
    console.warn("[ai] breakDownHook failed", (e as Error).message);
    return null;
  }
}

/** "Make my version": adapt the structure of an outlier video to the user's product. */
export async function makeMyVersion(
  product: ProductInput,
  v: ScriptVideoInput,
  locale: string,
  goal?: Goal | null,
): Promise<Script & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const { output } = await generateText({
        // The user is waiting on this one, so allow a slow first model plus the fallback.
        ...aiCallOptions(40_000),
        model,
        output: Output.object({ schema: scriptSchema }),
        prompt: [
          `Write a short-form video script for the product below, in ${languageName(locale)}.`,
          "Borrow the STRUCTURE of the reference video (hook style, format, pacing, angle) — never copy its",
          "words, jokes or footage. Make it filmable by a founder with a phone in one take. 20-45 seconds.",
          ...(goal ? [`The user ${GOAL_BRIEF[goal]}.`, ...GOAL_BEATS[goal]] : ["Beats in order: hook, setup, demo, payoff, cta."]),
          "Keep the first beat under 12 words. Only claim what the product description says it does.",
          NO_MADE_UP_NUMBERS,
          "",
          `Product: ${product.name}`,
          product.url ? `Link: ${product.url}` : "",
          product.description ? `What it does: ${product.description}` : "",
          product.audience ? `For: ${product.audience}` : "",
          "",
          `Reference video by @${v.handle} on ${v.platform}, ${v.views ?? "?"} views` +
            (v.usual !== null ? ` (${formatMultiplier(v.usual)}x usual)` : ""),
          v.hook ? `Its hook: ${v.hook}` : "",
          v.format ? `Its format: ${v.format}` : "",
          v.angle ? `Its angle: ${v.angle}` : "",
          ...(v.spoken
            ? [
                `What it actually says first (transcript): "${v.spoken.hook}". Use the same KIND of opening, in new words.`,
                v.spoken.beats.length
                  ? `Its real structure: ${v.spoken.beats.map((b) => `${b.label} ${b.start.toFixed(0)}-${b.end.toFixed(0)}s (${b.summary})`).join("; ")}. Match this pacing: start each beat at about the same time.`
                  : "",
              ]
            : []),
          `Its caption: ${v.caption.slice(0, 400)}`,
        ].join("\n"),
      });
      return { ...output, source: "ai" };
    } catch (e) {
      console.warn("[ai] makeMyVersion failed, using sample", (e as Error).message);
    }
  }
  const th = locale !== "en";
  const p = product.name;
  return {
    title: th ? `${p} ในแบบของคุณ` : `${p}, your version`,
    durationSeconds: 30,
    beats: [
      { label: "hook", time: "0:00", voiceover: th ? `ถ้าคุณยังทำแบบนี้อยู่ ลองดู ${p}` : `Still doing it the hard way? Watch this.`, onScreen: v.hook ?? "", visual: th ? "พูดกับกล้อง ใกล้ ๆ" : "Close-up, talking to camera" },
      { label: "setup", time: "0:03", voiceover: th ? "ปัญหาที่คนส่วนใหญ่เจอคือ…" : "Here's the problem most people have…", onScreen: "", visual: th ? "โชว์ปัญหา" : "Show the problem" },
      { label: "demo", time: "0:10", voiceover: th ? `${p} ช่วยให้…` : `${p} makes it…`, onScreen: "", visual: th ? "บันทึกหน้าจอการใช้งาน" : "Screen recording of the product" },
      { label: "payoff", time: "0:22", voiceover: th ? "ผลลัพธ์คือ…" : "The result…", onScreen: "", visual: th ? "โชว์ผลลัพธ์" : "Show the result" },
      { label: "cta", time: "0:27", voiceover: th ? "ลองใช้ได้ที่ลิงก์ในโปรไฟล์" : "Try it from the link in bio", onScreen: "", visual: th ? "โลโก้ + ลิงก์" : "Logo + link" },
    ],
    caption: th
      ? "สคริปต์ตัวอย่าง — ใส่ Gemini API key เพื่อให้ AI เขียนสคริปต์จริงจากคลิปนี้"
      : "Sample script — add a Gemini API key to have AI adapt this video for your product.",
    hashtags: [],
    borrowed: th ? "ยืมโครงสร้าง ฮุก → ปัญหา → เดโม → ผลลัพธ์ → CTA" : "Borrowed structure: hook → problem → demo → result → CTA",
    source: "sample",
  };
}

type RunInput = {
  keywords: string[];
  totalVideos: number;
  topViews: number | null;
  smallAccountsInTop10: number;
  breakouts: number;
  product?: ProductBrief;
  goal?: Goal | null;
  /** Best first; up to 15. `dbId` lets patterns point at real videos. */
  top: {
    dbId?: number;
    handle: string;
    caption: string;
    views: number | null;
    multiplier: number | null;
    keepRate: number | null;
    platform: string;
  }[];
};

export async function summarizeRun(input: RunInput, locale: string): Promise<RunSummary> {
  const model = getModel();
  if (model && input.top.length) {
    try {
      const { output } = await generateText({
        ...aiCallOptions(40_000),
        model,
        output: Output.object({ schema: runSummarySchema }),
        prompt: [
          `You summarise short-form video research for a founder. Answer in ${languageName(locale)}.`,
          `Keywords: ${input.keywords.join(", ")}`,
          `Videos found: ${input.totalVideos}. Clear breakouts (5x+ usual views): ${input.breakouts}.`,
          `Top results from accounts under 10K followers: ${input.smallAccountsInTop10} of ${Math.min(10, input.top.length)}.`,
          input.product ? `The founder's product: ${input.product.name} — ${input.product.whatItIs}` : "",
          input.goal ? `The user ${GOAL_BRIEF[input.goal]}; every formula and idea must serve that.` : "",
          "Top videos (line | handle | views | multiplier | saves+shares per view | caption):",
          ...input.top.map(
            (v, i) =>
              `${i} | @${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.keepRate !== null ? (v.keepRate * 100).toFixed(1) + "%" : "?"} | ${v.caption.slice(0, 160).replace(/\s+/g, " ")}`,
          ),
          "Write a confident headline about whether this niche works on short-form, and a takeaway that",
          "names the shared pattern (hook, format or angle) behind the winners. Cite @handles. No hype words.",
          "Then group the videos into 3-5 formulas the founder can copy tomorrow with a phone. Each formula needs",
          "1-3 example line numbers; skip videos that fit no useful formula. The idea must be about THEIR product.",
          input.goal ? GOAL_FORMULAS[input.goal] : "",
          NO_MADE_UP_NUMBERS,
        ].join("\n"),
      });
      const patterns = output.patterns
        .map(({ examples, ...p }) => ({
          ...p,
          videoIds: [...new Set(examples)].map((i) => input.top[i]?.dbId).filter((id): id is number => id !== undefined),
        }))
        .filter((p) => p.videoIds.length);
      return { ...output, patterns, source: "ai" };
    } catch (e) {
      console.warn("[ai] summarizeRun failed, using sample", (e as Error).message);
    }
  }
  const th = locale !== "en";
  const kw = input.keywords[0] ?? "";
  const lead = input.top[0];
  return {
    headline: th ? `คลิปเรื่อง ${kw} มีคนดูจริงบนวิดีโอสั้น` : `${kw} videos have an audience on short-form.`,
    highlight: th ? "มีคนดูจริง" : "audience",
    summary: th
      ? `${input.breakouts} คลิปได้วิวเกิน 5 เท่าของปกติ คลิปเหล่านี้บอกว่าควรทำอะไร`
      : `${input.breakouts} videos got 5x+ their usual views. Those show you what to make.`,
    takeaway: lead
      ? th
        ? `เริ่มจากศึกษา @${lead.handle} ที่ได้ ${lead.views ?? "?"} วิว (ข้อความตัวอย่าง — ใส่ Gemini API key เพื่อดูบทวิเคราะห์จริง)`
        : `Start by studying @${lead.handle} with ${lead.views ?? "?"} views. (Sample text — add a Gemini API key for a real analysis.)`
      : "",
    source: "sample",
  };
}

export type ClipForIdea = { handle: string; caption: string; views: number | null; multiplier: number | null; hasShop: boolean; platform: string };

/**
 * Results page: one "how you'd use this clip" line per top video, for the user's product and goal (one Gemini
 * call, no credits). Returns lines in the same order, or null when AI is unavailable or fails.
 */
export async function ideasForClips(
  product: ProductBrief,
  goal: Goal,
  clips: ClipForIdea[],
  locale: string,
): Promise<(string | null)[] | null> {
  const model = getModel();
  if (!model || !clips.length) return null;
  try {
    const { output } = await generateText({
      ...aiCallOptions(40_000),
      model,
      output: Output.object({ schema: clipIdeasSchema }),
      prompt: [
        `You help a user turn viral short videos into their own content. Answer in ${languageName(locale)}.`,
        `The user ${GOAL_BRIEF[goal]}.`,
        `Their product: ${product.name} — ${product.whatItIs}${product.audience ? `. Audience: ${product.audience}` : ""}`,
        `For EVERY video below write one sentence (max 25 words): how they could reuse its hook or format for their product to ${GOAL_ACTION[goal]}.`,
        "Be concrete: name the hook or format to borrow and what to show on screen. Never suggest copying its words or footage.",
        "Only mention what the product description says it does; never give it a brand, product or feature name taken from the video.",
        NO_MADE_UP_NUMBERS,
        "Videos (line | platform | handle | views | multiplier | shop link | caption):",
        ...clips.map(
          (v, i) =>
            `${i} | ${v.platform} | @${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.hasShop ? "yes" : "no"} | ${v.caption.slice(0, 200).replace(/\s+/g, " ")}`,
        ),
      ].join("\n"),
    });
    const out: (string | null)[] = Array(clips.length).fill(null);
    for (const x of output.ideas) if (x.i < clips.length && x.idea.trim()) out[x.i] = x.idea.trim();
    return out;
  } catch (e) {
    console.warn("[ai] ideasForClips failed", (e as Error).message);
    return null;
  }
}

export type TodayCandidate = { handle: string; caption: string; views: number | null; multiplier: number | null; keepRate: number | null; source: string };
export type TodayIdea = { i: number; title: string; why: string; hook: string; angle: string };

/** Today page: picks 3-5 of the new breakouts and turns each into a "post this today" idea for the product. */
export async function pickTodayIdeas(
  product: ProductBrief | null,
  candidates: TodayCandidate[],
  locale: string,
  goal?: Goal | null,
): Promise<TodayIdea[]> {
  const model = getModel();
  if (model && candidates.length) {
    try {
      const { output } = await generateText({
        ...aiCallOptions(40_000),
        model,
        output: Output.object({ schema: todaySchema }),
        prompt: [
          `You are a content strategist. Answer in ${languageName(locale)}.`,
          product ? `The founder's product: ${product.name} — ${product.whatItIs}. Audience: ${product.audience}` : "",
          goal ? `The user ${GOAL_BRIEF[goal]}. ${GOAL_TODAY[goal]} Each angle says how to ${GOAL_ACTION[goal]}.` : "",
          "These short videos broke out in the last 7 days (line | source | handle | views | multiplier | saves+shares per view | caption):",
          ...candidates.map(
            (v, i) =>
              `${i} | ${v.source} | @${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.keepRate !== null ? (v.keepRate * 100).toFixed(1) + "%" : "?"} | ${v.caption.slice(0, 160).replace(/\s+/g, " ")}`,
          ),
          "Pick the 3-5 most useful for this founder (different formats, prefer high saves+shares and real views),",
          "and turn each into one video they could film today with a phone. Never suggest copying words or footage.",
          NO_MADE_UP_NUMBERS,
        ].join("\n"),
      });
      const seen = new Set<number>();
      return output.ideas.filter((x) => x.i < candidates.length && !seen.has(x.i) && seen.add(x.i));
    } catch (e) {
      console.warn("[ai] pickTodayIdeas failed, using top videos", (e as Error).message);
    }
  }
  const th = locale !== "en";
  return candidates.slice(0, 5).map((v, i) => ({
    i,
    title: (v.caption.split(/\n|#/)[0] || v.caption).trim().slice(0, 80) || `@${v.handle}`,
    why: th
      ? `ได้ ${v.views ?? "?"} วิว${v.multiplier !== null ? ` (${formatMultiplier(v.multiplier)}× ของปกติ)` : ""}`
      : `${v.views ?? "?"} views${v.multiplier !== null ? ` (${formatMultiplier(v.multiplier)}x usual)` : ""}`,
    hook: "",
    angle: th ? "เปิดดูคลิปแล้วกด “เขียนสคริปต์” เพื่อทำเวอร์ชันของคุณ" : "Open the video and press Make my version.",
  }));
}

/** Fetches an image for Gemini (JPEG/PNG/WebP only, 5 s, 2 MB max). Null when it cannot be read. */
async function imageForAi(url: string | null): Promise<{ data: string; mediaType: string } | null> {
  if (!url) return null;
  try {
    // Only vendor CDNs we store thumbnails from: never fetch an arbitrary address server-side.
    const { protocol, hostname } = new URL(url);
    const cdn = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|ytimg\.com|cdninstagram\.com|fbcdn\.net)$/.test(hostname);
    if (protocol !== "https:" || !cdn) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 2_000_000 ? null : { data: buf.toString("base64"), mediaType: type };
  } catch {
    return null;
  }
}

type SeedVideo = { caption: string; handle: string; views: number | null; soundTitle: string | null; thumbnailUrl: string | null };

/** Format explorer, step 1: names the seed video's format (from its caption, sound and cover image). */
export async function describeFormat(seed: SeedVideo, locale: string): Promise<FormatDescription & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const image = await imageForAi(seed.thumbnailUrl);
      const prompt = [
        `You explain short-video formats (repeatable templates creators copy). Answer in ${languageName(locale)},`,
        "except searchPhrases: write those in the language creators of this format post in.",
        `Video by @${seed.handle}, ${seed.views ?? "?"} views.`,
        `Caption: ${seed.caption.slice(0, 400) || "(none)"}`,
        seed.soundTitle ? `Sound: ${seed.soundTitle}` : "",
        image ? "Its cover image is attached as a hint only." : "",
        "Describe the FORMAT: what happens in the video (structure, hook, how it is filmed, on-screen text style)",
        "that other creators could copy for any topic. Not this video's topic, and not the thumbnail design.",
        "searchPhrases: 2 short phrases that would find OTHER videos made in this format (e.g. a meme name, a",
        "template name, or 'POV ...'), not the topic of this one video.",
      ].join("\n");
      const { output } = await generateText({
        ...aiCallOptions(),
        model,
        output: Output.object({ schema: formatSchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...(image ? [{ type: "file" as const, mediaType: image.mediaType, data: image.data }] : []),
            ],
          },
        ],
      });
      return { ...output, source: "ai" };
    } catch (e) {
      console.warn("[ai] describeFormat failed, using sample", (e as Error).message);
    }
  }
  const th = locale !== "en";
  const firstLine = (seed.caption.split(/\n|#/)[0] || seed.caption).trim().slice(0, 60);
  return {
    name: firstLine || (th ? "สูตรคลิปนี้" : "This format"),
    howTo: th ? "ตัวอย่าง: ใส่ Gemini API key เพื่อให้ AI อธิบายสูตรคลิปนี้" : "Sample: add a Gemini API key to have AI explain this format.",
    keepSame: "—",
    makeYours: "—",
    whoFor: [{ segment: "consumer", idea: "—" }],
    searchPhrases: [firstLine || seed.handle],
    source: "sample",
  };
}

/**
 * Format explorer, step 2: scores which candidates use the format (0-2) and groups them by the topic people
 * applied it to. Returns null when AI is unavailable, so callers keep sound matches only.
 */
export async function matchFormat(
  format: Pick<FormatDescription, "name" | "howTo" | "keepSame">,
  videos: { caption: string; creatorHandle: string; soundTitle: string | null; sameSound: boolean }[],
  locale: string,
): Promise<{ scores: number[]; topics: { topic: string; examples: number[] }[] } | null> {
  const model = getModel();
  if (!model || !videos.length) return null;
  try {
    const { output } = await generateText({
      ...aiCallOptions(40_000),
      model,
      output: Output.object({ schema: formatMatchSchema }),
      prompt: [
        `Format: ${format.name}. ${format.howTo} Must keep: ${format.keepSame}`,
        "Score every video: 2 = clearly uses this format, 1 = plausibly (similar structure or style, even on a",
        "different topic), 0 = clearly a different kind of video. Captions are short, so give 1 when in doubt.",
        "Videos marked [same sound] use the format's sound, which is strong evidence.",
        `Then group the videos that use it by the topic or subject people applied it to (topics in ${languageName(locale)}).`,
        "",
        ...videos.map(
          (v, i) =>
            `${i} | @${v.creatorHandle}${v.sameSound ? " [same sound]" : ""}${v.soundTitle ? ` | sound: ${v.soundTitle.slice(0, 50)}` : ""} | ${v.caption.slice(0, 140).replace(/\s+/g, " ") || "(no caption)"}`,
        ),
      ].join("\n"),
    });
    const scores: number[] = Array(videos.length).fill(0);
    for (const s of output.scores) if (s.i < videos.length) scores[s.i] = s.score;
    return { scores, topics: output.topics.map((t) => ({ ...t, examples: t.examples.filter((i) => i < videos.length) })) };
  } catch (e) {
    console.warn("[ai] matchFormat failed", (e as Error).message);
    return null;
  }
}

/**
 * Chat "Enhance": rewrites a rough description into a brief that covers the topic, who it is for, the
 * angle and what to avoid (keeping the user's facts, product names and links). Null when AI is off.
 */
export async function enhanceBrief(text: string, locale: string): Promise<Enhanced | null> {
  const model = getModel();
  if (!model) return null;
  try {
    const { output } = await generateText({
      ...aiCallOptions(),
      model,
      output: Output.object({ schema: enhanceSchema }),
      prompt: [
        "Rewrite this rough request into a clear brief for finding viral short videos for a founder.",
        "Cover: 1) the topic / product category, 2) who it is for, 3) the angle or kinds of videos wanted",
        "(e.g. tutorials, reviews, comparisons, quick tips), 4) what to avoid. Keep every fact, product name,",
        "competitor and link the user gave; add sensible specifics where missing, without inventing claims.",
        `Write the brief in ${languageName(locale)} unless the user wrote in another language. Then mark which`,
        "of the 4 parts the brief covers.",
        "",
        `Request:\n${text}`,
      ].join("\n"),
    });
    return output;
  } catch (e) {
    console.warn("[ai] enhanceBrief failed", (e as Error).message);
    return null;
  }
}
