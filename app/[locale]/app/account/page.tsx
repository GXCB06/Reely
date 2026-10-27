import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

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
      <div className="px-4 md:px-10 pb-16">
        <PasswordForm />
      </div>
    </div>
  );
}
