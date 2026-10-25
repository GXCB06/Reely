import { setRequestLocale } from "next-intl/server";
import { Sidebar } from "@/components/shell/sidebar";
import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);

  let email: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    email = (data?.claims?.email as string | undefined) ?? null;
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect({ href: "/login", locale });
  }

  return (
    <div className="flex min-h-dvh items-start bg-sidebar">
      <Sidebar email={email} onSignOut={email ? signOut : undefined} />
      <main className="my-2 mr-2 flex-1 overflow-hidden rounded-3xl bg-background">
        {!isSupabaseConfigured() && (
          <p className="bg-amber-100 px-6 py-2 text-xs text-amber-900">
            Supabase keys are not set yet — sign-in and saving are off. Add them to .env.local.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
