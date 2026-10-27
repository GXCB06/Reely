import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordForm } from "./password-form";
import { UsageSection } from "./usage";

export default async function AccountPage({ params }: PageProps<"/[locale]/app/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <div>
      <header className="page-wash px-4 md:px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{(data?.claims?.email as string | undefined) ?? ""}</p>
      </header>
      <div className="space-y-10 px-4 md:px-10 pb-16">
        <Suspense fallback={<Skeleton className="h-40 max-w-2xl rounded-2xl" />}>
          <UsageSection />
        </Suspense>
        <PasswordForm />
      </div>
    </div>
  );
}
