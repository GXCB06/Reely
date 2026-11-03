"use client";

import { LayoutTemplate, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

/**
 * "Open in canvas" on a research: a new canvas for its product with its best 3 exact matches. Goes through
 * /api/canvases, not a server action, so it never waits behind the research page's own AI call.
 */
export function OpenInCanvas({ runId, className = "chip" }: { runId: string; className?: string }) {
  const t = useTranslations("canvas");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("openInCanvasTip")}
      onClick={() =>
        start(async () => {
          const res = (await fetch("/api/canvases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId }),
          })
            .then((r) => r.json())
            .catch(() => ({ ok: false }))) as { ok: boolean; id?: string };
          if (!res.ok || !res.id) return void toast.error(t("failed"));
          router.push(`/app/canvas/${res.id}`);
        })
      }
      className={className}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LayoutTemplate className="size-3.5" />} {t("openInCanvas")}
    </button>
  );
}
