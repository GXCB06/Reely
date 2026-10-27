import { z } from "zod";
import { toCsv, toJson, toMarkdown } from "@/lib/export";
import { researchExport } from "@/lib/export-data";
import { createClient } from "@/lib/supabase/server";

const query = z.object({
  format: z.enum(["csv", "md", "json"]),
  scope: z.enum(["top", "all"]).default("all"),
  lang: z.enum(["th", "en"]).default("th"),
  /** "1" = return the text to show/copy instead of a file download. */
  inline: z.enum(["1"]).optional(),
});

const TYPES = { csv: "text/csv; charset=utf-8", md: "text/markdown; charset=utf-8", json: "application/json; charset=utf-8" } as const;

/** Research export (CSV for Excel, Markdown for AI assistants, JSON). The user's own researches only (RLS). */
export async function GET(request: Request, ctx: RouteContext<"/api/research/[id]/export">) {
  const { id } = await ctx.params;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return new Response("Bad request", { status: 400 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return new Response("Unauthorized", { status: 401 });

  const { format, scope, lang, inline } = parsed.data;
  const data = await researchExport(supabase, id, scope, lang);
  if (!data) return new Response("Not found", { status: 404 });

  const body = format === "csv" ? toCsv(data) : format === "json" ? toJson(data) : toMarkdown(data, lang);
  const name = `reely-${(data.title || "research").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40)}-${data.createdAt.slice(0, 10)}.${format}`;
  return new Response(body, {
    headers: {
      "Content-Type": TYPES[format],
      "Cache-Control": "no-store",
      ...(inline ? {} : { "Content-Disposition": `attachment; filename="reely-export.${format}"; filename*=UTF-8''${encodeURIComponent(name)}` }),
    },
  });
}
