"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { parseHandle } from "@/lib/handles";
import { addOwnAccountAction, removeOwnAccountAction } from "./actions";

type Platform = "tiktok" | "youtube" | "instagram";

/** Add a channel: a profile link or @handle (a bare handle asks for the platform) and the product it belongs to. */
export function AddChannel({ products }: { products: { id: string; name: string; full: boolean }[] }) {
  const t = useTranslations("me");
  const router = useRouter();
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState<Platform | null>(null);
  const [productId, setProductId] = useState(products.find((p) => !p.full)?.id ?? products[0]?.id ?? "");
  const [pending, start] = useTransition();
  const detected = parseHandle(input)?.platform ?? null;

  function add() {
    start(async () => {
      const res = await addOwnAccountAction(productId, input, detected ? null : picked);
      if (!res.ok) return void toast.error(t(`errors.${res.error}`));
      setInput("");
      router.push(`/app/me/${res.platform}/${encodeURIComponent(res.handle)}`);
    });
  }

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4" data-me="add">
      <h2 className="font-heading font-bold">{t("addTitle")}</h2>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 basis-60 rounded-full border bg-background px-3 py-2 text-sm"
        />
        {!detected && (
          <select
            value={picked ?? ""}
            onChange={(e) => setPicked((e.target.value || null) as Platform | null)}
            aria-label={t("platform")}
            className="rounded-full border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("platform")}</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
          </select>
        )}
        <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label={t("product")} className="max-w-48 rounded-full border bg-background px-3 py-2 text-sm">
          {products.map((p) => (
            <option key={p.id} value={p.id} disabled={p.full}>
              {p.name}
              {p.full ? ` (${t("full")})` : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || input.trim().length < 2 || (!detected && !picked)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {pending ? t("adding") : t("add")}
        </button>
      </form>
      <p className="text-xs text-muted-foreground">{t("addHint")}</p>
    </section>
  );
}

export function RemoveChannel({ id }: { id: string }) {
  const t = useTranslations("me");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("remove")}
      onClick={() => {
        if (!window.confirm(t("removeConfirm"))) return;
        start(async () => {
          await removeOwnAccountAction(id);
          router.refresh();
        });
      }}
      className="absolute top-3 right-10 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
