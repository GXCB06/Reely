import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  type BriefMetrics,
  briefMetrics,
  EVAL_PLATFORMS,
  JUDGE_CLIPS,
  type Summary,
  summarize,
  topClips,
  topCreators,
} from "@/lib/eval";
import { loadEvalBrief } from "@/lib/eval-data";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AddBriefs } from "./add-briefs";
import { BriefCard, type BriefView, type EvalItem } from "./brief-card";
import { EvalSummary } from "./eval-summary";

const SUGGESTED = 12;
// "Re-run" runs a whole research from this page.
export const maxDuration = 120;
const RERUN_BATCH_MS = 2 * 3600_000;

/**
 * Owner-only: the relevance test set. Each brief's stored results are judged (strict AI, correctable in one tap) and
 * measured against the v0.2 targets; snapshots compare one search change with the last. Spends no credits.
 */
export default async function EvalPage({ params }: PageProps<"/[locale]/app/eval">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  if (!admin || !isOwner(claims?.claims?.email as string | undefined)) notFound();
  const ownerId = claims!.claims.sub as string;
  const t = await getTranslations("eval");
  const format = await getFormatter();

  const [{ data: set }, { data: mine }, { data: snapshots }] = await Promise.all([
    admin.from("eval_briefs").select("run_id, core, parent_run_id, added_at").order("added_at"),
    admin
      .from("research_runs")
      .select("id, title, brief, region, platforms, created_at")
      .eq("user_id", ownerId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(80),
    admin.from("eval_snapshots").select("note, created_at, metrics").order("created_at", { ascending: false }).limit(1),
  ]);
  const inSet = new Map((set ?? []).map((b) => [b.run_id as string, b.core as boolean]));
  // A re-run points at the brief it repeats: originals make the main rows, re-runs are compared with their originals.
  const parentOf = new Map((set ?? []).filter((b) => b.parent_run_id).map((b) => [b.run_id as string, b.parent_run_id as string]));

  const briefs = (await Promise.all([...inSet.keys()].map((id) => loadEvalBrief(admin, id)))).filter((b) => b !== null);
  const views: BriefView[] = [];
  const metrics: BriefMetrics[] = [];
  const unjudged: string[] = [];
  const allIds: string[] = [];
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

  for (const b of briefs) {
    const m = briefMetrics({ runId: b.run.id, region: b.run.region, clips: b.clips, labels: b.labels, stats: b.run.stats, seconds: b.run.seconds });
    metrics.push(m);
    allIds.push(b.run.id);
    const byId = new Map(b.videos.map((v) => [v.dbId!, v]));
    const item = (key: string, kind: EvalItem["kind"], platform: EvalItem["platform"], handle: string, videoId: number | null): EvalItem => ({
      item: key,
      kind,
      platform,
      videoId,
      handle,
      thumbnailUrl: videoId ? (byId.get(videoId)?.thumbnailUrl ?? null) : null,
      label: b.labels.get(key) ?? null,
      reason: b.reasons.get(key) ?? "",
      corrected: b.corrected.has(key),
    });
    const lists = EVAL_PLATFORMS.filter((p) => b.clips.some((c) => c.platform === p)).map((p) => ({
      platform: p,
      clips: topClips(b.clips, p, JUDGE_CLIPS[p]).map((c) => item(String(c.id), "clip", p, c.handle, c.id)),
      creators: topCreators(b.clips, p).map((key) => item(key, "creator", p, key.slice(key.indexOf(":") + 1), null)),
    }));
    const judged = lists.some((l) => l.clips.some((c) => c.label !== null));
    if (!judged) unjudged.push(b.run.id);
    const line = EVAL_PLATFORMS.filter((p) => m.platforms[p])
      .map((p) => `${p === "instagram" ? "IG" : p === "youtube" ? "YouTube" : "TikTok"} ${pct(m.platforms[p]!.precision10.value)}`)
      .concat(m.costPerUseful !== null ? [t("costLine", { n: m.costPerUseful.toFixed(1) })] : [])
      .join(" · ");
    views.push({
      runId: b.run.id,
      title: b.run.title,
      brief: b.run.brief,
      region: b.run.region,
      goal: b.run.goal,
      core: inSet.get(b.run.id) ?? false,
      rerunOf: parentOf.has(b.run.id) ? (briefs.find((x) => x.run.id === parentOf.get(b.run.id))?.run.title ?? "—") : null,
      judged,
      lists,
      line: judged ? line : t("notJudged"),
    });
  }
  // Core briefs first, then the newest.
  views.sort((a, b) => Number(b.core) - Number(a.core));

  const originals = metrics.filter((m) => !parentOf.has(m.runId));
  // The latest batch of re-runs (added within 2 hours of the newest one), compared with their originals: each search
  // change is measured once, not mixed with re-runs made for an earlier change.
  const rerunRows = (set ?? []).filter((b) => b.parent_run_id);
  const newest = Math.max(0, ...rerunRows.map((b) => new Date(b.added_at as string).getTime()));
  const batch = rerunRows.filter((b) => new Date(b.added_at as string).getTime() >= newest - RERUN_BATCH_MS);
  const latestIds = new Set(batch.map((b) => b.run_id as string));
  const reruns = metrics.filter((m) => latestIds.has(m.runId));
  const rerunParents = new Set(batch.map((b) => b.parent_run_id as string));
  const group = (region?: string) => summarize(region ? originals.filter((m) => m.region === region) : originals);
  const rows = [
    { key: "all", name: t("rowAll"), s: group() },
    { key: "th", name: t("region.th"), s: group("th") },
    { key: "global", name: t("region.global"), s: group("global") },
    { key: "both", name: t("region.both"), s: group("both") },
    // Same briefs before and after a search change.
    { key: "rerunBefore", name: t("rowRerunBefore"), s: summarize(originals.filter((m) => rerunParents.has(m.runId))) },
    { key: "rerunAfter", name: t("rowRerunAfter"), s: summarize(reruns) },
  ].filter((r) => r.key === "all" || r.s.briefs > 0);

  const lastSnap = snapshots?.[0];
  const last = lastSnap
    ? { note: lastSnap.note as string | null, createdAt: lastSnap.created_at as string, all: ((lastSnap.metrics as { all?: Summary }).all ?? null) as Summary | null }
    : null;

  // Not in the set yet: your other finished researches. With an empty set, suggest the latest one per product.
  const candidates = (mine ?? [])
    .filter((r) => !inSet.has(r.id as string))
    .map((r) => ({
      id: r.id as string,
      title: ((r.title as string | null) || (r.brief as string)).slice(0, 60),
      region: (r.region as string | null) ?? "th",
      when: format.relativeTime(new Date(r.created_at as string)),
      platforms: ((r.platforms as string[]) ?? []).map((p) => (p === "instagram" ? "IG" : p === "youtube" ? "YouTube" : "TikTok")).join(" + "),
    }));
  const suggested: string[] = [];
  if (!inSet.size) {
    const seenTitles = new Set<string>();
    for (const c of candidates) {
      const key = c.title.toLowerCase().slice(0, 24);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      suggested.push(c.id);
      if (suggested.length === SUGGESTED) break;
    }
  }

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="space-y-6 px-4 pb-16 md:px-10">
        <EvalSummary rows={rows} last={last} unjudged={unjudged} all={allIds} />
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold">{t("setTitle", { n: views.length, core: views.filter((v) => v.core).length })}</h2>
          {views.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          {views.map((v) => (
            <BriefCard key={v.runId} view={v} />
          ))}
        </section>
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold">{t("addTitle")}</h2>
          <AddBriefs candidates={candidates.slice(0, 40)} suggested={suggested} />
        </section>
      </div>
    </div>
  );
}
