"use client";

import { Bookmark, FlaskConical, Home, Languages, LogOut, Package, Radar, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "./logo";

type NavItem = { href: string; key: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean };

const SECTIONS: { key: string; items: NavItem[] }[] = [
  { key: "overview", items: [{ href: "/app", key: "home", icon: Home }] },
  {
    key: "research",
    items: [
      { href: "/app/research/new", key: "newResearch", icon: Sparkles },
      { href: "/app/tracking", key: "tracking", icon: Radar, soon: true },
      { href: "/app/saved", key: "saved", icon: Bookmark },
      { href: "/app/product", key: "product", icon: Package, soon: true },
      { href: "/app/dev-search", key: "devSearch", icon: FlaskConical },
    ],
  },
];

export function Sidebar({ email, onSignOut }: { email: string | null; onSignOut?: () => Promise<void> }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();
  const otherLocale = locale === "th" ? "en" : "th";

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground">
      <Link href="/app" className="mb-6 px-2">
        <Logo onDark height={26} />
      </Link>

      <nav className="flex-1 space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.key}>
            <p className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/50 uppercase">
              {t(section.key)}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-disabled={item.soon}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent text-white ring-1 ring-sidebar-primary/60"
                          : "hover:bg-sidebar-accent/60"
                      } ${item.soon ? "pointer-events-none opacity-40" : ""}`}
                    >
                      <Icon className="size-4" />
                      {t(item.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border pt-3 text-sm">
        <Link
          href={pathname}
          locale={otherLocale}
          className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-sidebar-accent/60"
        >
          <Languages className="size-4" />
          {t("language")}
        </Link>
        {email && onSignOut && (
          <form action={onSignOut}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-sidebar-accent/60">
              <LogOut className="size-4" />
              <span className="truncate">{email}</span>
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
