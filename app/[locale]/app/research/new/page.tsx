import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResearchWizard } from "./research-wizard";

export default async function NewResearchPage({ params }: PageProps<"/[locale]/app/research/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("research");

  return (
    <div>
      <header className="page-wash px-10 pt-10 pb-8">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t("eyebrow")}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="px-10 pb-16">
        <ResearchWizard />
      </div>
    </div>
  );
}
