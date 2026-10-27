import { Lock, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/shell/logo";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "./login-form";
import { Showcase } from "./showcase";

/** Sign-in: the form on the left, what Reely does on the right (stacked on phones, with the form first). */
export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("login");

  return (
    <div className="min-h-dvh bg-[#f6f5fb] p-3 md:p-4">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-7xl gap-4 overflow-hidden rounded-[2.25rem] bg-white p-3 shadow-sm md:min-h-[calc(100dvh-2rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col px-5 py-6 md:px-10 lg:px-14">
          <div className="flex items-center justify-between">
            <Logo height={32} />
            <div className="flex items-center gap-1 rounded-full bg-muted p-0.5 text-xs">
              {(["th", "en"] as const).map((l) => (
                <Link
                  key={l}
                  href="/login"
                  locale={l}
                  className={`rounded-full px-2.5 py-1 font-medium ${locale === l ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {l === "th" ? "ไทย" : "EN"}
                </Link>
              ))}
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>

          <div className="mx-auto w-full max-w-sm space-y-2 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t("trustPublic")}
            </p>
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t("trustNoPost")}
            </p>
          </div>
        </section>

        <section className="min-h-[34rem] lg:min-h-0">
          <Showcase />
        </section>
      </div>
    </div>
  );
}
