import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LinkPreview = { url: string; title: string | null; description: string | null; text: string };

const MAX_BYTES = 600_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;

/** Private, loopback, link-local and other non-public ranges must never be fetched (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  if (url.username || url.password) throw new Error("credentials in url");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("private address");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).trim() || null : null;
}

/**
 * Reads a public product page: title, description and the first ~2,500 characters of visible text.
 * Follows up to 3 redirects, re-checking each hop. Returns null when the page can't be read.
 */
export async function readLink(raw: string): Promise<LinkPreview | null> {
  try {
    let url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "ReelyBot/0.1 (+product preview)", accept: "text/html" },
        cache: "no-store",
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      url = new URL(next, url);
      res = null;
    }
    if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;

    // Read at most MAX_BYTES so a huge page can't exhaust memory.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks));

    const title = meta(html, "og:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() ?? null;
    const description = meta(html, "og:description") ?? meta(html, "description");
    const text = decode(
      html
        .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);
    return { url: url.toString(), title: title || null, description, text };
  } catch {
    return null;
  }
}
