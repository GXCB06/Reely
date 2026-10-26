// What the user wants the clips for. It steers keywords, the relevance check, ranking and the per-clip ideas.
// No server imports (shared by the chat, the server and tests).
import { captionLanguage } from "./region";
import { bestScore, keepRate, type OutlierLabel } from "./scoring";

export const GOALS = ["sell", "shop", "startup", "brand"] as const;
/** sell = affiliate / TikTok Shop; shop = a shop or local business; startup = an app or SaaS; brand = personal brand. */
export type Goal = (typeof GOALS)[number];

export const isGoal = (v: unknown): v is Goal => typeof v === "string" && (GOALS as readonly string[]).includes(v);

type Rankable = {
  label: OutlierLabel;
  views: number | null;
  saves: number | null;
  shares: number | null;
  hasShop?: boolean;
  creatorFollowers?: number | null;
  caption?: string;
  language?: string | null;
  usual?: number | null;
  reach?: number | null;
};

/** Accounts this small can be copied by anyone with a phone (no celebrity or big-budget effect). */
const SMALL_ACCOUNT = 100_000;

/** How much more useful a video is for this goal (1 = neutral). Only reorders videos inside the same label. */
export function goalFactor(v: Rankable, goal: Goal): number {
  const small = v.creatorFollowers != null && v.creatorFollowers < SMALL_ACCOUNT;
  const saveRate = v.views && v.saves != null ? v.saves / v.views : 0;
  switch (goal) {
    // Videos that sell: a Shop link, people saving/sharing (buying intent), sellers like them.
    case "sell":
      return (v.hasShop ? 1.8 : 1) * (small ? 1.2 : 1) * (1 + 5 * (keepRate(v) ?? 0));
    // Local businesses: Thai-language clips from accounts their size.
    case "shop":
      return (v.caption !== undefined && captionLanguage({ caption: v.caption, language: v.language }) === "th" ? 1.4 : 1) * (small ? 1.3 : 1);
    // Feature promotion: saves mean "useful, I'll come back to this".
    case "startup":
      return 1 + 25 * saveRate;
    // Growing an audience: clips that beat the creator's own usual views by the most.
    case "brand":
      return Math.min(3, 1 + Math.log10(Math.max(1, v.usual ?? v.reach ?? 1)) / 2);
  }
}

/** "Best for your goal": the label still comes first, then views weighted by keep rate and the goal factor. */
export function goalScore(v: Rankable, goal: Goal | null | undefined): number {
  const base = bestScore(v);
  if (!goal) return base;
  const tier = Math.floor(base / 1e12) * 1e12;
  return tier + (base - tier) * goalFactor(v, goal);
}

/** Picks the score function for a goal (plain "best" when there is none). */
export const scoreFor = (goal: Goal | null | undefined) => (v: Rankable) => goalScore(v, goal);
