"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { createCanvasAction, deleteCanvasAction } from "./actions";

/** "New canvas": straight in with one product, or a quick product pick when there are several. */
export function NewCanvas({ products }: { products: { id: string; name: string }[] }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();

  function create(productId: string) {
    start(async () => {
      const res = await createCanvasAction(productId);
      if (!res.ok) return void toast.error(t("failed"));
      router.push(`/app/canvas/${res.id}`);
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => (products.length === 1 ? create(products[0].id) : setPicking((p) => !p))}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t("new")}
      </button>
      {picking && (
        // In the page flow, not a floating menu: the content panel clips anything that overflows it.
        <div className="mt-2 w-64 max-w-full rounded-2xl border bg-popover p-2 shadow-lg">
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("pickProduct")}</p>
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={pending}
              onClick={() => create(p.id)}
              className="block w-full truncate rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeleteCanvas({ id }: { id: string }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("delete")}
      onClick={() => {
        if (!window.confirm(t("deleteConfirm"))) return;
        start(async () => {
          await deleteCanvasAction(id);
          router.refresh();
        });
      }}
      className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
