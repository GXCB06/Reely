import "server-only";
import { generateText, Output } from "ai";
import type { LinkPreview } from "@/lib/link-preview";
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
  type Script,
  todaySchema,
  scriptSchema,
  type Understanding,
  understandingSchema,
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
  /** A product the user saved earlier ("agent memory"); the text then refines what to look for. */
  saved?: { name: string; url: string | null; description: string | null; audience: string | null } | null;
};

const REGION_RULE: Record<RegionChoice, string> = {
  th: `All ${MAX_KEYWORDS} phrases in Thai (region "th"), as Thai creators would type them; English product terms are fine inside.`,
  global: `All ${MAX_KEYWORDS} phrases in English (region "global"), as creators worldwide would type them.`,
  both: `3 phrases in Thai (region "th") then 2 in English (region "global").`,
};

/**
 * Chat home, step 1: reads the user's description, product page and/or image, then plans the search.
 * Keyword regions are forced to match the region choice, whatever the model returns.
 */
export async function understandProduct(
  msg: ProductMessage,
  locale: string,
): Promise<Understanding & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const prompt = [
        "You are Reely, a research assistant that finds viral short-form videos (TikTok, YouTube Shorts,",
        "Instagram Reels) a founder can learn from. Work out what the product is from everything below,",
        `then plan the search. Write productName, whatItIs, audience and reply in ${languageName(locale)}.`,
        `Keywords: up to ${MAX_KEYWORDS} search phrases, 2-4 words each, that people actually type or use as hashtags:`,
        "mix the product category, the problem it solves and the audience's everyday topics, so results include",
        "similar products AND content the same audience watches. " + REGION_RULE[msg.region],
        "Avoid broad or ambiguous phrases that also name unrelated things (e.g. a university faculty, a",
        "celebrity, a TV show): every phrase should still clearly point at the product's topic.",
        "Exclusions: single words that would bring off-topic videos.",
        "",
        msg.saved
          ? `Their saved product: ${msg.saved.name} — ${msg.saved.description ?? ""}. Audience: ${msg.saved.audience ?? ""}. Link: ${msg.saved.url ?? ""}. Keep this product name.`
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
      const { output } = await generateText({
        ...aiCallOptions(),
        model,
        output: Output.object({ schema: understandingSchema }),
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
      const regions = keywordRegions(msg.region, output.keywords.length);
      return { ...output, keywords: output.keywords.map((k, i) => ({ ...k, region: regions[i] })), source: "ai" };
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
    productName: name,
    whatItIs: msg.saved?.description ?? msg.link?.description ?? msg.text.slice(0, 300),
    audience: msg.saved?.audience ?? "",
    reply: th
      ? "นี่คือคีย์เวิร์ดตัวอย่าง (ยังไม่ได้ใช้ AI) แก้ไขได้ก่อนกดค้นหา"
      : "These are sample keywords (AI is off). Edit them before you search.",
    keywords: plan.keywords.map((text, i) => ({ text, region: regions[i] })),
    exclusions: plan.exclusions,
    source: "sample",
  };
}

export type ProductBrief = { name: string; whatItIs: string; audience: string };

const RELEVANCE_BATCH = 80;

/**
 * Rates each search result 0-2 for relevance to the product, from its caption (one Gemini call per
 * 80 videos, run in parallel). Returns null when AI is unavailable or fails, so callers keep everything.
 */
export async function rateRelevance(
  product: ProductBrief,
  videos: { caption: string; creatorHandle: string }[],
): Promise<number[] | null> {
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
            "Score 2: about the product's category, the problem it solves, or a competitor.",
            "Score 1: not about the product, but a topic its audience clearly cares about (their work, money, tools).",
            "Score 0: unrelated (school/university life, entertainment, pets, other industries) or the caption is",
            "empty or too vague to tell.",
            "Return one score per line number.",
            "",
            ...batch.map((v, i) => `${i} | @${v.creatorHandle} | ${v.caption.slice(0, 160).replace(/\s+/g, " ") || "(no caption)"}`),
          ].join("\n"),
        });
        const scores: number[] = Array(batch.length).fill(0);
        for (const s of output.scores) if (s.i < batch.length) scores[s.i] = s.score;
        return { b, scores };
      }),
    );
    return results.sort((x, y) => x.b - y.b).flatMap((r) => r.scores);
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
type ScriptVideoInput = VideoInput & { hook: string | null; format: string | null; angle: string | null };

/** "Make my version": adapt the structure of an outlier video to the user's product. */
export async function makeMyVersion(
  product: ProductInput,
  v: ScriptVideoInput,
  locale: string,
): Promise<Script & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const { output } = await generateText({
        ...aiCallOptions(),
        model,
        output: Output.object({ schema: scriptSchema }),
        prompt: [
          `Write a short-form video script for the product below, in ${languageName(locale)}.`,
          "Borrow the STRUCTURE of the reference video (hook style, format, pacing, angle) — never copy its",
          "words, jokes or footage. Make it filmable by a founder with a phone in one take. 20-45 seconds.",
          "Beats in order: hook, setup, demo, payoff, cta. Keep the hook under 12 words.",
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
          "Top videos (line | handle | views | multiplier | saves+shares per view | caption):",
          ...input.top.map(
            (v, i) =>
              `${i} | @${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.keepRate !== null ? (v.keepRate * 100).toFixed(1) + "%" : "?"} | ${v.caption.slice(0, 160).replace(/\s+/g, " ")}`,
          ),
          "Write a confident headline about whether this niche works on short-form, and a takeaway that",
          "names the shared pattern (hook, format or angle) behind the winners. Cite @handles. No hype words.",
          "Then group the videos into 3-5 formulas the founder can copy tomorrow with a phone. Each formula needs",
          "1-3 example line numbers; skip videos that fit no useful formula. The idea must be about THEIR product.",
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

export type TodayCandidate = { handle: string; caption: string; views: number | null; multiplier: number | null; keepRate: number | null; source: string };
export type TodayIdea = { i: number; title: string; why: string; hook: string; angle: string };

/** Today page: picks 3-5 of the new breakouts and turns each into a "post this today" idea for the product. */
export async function pickTodayIdeas(product: ProductBrief | null, candidates: TodayCandidate[], locale: string): Promise<TodayIdea[]> {
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
          "These short videos broke out in the last 7 days (line | source | handle | views | multiplier | saves+shares per view | caption):",
          ...candidates.map(
            (v, i) =>
              `${i} | ${v.source} | @${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.keepRate !== null ? (v.keepRate * 100).toFixed(1) + "%" : "?"} | ${v.caption.slice(0, 160).replace(/\s+/g, " ")}`,
          ),
          "Pick the 3-5 most useful for this founder (different formats, prefer high saves+shares and real views),",
          "and turn each into one video they could film today with a phone. Never suggest copying words or footage.",
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
