"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { CheckItem } from "@/lib/eval-check";
import { setBlindLabelAction } from "../actions";
import { ClipLabelCard } from "../clip-label-card";

/** One clip of the judge check, labelled blind; the page then shows the next one. */
export function CheckCard({ item }: { item: CheckItem }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [pending, start] = useTransition();

  function answer(label: 0 | 1 | 2) {
    start(async () => {
      const res = await setBlindLabelAction(item.runId, item.item, item.platform, label);
      if (!res.ok) return void toast.error(t("check.notSaved"));
      router.refresh();
    });
  }

  return <ClipLabelCard platform={item.platform} brief={item.brief} clip={item.clip} pending={pending} onAnswer={answer} />;
}
