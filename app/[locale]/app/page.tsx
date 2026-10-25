import { setRequestLocale } from "next-intl/server";
import { ResearchChat } from "@/components/chat/research-chat";
import type { RegionChoice } from "@/lib/region";

const REGIONS = new Set<RegionChoice>(["th", "global", "both"]);

/** Home = the research chat. `?q=…&region=…&go=1` pre-fills it (used by "search again" on results). */
export default async function HomePage({ params, searchParams }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 1000) : "";
  const region = typeof sp.region === "string" && REGIONS.has(sp.region as RegionChoice) ? (sp.region as RegionChoice) : "th";

  // key: a fresh chat each time the link changes (e.g. "New research" while a chat is open).
  return <ResearchChat key={`${q}|${region}|${String(sp.n ?? "")}`} initialText={q} initialRegion={region} autoSend={sp.go === "1" && !!q} />;
}
