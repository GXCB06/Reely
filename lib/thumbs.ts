import "server-only";
import type { NormalizedVideo } from "@/lib/adapters/types";
import { fixturesEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Vendor cover links are signed and expire (TikTok: ~5-23 h), after which they return 403.
// So covers are copied once into a public Supabase Storage bucket and served from there.
const BUCKET = "thumbs";
const MAX_BYTES = 600_000;
const CONCURRENCY = 8;
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

async function copyOne(admin: NonNullable<ReturnType<typeof createAdminClient>>, v: NormalizedVideo): Promise<string | null> {
  if (!v.thumbnailUrl || !isVendorCdn(v.thumbnailUrl)) return null;
  try {
    const res = await fetch(v.thumbnailUrl, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    const ext = TYPES[type];
    if (!res.ok || !ext) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) return null;
    const path = `${v.platform}/${v.platformVideoId.replace(/[^\w-]/g, "_")}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: true, cacheControl: "31536000" });
    if (error) return null;
    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
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
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const urls = await Promise.all(batch.map((v) => copyOne(admin, v)));
    batch.forEach((v, j) => urls[j] && out.set(`${v.platform}:${v.platformVideoId}`, urls[j]!));
  }
  return out;
}
