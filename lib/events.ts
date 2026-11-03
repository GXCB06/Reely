import { z } from "zod";

// What happened when someone sent or kept something (client_events). Small enums and ids only: never the text a
// user typed, so a log can't leak a product idea.
export const EVENT_NAMES = [
  "send_attempt",
  "send_ok",
  "send_failed",
  "plan_slow",
  "plan_timeout",
  "run_failed",
  "ask_failed",
  "save",
  "vote",
  // Content Canvas: a clip added from a card or video page, a canvas opened from a research, a generation (props:
  // format, refine), a script saved, a version voted on.
  "canvas_add",
  "canvas_open",
  "canvas_generate",
  "canvas_save_script",
  "canvas_vote",
  // My channels: an own channel added (props: platform), an analysis (props: fresh, ideas), an idea opened in a canvas.
  "own_account_add",
  "channel_audit",
  "idea_to_canvas",
  // "Did it work?": a canvas version linked to the post made from it (props: pasted link or picked).
  "post_linked",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const EVENT_SOURCES = ["chat", "ask", "research", "video", "plan", "saved", "tracking", "canvas", "other"] as const;

const propValue = z.union([z.string().max(60), z.number().finite(), z.boolean(), z.null()]);

export const eventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  requestId: z.string().uuid().nullish(),
  source: z.enum(EVENT_SOURCES).nullish(),
  props: z.record(z.string().max(30), propValue).refine((p) => Object.keys(p).length <= 8, "too many props").default({}),
});
export type ClientEvent = z.input<typeof eventSchema>;

/** Where a page is, for the `source` of a save or vote ("/th/app/research/…" → "research"). */
export function sourceOf(pathname: string): (typeof EVENT_SOURCES)[number] {
  const p = pathname.replace(/^\/(th|en)(?=\/)/, "");
  if (p.startsWith("/app/research/")) return "research";
  if (p.startsWith("/app/video/")) return "video";
  if (p.startsWith("/app/plan")) return "plan";
  if (p.startsWith("/app/saved")) return "saved";
  if (p.startsWith("/app/tracking")) return "tracking";
  if (p.startsWith("/app/canvas")) return "canvas";
  return "other";
}
