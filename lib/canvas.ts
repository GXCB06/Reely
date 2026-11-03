// Content Canvas (v0.3 Part A): a board that turns reference clips, the product and a note into one of a few fixed
// formats. Not a chat: each generation is a format, the inputs and an optional extra line. Pure (client and server).
import type { CanvasBrief, CanvasCaption, CanvasHooks, CanvasScript } from "@/lib/ai/schemas";
import type { Goal } from "@/lib/goals";

export const CANVAS_FORMATS = ["script", "hooks", "demo", "shopReview", "brief", "caption"] as const;
export type CanvasFormat = (typeof CANVAS_FORMATS)[number];

/** One-tap rewrites of a version (one AI call each). */
export const CANVAS_REFINES = ["shorter", "casual", "strongerHook", "shopCta", "english"] as const;
export type CanvasRefine = (typeof CANVAS_REFINES)[number];

export const MAX_CLIPS = 6;
export const NOTE_MAX = 500;
export const INSTRUCTIONS_MAX = 300;
/** Generations per person per day: protects the free Gemini tier. */
export const CANVAS_PER_DAY = 40;

export type CanvasInputs = { clips: number[]; note: string; link: string | null };

/** A canvas's stored inputs, whatever shape the row holds (older or hand-edited rows never break the page). */
export function parseInputs(raw: unknown): CanvasInputs {
  const r = (raw ?? {}) as Partial<Record<keyof CanvasInputs, unknown>>;
  const clips = Array.isArray(r.clips) ? [...new Set(r.clips.filter((c): c is number => Number.isInteger(c) && (c as number) > 0))] : [];
  return {
    clips: clips.slice(0, MAX_CLIPS),
    note: typeof r.note === "string" ? r.note.slice(0, NOTE_MAX) : "",
    link: typeof r.link === "string" && r.link.trim() ? r.link.trim().slice(0, 300) : null,
  };
}

/** The formats in the order a goal needs them: its own format first (demo for startups, shop review for sellers). */
export function formatsFor(goal: Goal | null): CanvasFormat[] {
  const first: CanvasFormat[] = goal === "startup" ? ["demo"] : goal === "sell" ? ["shopReview"] : [];
  return [...first, ...CANVAS_FORMATS.filter((f) => !first.includes(f))];
}

/** Formats whose output is a script, so it can be saved to Scripts. */
export const SCRIPT_FORMATS: ReadonlySet<CanvasFormat> = new Set(["script", "demo", "shopReview"]);

export type CanvasContent =
  | ({ format: "script" | "demo" | "shopReview" } & CanvasScript)
  | ({ format: "hooks" } & CanvasHooks)
  | ({ format: "brief" } & CanvasBrief)
  | ({ format: "caption" } & CanvasCaption);

/**
 * Every `from` names a reference clip actually on the canvas: a handle the AI made up (seen live: the product's own
 * account) is cleared, so a part is never credited to a clip the founder can't open.
 */
export function keepKnownSources(c: CanvasContent, handles: string[]): CanvasContent {
  const known = new Map(handles.map((h) => [h.replace(/^@/, "").toLowerCase(), h.replace(/^@/, "")]));
  const fix = (from: string) => known.get(from.trim().replace(/^@/, "").toLowerCase()) ?? "";
  switch (c.format) {
    case "script":
    case "demo":
    case "shopReview":
      return { ...c, beats: c.beats.map((b) => ({ ...b, from: fix(b.from) })) };
    case "hooks":
      return { ...c, hooks: c.hooks.map((h) => ({ ...h, from: fix(h.from) })) };
    case "brief":
      return { ...c, from: [...new Set(c.from.map(fix).filter(Boolean))] };
    case "caption":
      return c;
  }
}

const tags = (h: string[]) => h.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");

/** A version as plain text, for Copy (pasted into notes, LINE or a doc). `label` names a beat in the user's language. */
export function contentText(c: CanvasContent, label: (beat: string) => string = (b) => b): string {
  switch (c.format) {
    case "script":
    case "demo":
    case "shopReview":
      return [
        c.title,
        "",
        ...c.beats.map((b) => [`[${b.time}] ${label(b.label)}: ${b.voiceover}`, b.onScreen && `  ${b.onScreen}`, b.visual && `  (${b.visual})`].filter(Boolean).join("\n")),
        "",
        c.caption,
        tags(c.hashtags),
      ]
        .join("\n")
        .trim();
    case "hooks":
      return c.hooks.map((h, i) => `${i + 1}. ${h.line}${h.onScreen ? `\n   ${h.onScreen}` : ""}`).join("\n");
    case "brief":
      return [
        c.title,
        c.summary,
        "",
        ...c.shots.map((s, i) => `${i + 1}. ${s.shot}${s.line ? `: "${s.line}"` : ""}${s.note ? ` (${s.note})` : ""}`),
        ...(c.mustSay.length ? ["", ...c.mustSay.map((m) => `+ ${m}`)] : []),
        ...(c.avoid.length ? ["", ...c.avoid.map((a) => `- ${a}`)] : []),
      ].join("\n");
    case "caption":
      return c.options.map((o, i) => `${i + 1}. ${o.caption}\n${tags(o.hashtags)}`).join("\n\n");
  }
}
