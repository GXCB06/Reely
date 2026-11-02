import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadEvalBrief } from "@/lib/eval-data";
import { loadQueue, type SetRow } from "@/lib/eval-queue-data";
import { isOwner } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { LabelQueue } from "./label-queue";

/**
 * Owner-only labelling queue (human-labelled test set): every clip the test set's metrics read, asked once per brief,
 * labelled blind. Your labels become the truth the metrics are computed from.
 */
export default async function LabelPage({ params }: PageProps<"/[locale]/app/eval/label">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  if (!admin || !isOwner(claims?.claims?.email as string | undefined)) notFound();
  const t = await getTranslations("eval");

  const { data: set } = await admin.from("eval_briefs").select("run_id, holdout, parent_run_id, added_at");
  const rows = (set ?? []) as SetRow[];
  const briefs = (await Promise.all(rows.map((r) => loadEvalBrief(admin, r.run_id)))).filter((b) => b !== null);
  const queue = await loadQueue(admin, rows, briefs);
  const batchKey = queue.batch[0] ? `${queue.batch[0].family}:${queue.batch[0].item}:${queue.done}` : `done:${queue.done}`;

  return (
    <div>
      <header className="page-wash px-4 pt-10 pb-8 md:px-10">
        <Link href="/app/eval" className="text-xs text-muted-foreground hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("label.title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("label.subtitle")}</p>
      </header>
      <div className="px-4 pb-16 md:px-10">
        <LabelQueue key={batchKey} batch={queue.batch} repeats={queue.repeats} total={queue.total} done={queue.done} perFamily={queue.perFamily} />
      </div>
    </div>
  );
}
