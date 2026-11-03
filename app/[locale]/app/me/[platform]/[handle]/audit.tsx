import { Lightbulb, Sparkles } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Thumb } from "@/components/thumb";
import { Link } from "@/i18n/navigation";
import { type CanvasClip, clipCards } from "@/lib/canvas-data";
import type { AuditPoint, StoredAudit } from "@/lib/channel-audit";
import type { createClient } from "@/lib/supabase/server";
import { AnalyseButton, IdeaToCanvas } from "./audit-buttons";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * "Analyse my channel" on a channel page: what the hits share, what the weaker posts share, gaps against the accounts
 * the founder watches, and 5 ideas that open in the canvas. Every point shows the posts or clips it comes from.
 */
export async function ChannelAudit({ supabase, platform, handle, fetchedAt, now }: { supabase: Supabase; platform: string; handle: string; fetchedAt: string | null; now: number }) {
  const t = await getTranslations("me");
  const format = await getFormatter();
  const { data: own } = await supabase.from("own_accounts").select("audit, audit_at").eq("platform", platform).eq("handle", handle).maybeSingle();
  const audit = (own?.audit as StoredAudit | null) ?? null;
  const auditAt = (own?.audit_at as string | null) ?? null;
  const stale = !!audit && !!auditAt && !!fetchedAt && Date.parse(fetchedAt) > Date.parse(auditAt);

  if (!audit) {
    return (
      <section className="space-y-3 rounded-3xl border-2 border-primary/30 bg-primary/5 p-5" data-me="audit">
        <h2 className="inline-flex items-center gap-1.5 font-heading text-lg font-bold">
          <Sparkles className="size-5 text-primary" /> {t("analyseTitle")}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("analyseHint")}</p>
        <AnalyseButton platform={platform} handle={handle} again={false} />
      </section>
    );
  }

  const ids = [...new Set([...audit.commonInHits, ...audit.weakPattern, ...audit.gaps, ...audit.ideas].flatMap((p) => p.videoIds))];
  const cards = new Map((await clipCards(supabase, ids)).map((c) => [c.id, c]));
  const cited = (videoIds: number[]) => videoIds.map((id) => cards.get(id)).filter((c): c is CanvasClip => !!c);
  const points = (title: string, list: AuditPoint[], empty?: string) => (
    <div className="space-y-2">
      <h3 className="font-heading font-bold">{title}</h3>
      {list.length === 0 && empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <ul className="space-y-3">
        {list.map((p, i) => (
          <li key={i} className="space-y-1.5 text-sm">
            <p>{p.point}</p>
            <Cited clips={cited(p.videoIds)} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-5 rounded-3xl border-2 border-primary/30 bg-primary/5 p-5" data-me="audit">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="inline-flex items-center gap-1.5 font-heading text-lg font-bold">
            <Sparkles className="size-5 text-primary" /> {t("analyseTitle")}
          </h2>
          <p className="mt-1">{audit.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("analysedAt", { when: format.relativeTime(new Date(auditAt ?? now), now), posts: audit.postsRead, clips: audit.clipsRead })}
            {!stale && <> · {t("upToDate")}</>}
          </p>
        </div>
        {stale && <AnalyseButton platform={platform} handle={handle} again />}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {points(t("commonTitle"), audit.commonInHits)}
        {points(t("weakTitle"), audit.weakPattern)}
        {points(t("gapsTitle"), audit.gaps, t("gapsNone"))}
      </div>
      <div className="space-y-3">
        <h3 className="inline-flex items-center gap-1.5 font-heading font-bold">
          <Lightbulb className="size-4 text-primary" /> {t("ideasTitle")}
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {audit.ideas.map((idea, i) => (
            <article key={i} className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-me="idea">
              <p className="font-heading font-bold">{idea.title}</p>
              <p className="font-medium">“{idea.hook}”</p>
              <p className="text-muted-foreground">{idea.angle}</p>
              <p className="text-xs text-muted-foreground">{idea.why}</p>
              <Cited clips={cited(idea.videoIds)} />
              <IdeaToCanvas platform={platform} handle={handle} index={i} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The posts or clips a point comes from, as small covers linking to each clip's page. */
function Cited({ clips }: { clips: CanvasClip[] }) {
  if (!clips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {clips.map((c) => (
        <Link key={c.id} href={`/app/video/${c.id}`} title={`@${c.handle}: ${c.caption.slice(0, 80)}`} className="block w-9 overflow-hidden rounded-md ring-1 ring-border">
          <span className="block aspect-[9/16]">
            <Thumb src={c.thumbnailUrl} videoId={c.id} className="h-full w-full object-cover" />
          </span>
        </Link>
      ))}
    </div>
  );
}
