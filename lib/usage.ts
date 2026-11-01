import "server-only";
import { addCredit } from "@/lib/run-context";
import { createAdminClient } from "@/lib/supabase/admin";

/** Counts one external call in api_usage. Never throws: usage logging must not break a search. */
export async function logApiCall(provider: string, endpoint: string, calls = 1) {
  // The research running right now counts its own credits too (stats.credits, for cost per useful clip).
  if (provider === "scrapecreators") addCredit(endpoint, calls);
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("increment_api_usage", {
    p_provider: provider,
    p_endpoint: endpoint,
    p_calls: calls,
  });
  if (error) console.warn("[usage] could not log call", provider, endpoint, error.message);
}
