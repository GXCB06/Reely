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

type Mode = "signin" | "signup" | "link" | "linkSent";

const MIN_PASSWORD = 8;

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
 * Email + password sign-in and sign-up (no emails sent, so no hourly email limit),
 * with the emailed link kept as a fallback.
 */
export function LoginForm() {
  const t = useTranslations("login");
  const locale = useLocale();
  const params = useSearchParams();
  const next = params.get("next") ?? `/${locale}/app`;
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : `/${locale}/app`;

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  // Back from /auth/callback when the sign-in could not be finished (e.g. started on another address of the site).
  const [error, setError] = useState<string | null>(params.get("error") === "auth" ? t("authFailed") : null);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      if (error.status === 429) return setError(t("rateLimited"));
      if (error.code === "user_already_exists") return setError(t("alreadyExists"));
      if (error.code === "weak_password") return setError(t("weakPassword", { n: MIN_PASSWORD }));
      if (error.code === "email_not_confirmed") return setError(t("notConfirmed"));
      return setError(mode === "signup" ? t("signupError") : t("wrongPassword"));
    }
    // Sign-up returns no session when Supabase still requires email confirmation.
    if (!data.session) {
      setBusy(false);
      return setError(t("checkEmailToConfirm"));
    }
    // Full navigation so the server sees the new session cookie right away.
    window.location.assign(safeNext);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    setBusy(false);
    if (error) return setError(error.status === 429 ? t("rateLimited") : t("error"));
    switchTo("linkSent");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setBusy(false);
      setError(t("googleError"));
    }
  }

  function continueWithPasted(e: React.FormEvent) {
    e.preventDefault();
    if (isOurSignInLink(pasted.trim())) return window.location.assign(pasted.trim());
    setError(t("badLink"));
  }

  const title = { signin: t("title"), signup: t("signupTitle"), link: t("linkModeTitle"), linkSent: t("linkTitle") }[mode];
  const subtitle = {
    signin: t("passwordSubtitle"),
    signup: t("signupSubtitle"),
    link: t("subtitle"),
    linkSent: t("linkSubtitle", { email }),
  }[mode];

  return (
    <Card className="rounded-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {(mode === "signin" || mode === "signup") && (
          <>
            <Button type="button" variant="outline" onClick={signInWithGoogle} disabled={busy} className="h-11 w-full rounded-full bg-white">
              <GoogleIcon /> {t("google")}
            </Button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {(mode === "signin" || mode === "signup") && (
          <form onSubmit={submitPassword} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? t("newPassword", { n: MIN_PASSWORD }) : t("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {busy ? t("verifying") : mode === "signup" ? t("createAccount") : t("signIn")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? t("noAccount") : t("haveAccount")}{" "}
              <button
                type="button"
                onClick={() => switchTo(mode === "signin" ? "signup" : "signin")}
                className="font-medium text-primary hover:underline"
              >
                {mode === "signin" ? t("createAccount") : t("signIn")}
              </button>
            </p>
            <button
              type="button"
              onClick={() => switchTo("link")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {t("useLinkInstead")}
            </button>
          </form>
        )}

        {mode === "link" && (
          <form onSubmit={sendLink} className="space-y-3">
            <Input type="email" required autoComplete="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {busy ? t("sending") : t("send")}
            </Button>
            <BackButton label={t("backToPassword")} onClick={() => switchTo("signin")} />
          </form>
        )}

        {mode === "linkSent" && (
          <form onSubmit={continueWithPasted} className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("linkStep1")}</li>
              <li>{t("linkStep2")}</li>
            </ol>
            <Input required autoComplete="off" placeholder={t("pastePlaceholder")} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <Button type="submit" className="w-full rounded-full" disabled={!pasted.trim()}>
              {t("continue")}
            </Button>
            <BackButton label={t("backToPassword")} onClick={() => switchTo("signin")} />
          </form>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> {label}
    </button>
  );
}
