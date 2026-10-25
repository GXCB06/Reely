import type { Metadata } from "next";
import { Anuphan, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";
import "../globals.css";

const latin = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-latin" });
const thai = Anuphan({ subsets: ["thai", "latin"], variable: "--font-thai" });

export const metadata: Metadata = {
  title: "Reely",
  description: "Find the short videos worth copying for your product.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${latin.variable} ${thai.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
