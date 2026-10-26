"use client";

import { Bookmark, ChevronUp, Languages, Layers, LogOut, Package, Radar, SquarePen, Sun, UserRound } from "lucide-react";
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

/** ChatGPT-style sidebar: New research, two pages, recent research chats, and one account menu at the bottom. */
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

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground">
      <Link href="/app" className="mb-5 px-2">
        <Logo onDark height={26} />
      </Link>

      <button
        type="button"
        // A fresh query each time so an open chat resets.
        onClick={() => router.push(`/app?n=${Date.now()}`)}
        className="mb-3 flex items-center gap-3 rounded-xl bg-sidebar-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-sidebar-primary/90"
      >
        <SquarePen className="size-4" />
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
  );
}
