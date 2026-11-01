"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ProductForm as Values } from "./actions";
import { ProductForm } from "./product-form";

/**
 * Adding or editing a product, in a panel from the right (full screen on a phone), so the product list never moves.
 * Closing with unsaved changes asks first.
 */
export function ProductSheet({
  open,
  onOpenChange,
  initial,
  id = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Values;
  id?: string | null;
}) {
  const t = useTranslations("product");
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => void (dirty.current = d), []);

  function close() {
    dirty.current = false;
    onOpenChange(false);
  }
  function requestClose() {
    if (dirty.current && !window.confirm(t("sheet.discard"))) return;
    close();
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="truncate font-heading text-lg font-bold">{id ? t("sheet.titleEdit", { name: initial.name }) : t("addTitle")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pt-5">
          {/* Mounted only while open, so each opening starts from the saved values. */}
          {open && <ProductForm initial={initial} id={id} onDone={close} onCancel={requestClose} onDirtyChange={onDirtyChange} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
