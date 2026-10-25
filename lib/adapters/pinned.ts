/** Pinned posts come first and are older than the posts after them: drop any post a later one is newer than. */
export function dropPinned<T extends { publishedAt: string | null }>(videos: T[]): T[] {
  return videos.filter((v, i) => !videos.slice(i + 1).some((later) => (later.publishedAt ?? "") > (v.publishedAt ?? "")));
}
