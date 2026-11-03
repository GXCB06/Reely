import { addToCanvasAction, listCanvasesAction, openInCanvasAction } from "@/app/[locale]/app/canvas/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * "Add to canvas" on clip cards. A route, not server actions: a page runs its server actions one at a time, so on a
 * research page the menu would wait behind the slow "your idea" AI call. Route handlers are outside proxy.ts's /app
 * gate, so the session is checked here; RLS keeps every row to its owner.
 */
async function signedIn() {
  if (!isSupabaseConfigured()) return false;
  const { data } = await (await createClient()).auth.getClaims();
  return Boolean(data?.claims);
}

export async function GET() {
  if (!(await signedIn())) return Response.json({ error: "auth" }, { status: 401 });
  return Response.json(await listCanvasesAction(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await signedIn())) return Response.json({ error: "auth" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { target?: unknown; videoId?: unknown; source?: unknown; runId?: unknown } | null;
  // "Open in canvas" on a research (same reason: the research page's own AI action would hold it up).
  if (body?.runId !== undefined) {
    const opened = await openInCanvasAction(body.runId as string);
    return Response.json(opened, { status: opened.ok ? 200 : 400 });
  }
  // addToCanvasAction validates every field with zod.
  const res = await addToCanvasAction(body?.target as { canvasId: string }, body?.videoId as number, body?.source as string);
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
