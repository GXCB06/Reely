// Relevance test set metrics (v0.2 1.3): how well a research's stored results match its brief, from labels on its top
// clips and creators (2 on target, 1 same audience / adjacent, 0 off). Pure, so the numbers are unit-tested.

export const EVAL_PLATFORMS = ["tiktok", "youtube", "instagram"] as const;
export type EvalPlatform = (typeof EVAL_PLATFORMS)[number];
export type Label = 0 | 1 | 2;

/** How many clips per platform the judge looks at: the top 10, and every Reel up to 25 (IG coverage counts them). */
export const JUDGE_CLIPS: Record<EvalPlatform, number> = { tiktok: 10, youtube: 10, instagram: 25 };
export const JUDGE_CREATORS = 5;

/** v0.2 targets (spec §3 1.3). */
export const TARGETS = { precision10: { tiktok: 0.8, youtube: 0.8, instagram: 0.7 }, creatorPrecision5: 0.8, igCoverage: 15, diversity: 0.4 };

/** A clip in the results page's default order ("best" first). */
export type EvalClip = { id: number; platform: EvalPlatform; handle: string };

export type LabelRow = { item: string; source: "ai" | "user"; label: number };

export const creatorItem = (platform: string, handle: string) => `${platform}:${handle.toLowerCase()}`;

/** One label per item: the owner's correction wins over the AI judge. */
export function effectiveLabels(rows: LabelRow[]): Map<string, Label> {
  const out = new Map<string, Label>();
  for (const r of rows) if (r.source === "ai") out.set(r.item, r.label as Label);
  for (const r of rows) if (r.source === "user") out.set(r.item, r.label as Label);
  return out;
}

/** The clips the judge sees for a platform: its top N in page order. */
export function topClips(clips: EvalClip[], platform: EvalPlatform, n = JUDGE_CLIPS[platform]) {
  return clips.filter((c) => c.platform === platform).slice(0, n);
}

/** A platform's top creators: in the order their first clip appears, so the best-ranked accounts come first. */
export function topCreators(clips: EvalClip[], platform: EvalPlatform, n = JUDGE_CREATORS): string[] {
  const seen: string[] = [];
  for (const c of clips) {
    if (c.platform !== platform) continue;
    const key = creatorItem(c.platform, c.handle);
    if (!seen.includes(key)) seen.push(key);
    if (seen.length === n) break;
  }
  return seen;
}

/** A share over the judged items only; `value` is null while none of them is judged (never counted as 0 or 2). */
export type Ratio = { value: number | null; judged: number; of: number };

function ratio(items: string[], labels: Map<string, Label>, hit: (l: Label) => boolean): Ratio {
  const judged = items.filter((i) => labels.has(i));
  return { value: judged.length ? judged.filter((i) => hit(labels.get(i)!)).length / judged.length : null, judged: judged.length, of: items.length };
}

export type RunStatsLite = {
  platforms?: Partial<Record<EvalPlatform, { found?: number; dropped?: Record<string, number> }>>;
  credits?: { total?: number };
} | null;

export type PlatformMetrics = {
  /** Share of the top 10 labelled 2, and labelled 1 or 2. */
  precision10: Ratio;
  precision10Loose: Ratio;
  creatorPrecision5: Ratio;
  /** Clips labelled 2 on this platform (IG coverage). */
  useful: number;
  /** Off-topic ÷ found when the run was searched. */
  noise: number | null;
  clips: number;
};

export type BriefMetrics = {
  runId: string;
  region: string;
  platforms: Partial<Record<EvalPlatform, PlatformMetrics>>;
  /** Share of the top 20 from the 3 creators with the most clips there. */
  diversity: number | null;
  credits: number | null;
  costPerUseful: number | null;
  seconds: number | null;
};

export function briefMetrics(input: {
  runId: string;
  region: string;
  clips: EvalClip[];
  labels: Map<string, Label>;
  stats: RunStatsLite;
  seconds: number | null;
}): BriefMetrics {
  const { clips, labels, stats } = input;
  const platforms: BriefMetrics["platforms"] = {};
  let useful = 0;
  for (const p of EVAL_PLATFORMS) {
    const own = clips.filter((c) => c.platform === p);
    if (!own.length) continue;
    const top10 = own.slice(0, 10).map((c) => String(c.id));
    const usefulHere = own.filter((c) => labels.get(String(c.id)) === 2).length;
    useful += usefulHere;
    const found = stats?.platforms?.[p]?.found ?? 0;
    const offTopic = stats?.platforms?.[p]?.dropped?.offTopic ?? 0;
    platforms[p] = {
      precision10: ratio(top10, labels, (l) => l === 2),
      precision10Loose: ratio(top10, labels, (l) => l >= 1),
      creatorPrecision5: ratio(topCreators(clips, p), labels, (l) => l === 2),
      useful: usefulHere,
      noise: found ? offTopic / found : null,
      clips: own.length,
    };
  }

  const top20 = clips.slice(0, 20);
  const perCreator = new Map<string, number>();
  for (const c of top20) perCreator.set(creatorItem(c.platform, c.handle), (perCreator.get(creatorItem(c.platform, c.handle)) ?? 0) + 1);
  const biggest3 = [...perCreator.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0);
  const credits = stats?.credits?.total ?? null;

  return {
    runId: input.runId,
    region: input.region,
    platforms,
    diversity: top20.length ? biggest3 / top20.length : null,
    credits,
    costPerUseful: credits !== null && useful > 0 ? credits / useful : null,
    seconds: input.seconds,
  };
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** Averages over briefs (a brief without a value, e.g. not judged yet, is left out of that average). */
export type Summary = {
  briefs: number;
  precision10: Partial<Record<EvalPlatform, number | null>>;
  precision10Loose: Partial<Record<EvalPlatform, number | null>>;
  creatorPrecision5: number | null;
  igCoverage: number | null;
  noise: Partial<Record<EvalPlatform, number | null>>;
  diversity: number | null;
  costPerUseful: number | null;
  seconds: number | null;
};

export function summarize(briefs: BriefMetrics[]): Summary {
  const per = <K extends keyof PlatformMetrics>(p: EvalPlatform, k: K, pick: (m: PlatformMetrics[K]) => number | null) =>
    mean(briefs.map((b) => (b.platforms[p] ? pick(b.platforms[p]![k]) : null)));
  const out: Summary = {
    briefs: briefs.length,
    precision10: {},
    precision10Loose: {},
    noise: {},
    creatorPrecision5: mean(briefs.flatMap((b) => Object.values(b.platforms).map((m) => m!.creatorPrecision5.value))),
    igCoverage: mean(briefs.map((b) => (b.platforms.instagram && b.platforms.instagram.precision10.judged ? b.platforms.instagram.useful : null))),
    diversity: mean(briefs.map((b) => b.diversity)),
    costPerUseful: mean(briefs.map((b) => b.costPerUseful)),
    seconds: mean(briefs.map((b) => b.seconds)),
  };
  for (const p of EVAL_PLATFORMS) {
    out.precision10[p] = per(p, "precision10", (r) => (r as Ratio).value);
    out.precision10Loose[p] = per(p, "precision10Loose", (r) => (r as Ratio).value);
    out.noise[p] = per(p, "noise", (n) => n as number | null);
  }
  return out;
}

/** The summary as a Markdown table (for "Copy as Markdown" and snapshot notes). */
export function summaryMarkdown(rows: { name: string; s: Summary }[]): string {
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
  const num = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : x.toFixed(d));
  const head = ["", "Briefs", "P@10 TikTok", "P@10 YouTube", "P@10 IG", "Creators P@5", "IG useful", "Diversity", "Credits/useful", "Seconds"];
  const lines = rows.map(({ name, s }) =>
    [name, String(s.briefs), pct(s.precision10.tiktok), pct(s.precision10.youtube), pct(s.precision10.instagram), pct(s.creatorPrecision5), num(s.igCoverage), pct(s.diversity), num(s.costPerUseful), num(s.seconds, 0)].join(" | "),
  );
  return [head.join(" | "), head.map(() => "---").join(" | "), ...lines].map((l) => `| ${l} |`).join("\n");
}
