"use client";

import { Bookmark, BookmarkCheck, Folder, FolderPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCollectionAction, listCollectionsAction, moveToCollectionAction } from "@/app/[locale]/app/saved/collection-actions";
import { toggleSaveAction } from "@/app/[locale]/app/saved-actions";

type FolderItem = { id: string; name: string };

/**
 * Save / un-save a clip. Right after saving, a small picker offers the user's folders (or a new one), so a clip
 * can be filed without going to the Saved page.
 */
export function SaveButton({ videoId, initialSaved = false }: { videoId: number; initialSaved?: boolean }) {
  const t = useTranslations("card");
  const ts = useTranslations("saved");
  const [saved, setSaved] = useState(initialSaved);
  const [folders, setFolders] = useState<FolderItem[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  // Filing has its own pending state: a quick tap right after saving must not hit buttons still disabled by the save.
  const [filing, startFiling] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Close the picker on a click outside it.
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setPicking(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);

  function toggle() {
    startTransition(async () => {
      setSaved(!saved);
      const res = await toggleSaveAction(videoId, !saved);
      setSaved(res.saved);
      if (res.saved && !saved) {
        setPicking(true);
        setFolders(await listCollectionsAction().catch(() => []));
      } else setPicking(false);
    });
  }

  function file(folder: FolderItem) {
    startFiling(async () => {
      const res = await moveToCollectionAction(videoId, folder.id);
      if (!res.ok) return void toast.error(ts("folderFailed"));
      toast.success(ts("filedIn", { name: folder.name }));
      setPicking(false);
    });
  }

  function createAndFile() {
    const clean = name.trim();
    if (!clean) return;
    startFiling(async () => {
      const res = await createCollectionAction(clean);
      if (!res.ok) return void toast.error(ts(res.error === "limit" ? "folderLimit" : "folderFailed"));
      setName("");
      file({ id: res.id, name: clean });
    });
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
          saved ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
        aria-pressed={saved}
      >
        {saved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
        {saved ? t("saved") : t("save")}
      </button>
      {picking && (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-60 rounded-2xl border bg-popover p-3 text-left shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">{ts("pickFolder")}</p>
            <button type="button" onClick={() => setPicking(false)} aria-label={ts("skip")} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </div>
          {folders === null ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={filing}
                  onClick={() => file(f)}
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs hover:border-primary/40 hover:bg-primary/5"
                >
                  <Folder className="size-3 shrink-0 text-primary" /> {f.name}
                </button>
              ))}
            </div>
          )}
          <form
            className="mt-2 flex items-center gap-1 rounded-full border px-2 py-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              createAndFile();
            }}
          >
            <FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={ts("newFolder")}
              aria-label={ts("newFolder")}
              className="w-full bg-transparent py-1 text-xs outline-none"
            />
          </form>
        </div>
      )}
    </div>
  );
}
