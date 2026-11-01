"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * A floating "Ask Reely" pill while the ask box (#ask, at the end of the results) is off-screen: one tap scrolls
 * there and puts the cursor in the box, so nobody has to scroll past every clip to ask a question.
 */
export function AskFab() {
  const t = useTranslations("results");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById("ask");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { rootMargin: "0px 0px -15% 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("ask-input")?.focus({ preventScroll: true });
      }}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 md:left-[calc(50%+8rem)]"
    >
      <MessageCircleQuestion className="size-4" /> {t("askFab")}
    </button>
  );
}
