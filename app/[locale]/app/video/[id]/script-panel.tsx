"use client";

import { Copy, Loader2, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Goal } from "@/lib/goals";
import { makeMyVersionAction, type SavedScript } from "./actions";

function scriptToText(s: SavedScript["content"]) {
  return [
    s.title,
    "",
    ...s.beats.map((b) => `[${b.time}] ${b.label.toUpperCase()}\n${b.voiceover}${b.onScreen ? `\nOn screen: ${b.onScreen}` : ""}\nShot: ${b.visual}`),
    "",
    s.caption,
    s.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
  ].join("\n");
}

export function ScriptPanel({
  videoId,
  products,
  initialScripts,
}: {
  videoId: number;
  products: { id: string; name: string; goal: Goal | null }[];
  initialScripts: SavedScript[];
}) {
  const t = useTranslations("script");
  const tg = useTranslations("goals");
  const locale = useLocale();
  const [scripts, setScripts] = useState(initialScripts);
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState(products[0]?.id ?? null);
  const productName = products.find((p) => p.id === productId)?.name ?? null;
  const goal = products.find((p) => p.id === productId)?.goal ?? null;

  if (!productName) {
    return (
      <div className="rounded-2xl border border-dashed p-5 text-sm">
        <p>{t("needProduct")}</p>
        <Link href="/app/product" className="mt-2 inline-block font-medium text-primary hover:underline">
          {t("setUpProduct")}
        </Link>
      </div>
    );
  }

  function generate() {
    startTransition(async () => {
      const res = await makeMyVersionAction(videoId, locale, productId);
      if (!res.ok) return void toast.error(t("error"));
      setScripts((s) => [res.script, ...s]);
      if (res.script.content.source === "sample") toast.info(t("sampleNotice"));
    });
  }

  const latest = scripts[0]?.content;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {products.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("forWhich")}
            <select
              value={productId ?? ""}
              onChange={(e) => setProductId(e.target.value)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm text-foreground"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">{t("forProduct", { product: productName })}</p>
        )}
        {goal && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground" title={tg(`${goal}.desc`)}>
            {t("structure", { goal: tg(`${goal}.short`) })}
          </span>
        )}
        <Button onClick={generate} disabled={pending} className="ml-auto rounded-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {scripts.length ? t("again") : t("make")}
        </Button>
      </div>

      {latest && (
        <article className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-bold">{latest.title}</h3>
              <p className="text-xs text-muted-foreground">
                ~{latest.durationSeconds}s · {latest.borrowed}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={async () => {
                await navigator.clipboard.writeText(scriptToText(latest));
                toast.success(t("copied"));
              }}
            >
              <Copy className="size-3.5" /> {t("copy")}
            </Button>
          </div>

          <ol className="mt-4 space-y-3">
            {latest.beats.map((b, i) => (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3 rounded-xl bg-muted p-3">
                <div>
                  <p className="text-[11px] font-bold tracking-widest text-primary uppercase">{t(`beat.${b.label}`)}</p>
                  <p className="font-mono text-xs text-muted-foreground">{b.time}</p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{b.voiceover}</p>
                  {b.onScreen && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">{t("onScreen")}:</span> {b.onScreen}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("shot")}: {b.visual}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-xl border p-3 text-sm">
            <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{t("caption")}</p>
            <p className="mt-1">{latest.caption}</p>
            {latest.hashtags.length > 0 && (
              <p className="mt-1 text-primary">{latest.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
            )}
          </div>
          {scripts.length > 1 && <p className="mt-3 text-xs text-muted-foreground">{t("versions", { n: scripts.length })}</p>}
        </article>
      )}
    </div>
  );
}
