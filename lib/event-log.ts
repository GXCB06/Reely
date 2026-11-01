import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { type ClientEvent, eventSchema } from "./events";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Adds one client_events row for the signed-in user. Never throws: a lost event must not break what the user did. */
export async function recordEvent(supabase: Supabase, event: ClientEvent) {
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) return;
  const { name, requestId, source, props } = parsed.data;
  try {
    const { error } = await supabase.from("client_events").insert({ name, request_id: requestId ?? null, source: source ?? null, props });
    if (error) console.warn("[events] not recorded", name, error.message);
  } catch (e) {
    console.warn("[events] not recorded", name, (e as Error).message);
  }
}
