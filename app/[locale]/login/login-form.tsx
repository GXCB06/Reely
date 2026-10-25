"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SUPABASE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

/** A pasted sign-in link must point at our own Supabase project, so this can't become an open redirect. */
function isOurSignInLink(value: string) {
  try {
    const url = new URL(value);
    return url.origin === new URL(SUPABASE_URL).origin && url.pathname.startsWith("/auth/v1/verify");
  } catch {
    return false;
  }
}

/**
 * Email sign-in in two steps. Step 2 accepts the link from the email (pasted here, so the session
 * lands in this same browser even if the email app opens links elsewhere) or a one-time code
 * (once a custom email template includes one).
 */
export function LoginForm() {
  const t = useTranslations("login");
  const locale = useLocale();
  const params = useSearchParams();
  const next = params.get("next") ?? `/${locale}/app`;
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : `/${locale}/app`;

  const [step, setStep] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    setBusy(false);
    if (error) return setError(t("error"));
    setStep("link");
  }

  async function continueWithPasted(e: React.FormEvent) {
    e.preventDefault();
    const value = pasted.trim();
    setError(null);
    if (isOurSignInLink(value)) {
      // Opening the link here completes sign-in in this browser (the callback then redirects into the app).
      return window.location.assign(value);
    }
    if (/^\d{6,10}$/.test(value)) {
      setBusy(true);
      const { error } = await createClient().auth.verifyOtp({ email, token: value, type: "email" });
      if (!error) return window.location.assign(safeNext);
      setBusy(false);
    }
    setError(t("badLink"));
  }

  return (
    <Card className="rounded-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{step === "email" ? t("title") : t("linkTitle")}</CardTitle>
        <CardDescription>{step === "email" ? t("subtitle") : t("linkSubtitle", { email })}</CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form onSubmit={sendEmail} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {busy ? t("sending") : t("send")}
            </Button>
          </form>
        ) : (
          <form onSubmit={continueWithPasted} className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("linkStep1")}</li>
              <li>{t("linkStep2")}</li>
            </ol>
            <Input
              required
              autoComplete="off"
              placeholder={t("pastePlaceholder")}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full rounded-full" disabled={busy || !pasted.trim()}>
              {busy ? t("verifying") : t("continue")}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setPasted("");
                setError(null);
              }}
              className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> {t("changeEmail")}
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
