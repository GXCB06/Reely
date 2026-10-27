"use client";

import { Bookmark, ChevronUp, Languages, Layers, LogOut, Menu, Package, Radar, Sun, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Mascot } from "@/components/mascot";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Logo } from "./logo";
import { RecentItem, type RecentRun } from "./recent-item";

export type { RecentRun };

const NAV = [
  { href: "/app/today", key: "today", icon: Sun },
  { href: "/app/formats", key: "formats", icon: Layers },
  { href: "/app/tracking", key: "tracking", icon: Radar },
  { href: "/app/saved", key: "saved", icon: Bookmark },
  { href: "/app/product", key: "products", icon: Package },
] as const;

const rowClass = (active: boolean) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
    active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60"
  }`;

/**
 * ChatGPT-style sidebar: New research, the pages, recent research chats, and one account menu at the bottom.
 * On phones it slides in from the left, opened from a top bar (menu, logo, New research).
 */
export function Sidebar({
  email,
  recent,
  onSignOut,
}: {
  email: string | null;
  recent: RecentRun[];
  onSignOut?: () => Promise<void>;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const otherLocale = locale === "th" ? "en" : "th";
  const [open, setOpen] = useState(false);
  // A fresh query each time so an open chat resets.
  const newResearch = () => {
    setOpen(false);
    router.push(`/app?n=${Date.now()}`);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-3 text-sidebar-foreground md:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label={t("openMenu")} className="grid size-10 place-items-center rounded-xl hover:bg-sidebar-accent/60">
          <Menu className="size-5" />
        </button>
        <Link href="/app">
          <Logo onDark height={22} />
        </Link>
        <button type="button" onClick={newResearch} aria-label={t("newResearch")} className="ml-auto grid size-10 place-items-center rounded-xl bg-sidebar-primary">
          <Mascot size={24} tone="light" />
        </button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        // Any link inside closes the phone menu (the page changes underneath).
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground transition-transform md:sticky md:top-0 md:z-auto md:w-64 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <Link href="/app">
            <Logo onDark height={26} />
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("closeMenu")} className="grid size-8 place-items-center rounded-lg hover:bg-sidebar-accent/60 md:hidden">
            <X className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={newResearch}
          className="mb-3 flex items-center gap-3 rounded-xl bg-sidebar-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-sidebar-primary/90"
        >
          <Mascot size={24} tone="light" />
          {t("newResearch")}
        </button>

        <nav className="space-y-1">
          {NAV.map(({ href, key, icon: Icon }) => (
            <Link key={href} href={href} className={rowClass(pathname === href || pathname.startsWith(`${href}/`))}>
              <Icon className="size-4" />
              {t(key)}
            </Link>
          ))}
        </nav>

        <p className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-widest text-sidebar-foreground/45 uppercase">
          {t("recent")}
        </p>
        <ul className="-mr-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {recent.length === 0 && <li className="px-3 text-xs text-sidebar-foreground/50">{t("noRecent")}</li>}
          {recent.map((r) => (
            // key includes the title so a rename from elsewhere resets the row's local state.
            <RecentItem key={`${r.id}:${r.title}`} run={r} />
          ))}
        </ul>

        {email && (
          <details className="group relative mt-3 border-t border-sidebar-border pt-3">
            <summary
              aria-label={t("menu")}
              className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar-primary text-xs font-bold text-white uppercase">
                {email[0]}
              </span>
              <span className="truncate">{email}</span>
              <ChevronUp className="ml-auto size-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="absolute inset-x-0 bottom-full mb-2 space-y-0.5 rounded-2xl border border-sidebar-border bg-sidebar p-1.5 shadow-xl">
              <Link href="/app/account" className={rowClass(pathname === "/app/account")}>
                <UserRound className="size-4" /> {t("account")}
              </Link>
              <Link href={pathname} locale={otherLocale} className={rowClass(false)}>
                <Languages className="size-4" /> {t("language")}
              </Link>
              {onSignOut && (
                <form action={onSignOut}>
                  <button className={`${rowClass(false)} w-full text-left`}>
                    <LogOut className="size-4" /> {t("signOut")}
                  </button>
                </form>
              )}
            </div>
          </details>
        )}
      </aside>
    </>
  );
}
