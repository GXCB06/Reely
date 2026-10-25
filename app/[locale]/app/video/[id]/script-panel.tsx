"use client";

import { Copy, Loader2, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
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
  productName,
  initialScripts,
}: {
  videoId: number;
  productName: string | null;
  initialScripts: SavedScript[];
}) {
  const t = useTranslations("script");
  const locale = useLocale();
  const [scripts, setScripts] = useState(initialScripts);
  const [pending, startTransition] = useTransition();

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
      const res = await makeMyVersionAction(videoId, locale);
      if (!res.ok) return void toast.error(t("error"));
      setScripts((s) => [res.script, ...s]);
      if (res.script.content.source === "sample") toast.info(t("sampleNotice"));
    });
  }

  const latest = scripts[0]?.content;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("forProduct", { product: productName })}</p>
        <Button onClick={generate} disabled={pending} className="rounded-full">
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
