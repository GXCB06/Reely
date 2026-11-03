"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { renameCanvasAction } from "../actions";

/** The canvas name, edited in place (saved when the field loses focus). */
export function CanvasTitle({ id, title, placeholder }: { id: string; title: string; placeholder: string }) {
  const t = useTranslations("canvas");
  const [value, setValue] = useState(title);
  const [, start] = useTransition();
  return (
    <input
      value={value}
      maxLength={80}
      aria-label={t("rename")}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== title && start(async () => void (await renameCanvasAction(id, value.trim())))}
      className="mt-1 w-full max-w-3xl bg-transparent font-heading text-3xl font-bold outline-none placeholder:text-foreground/40 focus:underline focus:decoration-primary/40"
    />
  );
}
