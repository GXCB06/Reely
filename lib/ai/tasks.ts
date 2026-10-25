import "server-only";
import { generateText, Output } from "ai";
import { formatMultiplier } from "@/lib/scoring";
import { getModel, languageName } from "./model";
import {
  MAX_KEYWORDS,
  planSchema,
  type ResearchPlan,
  type RunSummary,
  runSummarySchema,
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

type VideoInput = { caption: string; views: number | null; usual: number | null; reach: number | null; handle: string; platform: string };

export async function analyzeVideo(v: VideoInput, locale: string): Promise<VideoAnalysis & { source: "ai" | "sample" }> {
  const model = getModel();
  if (model) {
    try {
      const { output } = await generateText({
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

type RunInput = {
  keywords: string[];
  totalVideos: number;
  topViews: number | null;
  smallAccountsInTop10: number;
  breakouts: number;
  top: { handle: string; caption: string; views: number | null; multiplier: number | null; platform: string }[];
};

export async function summarizeRun(input: RunInput, locale: string): Promise<RunSummary> {
  const model = getModel();
  if (model && input.top.length) {
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: runSummarySchema }),
        prompt: [
          `You summarise short-form video research for a founder. Answer in ${languageName(locale)}.`,
          `Keywords: ${input.keywords.join(", ")}`,
          `Videos found: ${input.totalVideos}. Clear breakouts (5x+ usual views): ${input.breakouts}.`,
          `Top results from accounts under 10K followers: ${input.smallAccountsInTop10} of ${Math.min(10, input.top.length)}.`,
          "Top videos (handle | views | multiplier | caption):",
          ...input.top.map(
            (v) =>
              `@${v.handle} | ${v.views ?? "?"} | ${v.multiplier !== null ? formatMultiplier(v.multiplier) + "x" : "?"} | ${v.caption.slice(0, 160).replace(/\s+/g, " ")}`,
          ),
          "Write a confident headline about whether this niche works on short-form, and a takeaway that",
          "names the shared pattern (hook, format or angle) behind the winners. Cite @handles. No hype words.",
        ].join("\n"),
      });
      return { ...output, source: "ai" };
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
