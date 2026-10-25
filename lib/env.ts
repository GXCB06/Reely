// Central place for environment flags. Public values only here; secrets are read in server-only modules.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Auth and the database are skipped until both public Supabase values are set (local dev before setup). */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/** When true, adapters read saved samples from lib/adapters/__fixtures__ instead of calling external APIs. */
export function fixturesEnabled() {
  return process.env.USE_FIXTURES !== "false";
}
