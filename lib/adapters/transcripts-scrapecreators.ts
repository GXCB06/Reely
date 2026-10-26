import "server-only";
import { fixturesEnabled } from "@/lib/env";
import { mergeSegments, parseVtt, type Segment } from "@/lib/transcript";
import { logApiCall } from "@/lib/usage";
import { readFixture } from "./fixtures";
import type { Platform } from "./types";

const BASE = "https://api.scrapecreators.com";

export type TimedTranscript = { segments: Segment[]; language: string | null };

async function call<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set");
  const res = await fetch(`${BASE}${endpoint}?${new URLSearchParams(params)}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ScrapeCreators ${endpoint} failed: ${res.status}`);
  await logApiCall("scrapecreators", endpoint);
  return (await res.json()) as T;
}

export const TRANSCRIPT_ENDPOINTS = ["/v1/tiktok/video/transcript", "/v1/youtube/video/transcript", "/v2/instagram/media/transcript"];

/**
 * A clip's speech with timestamps (1 credit; a YouTube clip without captions costs nothing). Null when the clip has
 * no speech or captions. Vendor limit: clips under 2 minutes. TikTok never uses the AI fallback (+10 credits).
 */
export async function fetchTranscript(platform: Platform, url: string): Promise<TimedTranscript | null> {
  if (fixturesEnabled()) {
    if (platform !== "tiktok") return null;
    const data = await readFixture<{ transcript?: string | null }>("tiktok-transcript");
    return data?.transcript ? { segments: parseVtt(data.transcript), language: null } : null;
  }
  if (platform === "tiktok") {
    const data = await call<{ transcript?: string | null }>("/v1/tiktok/video/transcript", { url });
    const segments = data?.transcript ? parseVtt(data.transcript) : [];
    return segments.length ? { segments, language: null } : null;
  }
  if (platform === "youtube") {
    type Res = { transcript?: { text: string; startMs: string; endMs: string }[] | null; language?: string | null };
    const data = await call<Res>("/v1/youtube/video/transcript", { url });
    const segments = (data?.transcript ?? [])
      .map((t) => ({ start: Number(t.startMs) / 1000, end: Number(t.endMs) / 1000, text: t.text.replace(/\s+/g, " ").trim() }))
      .filter((s) => s.text);
    return segments.length ? { segments, language: data?.language ?? null } : null;
  }
  // Instagram: word-level timestamps, joined into readable lines.
  type Res = { transcripts?: { transcript_with_timestamp?: { start: number; end: number; text: string }[] }[] };
  const data = await call<Res>("/v2/instagram/media/transcript", { url });
  const words = (data?.transcripts?.[0]?.transcript_with_timestamp ?? []).filter((w) => w.text?.trim());
  const segments = mergeSegments(words.map((w) => ({ start: w.start, end: w.end, text: w.text.trim() })));
  return segments.length ? { segments, language: null } : null;
}
