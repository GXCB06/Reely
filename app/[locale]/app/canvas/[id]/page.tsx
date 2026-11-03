import { Package } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CANVAS_PER_DAY, formatsFor } from "@/lib/canvas";
import { clipChoices, loadCanvas } from "@/lib/canvas-data";
import { createClient } from "@/lib/supabase/server";
import { CanvasInputs } from "./canvas-inputs";
import { CanvasOutput } from "./canvas-output";
import { CanvasTitle } from "./canvas-title";

/**
 * One Content Canvas: reference clips, the product and a note on the left; a fixed format, Generate and every version
 * on the right. A new canvas reads as three numbered steps (the guided start).
 */
export default async function CanvasPage({ params }: PageProps<"/[locale]/app/canvas/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("canvas");
  const tg = await getTranslations("goals");
  const supabase = await createClient();
  const canvas = await loadCanvas(supabase, id);
  if (!canvas) notFound();
  const choices = await clipChoices(supabase, canvas.product.id);
  const p = canvas.product;

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-6 md:px-10">
        <Link href="/app/canvas" className="text-xs text-muted-foreground hover:underline">
          ← {t("back")}
        </Link>
        {/* Keyed by the title, so a name the first version gives the canvas shows up. */}
        <CanvasTitle key={canvas.title} id={canvas.id} title={canvas.title} placeholder={t("untitled")} />
        {canvas.outputs.length === 0 && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("guide")}</p>}
      </header>
      <div className="grid gap-6 px-4 pb-16 md:px-10 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="space-y-4">
          <section className="space-y-1 rounded-3xl border bg-card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 font-heading font-bold">
                <Package className="size-4 text-primary" /> {t("product")}
              </h2>
              <Link href="/app/product" className="text-xs text-primary hover:underline">
                {t("editProduct")}
              </Link>
            </div>
            <p className="font-medium">
              {p.name}
              {p.goal && <span className="ml-1.5 text-xs text-muted-foreground">· {tg(`${p.goal}.short`)}</span>}
            </p>
            {p.description && <p className="line-clamp-3 text-xs text-muted-foreground">{p.description}</p>}
          </section>
          <CanvasInputs canvasId={canvas.id} clips={canvas.clips} note={canvas.inputs.note} link={canvas.inputs.link ?? ""} choices={choices} />
        </div>
        <CanvasOutput
          canvasId={canvas.id}
          formats={formatsFor(p.goal)}
          outputs={canvas.outputs}
          perDay={CANVAS_PER_DAY}
          hasClips={canvas.clips.length > 0}
        />
      </div>
    </div>
  );
}
