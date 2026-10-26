"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Mascot } from "@/components/mascot";
import { PlatformIcon } from "@/components/platform-icon";
import type { Platform } from "@/lib/adapters/types";

const SCENE_MS = 6500;
const SCENES = ["read", "search", "filter", "score"] as const;

/** Highlights the words of the keywords inside the user's own brief (Thai has no spaces: substring match). */
function highlight(text: string, keywords: string[]) {
  const words = [...new Set(keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length);
  if (!words.length || !text) return [text];
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-transparent px-0.5 font-semibold text-primary">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * What plays while a research runs (30-60 s): how Reely works, told with the user's own brief, keywords and
 * filters: read the brief → search every platform → keep what fits → score every keeper. Loops until done.
 */
export function ResearchStory({
  brief,
  keywords,
  exclusions,
  platforms,
}: {
  brief: string;
  keywords: string[];
  exclusions: string[];
  platforms: Platform[];
}) {
  const t = useTranslations("story");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = tick * 1000;
  const sceneIndex = Math.floor(elapsed / SCENE_MS) % SCENES.length;
  const scene = SCENES[sceneIndex];
  const inScene = Math.floor((elapsed % SCENE_MS) / 1000);
  const ring: Record<Platform, string> = { tiktok: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", instagram: "left-[8%] bottom-[14%]", youtube: "right-[8%] bottom-[14%]" };

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex gap-1 px-5 pt-4">
        {SCENES.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= sceneIndex ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div key={scene} className="story-in px-6 pt-4 pb-6">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("step", { n: sceneIndex + 1, of: SCENES.length })}</p>
        <h3 className="mt-1 font-heading text-xl font-bold">{t(`${scene}.title`)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t(`${scene}.body`)}</p>

        <div className="mt-5 grid min-h-56 place-items-center rounded-2xl bg-muted/50 p-5">
          {scene === "read" && (
            <p className="max-w-lg text-center text-lg leading-relaxed">“{highlight(brief, keywords)}”</p>
          )}

          {scene === "search" && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative size-40">
                <div className="absolute inset-0 rounded-full border border-primary/25" />
                <div className="absolute inset-6 rounded-full border border-primary/20" />
                <div className="radar-sweep absolute inset-0 rounded-full" />
                <div className="absolute inset-0 grid place-items-center">
                  <Mascot size={52} />
                </div>
                {platforms.map((p) => (
                  <span key={p} className={`absolute grid size-9 place-items-center rounded-full bg-card shadow ring-1 ring-border ${ring[p]}`}>
                    <PlatformIcon platform={p} className="size-5" />
                  </span>
                ))}
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
                {keywords.map((k, i) => (
                  <span
                    key={k}
                    className={`rounded-full px-3 py-1 text-sm transition-all ${
                      i === tick % keywords.length ? "bg-primary text-primary-foreground shadow" : i < tick % keywords.length ? "bg-card ring-1 ring-border" : "text-muted-foreground/60"
                    }`}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {scene === "filter" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase">{t("filter.dropped")}</p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {(exclusions.length ? exclusions : [t("filter.offTopic")]).map((w, i) => (
                  <span key={w} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900 ring-1 ring-amber-200">
                    <span className="strike" style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
                      {w}
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{t("filter.ai")}</p>
            </div>
          )}

          {scene === "score" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="rounded-full bg-card px-3 py-0.5 text-xs font-semibold tracking-widest text-muted-foreground ring-1 ring-border">
                {t("score.example")}
              </span>
              <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
                {t("score.usually")}
                <span className="rounded-lg bg-card px-2 py-1 font-semibold ring-1 ring-border">2.1K</span>
                {t("score.got")}
                <span className="rounded-lg bg-card px-2 py-1 font-semibold ring-1 ring-border">248K</span>
              </p>
              <p className="flex items-center gap-3">
                <span className="font-heading text-4xl font-bold">{inScene >= 2 ? "118×" : "…"}</span>
                {inScene >= 3 && (
                  <span className="story-in rounded-full bg-[var(--breakout)] px-3 py-1 text-sm font-bold text-white">🔥 {t("score.breakout")}</span>
                )}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">{t("score.note")}</p>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("wait")}</p>
      </div>
    </div>
  );
}
