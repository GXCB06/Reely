// Turns what a user pastes ("@flowaccount", a profile URL, a video URL) into a platform + handle.
// Pure, so it is tested directly.

export type TrackablePlatform = "tiktok" | "youtube";

export type ParsedHandle = { platform: TrackablePlatform | null; handle: string };

const HANDLE_RE = /^[A-Za-z0-9._-]{2,64}$/;

export function parseHandle(input: string): ParsedHandle | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw) || /^(www\.)?(tiktok|youtube)\.com\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^www\.|^m\./, "");
    const at = url.pathname.match(/\/@([^/?#]+)/)?.[1];
    if (host.endsWith("tiktok.com") && at) return valid({ platform: "tiktok", handle: at });
    if ((host.endsWith("youtube.com") || host === "youtu.be") && at) return valid({ platform: "youtube", handle: at });
    const channel = url.pathname.match(/\/channel\/(UC[\w-]{22})/)?.[1];
    if (host.endsWith("youtube.com") && channel) return { platform: "youtube", handle: channel };
    return null;
  }

  return valid({ platform: null, handle: raw.replace(/^@/, "") });
}

function valid(p: ParsedHandle): ParsedHandle | null {
  const handle = decodeURIComponent(p.handle);
  return HANDLE_RE.test(handle) ? { ...p, handle } : null;
}
