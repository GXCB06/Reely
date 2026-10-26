import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AccountRow, AccountRowSkeleton } from "@/components/tracking/account-row";
import { AddAccountForm } from "@/components/tracking/add-account-form";
import type { Platform } from "@/lib/adapters/types";
import { createClient } from "@/lib/supabase/server";

export default async function TrackingPage({ params }: PageProps<"/[locale]/app/tracking">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tracking");
  const supabase = await createClient();
  const { data } = await supabase.from("tracked_accounts").select("id, platform, handle").order("created_at");
  const accounts = (data ?? []) as { id: string; platform: Platform; handle: string }[];

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
      <header className="page-wash px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6">
          <AddAccountForm />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("costNote")}</p>
      </header>

      <div className="space-y-4 px-10 pb-16">
        {accounts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          accounts.map((a) => (
            <Suspense key={a.id} fallback={<AccountRowSkeleton />}>
              <AccountRow id={a.id} platform={a.platform} handle={a.handle} />
            </Suspense>
          ))
        )}
      </div>
    </div>
  );
}
