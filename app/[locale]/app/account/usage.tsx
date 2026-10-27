import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { usageReport } from "@/lib/usage-report";

/** Account page: researches today and this month, credits used by everyone, and (owners) per person. */
export async function UsageSection() {
  const t = await getTranslations("account");
  const u = await usageReport(await createClient());
  const tiles = [
    { label: t("usageToday"), value: u.cap === null ? `${u.today}` : `${u.today} / ${u.cap}` },
    { label: t("usageMonth"), value: `${u.month}` },
    { label: t("creditsToday"), value: `${u.credits.today}` },
    { label: t("creditsMonth"), value: `${u.credits.month}` },
  ];
  return (
    <section className="max-w-2xl space-y-3">
      <h2 className="font-heading text-xl font-bold">{t("usageTitle")}</h2>
      <p className="text-sm text-muted-foreground">{u.owner ? t("usageOwner") : u.cap === null ? t("usageUnlimited") : t("usageHint", { n: u.cap })}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-2xl bg-muted px-4 py-3">
            <p className="text-lg font-bold">{x.value}</p>
            <p className="text-xs text-muted-foreground">{x.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("creditsHint")}</p>
      {u.people && u.people.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("person")}</th>
                <th className="px-4 py-2 font-medium">{t("usageToday")}</th>
                <th className="px-4 py-2 font-medium">{t("usageMonth")}</th>
              </tr>
            </thead>
            <tbody>
              {u.people.map((p) => (
                <tr key={p.email} className="border-t">
                  <td className="px-4 py-2 break-all">{p.email}</td>
                  <td className="px-4 py-2">{p.today}</td>
                  <td className="px-4 py-2">{p.month}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
