"use client";

import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRunAction, pinRunAction, renameRunAction } from "@/app/[locale]/app/research/actions";
import { RegionIcon } from "@/components/chat/region-flag";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { RegionChoice } from "@/lib/region";

export type RecentRun = { id: string; title: string; region: RegionChoice; running: boolean; pinned: boolean };

const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-sidebar-accent";

/** One research chat in the sidebar, with a ⋯ menu to rename, pin or delete it. */
export function RecentItem({ run }: { run: RecentRun }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const href = `/app/research/${run.id}`;
  const active = pathname === href;
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(run.title);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: boolean }>, after?: () => void) {
    setMenuAt(null);
    startTransition(async () => {
      const res = await fn().catch(() => ({ ok: false }));
      if (!res.ok) return void toast.error(t("actionFailed"));
      after?.();
    });
  }

  function saveTitle() {
    setRenaming(false);
    const next = title.trim();
    if (!next || next === run.title) return setTitle(run.title);
    act(() => renameRunAction(run.id, next));
  }

  function remove() {
    if (!window.confirm(t("deleteConfirm", { title: run.title }))) return setMenuAt(null);
    act(
      () => deleteRunAction(run.id),
      () => {
        toast.success(t("deleted"));
        if (active) router.push("/app");
      },
    );
  }

  if (renaming) {
    return (
      <li className="px-1">
        <input
          autoFocus
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitle(run.title);
              setRenaming(false);
            }
          }}
          className="w-full rounded-xl bg-sidebar-accent px-3 py-1.5 text-sm text-white outline-none ring-1 ring-sidebar-primary"
        />
      </li>
    );
  }

  return (
    <li className={`group relative ${pending ? "opacity-50" : ""}`}>
      <Link
        href={href}
        title={run.title}
        className={`flex items-center gap-3 rounded-xl py-1.5 pr-8 pl-3 text-sm transition-colors ${
          active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60"
        }`}
      >
        <RegionIcon region={run.region} className="text-xs" />
        <span className="truncate">{title}</span>
        {run.pinned && <Pin aria-label={t("pinned")} className="size-3 shrink-0 text-sidebar-foreground/50" />}
        {run.running && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-sidebar-primary" />}
      </Link>
      <button
        type="button"
        aria-label={t("chatMenu")}
        aria-expanded={menuAt !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuAt({ top: r.bottom + 4, left: r.left - 4 });
        }}
        className={`absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-white ${
          menuAt || active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <Ellipsis className="size-4" />
      </button>

      {menuAt && (
        <>
          {/* Click anywhere else to close. Fixed position so the scrolling list can't clip the menu. */}
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuAt(null)} />
          <div
            role="menu"
            style={{ top: menuAt.top, left: menuAt.left }}
            className="fixed z-50 w-44 rounded-xl border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={() => {
                setMenuAt(null);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" /> {t("rename")}
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => act(() => pinRunAction(run.id, !run.pinned))}>
              {run.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />} {t(run.pinned ? "unpin" : "pin")}
            </button>
            <button type="button" role="menuitem" className={`${menuItem} text-red-400`} onClick={remove}>
              <Trash2 className="size-4" /> {t("delete")}
            </button>
          </div>
        </>
      )}
    </li>
  );
}
