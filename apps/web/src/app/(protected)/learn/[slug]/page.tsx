import { LEARN_SLUGS } from "@compass/shared";
import { ModuleView } from "@/features/learn/module-view";

export function generateStaticParams() {
  return LEARN_SLUGS.map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  return <ModuleView slug={slug} />;
}
