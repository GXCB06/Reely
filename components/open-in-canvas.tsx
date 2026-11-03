"use client";

import { LayoutTemplate, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { openInCanvasAction } from "@/app/[locale]/app/canvas/actions";
import { useRouter } from "@/i18n/navigation";

/** "Open in canvas" on a research: a new canvas for its product with its best 3 exact matches. */
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
          const res = await openInCanvasAction(runId);
          if (!res.ok) return void toast.error(t("failed"));
          router.push(`/app/canvas/${res.id}`);
        })
      }
      className={className}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LayoutTemplate className="size-3.5" />} {t("openInCanvas")}
    </button>
  );
}
