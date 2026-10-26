import "server-only";
import { adapters } from "@/lib/adapters";
import { tiktokSoundVideos } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo } from "@/lib/adapters/types";
import type { FormatDescription } from "@/lib/ai/schemas";
import { describeFormat, matchFormat } from "@/lib/ai/tasks";
import { saveVideos } from "@/lib/cache";
import { type VideoRow, videoFromRow } from "@/lib/db-mappers";
import { type FormatStage, formatStage, postsPerDay, topSounds } from "@/lib/format-stats";
import { looksThai } from "@/lib/region";
import { bestScore, labelFor, passesNoiseFilter, reachScore } from "@/lib/scoring";
import type { ScoredVideo } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Format explorer ("who else made this kind of clip?"). Per format: 1 call for videos using the seed's sound
// + 1 keyword search per AI search phrase (max 2) = about 3 credits. Shared cache for 3 days, all users.
const TTL_MS = 3 * 864e5;
const MIN_VIEWS = 5_000;
const MAX_VIDEOS = 40;

export type FormatData = Omit<FormatDescription, "searchPhrases"> & {
  source: "ai" | "sample";
  stage: FormatStage;
  thisWeek: number;
  lastWeek: number;
  perDay: { day: string; count: number }[];
  sounds: { id: string; title: string; count: number; avgViews: number }[];
  topics: { topic: string; videoIds: number[] }[];
  totals: { videos: number; creators: number; views: number };
  seedSound: { id: string; title: string } | null;
};

export type FormatRow = { id: string; seedVideoId: number; data: FormatData; videoIds: number[]; updatedAt: string };

export async function getFormat(seedVideoId: number): Promise<FormatRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("formats")
    .select("id, seed_video_id, data, video_ids, updated_at")
    .eq("seed_video_id", seedVideoId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    seedVideoId: data.seed_video_id as number,
    data: data.data as FormatData,
    videoIds: data.video_ids as number[],
    updatedAt: data.updated_at as string,
  };
}

export const isFresh = (f: FormatRow) => Date.now() - new Date(f.updatedAt).getTime() < TTL_MS;

/** Scored cards for a format's videos (views ÷ followers where known; no paid baseline lookups). */
export async function loadFormatVideos(ids: number[]): Promise<ScoredVideo[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("*").in("id", ids);
  return ((data ?? []) as VideoRow[])
    .map((v) => {
      const reach = reachScore(v.views, v.creator_followers);
      return videoFromRow(v, { reach, usual: null, usualViews: null, label: labelFor(null, reach, { views: v.views, followers: v.creator_followers }) });
    })
    .sort((a, b) => bestScore(b) - bestScore(a) || (b.views ?? 0) - (a.views ?? 0));
}

/** Builds (or rebuilds) the format of one seed video and stores it in the shared cache. */
export async function buildFormat(seedVideoId: number, userId: string | null, locale: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: seed } = await supabase.from("videos").select("*").eq("id", seedVideoId).maybeSingle<VideoRow>();
  const admin = createAdminClient();
  if (!seed || !admin) return { ok: false };

  const description = await describeFormat(
    {
      caption: seed.caption,
      handle: seed.creator_handle,
      views: seed.views,
      soundTitle: seed.sound_title,
      thumbnailUrl: seed.thumbnail_url,
    },
    locale,
  );

  // 1. Videos that use the same sound (TikTok), plus ones already in the cache with that sound (free).
  const soundId = seed.platform === "tiktok" ? seed.sound_id : null;
  const [bySound, cachedSound] = await Promise.all([
    soundId ? tiktokSoundVideos(soundId).catch(() => [] as NormalizedVideo[]) : Promise.resolve([] as NormalizedVideo[]),
    soundId
      ? supabase.from("videos").select("*").eq("sound_id", soundId).limit(MAX_VIDEOS)
      : Promise.resolve({ data: [] as VideoRow[] }),
  ]);
  // 2. Keyword searches for the format itself (it may use many sounds).
  const byPhrase = await Promise.all(
    description.searchPhrases.slice(0, 2).map((q) =>
      adapters.tiktok.searchVideos(q, { region: looksThai(q) ? "th" : "global", days: 90 }).catch(() => [] as NormalizedVideo[]),
    ),
  );

  const seen = new Set<string>([`${seed.platform}:${seed.platform_video_id}`]);
  const fromCache = ((cachedSound.data ?? []) as VideoRow[]).map((r) => videoFromRow(r, { reach: null, usual: null, usualViews: null, label: "normal" }));
  const candidates = [...bySound, ...fromCache, ...byPhrase.flat()]
    .filter((v) => passesNoiseFilter(v.views, v.creatorFollowers) && (v.views ?? 0) >= MIN_VIEWS)
    .filter((v) => {
      const key = `${v.platform}:${v.platformVideoId}`;
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, 80);

  // 3. AI keeps the videos that really use the format and groups them by topic.
  const match = await matchFormat(
    description,
    candidates.map((v) => ({
      caption: v.caption,
      creatorHandle: v.creatorHandle,
      soundTitle: v.sound?.title ?? null,
      sameSound: !!soundId && v.sound?.id === soundId,
    })),
    locale,
  );
  // An "original sound" shared by many videos is usually the meme itself (e.g. the wizard cat), so those
  // always count. Licensed music is used by all kinds of videos, so those need the AI to agree.
  const sameMemeSound = (v: NormalizedVideo) => !!soundId && seed.sound_original === true && v.sound?.id === soundId;
  const keptIdx = candidates
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => sameMemeSound(v) || (match ? match.scores[i] > 0 : !!soundId && v.sound?.id === soundId))
    .sort((a, b) => (b.v.views ?? 0) - (a.v.views ?? 0))
    .slice(0, MAX_VIDEOS);
  const kept = keptIdx.map(({ v }) => v);
  console.info(
    `[format] seed ${seedVideoId}: ${bySound.length} same sound, ${byPhrase.flat().length} from search, ` +
      `${candidates.length} candidates, ${kept.length} kept (AI ${match ? "on" : "off"})`,
  );
  const dbIds = await saveVideos(kept);
  const idOf = (v: NormalizedVideo) => dbIds.get(`${v.platform}:${v.platformVideoId}`) ?? (v as ScoredVideo).dbId;
  const keptIds = [seedVideoId, ...kept.map(idOf).filter((id): id is number => id !== undefined)];

  const all = [{ publishedAt: seed.published_at, views: seed.views, creatorHandle: seed.creator_handle, sound: soundId ? { id: soundId, title: seed.sound_title ?? "" } : null }, ...kept];
  const indexToId = new Map(keptIdx.map(({ v, i }) => [i, idOf(v)]));
  const { searchPhrases: _phrases, source, ...rest } = description;
  void _phrases;
  const data: FormatData = {
    ...rest,
    source,
    ...formatStage(all),
    perDay: postsPerDay(all),
    sounds: topSounds(all),
    topics: (match?.topics ?? [])
      .map((t) => ({ topic: t.topic, videoIds: t.examples.map((i) => indexToId.get(i)).filter((id): id is number => id !== undefined) }))
      .filter((t) => t.videoIds.length),
    totals: {
      videos: all.length,
      creators: new Set(all.map((v) => v.creatorHandle)).size,
      views: all.reduce((s, v) => s + (v.views ?? 0), 0),
    },
    seedSound: soundId ? { id: soundId, title: seed.sound_title ?? "" } : null,
  };

  const { error } = await admin.from("formats").upsert(
    { seed_video_id: seedVideoId, data, video_ids: keptIds, created_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "seed_video_id" },
  );
  return { ok: !error };
}

/** The formats board: every explored format, most creators posting it this week first. */
export async function listFormats(): Promise<FormatRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("formats").select("id, seed_video_id, data, video_ids, updated_at").order("updated_at", { ascending: false }).limit(50);
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      seedVideoId: r.seed_video_id as number,
      data: r.data as FormatData,
      videoIds: r.video_ids as number[],
      updatedAt: r.updated_at as string,
    }))
    .sort((a, b) => b.data.thisWeek - a.data.thisWeek || b.data.totals.views - a.data.totals.views);
}
