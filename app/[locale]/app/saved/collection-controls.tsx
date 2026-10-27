"use client";

import { FolderPlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { createCollectionAction, deleteCollectionAction, moveToCollectionAction } from "./collection-actions";

export type Collection = { id: string; name: string };

/** Saved page: a name box that makes a new folder and opens it. */
export function NewCollection() {
  const t = useTranslations("saved");
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        startTransition(async () => {
          const res = await createCollectionAction(name);
          if (!res.ok) return void toast.error(t(res.error === "limit" ? "folderLimit" : "folderFailed"));
          setName("");
          router.push(`/app/saved?c=${res.id}`);
        });
      }}
    >
      <FolderPlus className="size-3.5 text-muted-foreground" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder={t("newFolder")}
        aria-label={t("newFolder")}
        className="w-32 bg-transparent py-1 text-sm outline-none"
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
