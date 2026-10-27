"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { trackAccountAction } from "@/app/[locale]/app/tracking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";

export function AddAccountForm() {
  const t = useTranslations("tracking");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "youtube" | "instagram">("tiktok");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await trackAccountAction(value, platform);
      if (!res.ok) return void toast.error(t(res.error === "limit" ? "errorLimit" : "errorInvalid"));
      toast.success(t("added", { handle: res.handle }));
      setValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1.5">
        {(["tiktok", "instagram", "youtube"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPlatform(p)} className={`chip ${platform === p ? "chip-on" : ""}`}>
            {platform === p && <Check className="size-3.5" />}
            {p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"}
          </button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("placeholder")}
        className="h-10 w-72 rounded-full bg-white"
      />
      <Button type="submit" disabled={pending || !value.trim()} className="h-10 rounded-full px-5">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("track")}
      </Button>
    </form>
  );
}
