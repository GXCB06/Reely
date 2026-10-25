import { redirect } from "@/i18n/navigation";

/** New research now starts from the chat on Home. */
export default async function NewResearchPage({ params }: PageProps<"/[locale]/app/research/new">) {
  const { locale } = await params;
  redirect({ href: "/app", locale });
}
