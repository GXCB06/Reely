import { Search, Sparkles } from "lucide-react";
import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AccountRow, AccountRowSkeleton } from "@/components/tracking/account-row";
import { AddAccountForm } from "@/components/tracking/add-account-form";
import { SuggestedAccounts } from "@/components/tracking/suggested-accounts";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Platform } from "@/lib/adapters/types";
import { createClient } from "@/lib/supabase/server";
import { searchKnownAccounts, suggestedAccounts } from "@/lib/tracking-suggestions";

/** Accounts to follow without leaving Reely: `?q=` searches creators Reely has seen; otherwise suggestions. */
async function FindAccounts({ query, tracked }: { query: string; tracked: Set<string> }) {
  const t = await getTranslations("tracking");
  const supabase = await createClient();
  const accounts = query ? await searchKnownAccounts(supabase, query, tracked) : await suggestedAccounts(supabase, tracked);
  if (!accounts.length) {
    return <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">{query ? t("searchEmpty", { q: query }) : t("suggestEmpty")}</p>;
  }
  return <SuggestedAccounts accounts={accounts} />;
}

export default async function TrackingPage({ params, searchParams }: PageProps<"/[locale]/app/tracking">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 60) : "";
  const t = await getTranslations("tracking");
  const supabase = await createClient();
  const { data } = await supabase.from("tracked_accounts").select("id, platform, handle").order("created_at");
  const accounts = (data ?? []) as { id: string; platform: Platform; handle: string }[];
  const tracked = new Set(accounts.map((a) => `${a.platform}:${a.handle}`));

  // Opening the page is what triggers refreshes (cost rule 5); remember when it happened. The write starts
  // now (it needs the request's cookies) but the page doesn't wait for it.
  if (accounts.length) {
    after(
      Promise.resolve(
        supabase
          .from("tracked_accounts")
          .update({ last_opened_at: new Date().toISOString() })
          .in("id", accounts.map((a) => a.id)),
      ),
    );
  }

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="space-y-8 px-4 md:px-10 pb-16">
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-1.5 font-heading text-xl font-bold">
                <Sparkles className="size-5 text-primary" /> {query ? t("searchTitle", { q: query }) : t("suggestTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{query ? t("searchHint") : t("suggestHint")}</p>
            </div>
            {/* Searches accounts Reely already knows (free): no copying links from the app. */}
            <form className="flex items-center gap-1 rounded-full border bg-card px-3 py-1 focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="size-4 text-muted-foreground" />
              <input
                name="q"
                defaultValue={query}
                maxLength={60}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="w-48 bg-transparent py-1 text-sm outline-none"
              />
              {query && (
                <Link href="/app/tracking" className="text-xs text-muted-foreground hover:text-foreground">
                  {t("searchClear")}
                </Link>
              )}
            </form>
          </div>
          <Suspense
            key={query}
            fallback={
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
            }
          >
            <FindAccounts query={query} tracked={tracked} />
          </Suspense>
          <details className="rounded-2xl border bg-card px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">{t("pasteTitle")}</summary>
            <div className="mt-3">
              <AddAccountForm />
              <p className="mt-2 text-xs text-muted-foreground">{t("costNote")}</p>
            </div>
          </details>
        </section>

        <section className="space-y-4">
          <h2 className="font-heading text-xl font-bold">{t("trackedTitle", { n: accounts.length })}</h2>
          {accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            accounts.map((a) => (
              <Suspense key={a.id} fallback={<AccountRowSkeleton />}>
                <AccountRow id={a.id} platform={a.platform} handle={a.handle} />
              </Suspense>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
