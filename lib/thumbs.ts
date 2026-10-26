import "server-only";
import { instagramPostCover } from "@/lib/adapters/instagram-scrapecreators";
import { tiktokVideoCover } from "@/lib/adapters/tiktok-scrapecreators";
import type { NormalizedVideo } from "@/lib/adapters/types";
import { fixturesEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Vendor cover links are signed and expire (TikTok: ~5-23 h), after which they return 403.
// So covers are copied once into a public Supabase Storage bucket and served from there.
const BUCKET = "thumbs";
const MAX_BYTES = 600_000;
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 10_000;
// Some vendor CDNs (TikTok's US one in particular) refuse requests that don't look like a browser.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
};
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

export const isStoredThumb = (url: string | null) => !!url && url.includes(`/storage/v1/object/public/${BUCKET}/`);

/** Only the vendor CDNs we get covers from: never fetch an arbitrary address server-side. */
function isVendorCdn(url: string) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|ytimg\.com|cdninstagram\.com|fbcdn\.net)$/.test(hostname);
  } catch {
    return false;
  }
}

type CopyResult = { url: string } | { failed: string };

async function fetchCover(url: string) {
  return fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
}

async function copyOne(admin: NonNullable<ReturnType<typeof createAdminClient>>, v: NormalizedVideo): Promise<CopyResult> {
  if (!v.thumbnailUrl || !isVendorCdn(v.thumbnailUrl)) return { failed: "not a vendor cover" };
  try {
    // One retry for a timeout or a server error (CDNs hiccup); a 403/404 won't get better.
    let res = await fetchCover(v.thumbnailUrl).catch(() => null);
    if (!res || res.status >= 500) res = await fetchCover(v.thumbnailUrl);
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    const ext = TYPES[type];
    if (!res.ok) return { failed: `http ${res.status}` };
    if (!ext) return { failed: `type ${type || "none"}` };
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) return { failed: "too big" };
    const path = `${v.platform}/${v.platformVideoId.replace(/[^\w-]/g, "_")}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: true, cacheControl: "31536000" });
    if (error) return { failed: "upload" };
    return { url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (e) {
    return { failed: (e as Error).name === "TimeoutError" ? "timeout" : "fetch error" };
  }
}

/**
 * Copies covers that are not stored yet (skipping `alreadyStored` keys) and returns "platform:id" → public URL.
 * Failures keep the vendor URL, so a run never fails because of a cover.
 */
export async function storeThumbnails(videos: NormalizedVideo[], alreadyStored: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const admin = createAdminClient();
  if (!admin || fixturesEnabled()) return out;
  const todo = videos.filter((v) => !alreadyStored.has(`${v.platform}:${v.platformVideoId}`) && v.thumbnailUrl);
  // Why covers failed, by platform and reason, so a gap in stored covers can be explained from the logs.
  const failures = new Map<string, number>();
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((v) => copyOne(admin, v)));
    batch.forEach((v, j) => {
      const r = results[j];
      if ("url" in r) out.set(`${v.platform}:${v.platformVideoId}`, r.url);
      else failures.set(`${v.platform} ${r.failed}`, (failures.get(`${v.platform} ${r.failed}`) ?? 0) + 1);
    });
  }
  if (todo.length) {
    const why = [...failures].map(([k, n]) => `${k}: ${n}`).join(", ");
    console.log(`[thumbs] stored ${out.size} of ${todo.length} covers${why ? `; failed: ${why}` : ""}`);
  }
  return out;
}

/**
 * Copies the covers of these videos to storage and updates their rows. Meant to run with after(), once the
 * results are already shown (vendor cover links stay valid for at least ~5 h, plenty for this).
 */
export async function persistThumbnails(videos: NormalizedVideo[]): Promise<void> {
  const admin = createAdminClient();
  if (!admin || fixturesEnabled() || !videos.length) return;
  const stored = new Set<string>();
  for (const platform of [...new Set(videos.map((v) => v.platform))]) {
    const { data } = await admin
      .from("videos")
      .select("platform, platform_video_id")
      .eq("platform", platform)
      .in("platform_video_id", videos.filter((v) => v.platform === platform).map((v) => v.platformVideoId))
      .like("thumbnail_url", `%/storage/v1/object/public/${BUCKET}/%`);
    data?.forEach((r) => stored.add(`${r.platform}:${r.platform_video_id}`));
  }
  const urls = await storeThumbnails(videos, stored);
  await Promise.all(
    [...urls].map(([key, url]) => {
      const [platform, ...id] = key.split(":");
      return admin.from("videos").update({ thumbnail_url: url }).eq("platform", platform).eq("platform_video_id", id.join(":"));
    }),
  );
}

/** Cover repairs cost 1 credit each; at most this many a day across all users. */
const REPAIRS_PER_DAY = 150;
const REPAIR_ENDPOINTS = ["/v2/tiktok/video", "/v1/instagram/post"];

/**
 * Covers that expired before they were copied (vendor links last ~5-23 h): fetches a fresh link for each video
 * (1 credit), copies it to storage and updates the row. Called only for covers a user is looking at, capped per
 * day. Returns video id → stored cover URL for the ones that worked.
 */
export async function repairCovers(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const admin = createAdminClient();
  if (!admin || fixturesEnabled() || !ids.length) return out;

  const [{ data: rows }, { data: usage }] = await Promise.all([
    admin.from("videos").select("id, platform, platform_video_id, url, thumbnail_url").in("id", ids),
    admin
      .from("api_usage")
      .select("calls")
      .eq("day", new Date().toISOString().slice(0, 10))
      .eq("provider", "scrapecreators")
      .in("endpoint", REPAIR_ENDPOINTS),
  ]);
  const used = (usage ?? []).reduce((sum, r) => sum + (r.calls as number), 0);
  const todo = (rows ?? [])
    .filter((r) => r.platform !== "youtube" && !isStoredThumb(r.thumbnail_url as string | null))
    .slice(0, Math.max(0, REPAIRS_PER_DAY - used));

  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (r) => {
        try {
          const fresh = r.platform === "tiktok" ? await tiktokVideoCover(r.url as string) : await instagramPostCover(r.url as string);
          if (!fresh) return;
          const copied = await copyOne(admin, {
            platform: r.platform,
            platformVideoId: r.platform_video_id,
            thumbnailUrl: fresh,
          } as NormalizedVideo);
          if (!("url" in copied)) return;
          await admin.from("videos").update({ thumbnail_url: copied.url }).eq("id", r.id);
          out.set(r.id as number, copied.url);
        } catch (e) {
          console.warn("[thumbs] repair failed", r.id, (e as Error).message);
        }
      }),
    );
  }
  if (todo.length) console.log(`[thumbs] repaired ${out.size} of ${todo.length} expired covers (${used + todo.length} repair calls today)`);
  return out;
}
