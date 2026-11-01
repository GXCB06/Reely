"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ProductForm as Values } from "./actions";
import { ProductSheet } from "./product-sheet";

/**
 * "+ Add product": opens the product sheet, where pasting the website fills the form in (one AI call) and the user
 * checks it and presses Add. Opens by itself when there is no product yet.
 */
export function AddProduct({ empty, disabled, startOpen = false }: { empty: Values; disabled: boolean; startOpen?: boolean }) {
  const t = useTranslations("product");
  const [open, setOpen] = useState(startOpen);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? t("limit") : undefined}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
      >
        <Plus className="size-4" /> {t("add")}
      </button>
      <ProductSheet open={open} onOpenChange={setOpen} initial={empty} />
    </>
  );
}
