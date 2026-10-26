"use client";

import { Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { writeIdeasAction } from "@/app/[locale]/app/research/actions";
import { useRouter } from "@/i18n/navigation";

/** Results page: asks for the "your idea" lines once the results are showing, then refreshes to show them. */
export function IdeasLoader({ runId }: { runId: string }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  function write() {
    setFailed(false);
    writeIdeasAction(runId, locale)
      .then((res) => (res.ok ? router.refresh() : setFailed(true)))
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    write();
    // Runs once per research page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Lightbulb className="size-3.5" /> {t("ideasFailed")}
        <button type="button" onClick={write} className="chip">
          <RotateCcw className="size-3.5" /> {t("ideasRetry")}
        </button>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-xs font-medium text-primary">
      <Loader2 className="size-3.5 animate-spin" /> {t("ideasWriting")}
    </p>
  );
}
