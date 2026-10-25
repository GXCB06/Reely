import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "./product-form";

export default async function ProductPage({ params }: PageProps<"/[locale]/app/product">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("name, url, description, audience, language")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <header className="page-wash px-10 pt-10 pb-8">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="px-10 pb-16">
        <ProductForm
          initial={{
            name: product?.name ?? "",
            url: product?.url ?? "",
            description: product?.description ?? "",
            audience: product?.audience ?? "",
            language: product?.language === "en" ? "en" : "th",
          }}
        />
      </div>
    </div>
  );
}
