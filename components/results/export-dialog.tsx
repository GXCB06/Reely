"use client";

import { Braces, Check, Copy, Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Format = "csv" | "md" | "json";
const FORMATS: { id: Format; icon: typeof FileText }[] = [
  { id: "md", icon: FileText },
  { id: "csv", icon: FileSpreadsheet },
  { id: "json", icon: Braces },
];

/**
 * "Export": the research's clips with their real numbers (plus product, keywords, summary and formulas) as a file,
 * or copied straight to the clipboard for Claude / ChatGPT to write scripts from data instead of guesses.
 */
export function ExportDialog({ runId, total }: { runId: string; total: number }) {
  const t = useTranslations("export");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"top" | "all">("all");
  const [format, setFormat] = useState<Format>("md");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const url = (fmt: Format, inline = false) =>
    `/api/research/${runId}/export?${new URLSearchParams({ format: fmt, scope, lang: locale === "en" ? "en" : "th", ...(inline ? { inline: "1" } : {}) })}`;

  async function copyForAi() {
    setCopying(true);
    try {
      const res = await fetch(url("md", true));
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("failed"));
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <Download className="size-4" /> {t("button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border bg-card p-5 shadow-xl md:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 font-heading text-xl font-bold">
                  <Download className="size-5 text-primary" /> {t("title")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-5 mb-2 text-sm font-semibold">{t("what")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "top"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition ${scope === s ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
                >
                  <span className="block font-medium">{s === "all" ? t("all", { n: total }) : t("top")}</span>
                  <span className="block text-xs text-muted-foreground">{t("includes")}</span>
                </button>
              ))}
            </div>

            <p className="mt-5 mb-2 text-sm font-semibold">{t("as")}</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFormat(id)}
                  className={`rounded-2xl border px-2 py-3 text-center transition ${format === id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
                >
                  <Icon className="mx-auto size-5 text-primary" />
                  <span className="mt-1 block text-sm font-semibold">{t(`format.${id}.name`)}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{t(`format.${id}.hint`)}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={copyForAi}
                disabled={copying}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {copying ? <Loader2 className="size-4 animate-spin" /> : copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {t("copy")}
              </button>
              <a
                href={url(format)}
                download
                onClick={() => setTimeout(() => setOpen(false), 300)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Download className="size-4" /> {t("download")}
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("aiTip")}</p>
          </div>
        </div>
      )}
    </>
  );
}
