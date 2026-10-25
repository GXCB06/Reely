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

export const runSummarySchema = z.object({
  headline: z.string().describe("Max 10 words, e.g. 'Accounting software videos work on short-form.'"),
  highlight: z.string().describe("One word from the headline to emphasise"),
  summary: z.string().describe("One sentence about how many videos clearly beat their usual views"),
  takeaway: z.string().describe("2-3 sentences: the pattern behind the winners, citing @handles and numbers"),
});
export type RunSummary = z.infer<typeof runSummarySchema> & { source: "ai" | "sample" };
