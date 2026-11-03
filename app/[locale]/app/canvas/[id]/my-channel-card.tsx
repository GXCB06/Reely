"use client";

import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { MyChannel } from "@/lib/canvas-data";
import { setUseMyChannelAction } from "../actions";

/** "What works on my channel": the latest My channels analysis, fed into generations unless switched off. */
export function MyChannelCard({ canvasId, channel, on }: { canvasId: string; channel: MyChannel; on: boolean }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [pending, start] = useTransition();
  return (
    <section className={`space-y-2 rounded-3xl border bg-card p-4 text-sm transition ${checked ? "" : "opacity-60"}`} data-canvas="my-channel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 font-heading font-bold">
          <TrendingUp className="size-4 text-primary" /> {t("myChannel")}
        </h2>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={checked}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setChecked(next);
              start(async () => {
                await setUseMyChannelAction(canvasId, next);
                router.refresh();
              });
            }}
            className="accent-[var(--primary)]"
          />
          {t("myChannelOn")}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("myChannelHint")}{" "}
        <Link href={`/app/me/${channel.platform}/${encodeURIComponent(channel.handle)}`} className="text-primary hover:underline">
          @{channel.handle}
        </Link>
      </p>
      <ul className="list-disc space-y-1 pl-5 text-xs">
        {channel.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </section>
  );
}
