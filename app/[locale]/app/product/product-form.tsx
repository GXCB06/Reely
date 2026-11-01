"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { GOALS } from "@/lib/goals";
import { deleteProductAction, type ProductForm as Values, saveProductAction } from "./actions";
import { FillFromLink, type ProductDraft } from "./fill-from-link";

const DRAFT_FIELDS = ["name", "url", "description", "audience", "competitors", "goal"] as const;

/**
 * Edits one saved product (with `id`), or adds a new one; shown in the product sheet. "Fill in from a link" drafts the
 * fields: a new product takes the whole draft, an existing one only gets its empty fields filled, so nothing typed is
 * lost. When adding, audience, competitors and the script language sit under "More details". The buttons stay at the
 * bottom of the sheet. `onDirtyChange` lets the sheet ask before closing with unsaved changes.
 */
export function ProductForm({
  initial,
  id = null,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  initial: Values;
  id?: string | null;
  onDone?: () => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("product");
  const tg = useTranslations("goals");
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const dirty = DRAFT_FIELDS.some((k) => values[k] !== initial[k]) || values.language !== initial.language;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  function applyDraft(draft: ProductDraft) {
    const filled: Values = { ...draft, goal: draft.goal ?? "", language: values.language };
    if (!id) {
      setValues(filled);
      return void toast.success(t("filled"));
    }
    setValues((v) => {
      const next = { ...v };
      for (const k of DRAFT_FIELDS) if (!v[k].trim() && filled[k]) next[k] = filled[k] as never;
      return next;
    });
    toast.success(t("sheet.filledEmpty"));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProductAction(values, id);
      if (!res.ok) return void toast.error(t(res.field === "url" ? "badUrl" : res.field === "limit" ? "limit" : "error"));
      toast.success(t("saved"));
      onDone?.();
      router.refresh();
    });
  }

  const field = (label: string, hint: string, control: React.ReactNode) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {control}
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
  const heading = (text: string) => <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{text}</h3>;

  const goal = (
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
  );
  const audience = field(t("audience"), t("audienceHint"), <Input maxLength={300} value={values.audience} onChange={set("audience")} className="bg-white" />);
  const language = (
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
  );
  const competitors = field(
    t("competitors"),
    t("competitorsHint"),
    <Input maxLength={300} value={values.competitors} onChange={set("competitors")} placeholder="FlowAccount, PEAK, Xero" className="bg-white" />,
  );

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6 px-5 pb-6">
        <FillFromLink initialLink={initial.url} hint={t(id ? "sheet.fillHintEdit" : "fillHint")} onDraft={applyDraft} />
        <section className="space-y-4">
          {heading(t("sheet.sectionBasics"))}
          {field(t("name"), t("nameHint"), <Input required maxLength={80} value={values.name} onChange={set("name")} className="bg-white" />)}
          {field(t("url"), t("urlHint"), <Input type="url" placeholder="https://" value={values.url} onChange={set("url")} className="bg-white" />)}
          {field(
            t("description"),
            t("descriptionHint"),
            <Textarea rows={4} maxLength={1000} value={values.description} onChange={set("description")} className="bg-white" />,
          )}
        </section>
        {id ? (
          <>
            <section className="space-y-4">
              {heading(t("sheet.sectionAudience"))}
              {goal}
              {audience}
              {language}
            </section>
            <section className="space-y-4">
              {heading(t("sheet.sectionCompetitors"))}
              {competitors}
            </section>
          </>
        ) : (
          <>
            {goal}
            <details className="group rounded-2xl border border-dashed px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t("moreDetails")}</summary>
              <div className="mt-4 space-y-5">
                {audience}
                {competitors}
                {language}
              </div>
            </details>
          </>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-5 py-3">
        <Button type="submit" disabled={pending || !values.name.trim()} className="h-10 rounded-full px-6">
          {pending && <Loader2 className="size-4 animate-spin" />} {t(id ? "save" : "add")}
        </Button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={pending} className="h-10 rounded-full px-4 text-sm text-muted-foreground hover:bg-muted">
            {t("sheet.cancel")}
          </button>
        )}
        {id && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm", { name: initial.name }))) return;
              startTransition(async () => {
                const res = await deleteProductAction(id);
                if (!res.ok) return void toast.error(t("error"));
                onDone?.();
                router.refresh();
              });
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-4" /> {t("delete")}
          </button>
        )}
      </div>
    </form>
  );
}
