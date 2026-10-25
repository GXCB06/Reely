"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ProductForm as Values, saveProductAction } from "./actions";

export function ProductForm({ initial }: { initial: Values }) {
  const t = useTranslations("product");
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProductAction(values);
      if (res.ok) toast.success(t("saved"));
      else toast.error(res.field === "url" ? t("badUrl") : t("error"));
    });
  }

  const field = (key: keyof Values, label: string, hint: string, control: React.ReactNode) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {control}
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-3xl border bg-card p-6 shadow-sm">
      {field("name", t("name"), t("nameHint"), <Input required maxLength={80} value={values.name} onChange={set("name")} className="bg-white" />)}
      {field("url", t("url"), t("urlHint"), <Input type="url" placeholder="https://" value={values.url} onChange={set("url")} className="bg-white" />)}
      {field(
        "description",
        t("description"),
        t("descriptionHint"),
        <Textarea rows={4} maxLength={1000} value={values.description} onChange={set("description")} className="bg-white" />,
      )}
      {field("audience", t("audience"), t("audienceHint"), <Input maxLength={300} value={values.audience} onChange={set("audience")} className="bg-white" />)}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{t("language")}</span>
        <div className="flex gap-2">
          {(["th", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setValues((v) => ({ ...v, language: l }))}
              className={`chip ${values.language === l ? "chip-on" : ""}`}
            >
              {values.language === l && <Check className="size-3.5" />}
              {l === "th" ? "ไทย" : "English"}
            </button>
          ))}
        </div>
        <span className="block text-xs text-muted-foreground">{t("languageHint")}</span>
      </div>
      <Button type="submit" disabled={pending || !values.name.trim()} className="h-11 rounded-full px-6">
        {pending && <Loader2 className="size-4 animate-spin" />} {t("save")}
      </Button>
    </form>
  );
}
