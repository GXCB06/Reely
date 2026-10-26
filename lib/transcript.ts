// Timed transcripts: parsing the vendor formats, and the numbers the hook breakdown shows. No server imports (tested directly).

/** One stretch of speech, in seconds from the start of the video. */
export type Segment = { start: number; end: number; text: string };

const vttTime = (h: string, m: string, s: string, ms: string) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
const CUE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

/** TikTok's WebVTT ("00:00:00.080 --> 00:00:15.120\ntext") → segments. */
export function parseVtt(vtt: string): Segment[] {
  const out: Segment[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n\s*\n/)) {
    const m = block.match(CUE);
    if (!m) continue;
    const text = block
      .slice(block.indexOf(m[0]) + m[0].length)
      .trim()
      .replace(/\s*\n\s*/g, " ");
    if (text) out.push({ start: vttTime(m[1], m[2], m[3], m[4]), end: vttTime(m[5], m[6], m[7], m[8]), text });
  }
  return out;
}

/**
 * Joins short pieces (Instagram gives one per word) into readable lines of up to `maxSeconds`, breaking at pauses.
 * Thai has no spaces between words, so pieces are joined with a space only when either side is not Thai.
 */
export function mergeSegments(segments: Segment[], maxSeconds = 4, pause = 0.7): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out.at(-1);
    if (last && s.start - last.end < pause && s.end - last.start <= maxSeconds) {
      const thai = /[฀-๿]$/.test(last.text) && /^[฀-๿]/.test(s.text);
      last.text = `${last.text}${thai ? "" : " "}${s.text}`;
      last.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/**
 * What is said in the first `seconds`: whole segments inside the window, plus the matching share of a segment that
 * runs past it (by time: TikTok cues can last 15 s, so the opening words are estimated, not cut by timestamp).
 */
export function firstSeconds(segments: Segment[], seconds = 3): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.start >= seconds) break;
    const duration = Math.max(s.end - s.start, 0.001);
    const share = Math.min(1, (seconds - s.start) / duration);
    if (share >= 1) {
      parts.push(s.text);
      continue;
    }
    const chars = Math.max(1, Math.round(s.text.length * share));
    // Don't cut an English word in half.
    const cut = /\s/.test(s.text) ? s.text.slice(0, chars).replace(/\s+\S*$/, "") || s.text.slice(0, chars) : s.text.slice(0, chars);
    parts.push(`${cut}…`);
    break;
  }
  return parts.join(" ").trim();
}

/** When speech starts and how much of the video has someone talking. */
export function speechStats(segments: Segment[], videoSeconds?: number | null) {
  if (!segments.length) return null;
  const end = Math.max(videoSeconds ?? 0, segments.at(-1)!.end);
  const talking = segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
  return { startsAt: segments[0].start, talkShare: end > 0 ? Math.min(1, talking / end) : 0, duration: end };
}

/** 75.4 → "1:15" */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
