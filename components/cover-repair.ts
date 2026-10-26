// Collects covers that failed to load on a page and asks the server to repair them in batches (one request per
// ~24 covers instead of one per card). Each video is asked about at most once per page load.

const BATCH = 24;
const WAIT_MS = 400;
const waiting = new Map<number, (url: string | null) => void>();
const asked = new Map<number, Promise<string | null>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const ids = [...waiting.keys()];
  const resolvers = new Map(waiting);
  waiting.clear();
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const covers: Record<string, string> = await fetch("/api/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: batch }),
    })
      .then((r) => (r.ok ? r.json() : { covers: {} }))
      .then((j) => j.covers ?? {})
      .catch(() => ({}));
    batch.forEach((id) => resolvers.get(id)?.(covers[id] ?? null));
  }
}

/** A stored cover URL for this video once repaired, or null when it could not be repaired. */
export function repairCover(videoId: number): Promise<string | null> {
  const known = asked.get(videoId);
  if (known) return known;
  const promise = new Promise<string | null>((resolve) => waiting.set(videoId, resolve));
  asked.set(videoId, promise);
  timer ??= setTimeout(flush, WAIT_MS);
  return promise;
}
