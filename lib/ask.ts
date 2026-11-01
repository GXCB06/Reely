// "Ask Reely" answers and thread (research_followups). Shared by the server action and the results page.
import type { Platform } from "@/lib/adapters/types";
import type { FOLLOW_UP_KINDS, Script } from "@/lib/ai/schemas";

export type AskKind = (typeof FOLLOW_UP_KINDS)[number];

/** One clip as an answer card shows it. */
export type AskClip = {
  dbId: number;
  handle: string;
  platform: Platform;
  thumbnailUrl: string | null;
  views: number | null;
  multiplier: number | null;
};

export type AskHook = { clip: AskClip; hook: string; hookType: string; format: string };

/** A script written from one clip and saved to `scripts` (id null when saving failed). */
export type AskScript = {
  id: string | null;
  clip: AskClip;
  title: string;
  durationSeconds: number;
  beats: Script["beats"];
  hookType: string | null;
  format: string | null;
};

export type AskAnswer = {
  kind: AskKind;
  reply: string;
  /** The clip the user pasted a link to. */
  reference: AskClip | null;
  clips: AskClip[];
  hooks: AskHook[];
  script: AskScript | null;
  /** A new search the user can start (the chat, pre-filled). */
  researchHref: string | null;
};

export type AskTurn = { requestId: string; question: string; answer: AskAnswer };

/** "Standout" on a clip grid: 5x or more its creator's usual views (or followers). */
export const STANDOUT_MULTIPLIER = 5;

/** The totals above a clip grid: views added up and how many clips are standouts. */
export function clipTotals(clips: AskClip[]) {
  return {
    views: clips.reduce((sum, c) => sum + (c.views ?? 0), 0),
    standout: clips.filter((c) => (c.multiplier ?? 0) >= STANDOUT_MULTIPLIER).length,
  };
}

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text).replace(/\s+/g, " ");

/**
 * The thread's last turns, compact, for the next question's prompt: lists keep their numbers so "hook 2" or "ข้อ 2"
 * can be resolved to a clip.
 */
export function threadMemory(turns: Pick<AskTurn, "question" | "answer">[], keep = 4): string[] {
  return turns.slice(-keep).flatMap(({ question, answer: a }, t) => {
    const n = t + 1;
    const list =
      a.kind === "hooks"
        ? a.hooks.map((h, i) => `${i + 1}=@${h.clip.handle} "${short(h.hook, 80)}"`).join(", ")
        : a.kind === "clips"
          ? a.clips.map((c, i) => `${i + 1}=@${c.handle}`).join(", ")
          : a.kind === "script" && a.script
            ? `script from @${a.script.clip.handle}: "${short(a.script.title, 60)}"`
            : short(a.reply, 200);
    return [`Q${n}: ${short(question, 200)}`, `A${n} (${a.kind}): ${list}`];
  });
}
