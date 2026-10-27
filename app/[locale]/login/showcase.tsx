"use client";

import { Bookmark, CalendarDays, Eye, Flame, Heart, PenLine, Quote, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";

const SLIDES = ["find", "why", "make"] as const;
const SLIDE_MS = 5500;

const THUMBS = "https://jjzpwqqtetmmwutilzfz.supabase.co/storage/v1/object/public/thumbs";

/**
 * Real clips Reely found (numbers as of 2026-10-27), one per kind of user: a startup (AccOS Pro's own Instagram),
 * an affiliate selling through TikTok Shop, and a content creator. Covers are the copies in our storage bucket.
 */
const REAL_CLIPS = [
  {
    kind: "startup",
    platform: "instagram" as const,
    cover: `${THUMBS}/instagram/Dc70ZuezCBP.jpg`,
    handle: "accos.pro",
    caption: "คอมเมนต์ “เอไอบัญชี” เดียวผมส่งรายละเอียดไปให้ครับ",
    views: "11.9K",
    x: "2.8×",
    of: "usual",
  },
  {
    kind: "affiliate",
    platform: "tiktok" as const,
    cover: `${THUMBS}/tiktok/7676146953482374420.jpg`,
    handle: "pangxnstory",
    caption: "สิ่งที่ซื้อมาแล้วไม่เสียดายเงิน",
    views: "870K",
    x: "15×",
    of: "followers",
  },
  {
    kind: "creator",
    platform: "instagram" as const,
    cover: `${THUMBS}/instagram/DViNtk3EUvL.jpg`,
    handle: "ai.reviewbyamit",
    caption: "Steps to Create Viral AI Videos",
    views: "1.6M",
    x: "53×",
    of: "usual",
  },
];

/**
 * The right half of the sign-in page: what Reely does, as three slides that rotate on their own (find clips that beat
 * their usual views → see why they worked → make your own version). Drawn with the app's own components and sample
 * numbers, so it shows the real product instead of a screenshot.
 */
export function Showcase() {
  const t = useTranslations("login");
  const [i, setI] = useState(0);
  // Bumped after the last slide, so slide 1's bar animates again on the next round.
  const [cycle, setCycle] = useState(0);
  // Hovering the panel pauses it, so a slide can be read at leisure.
  const [paused, setPaused] = useState(false);

  // The current bar's fill animation drives the change: when it ends, the next slide shows.
  function next() {
    setI((n) => {
      if (n === SLIDES.length - 1) setCycle((c) => c + 1);
      return (n + 1) % SLIDES.length;
    });
  }

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#5636ba] via-[#6d4fd6] to-[#9b84ee] p-8 text-white xl:p-10">
      <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-fuchsia-300/20 blur-3xl" />

      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
          <Sparkles className="size-3.5" /> {t("showcase.badge")}
        </p>
        <h2 className="mt-4 max-w-md font-heading text-3xl leading-tight font-bold text-balance xl:text-4xl">{t("showcase.title")}</h2>
        <p className="mt-2 max-w-md text-white/85">{t("showcase.subtitle")}</p>
        <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
          {(["tiktok", "youtube", "instagram"] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-white/15 py-0.5 pr-2.5 pl-0.5">
              <PlatformIcon platform={p} className="size-5" /> {t(`showcase.platform.${p}`)}
            </span>
          ))}
        </div>
      </div>

      {/* The product, in a window frame. Every slide is laid on the same spot, so the panel keeps the height of the
          tallest one and nothing below it moves when the slides change. */}
      <div className="relative mt-8 grid flex-1 items-center">
        {SLIDES.map((s, n) => (
          <div
            key={s}
            aria-hidden={n !== i}
            className={`col-start-1 row-start-1 transition duration-500 ${n === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
          >
            <SlideBody slide={s} index={n} />
          </div>
        ))}
      </div>

      {/* Story-style bars: the current one fills up until the next slide, so the change never comes out of nowhere. */}
      <div className="relative mt-6 flex items-center gap-2">
        {SLIDES.map((s, n) => (
          <button
            key={s}
            type="button"
            onClick={() => setI(n)}
            aria-label={t(`slide.${s}.step`)}
            aria-current={n === i}
            className="group flex flex-col items-start gap-1.5"
          >
            <span className="relative block h-1.5 w-16 overflow-hidden rounded-full bg-white/30">
              <span
                // Re-mounted for each slide, so the fill starts again from empty.
                key={n === i ? `on-${i}-${cycle}` : "off"}
                className={`absolute inset-y-0 left-0 rounded-full bg-white ${n === i ? "slide-progress" : ""}`}
                style={
                  n === i
                    ? ({ "--slide-ms": `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" } as React.CSSProperties)
                    : { width: n < i ? "100%" : "0%" }
                }
                onAnimationEnd={next}
              />
            </span>
            <span className={`text-[11px] font-medium ${n === i ? "text-white" : "text-white/60 group-hover:text-white/80"}`}>{t(`slide.${s}.step`)}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-white/70">{t("showcase.sample")}</span>
      </div>
    </div>
  );
}

/** One slide: the product window and the line under it. */
function SlideBody({ slide, index }: { slide: (typeof SLIDES)[number]; index: number }) {
  const t = useTranslations("login");
  return (
    <>
    <div className="rounded-3xl bg-white p-4 text-foreground shadow-2xl shadow-black/20 xl:p-5">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">
        {index + 1} / {SLIDES.length} · {t(`slide.${slide}.step`)}
      </p>
      <h3 className="mt-1 font-heading text-lg font-bold">{t(`slide.${slide}.title`)}</h3>

      {slide === "find" && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Search className="size-4 text-primary" /> {t("slide.find.brief")}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {REAL_CLIPS.map((c) => (
              <div key={c.handle} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="relative aspect-[9/13] bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                    {t(`slide.find.kind.${c.kind}`)}
                  </span>
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <Eye className="size-2.5" /> {c.views}
                  </span>
                  {/* Purple, not red: a high multiplier is good news (red reads as a warning). */}
                  <span
                    title={t(`slide.find.of.${c.of}`)}
                    className="absolute top-6 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    <Flame className="size-2.5" /> {c.x}
                  </span>
                  <p className="absolute inset-x-2 bottom-7 line-clamp-2 text-[11px] leading-tight font-semibold text-white drop-shadow">{c.caption}</p>
                  <span className="absolute bottom-1.5 left-1.5 flex max-w-[90%] items-center gap-1 text-[10px] text-white/90">
                    <PlatformIcon platform={c.platform} className="size-4" /> <span className="truncate">@{c.handle}</span>
                  </span>
                </div>
                <p className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-emerald-700">
                  <Heart className="size-2.5" /> {t(`slide.find.of.${c.of}`)}
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
    </>
  );
}
