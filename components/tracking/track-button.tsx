"use client";

import { Radar, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { trackAccountAction } from "@/app/[locale]/app/tracking/actions";
import { useRouter } from "@/i18n/navigation";

/** "Track @handle" from a video page, like Virlo's Track button on outlier cards. */
export function TrackButton({
  platform,
  handle,
  initialTracked,
  refresh = false,
}: {
  platform: "tiktok" | "youtube" | "instagram";
  handle: string;
  initialTracked: boolean;
  /** Re-render the page after tracking (the tracking page's list grows). */
  refresh?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("tracking");
  const [tracked, setTracked] = useState(initialTracked);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={tracked || pending}
      onClick={() =>
        startTransition(async () => {
          const res = await trackAccountAction(handle, platform);
          if (!res.ok) return void toast.error(t(res.error === "limit" ? "errorLimit" : "errorInvalid"));
          setTracked(true);
          toast.success(t("added", { handle }));
          if (refresh) router.refresh();
        })
      }
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        tracked ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {tracked ? <Check className="size-3.5" /> : <Radar className="size-3.5" />}
      {tracked ? t("tracking") : t("trackHandle", { handle })}
    </button>
  );
}
