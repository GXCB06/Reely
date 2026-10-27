"use client";

import { FolderPlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { createCollectionAction, deleteCollectionAction, moveToCollectionAction } from "./collection-actions";

export type Collection = { id: string; name: string };

/** Saved page: "+ New folder" opens a name box; Enter makes the folder and opens it, Esc cancels. */
export function NewCollection() {
  const t = useTranslations("saved");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <FolderPlus className="size-4" /> {t("addFolder")}
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5 rounded-2xl border bg-card px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        startTransition(async () => {
          const res = await createCollectionAction(name);
          if (!res.ok) return void toast.error(t(res.error === "limit" ? "folderLimit" : "folderFailed"));
          setName("");
          setAdding(false);
          router.push(`/app/saved?c=${res.id}`);
        });
      }}
    >
      <FolderPlus className="size-4 shrink-0 text-primary" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
        onBlur={() => !name.trim() && setAdding(false)}
        maxLength={40}
        placeholder={t("folderName")}
        aria-label={t("folderName")}
        className="w-full bg-transparent py-1 text-sm outline-none"
        disabled={pending}
      />
    </form>
  );
}

/** Deletes the open folder (its clips stay saved). */
export function DeleteCollection({ id, name }: Collection) {
  const t = useTranslations("saved");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("deleteConfirm", { name }))) return;
        startTransition(async () => {
          await deleteCollectionAction(id);
          router.push("/app/saved");
        });
      }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
    >
      <Trash2 className="size-3.5" /> {t("deleteFolder")}
    </button>
  );
}

/** Under each saved clip: which folder it is in. */
export function FolderPicker({ videoId, value, collections }: { videoId: number; value: string | null; collections: Collection[] }) {
  const t = useTranslations("saved");
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={current}
      disabled={pending}
      aria-label={t("folder")}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        startTransition(async () => {
          const res = await moveToCollectionAction(videoId, next || null);
          if (!res.ok) {
            setCurrent(value ?? "");
            return void toast.error(t("folderFailed"));
          }
          router.refresh();
        });
      }}
      className="w-full rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground"
    >
      <option value="">{t("noFolder")}</option>
      {collections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
