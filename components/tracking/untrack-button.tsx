"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { untrackAccountAction } from "@/app/[locale]/app/tracking/actions";
import { useRouter } from "@/i18n/navigation";

export function UntrackButton({ id }: { id: string }) {
  const t = useTranslations("tracking");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("untrack")}
      onClick={() =>
        startTransition(async () => {
          await untrackAccountAction(id);
          router.refresh();
        })
      }
      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" />
      <span className="sr-only">{t("untrack")}</span>
    </button>
  );
}
