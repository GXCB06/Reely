"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { GOALS } from "@/lib/goals";
import { deleteProductAction, type ProductForm as Values, saveProductAction } from "./actions";

/** Edits one saved product (with `id`), or adds a new one. */
export function ProductForm({ initial, id = null }: { initial: Values; id?: string | null }) {
  const t = useTranslations("product");
  const tg = useTranslations("goals");
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProductAction(values, id);
      if (!res.ok) return void toast.error(t(res.field === "url" ? "badUrl" : res.field === "limit" ? "limit" : "error"));
      toast.success(t("saved"));
      if (!id) setValues(initial);
      router.refresh();
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
    <form onSubmit={submit} className={`space-y-5 ${id ? "" : "rounded-3xl border bg-card p-6 shadow-sm"}`}>
      {field("name", t("name"), t("nameHint"), <Input required maxLength={80} value={values.name} onChange={set("name")} className="bg-white" />)}
      {field("url", t("url"), t("urlHint"), <Input type="url" placeholder="https://" value={values.url} onChange={set("url")} className="bg-white" />)}
      {field(
        "description",
        t("description"),
        t("descriptionHint"),
        <Textarea rows={4} maxLength={1000} value={values.description} onChange={set("description")} className="bg-white" />,
      )}
      {field("audience", t("audience"), t("audienceHint"), <Input maxLength={300} value={values.audience} onChange={set("audience")} className="bg-white" />)}
      {field(
        "competitors",
        t("competitors"),
        t("competitorsHint"),
        <Input maxLength={300} value={values.competitors} onChange={set("competitors")} placeholder="FlowAccount, PEAK, Xero" className="bg-white" />,
      )}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{t("goal")}</span>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              title={tg(`${g}.desc`)}
              onClick={() => setValues((v) => ({ ...v, goal: v.goal === g ? "" : g }))}
              className={`chip ${values.goal === g ? "chip-on" : ""}`}
            >
              {values.goal === g && <Check className="size-3.5" />}
              {tg(`${g}.label`)}
            </button>
          ))}
        </div>
        <span className="block text-xs text-muted-foreground">{t("goalHint")}</span>
      </div>
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
      <div className="flex items-center justify-between gap-3">
        <Button type="submit" disabled={pending || !values.name.trim()} className="h-11 rounded-full px-6">
          {pending && <Loader2 className="size-4 animate-spin" />} {t(id ? "save" : "add")}
        </Button>
        {id && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm", { name: initial.name }))) return;
              startTransition(async () => {
                const res = await deleteProductAction(id);
                if (!res.ok) return void toast.error(t("error"));
                router.refresh();
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-4" /> {t("delete")}
          </button>
        )}
      </div>
    </form>
  );
}
