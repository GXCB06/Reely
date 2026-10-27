"use client";

import { Bookmark, CalendarDays, Eye, Flame, Heart, PenLine, Quote, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";

const SLIDES = ["find", "why", "make"] as const;
const SLIDE_MS = 5500;

/** Example clips for the "find" slide: illustrative numbers, drawn as cards (no real creators). */
const SAMPLE_CLIPS = [
  { tone: "from-violet-500 to-fuchsia-400", platform: "tiktok" as const, views: "1.9M", x: "47×", text: "slide.find.clip1" },
  { tone: "from-sky-500 to-indigo-400", platform: "instagram" as const, views: "640K", x: "21×", text: "slide.find.clip2" },
  { tone: "from-amber-400 to-rose-400", platform: "youtube" as const, views: "312K", x: "9.4×", text: "slide.find.clip3" },
];

/**
 * The right half of the sign-in page: what Reely does, as three slides that rotate on their own (find clips that beat
 * their usual views → see why they worked → make your own version). Drawn with the app's own components and sample
 * numbers, so it shows the real product instead of a screenshot.
 */
export function Showcase() {
  const t = useTranslations("login");
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [i]);

  const slide = SLIDES[i];
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#5636ba] via-[#6d4fd6] to-[#9b84ee] p-8 text-white xl:p-10">
      <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-fuchsia-300/20 blur-3xl" />

      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
          <Sparkles className="size-3.5" /> {t("showcase.badge")}
        </p>
        <h2 className="mt-4 max-w-md font-heading text-3xl leading-tight font-bold xl:text-4xl">{t("showcase.title")}</h2>
        <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
          {(["tiktok", "youtube", "instagram"] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-white/15 py-0.5 pr-2.5 pl-0.5">
              <PlatformIcon platform={p} className="size-5" /> {t(`showcase.platform.${p}`)}
            </span>
          ))}
        </div>
      </div>

      {/* The product, in a window frame. */}
      <div key={slide} className="story-in relative mt-8 flex flex-1 flex-col justify-center">
        <div className="rounded-3xl bg-white p-4 text-foreground shadow-2xl shadow-black/20 xl:p-5">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            {i + 1} / {SLIDES.length} · {t(`slide.${slide}.step`)}
          </p>
          <h3 className="mt-1 font-heading text-lg font-bold">{t(`slide.${slide}.title`)}</h3>

          {slide === "find" && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <Search className="size-4 text-primary" /> {t("slide.find.brief")}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SAMPLE_CLIPS.map((c) => (
                  <div key={c.text} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className={`relative aspect-[9/13] bg-gradient-to-br ${c.tone}`}>
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        <Eye className="size-2.5" /> {c.views}
                      </span>
                      <span className="absolute top-6 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--breakout)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Flame className="size-2.5" /> {c.x}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5">
                        <PlatformIcon platform={c.platform} className="size-4" />
                      </span>
                      <p className="absolute inset-x-2 bottom-7 text-[11px] leading-tight font-semibold text-white drop-shadow">{t(c.text)}</p>
                    </div>
                    <p className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-emerald-700">
                      <Heart className="size-2.5" /> {t("slide.find.engaged")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slide === "why" && (
            <div className="mt-3 space-y-2.5">
              <p className="flex gap-2 rounded-2xl bg-accent px-3 py-2.5 text-sm text-accent-foreground">
                <Quote className="mt-0.5 size-4 shrink-0" /> {t("slide.why.hook")}
              </p>
              <div className="flex h-7 overflow-hidden rounded-full text-[10px] font-semibold text-white">
                {[
                  ["w-[14%] bg-primary", "slide.why.beat1"],
                  ["w-[30%] bg-violet-400", "slide.why.beat2"],
                  ["w-[38%] bg-sky-400", "slide.why.beat3"],
                  ["w-[18%] bg-slate-500", "slide.why.beat4"],
                ].map(([cls, key]) => (
                  <span key={key} className={`grid place-items-center ${cls}`}>
                    {t(key)}
                  </span>
                ))}
              </div>
              <p className="rounded-2xl border p-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{t("slide.why.label")}</span> {t("slide.why.body")}
              </p>
            </div>
          )}

          {slide === "make" && (
            <div className="mt-3 space-y-2.5">
              <div className="grid grid-cols-7 gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <span
                    key={d}
                    className={`rounded-xl border py-1.5 text-center text-[10px] ${d === 0 ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    {t("slide.make.day", { n: d + 1 })}
                  </span>
                ))}
              </div>
              <div className="rounded-2xl border p-3">
                <p className="text-sm font-semibold">{t("slide.make.post")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("slide.make.script")}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
                    <PenLine className="size-3" /> {t("slide.make.write")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]">
                    <CalendarDays className="size-3" /> {t("slide.make.plan")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]">
                    <Bookmark className="size-3" /> {t("slide.make.save")}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 max-w-md text-sm text-white/85">{t(`slide.${slide}.caption`)}</p>
      </div>

      <div className="relative mt-6 flex items-center gap-2">
        {SLIDES.map((s, n) => (
          <button
            key={s}
            type="button"
            onClick={() => setI(n)}
            aria-label={t(`slide.${s}.step`)}
            className={`h-1.5 rounded-full transition-all ${n === i ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/60"}`}
          />
        ))}
        <span className="ml-auto text-xs text-white/70">{t("showcase.sample")}</span>
      </div>
    </div>
  );
}
