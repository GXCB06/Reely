import { z } from "zod";

export const MAX_KEYWORDS = 5;

export const planSchema = z.object({
  keywords: z.array(z.string().min(2).max(80)).min(1).max(MAX_KEYWORDS),
  exclusions: z.array(z.string().min(2).max(40)).max(10),
});
export type ResearchPlan = z.infer<typeof planSchema>;

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

export const runSummarySchema = z.object({
  headline: z.string().describe("Max 10 words, e.g. 'Accounting software videos work on short-form.'"),
  highlight: z.string().describe("One word from the headline to emphasise"),
  summary: z.string().describe("One sentence about how many videos clearly beat their usual views"),
  takeaway: z.string().describe("2-3 sentences: the pattern behind the winners, citing @handles and numbers"),
});
export type RunSummary = z.infer<typeof runSummarySchema> & { source: "ai" | "sample" };
