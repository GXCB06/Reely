import { z } from "zod";

export const MAX_KEYWORDS = 5;

export const planSchema = z.object({
  keywords: z.array(z.string().min(2).max(80)).min(1).max(MAX_KEYWORDS),
  exclusions: z.array(z.string().min(2).max(40)).max(10),
});
export type ResearchPlan = z.infer<typeof planSchema>;

/** Chat home: what Reely understood from the user's text, link and/or image, plus the search plan. */
export const understandingSchema = z.object({
  productName: z.string().min(1).max(80).describe("The product or brand name; a short descriptive name if none is given"),
  whatItIs: z.string().max(300).describe("One sentence: what the product does"),
  audience: z.string().max(200).describe("Who it is for, a few words"),
  reply: z.string().max(400).describe("1-2 friendly sentences to the user: what you understood and what videos you will look for"),
  keywords: z
    .array(
      z.object({
        text: z.string().min(2).max(80),
        region: z.enum(["th", "global"]).describe("th = a Thai-language phrase; global = an English phrase"),
      }),
    )
    .min(1)
    .max(MAX_KEYWORDS),
  exclusions: z.array(z.string().min(2).max(40)).max(10),
});
export type Understanding = z.infer<typeof understandingSchema>;

/** Relevance of each search result to the user's product: 0 unrelated, 1 same audience, 2 on topic. */
export const relevanceSchema = z.object({
  scores: z.array(z.object({ i: z.number().int().min(0), score: z.number().int().min(0).max(2) })),
});

export const videoAnalysisSchema = z.object({
  hook: z.string().describe("The opening line or on-screen hook, quoted or closely paraphrased from the caption"),
  hookType: z.string().describe("Short label, e.g. question, bold claim, POV, problem callout, list, story, how-to"),
  format: z.string().describe("e.g. talking head, screen demo, slideshow, skit, interview, before/after"),
  angle: z.string().describe("Why a viewer cares: the promise, fear or curiosity the video plays on"),
  cta: z.string().describe("What the video asks viewers to do, or 'none'"),
  whyItWorked: z.string().describe("2-3 sentences. A hypothesis, grounded in the numbers given"),
});
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

export const BEAT_LABELS = ["hook", "setup", "demo", "payoff", "cta"] as const;

export const scriptSchema = z.object({
  title: z.string().describe("Working title for the video, max 8 words"),
  durationSeconds: z.number().int().min(10).max(90),
  beats: z
    .array(
      z.object({
        label: z.enum(BEAT_LABELS),
        time: z.string().describe("Start time like 0:00"),
        voiceover: z.string().describe("What is said out loud"),
        onScreen: z.string().describe("Short on-screen text, or empty"),
        visual: z.string().describe("What the camera shows"),
      }),
    )
    .min(3)
    .max(6),
  caption: z.string().describe("Post caption, 1-2 sentences"),
  hashtags: z.array(z.string()).max(6),
  borrowed: z.string().describe("One sentence: what structure is borrowed from the original and what is new"),
});
export type Script = z.infer<typeof scriptSchema>;

/** A repeatable formula behind several winning videos ("Demo that kills a boring chore"). */
export const patternSchema = z.object({
  name: z.string().describe("Max 6 words, a memorable name for the formula"),
  why: z.string().describe("1-2 sentences: why it works, citing views, multipliers or saves of the examples"),
  hook: z.string().describe("A fill-in-the-blank opening line the user could say, max 14 words, e.g. 'Still ___ by hand? Watch this.'"),
  idea: z.string().describe("One sentence: a concrete video the user could shoot with this formula for THEIR product"),
  examples: z.array(z.number().int().min(0)).min(1).max(3).describe("Line numbers of the videos that use it"),
});

export const runSummarySchema = z.object({
  headline: z.string().describe("Max 10 words, e.g. 'Accounting software videos work on short-form.'"),
  highlight: z.string().describe("One word from the headline to emphasise"),
  summary: z.string().describe("One sentence about how many videos clearly beat their usual views"),
  takeaway: z.string().describe("2-3 sentences: the pattern behind the winners, citing @handles and numbers"),
  patterns: z.array(patternSchema).min(1).max(5),
});

/** Stored with the run: example line numbers replaced by video ids. */
export type Pattern = Omit<z.infer<typeof patternSchema>, "examples"> & { videoIds: number[] };
export type RunSummary = Omit<z.infer<typeof runSummarySchema>, "patterns"> & {
  patterns?: Pattern[];
  source: "ai" | "sample";
};

/** Today page: 3-5 "post this today" ideas picked from new breakouts. */
export const todaySchema = z.object({
  ideas: z
    .array(
      z.object({
        i: z.number().int().min(0).describe("Line number of the video this idea comes from"),
        title: z.string().describe("Max 10 words: what to post today, as an action"),
        why: z.string().describe("1-2 sentences: why this video worked, citing its views, multiplier or saves"),
        hook: z.string().describe("An opening line the user could say, max 14 words"),
        angle: z.string().describe("One sentence: how to do it for the user's product"),
      }),
    )
    .min(1)
    .max(5),
});
