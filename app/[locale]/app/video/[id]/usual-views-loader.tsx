"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { lookUpClipCreatorAction } from "../import-actions";

/** After a pasted link: looks up the creator's usual views (~20 s on Instagram), then shows the multiplier. */
export function UsualViewsLoader({ videoId, handle }: { videoId: number; handle: string }) {
  const t = useTranslations("video");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    lookUpClipCreatorAction(videoId)
      .then((res) => (res === "done" || res === "known" ? router.refresh() : setFailed(true)))
      .catch(() => setFailed(true));
  }, [videoId, router]);

  if (failed) return null;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {t("checkingUsual", { handle })}
    </div>
  );
}
