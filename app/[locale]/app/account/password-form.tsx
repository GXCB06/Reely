"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

/** Lets a signed-in user set or change their password (accounts made with an email link have none). */
export function PasswordForm() {
  const t = useTranslations("account");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return void toast.error(t("mismatch"));
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return void toast.error(error.code === "weak_password" ? t("weak", { n: MIN_PASSWORD }) : t("error"));
    setPassword("");
    setConfirm("");
    toast.success(t("saved"));
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 rounded-3xl border bg-card p-6 shadow-sm">
      <h2 className="font-heading text-lg font-bold">{t("passwordTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
      <Input
        type="password"
        required
        minLength={MIN_PASSWORD}
        autoComplete="new-password"
        placeholder={t("newPassword", { n: MIN_PASSWORD })}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        type="password"
        required
        minLength={MIN_PASSWORD}
        autoComplete="new-password"
        placeholder={t("confirmPassword")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" disabled={busy} className="rounded-full">
        {t("save")}
      </Button>
    </form>
  );
}
