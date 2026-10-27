// Pure helper for the Instagram adapter (tested directly).

/** Phrasings tried on popular search, in order (each empty answer costs nothing). */
export function popularQueries(keyword: string): string[] {
  const k = keyword.trim().replace(/\s+/g, " ");
  if (/\b(tips|ideas)$/i.test(k)) return [k];
  return [k, `${k} tips`, `${k} ideas`];
}
